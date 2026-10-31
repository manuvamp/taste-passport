import type {
  Domain,
  QlooEntity,
  ExplorationPool,
  TasteCard,
  TasteProfile,
  TasteSignal,
  TasteState,
  UnexpectedConnection,
} from "@/lib/types";
import { DOMAINS, DOMAIN_TO_QLOO_TYPE } from "@/lib/types";
import { COLD_START_IDS, SEED_CARDS, cardsById } from "@/data/cards";
import { isVibe } from "@/data/vibes";
import CARD_IMAGES from "@/data/card-images.json";
import VIBE_IMAGES from "@/data/vibe-images.json";
import { mockAffinity, tagAffinity } from "@/lib/qloo/mock";
import { getQlooAdapter } from "@/lib/qloo";
import { anchorsFor, becauseOf, likedIds, likedWeights, lookupCard, pickedTwins, resolveAnchors, explain, prettyTag, tagIdf as sharedIdf } from "@/lib/taste/signals";
import { liveEntityToCard, registerLiveCards, getLiveCard } from "@/lib/qloo/live-cards";

/**
 * The taste engine: converts interactions into a taste state, selects the next
 * adaptive batch (70% exploit / 20% adjacent / 10% novel), scores candidates
 * with configurable weights, and compiles the cultural profile.
 *
 * Qloo drives adaptation: candidate affinity comes from the Qloo adapter
 * (live graph or deterministic mock graph), not from pixel similarity.
 */

// ---------- configurable weights (see .env.example) ----------
function num(env: string | undefined, dflt: number): number {
  const v = Number(env);
  return Number.isFinite(v) ? v : dflt;
}
export const WEIGHTS = {
  qloo: num(process.env.TASTE_QLOO_WEIGHT, 0.4),
  bridge: num(process.env.TASTE_BRIDGE_WEIGHT, 0.25),
  tag: num(process.env.TASTE_TAG_WEIGHT, 0.15),
  balance: num(process.env.TASTE_BALANCE_WEIGHT, 0.1),
  novelty: num(process.env.TASTE_NOVELTY_WEIGHT, 0.1),
};

export const INTERACTION_WEIGHT: Record<TasteSignal["interaction"], number> = {
  like: 1.0,
  dislike: -1.0,
  skip: 0,
};

// diminishing returns so one interaction can't dominate
function diminishing(countSoFar: number): number {
  return 1 / (1 + countSoFar * 0.02);
}

// recency multiplier: newest signals count up to 1.2x
function recency(signalIndex: number, total: number): number {
  const age = (total - 1 - signalIndex) / Math.max(1, total - 1); // 0 newest → 1 oldest
  return 1.2 - 0.4 * age; // 1.2 → 0.8
}

// ---------- state updates ----------
export function applyInteraction(
  state: TasteState,
  card: TasteCard,
  interaction: TasteSignal["interaction"],
  round: number,
  entityId = `card:${card.id}`,
  source?: string,
  /** 0..2 — a deliberate four-way choice counts more than a scroll-by tap; passing an option over is a light negative */
  strength = 1
): void {
  const sameEntityCount = state.signals.filter((s) => s.entityId === entityId).length;
  const base = INTERACTION_WEIGHT[interaction];
  const k = Math.max(0, Math.min(2, Number.isFinite(strength) ? strength : 1));
  if (base !== 0 && k > 0) {
    const w = base * k * diminishing(sameEntityCount) * recency(state.signals.length, state.signals.length + 1);
    state.signals.push({
      cardId: card.id,
      entityId,
      entityType: card.domain,
      domain: card.domain,
      interaction,
      weight: Math.round(w * 1000) / 1000,
      timestamp: new Date().toISOString(),
      round,
      source,
      ...(k !== 1 ? { strength: k } : {}),
    });
    // tag vector update
    for (const t of card.tags) {
      state.tagVector[t] = (state.tagVector[t] ?? 0) + w;
    }
    // domain weights: likes attract, dislikes repel slightly
    state.domainWeights[card.domain] = (state.domainWeights[card.domain] ?? 0) + domainDelta(interaction, k);
  } else {
    state.signals.push({
      cardId: card.id,
      entityId,
      entityType: card.domain,
      domain: card.domain,
      interaction: "skip",
      weight: 0,
      timestamp: new Date().toISOString(),
      round,
      source,
    });
  }
  state.lastUpdated = new Date().toISOString();
}

/** Likes pull a domain forward; dislikes (and light "passed over" signals) push it back a little. */
function domainDelta(interaction: TasteSignal["interaction"], strength: number): number {
  if (interaction === "like") return Math.min(1, strength);
  if (interaction === "dislike") return -0.4 * Math.min(1, strength);
  return 0;
}

// ---------- confidence ----------
export function computeConfidence(state: TasteState): number {
  const decisive = state.signals.filter((s) => s.interaction !== "skip");
  const pos = decisive.filter((s) => s.interaction === "like").length;
  const neg = decisive.length - pos;
  if (pos === 0) return 0; // only passes: we know what you don't love, not what you do
  // distinct things liked matter more than raw taps; ~60 distinct picks reads as a full profile
  const distinct = new Set(decisive.filter((s) => s.interaction === "like").map((s) => s.cardId)).size;
  const countScore = Math.min(1, distinct / 60);
  const domainsCovered = new Set(decisive.map((s) => s.domain)).size;
  const domainScore = Math.min(1, domainsCovered / Math.min(8, DOMAINS.length));
  // knowing what someone passes over (relative choices) sharpens the picture
  const contrastScore = Math.min(1, neg / Math.max(8, pos * 0.5));
  return Math.round(Math.min(1, countScore * 0.62 + domainScore * 0.23 + contrastScore * 0.15) * 100) / 100;
}

export function confidenceLabel(c: number): string {
  if (c < 0.25) return "Learning";
  if (c < 0.5) return "Emerging";
  if (c < 0.75) return "Strong";
  return "High confidence";
}

// ---------- candidate scoring ----------
export type ScoredCandidate = {
  card: TasteCard;
  score: number;
  parts: { qloo: number; bridge: number; tag: number; balance: number; novelty: number };
  pool: ExplorationPool;
};

/**
 * Local (synchronous) scoring pass. `qlooScores` comes from the adapter —
 * in mock mode from the deterministic tag/bridge graph, in live mode from
 * /v2/insights affinity. Bridge similarity = curated cross-domain bridge
 * strength (stands in for a visual-embedding channel; see README).
 */
export function scoreCandidates(
  state: TasteState,
  qlooScores: Record<string, number>,
  seen: Set<string>
): ScoredCandidate[] {
  const posInterests: Record<string, number> = {};
  for (const s of state.signals) {
    if (s.interaction === "like" && s.entityId.startsWith("card:")) {
      posInterests[s.entityId.slice(5)] = 1;
    }
  }
  // Signal-weighted taste vector (recency + diminishing returns already baked into signal.weight),
  // so what you picked lately counts more and one repeated pick can't dominate.
  const userVec: Record<string, number> = {};
  let likeCount = 0;
  for (const s of state.signals) {
    if (s.interaction === "skip") continue;
    const card = cardsById().get(s.cardId) ?? getLiveCard(s.cardId);
    if (!card) continue;
    if (s.interaction === "like") likeCount++;
    for (const t of card.tags) userVec[t] = (userVec[t] ?? 0) + s.weight;
  }
  const idf = tagIdf();
  const userNorm = Math.sqrt(Object.entries(userVec).reduce((a, [t, w]) => a + (w * (idf[t] ?? 1)) ** 2, 0)) || 1;
  const conf = computeConfidence(state);

  const totalDomains = Object.entries(state.domainWeights).reduce(
    (a, [, v]) => (v > 0 ? a + v : a),
    0
  );

  const out: ScoredCandidate[] = [];
  for (const card of SEED_CARDS) {
    if (seen.has(card.id)) continue;
    const qloo = qlooScores[card.id] ?? mockAffinity(card.id, posInterests);
    // IDF-weighted cosine: sharing a rare tag ("kaiseki") says far more than a common one ("warm")
    let dot = 0;
    let cn = 0;
    for (const t of card.tags) {
      const w = idf[t] ?? 1;
      cn += w * w;
      dot += (userVec[t] ?? 0) * w * w;
    }
    const tagSim = cn > 0 ? Math.max(0, dot / (Math.sqrt(cn) * userNorm * 1)) : 0;

    // early on, widen across domains; later, lean into the domains you actually love
    const domW = state.domainWeights[card.domain] ?? 0;
    const share = totalDomains > 0 ? domW / totalDomains : 0;
    const balance = totalDomains > 0 ? Math.max(0, 1 - share) : 1;
    const domainAffinity = Math.min(1, share * 3);

    const novelty = seen.size === 0 ? 1 : 1 - qloo;

    const score =
      WEIGHTS.qloo * qloo +
      WEIGHTS.bridge * (qlooScores[card.id] ?? 0) * 0 + // bridge merged into qloo in mock; live explainability boosts below
      (WEIGHTS.tag + 0.35 * Math.min(1, likeCount / 40)) * Math.min(1, tagSim * 1.6) +
      WEIGHTS.balance * (1 - conf) * balance +
      0.12 * conf * domainAffinity +
      WEIGHTS.novelty * novelty * 0.5; // dampened so novelty never swamps signal

    out.push({ card, score, parts: { qloo, bridge: qlooScores[card.id] ?? 0, tag: tagSim, balance, novelty }, pool: "exploit" });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** How well a tag set fits the user's weighted taste vector (IDF-weighted cosine, 0..1). */
export function tasteSimilarity(state: TasteState, tags: string[]): number {
  const idf = tagIdf();
  const user: Record<string, number> = {};
  for (const sg of state.signals) {
    if (sg.interaction === "skip") continue;
    const c = cardsById().get(sg.cardId) ?? getLiveCard(sg.cardId);
    if (!c) continue;
    for (const t of c.tags) user[t] = (user[t] ?? 0) + sg.weight;
  }
  let dot = 0;
  let cn = 0;
  for (const t of tags) {
    const w = idf[t] ?? 1;
    cn += w * w;
    dot += (user[t] ?? 0) * w * w;
  }
  const un = Math.sqrt(Object.entries(user).reduce((a, [t, w]) => a + (w * (idf[t] ?? 1)) ** 2, 0)) || 1;
  return cn > 0 ? Math.max(0, dot / (Math.sqrt(cn) * un)) : 0;
}

let _idf: Record<string, number> | null = null;
function tagIdf(): Record<string, number> {
  if (_idf) return _idf;
  const df: Record<string, number> = {};
  for (const c of SEED_CARDS) for (const t of new Set(c.tags)) df[t] = (df[t] ?? 0) + 1;
  _idf = {};
  for (const [t, n] of Object.entries(df)) _idf[t] = Math.log(1 + SEED_CARDS.length / n);
  return _idf;
}

function assignPools(ranked: ScoredCandidate[]): void {
  // exploit = top tier, adjacent = middle, novel = tail + unexplored domains
  const n = ranked.length;
  ranked.forEach((c, i) => {
    const pct = i / Math.max(1, n - 1);
    c.pool = pct < 0.3 ? "exploit" : pct < 0.7 ? "adjacent" : "novel";
  });
}

export function batchTargets(count: number, confidence = 0): { exploit: number; adjacent: number; novel: number } {
  // the more we know, the more we exploit: 70/20/10 at the start → 85/11/4 once confident
  const ex = 0.7 + 0.15 * confidence;
  const adj = 0.2 - 0.09 * confidence;
  return {
    exploit: Math.round(count * ex),
    adjacent: Math.round(count * adj),
    novel: count - Math.round(count * ex) - Math.round(count * adj),
  };
}

// ---------- adaptive feed ----------
export async function nextBatch(session: {
  state: TasteState;
  currentRound: number;
}, count = 12, onlyDomains?: string[]): Promise<{ cards: TasteCard[]; adapted: boolean; pools: Record<string, ExplorationPool> }> {
  const state = session.state;
  const seen = new Set(state.shownCardIds);
  // a live Qloo card and its seed twin are the same thing to the user — treat both as seen
  const seenTitles = new Set<string>();
  for (const id of state.shownCardIds) {
    const t = cardsById().get(id)?.title ?? getLiveCard(id)?.title;
    if (t) seenTitles.add(t.toLowerCase());
  }
  for (const c of SEED_CARDS) if (seenTitles.has(c.title.toLowerCase())) seen.add(c.id);

  if (state.signals.length === 0) {
    // never repeat a card already shown — clicking "next" on the gallery must
    // deal a fresh wall even before any interaction was recorded. Round-robin
    // across domains so any slice stays visually diverse.
    const fresh = COLD_START_IDS.filter((id) => !seen.has(id));
    const ids = fresh.length ? fresh : COLD_START_IDS;
    const all = ids.map((id) => cardsById().get(id)!).filter(Boolean);
    const byDomain = new Map<string, TasteCard[]>();
    for (const c of all) {
      const arr = byDomain.get(c.domain) ?? [];
      arr.push(c);
      byDomain.set(c.domain, arr);
    }
    const cards: TasteCard[] = [];
    let remaining = true;
    while (cards.length < count && remaining) {
      remaining = false;
      for (const arr of byDomain.values()) {
        if (cards.length >= count) break;
        const next = arr.shift();
        if (next) {
          cards.push(next);
          remaining = true;
        }
      }
    }
    const pools: Record<string, ExplorationPool> = {};
    cards.forEach((c) => (pools[c.id] = "novel"));
    return { cards, adapted: false, pools };
  }

  const decisive = state.signals.filter((s) => s.interaction !== "skip");
  const adapter = getQlooAdapter();
  const rot = state.shownCardIds.length + session.currentRound * 7; // keeps rotating after the shown-list cap
  // a seed that is the same thing as a vibe you already picked ("Ramen" after the Ramen tile) is not news
  for (const id of pickedTwins(likedIds(state))) seen.add(id);

  let liveCards: TasteCard[] = [];
  const qlooScores: Record<string, number> = {};
  if (adapter.mode === "live") {
    // Cross-domain jump is the point: ask for film / tv / games that fit the taste.
    // (Qloo's generic "place" type returns hotels and bars, destinations/brands ship without photos,
    // and artists are portraits — so those stay with the curated seed cards.)
    // Each domain is seeded with its own anchors (your picks there, stand-ins for your vibes, the best
    // local matches) — a mixed bag of everything drifts toward whatever is merely popular.
    const LIVE_DOMAINS: Domain[] = ["film", "tv", "game"]; // live books skew to non-fiction/memoir — curated seed books are better
    const liveAllowed = onlyDomains ? LIVE_DOMAINS.filter((d) => onlyDomains.includes(d)) : LIVE_DOMAINS;
    const uniqueDomains = liveAllowed.length ? [...new Set([0, 1, 2].map((k) => liveAllowed[(rot + k) % liveAllowed.length]))] : [];
    const local = scoreCandidates(state, {}, likedIds(state)).map((c) => c.card);
    const perDomain = await Promise.all(
      uniqueDomains.map(async (d) => {
        const all = anchorsFor(state, [d], { max: 12, inferred: local });
        // rotate the window so successive batches ask the graph different (taste-consistent) questions
        const win = all.length <= 7 ? all : Array.from({ length: 7 }, (_, k) => all[(rot + k) % all.length]);
        const { ids } = await resolveAnchors(win);
        if (!ids.length) return { entities: [] as QlooEntity[] };
        return adapter.getRecommendations({ interests: ids, domain: d, take: 40, excludeIds: ids });
      })
    );
    liveCards = perDomain.flatMap((r, i) => r.entities.map((e) => liveEntityToCard(e, uniqueDomains[i])));
    liveCards = liveCards.filter((c) => typeof c.imageUrl === "string"); // never serve a card we can't picture
    registerLiveCards(liveCards);
  } else {
    // mock graph: affinity is keyed by seed ids, so it can score the curated corpus directly
    const likedCardIds = [...likedIds(state)].filter((id) => !isVibe(id)).slice(0, 10);
    const recs = await adapter.getRecommendations({ interests: likedCardIds.map((id) => `card:${id}`), take: 30, excludeIds: likedCardIds });
    for (const e of recs.entities) qlooScores[e.entityId.replace(/^card:/, "").replace(/^mock:/, "")] = e.affinity ?? 0.5;
  }

  if (onlyDomains) liveCards = liveCards.filter((c) => onlyDomains.includes(c.domain));

  const ranked = scoreCandidates(state, qlooScores, seen);
  // Qloo-boosted candidates get a merge advantage (its affinity replaces pure-local)
  for (const c of ranked) {
    if (qlooScores[c.card.id] !== undefined) {
      c.score += WEIGHTS.bridge * 0.5 * (qlooScores[c.card.id] ?? 0);
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  if (onlyDomains) {
    const keep = ranked.filter((c) => onlyDomains.includes(c.card.domain));
    ranked.length = 0;
    ranked.push(...keep);
  }
  assignPools(ranked);

  const targets = batchTargets(count, computeConfidence(state));
  const pools: Record<string, ExplorationPool> = {};
  const picked: TasteCard[] = [];
  const domainPerBatch: Record<string, number> = {};

  function take(pool: ExplorationPool, n: number) {
    let taken = 0;
    for (const c of ranked) {
      if (taken >= n) break;
      if (c.pool !== pool || picked.includes(c.card)) continue;
      const perDom = domainPerBatch[c.card.domain] ?? 0;
      if (perDom >= Math.max(2, Math.ceil(count / 4))) continue; // keep batch visually diverse
      picked.push(c.card);
      pools[c.card.id] = pool;
      domainPerBatch[c.card.domain] = perDom + 1;
      taken++;
    }
  }

  // exploration level decays as confidence grows, shifting mix toward exploit
  const conf = computeConfidence(state);
  state.confidence = conf;
  state.explorationLevel = Math.max(0, 1 - conf);

  // Live-graph cards earn real slots: the Qloo suggestions ARE the point.
  const likedDomains = new Set(decisive.filter((s) => s.interaction === "like").map((s) => s.domain));
  const liveSlots = Math.min(liveCards.length, Math.ceil(count * 0.4));
  const seedTarget = count - liveSlots;

  take("exploit", Math.min(targets.exploit, seedTarget));
  take("adjacent", Math.min(targets.adjacent, Math.max(0, seedTarget - picked.length)));
  take("novel", Math.max(0, seedTarget - picked.length));
  // fill any seed shortfall from ranked order
  for (const c of ranked) {
    if (picked.length >= seedTarget) break;
    if (!picked.includes(c.card)) {
      picked.push(c.card);
      pools[c.card.id] = c.pool;
    }
  }

  // append live Qloo entities (deduped against picked seed titles)
  const pickedTitles = new Set(picked.map((c) => c.title.toLowerCase()));
  // never re-serve what the user already saw (by id, or by title for seed/live twins)
  for (const id of seen) {
    const t = cardsById().get(id)?.title ?? getLiveCard(id)?.title;
    if (t) pickedTitles.add(t.toLowerCase());
  }
  // live cards keep Qloo's affinity order; cap per domain so one type can't flood a batch
  // (relaxed only when the curated seeds are exhausted)
  const liveDom: Record<string, number> = {};
  for (const cap of [Math.ceil(count / 4), count]) {
    for (const lc of liveCards) {
      if (picked.length >= count) break;
      if (seen.has(lc.id) || pickedTitles.has(lc.title.toLowerCase())) continue;
      if ((liveDom[lc.domain] ?? 0) >= cap) continue;
      pickedTitles.add(lc.title.toLowerCase());
      liveDom[lc.domain] = (liveDom[lc.domain] ?? 0) + 1;
      picked.push(lc);
      pools[lc.id] = likedDomains.has(lc.domain) ? "exploit" : "adjacent";
    }
  }

  // Endless feed: only when fresh cards genuinely run out do we start another lap — oldest-shown
  // first, never anything the user already picked, and always with a photo.
  if (picked.length < Math.ceil(count / 2)) {
    const liked = new Set(state.signals.map((sg) => sg.cardId));
    const have = new Set(picked.map((c) => c.id));
    for (const id of state.shownCardIds) {
      if (picked.length >= count) break;
      const c = cardsById().get(id) ?? getLiveCard(id);
      if (!c || have.has(id) || liked.has(id) || isVibe(id) || c.domain === "music" || !imageFor(c)) continue;
      if (onlyDomains && !onlyDomains.includes(c.domain)) continue;
      picked.push(c);
      have.add(id);
      pools[id] = "adjacent";
    }
  }

  return { cards: picked.slice(0, count), adapted: true, pools };
}

// ---------- profile ----------
/** Best real photo for any card: live Qloo image, resolved seed photo, or the vibe's first photo. */
export function imageFor(card: TasteCard): string | undefined {
  return card.imageUrl ?? (CARD_IMAGES as Record<string, string>)[card.id] ?? (VIBE_IMAGES as Record<string, string[]>)[card.id]?.[0];
}

/** Remove every signal for a card and subtract its contribution from the taste vector (profile tweaking). */
export function removeCardSignals(state: TasteState, cardId: string): number {
  const gone = state.signals.filter((s) => s.cardId === cardId);
  if (!gone.length) return 0;
  const card = cardsById().get(cardId) ?? getLiveCard(cardId);
  for (const s of gone) {
    // exact reversal: what was passed over elsewhere (negative weight) must survive removing a like
    for (const t of card?.tags ?? []) {
      const v = (state.tagVector[t] ?? 0) - s.weight;
      if (Math.abs(v) > 0.001) state.tagVector[t] = v;
      else delete state.tagVector[t];
    }
    state.domainWeights[s.domain] = (state.domainWeights[s.domain] ?? 0) - domainDelta(s.interaction, s.strength ?? 1);
  }
  state.signals = state.signals.filter((s) => s.cardId !== cardId);
  state.lastUpdated = new Date().toISOString();
  return gone.length;
}

const ARCHETYPES: { match: string[]; name: string; description: string }[] = [
  { match: ["minimal", "quiet", "zen", "silence", "precise"], name: "Quiet Intensity", description: "restrained, atmospheric, precise — you let space and silence do the talking" },
  { match: ["neon", "night", "urban", "vibrant", "strobe"], name: "Neon Velocity", description: "electric, urban, after-dark — you like culture at full volume" },
  { match: ["warm", "cozy", "rustic", "seasonal", "domestic"], name: "Warm Hearth", description: "warm, handmade, unhurried — comfort as a cultural stance" },
  { match: ["maximal", "ornate", "playful", "loud"], name: "Joyful Maximalism", description: "more is more — color, pattern, and pleasure without apology" },
  { match: ["raw", "gritty", "punk", "street", "rebellious"], name: "Raw Edge", description: "honest textures and friction — you trust things that look used" },
  { match: ["craft", "artisan", "handmade", "precision", "technical"], name: "The Craft Mind", description: "process-forward — you taste the maker's hand in everything" },
  { match: ["surreal", "dreamy", "ethereal", "hazy", "immersive"], name: "Dream Logic", description: "drifting, associative, oneiric — your taste blurs the real" },
  { match: ["political", "activist", "communal", "community", "guerrilla"], name: "Collective Spirit", description: "culture with a stance — you lean toward work that argues for something" },
  { match: ["retro", "nostalgic", "faded", "analog", "vintage"], name: "Analog Nostalgia", description: "time-worn and warm — you like the future with a memory" },
  { match: ["sci-fi", "futuristic", "tech", "machine", "brutal"], name: "Cold Frontier", description: "systematic, metallic, forward-leaning — beauty at low temperature" },
];

/** IDF-weighted archetype scores: sharing a distinctive tag ("zen") says more than a common one ("warm"). */
function archetypeScores(tagVector: Record<string, number>) {
  const idf = sharedIdf();
  return ARCHETYPES.map((a) => ({ a, score: a.match.reduce((acc, m) => acc + Math.max(0, tagVector[m] ?? 0) * Math.sqrt(idf[m] ?? 1), 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
}

export function deriveArchetype(tagVector: Record<string, number>): { name: string; description: string; secondary?: string } {
  const ranked = archetypeScores(tagVector);
  if (!ranked.length) {
    const top = Object.entries(tagVector).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => prettyTag(t));
    return { name: `Emerging ${top.join(" + ") || "taste"}`, description: "your taste is still forming — keep going" };
  }
  const [first, second] = ranked;
  // a strong second pull makes the read more personal than a single bucket
  const blend = second && second.score >= first.score * 0.6 ? second.a.name : undefined;
  return { name: first.a.name, description: first.a.description, ...(blend ? { secondary: blend } : {}) };
}

const AXES: { left: string; right: string; a: string[]; b: string[] }[] = [
  { left: "Calm", right: "Electric", a: ["quiet", "calm", "zen", "minimal", "slow", "meditative", "silence", "cozy", "ritual"], b: ["neon", "loud", "night", "energetic", "vibrant", "kinetic", "strobe", "street", "playful"] },
  { left: "Timeless", right: "Futuristic", a: ["classic", "timeless", "nostalgic", "retro", "analog", "vintage", "faded", "literary"], b: ["futuristic", "tech", "sci-fi", "retro-future", "digital", "modular", "machine", "immersive"] },
  { left: "Handmade", right: "Precise", a: ["handmade", "craft", "artisan", "rustic", "organic", "earthy", "textile", "wood"], b: ["precise", "precision", "rational", "geometric", "technical", "modernist", "functional", "industrial"] },
  { left: "Understated", right: "Maximal", a: ["minimal", "quiet-luxury", "restrained", "austere", "simple", "monochrome", "white"], b: ["maximal", "ornate", "colorful", "pop", "luxury", "golden", "loud", "pastel"] },
  { left: "Cozy", right: "Adventurous", a: ["cozy", "warm", "domestic", "comfort", "intimate", "social"], b: ["remote", "epic", "dramatic", "raw", "gritty", "adventure", "mountain", "wonder"] },
];

function computeAxes(tagVector: Record<string, number>) {
  return AXES.map((ax) => {
    const sum = (tags: string[]) => tags.reduce((acc, t) => acc + Math.max(0, tagVector[t] ?? 0), 0);
    const l = sum(ax.a);
    const r = sum(ax.b);
    // centred at 0.5, and a handful of picks can't pin the dial to an edge
    return { left: ax.left, right: ax.right, value: Math.round((0.5 + 0.46 * ((r - l) / (l + r + 2))) * 100) / 100 };
  });
}

const DOMAIN_NOUN: Record<string, string> = {
  film: "films", tv: "series", book: "books", game: "games", food: "food", travel: "places", architecture: "architecture",
  art: "art", fashion: "fashion", brand: "brands", lifestyle: "pastimes", music: "music",
};

// tags too broad to name a theme by
const VAGUE = new Set(["warm", "quiet", "classic", "modern", "calm", "simple", "social", "playful", "cozy", "craft"]);

/**
 * Threads: the recurring themes in what someone picked, each with the real things behind it
 * ("Japanese — Ramen, Temple lanes, Spirited Away"). Greedy so threads don't repeat the same items.
 */
function buildThreads(state: TasteState): { tag: string; label: string; items: string[] }[] {
  const idf = sharedIdf();
  const liked = likedWeights(state).map(([id, w]) => ({ c: lookupCard(id)!, w }));
  const cands = Object.entries(state.tagVector)
    .filter(([t, v]) => v > 0 && !VAGUE.has(t))
    .map(([t, v]) => {
      const members = liked.filter((l) => l.c.tags.includes(t));
      return { t, members, s: v * Math.sqrt(idf[t] ?? 1) };
    })
    .filter((x) => x.members.length >= 3)
    .sort((a, b) => b.s - a.s);
  const used = new Map<string, number>();
  const out: { tag: string; label: string; items: string[] }[] = [];
  for (const x of cands) {
    if (out.length >= 4) break;
    const fresh = x.members.filter((m) => !used.has(m.c.id));
    if (fresh.length < Math.max(2, x.members.length * 0.5)) continue;
    const defining = (m: { c: TasteCard; w: number }) => m.w / (1 + m.c.tags.indexOf(x.t) * 0.6);
    const items = [...fresh, ...x.members.filter((m) => used.has(m.c.id))]
      .sort((a, b) => defining(b) - defining(a))
      .slice(0, 4)
      .map((m) => m.c.title);
    for (const m of fresh) used.set(m.c.id, 1);
    const label = x.t.endsWith("-food") ? `${prettyTag(x.t)} food` : prettyTag(x.t);
    if (out.some((o) => o.label === label)) continue;
    out.push({ tag: x.t, label, items });
  }
  return out;
}

const PROPER_TAG = /^[A-Z]/;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s); // keeps "DJing", "3D printing"
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function buildProfile(session: {
  id: string;
  state: TasteState;
  profileVersions: unknown[];
}): TasteProfile {
  const state = session.state;
  const lookup = lookupCard;
  const dislikes = state.signals.filter((s) => s.interaction === "dislike");
  const liked = likedWeights(state);
  const likedSet = new Set(liked.map(([id]) => id));
  const entityWeight = Object.fromEntries(liked);

  const coreEntities = liked
    .slice(0, 8)
    .map(([id]) => lookup(id)!)
    .map((c) => ({ title: c.title, domain: c.domain, cardId: c.id, imageUrl: imageFor(c) }));

  const gallery = liked
    .map(([id]) => lookup(id)!)
    .filter((c) => !!imageFor(c))
    .map((c) => ({ title: c.title, domain: c.domain, cardId: c.id, imageUrl: imageFor(c)!, weight: entityWeight[c.id] ?? 0 }))
    .slice(0, 48);

  // distinctive-first: a rare shared tag says more about you than "warm"
  const idf = sharedIdf();
  const inferredTags = Object.entries(state.tagVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] * Math.sqrt(idf[b[0]] ?? 1) - a[1] * Math.sqrt(idf[a[0]] ?? 1))
    .slice(0, 14)
    .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 100) / 100 }));

  const totalPos = Object.values(state.domainWeights).reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const domainPreferences: Record<string, number> = {};
  for (const d of DOMAINS) {
    const w = Math.max(0, state.domainWeights[d] ?? 0);
    if (w > 0) domainPreferences[d] = Math.round((w / totalPos) * 100) / 100;
  }

  const clusters = DOMAINS.map((d) => {
    const cards = liked.map(([id]) => lookup(id)!).filter((c) => c.domain === d);
    const tags = [...new Set(cards.flatMap((c) => c.tags))]
      .map((t) => ({ t, w: state.tagVector[t] ?? 0 }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map((x) => x.t);
    return { domain: d, label: d.toUpperCase(), entities: cards.slice(0, 5).map((c) => c.title), tags };
  }).filter((c) => c.entities.length > 0);

  // Unexpected connections: high-affinity seeds from domains you never liked, each named by the picks it shares the most with.
  const likedDomains = new Set(liked.map(([id]) => lookup(id)!.domain));
  const posInterests: Record<string, number> = {};
  for (const [id] of liked) posInterests[id] = 1;
  const twins = pickedTwins(likedSet);
  const unexpected: UnexpectedConnection[] = [];
  const ranked = SEED_CARDS.filter((c) => !likedDomains.has(c.domain) && c.domain !== "music" && !twins.has(c.id))
    .map((c) => ({ card: c, aff: Math.max(mockAffinity(c.id, posInterests), tasteSimilarity(state, c.tags)) }))
    .filter((x) => x.aff > 0.08)
    .sort((a, b) => b.aff - a.aff);
  for (const { card, aff } of ranked) {
    if (unexpected.length >= 4) break;
    const bridges = becauseOf(state, card.tags, { k: 3, min: 5 });
    if (!bridges.length) continue;
    unexpected.push({
      title: card.title,
      domain: card.domain,
      cardId: card.id,
      imageUrl: imageFor(card),
      reason: `You haven't picked any ${DOMAIN_NOUN[card.domain] ?? card.domain} yet, but this shares a lot with ${list(bridges.slice(0, 2))}.`,
      bridges,
      qlooBacked: false,
      source: "local",
      affinity: Math.round(aff * 100) / 100,
    });
  }

  // What you'd probably love next: best-scoring unpicked cards, spread across domains, each with the picks that point to it.
  const exclude = new Set([...likedSet, ...twins]);
  const eligible = scoreCandidates(state, {}, exclude).filter((c) => !isVibe(c.card.id) && imageFor(c.card) && c.card.domain !== "music");
  const fitting = eligible.filter((c) => c.parts.tag > 0.04);
  const scored = fitting.length >= 24 ? fitting : eligible;
  const perDomain: Record<string, number> = {};
  const suggestions = scored
    .map((c) => ({ c, s: c.score }))
    .sort((a, b) => b.s - a.s)
    .reduce<{ c: ScoredCandidate; s: number }[]>((acc, x) => {
      // diversify: each extra pick from the same domain costs a little
      const n = perDomain[x.c.card.domain] ?? 0;
      perDomain[x.c.card.domain] = n + 1;
      acc.push({ c: x.c, s: x.s - 0.035 * n });
      return acc;
    }, [])
    .sort((a, b) => b.s - a.s)
    .slice(0, 60)
    .map(({ c }) => ({
      title: c.card.title,
      domain: c.card.domain,
      cardId: c.card.id,
      imageUrl: imageFor(c.card)!,
      why: becauseOf(state, c.card.tags, { exclude: c.card.id }),
    }));

  const archetype = deriveArchetype(state.tagVector);
  const conf = computeConfidence(state);
  const mode = getQlooAdapter().mode;
  const axes = computeAxes(state.tagVector);
  const threads = buildThreads(state);
  const hobbies = liked
    .filter(([id]) => id.startsWith("h-"))
    .map(([id]) => lookup(id)!)
    .slice(0, 8)
    .map((c) => ({ cardId: c.id, title: c.title, imageUrl: imageFor(c) }));
  const passedOver = Object.entries(state.tagVector)
    .filter(([t, w]) => w < -0.4 && !VAGUE.has(t))
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([t]) => prettyTag(t));

  const day = buildDay(state, scored.map((c) => c.card), hobbies);

  const topTags = inferredTags.slice(0, 5).map((t) => prettyTag(t.tag));
  const tasteSummary = !topTags.length ? "Your selections suggest your taste is still taking shape: pick a few things you love." : `Your selections suggest a pull toward ${list(topTags.slice(0, 3))}${topTags.length > 3 ? `, with a streak of ${list(topTags.slice(3))}` : ""}.`;

  // A grounded, personal read: every clause names things the person actually picked.
  const lines: string[] = [];
  const theme = (t: { tag: string; label: string }) => (PROPER_TAG.test(t.label) ? t.label : lowerFirst(t.label));
  if (threads[0]) lines.push(`Your picks keep circling back to ${theme(threads[0])} things — ${list(threads[0].items.slice(0, 3))}.`);
  if (threads[1]) lines.push(`There's a clear ${theme(threads[1])} streak too (${list(threads[1].items.slice(0, 2))}).`);
  if (hobbies.length >= 2) lines.push(`Off-screen, your time goes to ${list(hobbies.slice(0, 3).map((h) => lowerFirst(h.title)))}.`);
  const leaning = [...axes]
    .filter((a) => Math.abs(a.value - 0.5) > 0.12)
    .sort((a, b) => Math.abs(b.value - 0.5) - Math.abs(a.value - 0.5))
    .slice(0, 2)
    .map((a) => (a.value < 0.5 ? `${lowerFirst(a.left)} over ${lowerFirst(a.right)}` : `${lowerFirst(a.right)} over ${lowerFirst(a.left)}`));
  if (leaning.length) lines.push(`You lean ${list(leaning)}.`);
  if (passedOver.length) lines.push(`You tended to pass over anything ${list(passedOver.map(lowerFirst)).replace(" and ", " or ")}.`);
  const narrative = lines.length ? lines.join(" ") : `${archetype.name}. ${tasteSummary}`;

  return {
    sessionId: session.id,
    profileVersion: Math.max(session.state.profileVersion ?? 0, session.profileVersions.length) + 1,
    interactionCount: state.signals.length,
    confidence: conf,
    archetype,
    coreEntities,
    gallery,
    suggestions,
    axes,
    threads,
    hobbies,
    passedOver,
    day,
    positiveSignals: coreEntities.map((e) => ({ ...e, weight: entityWeight[e.cardId] ?? 0 })),
    negativeSignals: [...new Set(dislikes.map((s) => s.cardId))]
      .map((id) => ({ c: lookup(id), w: dislikes.filter((s) => s.cardId === id).reduce((a, s) => a + s.weight, 0) }))
      .filter((x) => x.c && x.w < -0.5)
      .sort((a, b) => a.w - b.w)
      .slice(0, 6)
      .map(({ c, w }) => ({ title: c!.title, domain: c!.domain, cardId: c!.id, weight: Math.round(w * 100) / 100 })),
    inferredTags,
    domainPreferences,
    clusters,
    unexpectedConnections: unexpected,
    tasteSummary,
    narrative,
    lastUpdated: new Date().toISOString(),
    mode,
  };
}

const MORNING = ["morning", "coffee", "brewing", "breakfast", "spread", "fika", "tea"];
const DINNER_NOT = new Set(["morning", "breakfast", "spread", "coffee", "brewing"]);

/** Morning → night from the best unpicked matches of the right kind, each slot with its reason. */
function buildDay(state: TasteState, ranked: TasteCard[], hobbies: { cardId: string; title: string; imageUrl?: string }[]): NonNullable<TasteProfile["day"]> {
  const used = new Set<string>();
  const avoided = (c: TasteCard) => c.tags.some((t) => (state.tagVector[t] ?? 0) < -0.4);
  const take = (ok: (c: TasteCard) => boolean) => {
    const c = ranked.find((x) => !used.has(x.id) && !avoided(x) && ok(x));
    if (c) used.add(c.id);
    return c;
  };
  const slot = (name: string, line: string, c?: TasteCard) =>
    c ? [{ slot: name, title: c.title, imageUrl: imageFor(c), line, why: becauseOf(state, c.tags, { exclude: c.id }), cardId: c.id }] : [];
  const morning = take((c) => ["food", "lifestyle"].includes(c.domain) && c.tags.some((t) => MORNING.includes(t)));
  // the afternoon belongs to something you said you'd actually do
  const hobby = hobbies.find((h) => h.imageUrl);
  const afternoon = hobby
    ? [{ slot: "Afternoon", title: hobby.title, imageUrl: hobby.imageUrl, line: "Because you said you'd actually do it", why: [], cardId: hobby.cardId }]
    : slot("Afternoon", "Lose an hour here", take((c) => ["art", "architecture", "travel"].includes(c.domain)));
  const dinner = take((c) => c.domain === "food" && !c.tags.some((t) => DINNER_NOT.has(t)));
  const night = take((c) => ["film", "tv", "book", "game"].includes(c.domain));
  return [...slot("Morning", "Start slow with this", morning), ...afternoon, ...slot("Evening", "Dinner, sorted", dinner), ...slot("Night", "Wind down with this", night)];
}

export { tagAffinity };

/**
 * Live-graph variant of "unexpected connections": queries /v2/insights for domains the user has
 * never liked, seeded by their real picks (vibes stand in through real entities), and keeps only
 * entities whose explainability names something they actually picked. Falls back silently.
 */
export async function enrichConnectionsLive(session: { state: TasteState }, profile: TasteProfile): Promise<TasteProfile> {
  const adapter = getQlooAdapter();
  if (adapter.mode !== "live") return profile;

  const state = session.state;
  if (likes(state) < 2) return profile;
  const likedDomains = new Set(likedWeights(state).map(([id]) => lookupCard(id)!.domain));
  const local = scoreCandidates(state, {}, likedIds(state)).map((c) => c.card);

  // Probe unexplored domains first; if the user touched almost everything,
  // fall back to their weakest liked domains so the live graph still gets a say.
  const unexplored = DOMAINS.filter((d) => !likedDomains.has(d) && d !== "music" && DOMAIN_TO_QLOO_TYPE[d]);
  const weak = [...likedDomains]
    .filter((d) => DOMAIN_TO_QLOO_TYPE[d] && ["film", "tv", "book", "game"].includes(d))
    .sort((a, b) => (state.domainWeights[a] ?? 0) - (state.domainWeights[b] ?? 0))
    .slice(0, 2);
  const targetDomains = [...unexplored.filter((d) => ["film", "tv", "book", "game", "travel"].includes(d)), ...weak].slice(0, 3);
  if (!targetDomains.length) return profile;

  const existing = new Set(profile.unexpectedConnections.map((c) => c.title.toLowerCase()));
  // each domain is seeded in its own neighbourhood (best local matches there + your strongest picks),
  // otherwise the graph answers with whatever is merely popular
  const results = await Promise.all(
    targetDomains.map(async (d) => {
      const ra = await resolveAnchors(anchorsFor(state, [d], { max: 8, inferred: local }));
      if (!ra.ids.length) return { entities: [] as QlooEntity[], nameOf: ra.nameOf };
      const recs = await adapter.getRecommendations({ interests: ra.ids, domain: d, take: 8, excludeIds: ra.ids }).catch(() => ({ entities: [] as QlooEntity[] }));
      return { entities: recs.entities, nameOf: ra.nameOf };
    })
  );
  const live: UnexpectedConnection[] = [];
  results.forEach(({ entities, nameOf }, i) => {
    const d = targetDomains[i];
    for (const e of entities) {
      if (live.length >= 2 || live.some((x) => x.domain === d)) break;
      if (existing.has(e.name.toLowerCase())) continue;
      const { because } = explain(e.explainability, nameOf);
      if (!because.length) continue; // no grounded explanation — skip
      existing.add(e.name.toLowerCase());
      const fresh = !likedDomains.has(d);
      live.push({
        title: e.name,
        domain: d,
        imageUrl: e.imageUrl,
        reason: `${fresh ? `You haven't picked any ${DOMAIN_NOUN[d] ?? d} yet, but` : "Off your usual path:"} Qloo's live graph links this to ${list(because)} (${Math.round((e.affinity ?? 0.5) * 100)}% affinity).`,
        bridges: because,
        qlooBacked: true,
        source: "qloo",
        affinity: e.affinity,
      });
    }
  });
  if (!live.length) return profile;
  return { ...profile, unexpectedConnections: [...live, ...profile.unexpectedConnections].slice(0, 6) };
}

function likes(state: TasteState): number {
  return state.signals.filter((s) => s.interaction === "like").length;
}
