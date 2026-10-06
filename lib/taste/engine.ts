import type {
  Domain,
  ExplorationPool,
  TasteCard,
  TasteProfile,
  TasteSignal,
  TasteState,
  UnexpectedConnection,
} from "@/lib/types";
import { DOMAINS, DOMAIN_TO_QLOO_TYPE } from "@/lib/types";
import { COLD_START_IDS, SEED_CARDS, cardsById } from "@/data/cards";
import { mockAffinity, tagAffinity } from "@/lib/qloo/mock";
import { getQlooAdapter } from "@/lib/qloo";
import { resolveCardEntities } from "@/lib/qloo/resolve";
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
  source?: string
): void {
  const sameEntityCount = state.signals.filter((s) => s.entityId === entityId).length;
  const base = INTERACTION_WEIGHT[interaction];
  if (base !== 0) {
    const w = base * diminishing(sameEntityCount) * recency(state.signals.length, state.signals.length + 1);
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
    });
    // tag vector update
    for (const t of card.tags) {
      state.tagVector[t] = (state.tagVector[t] ?? 0) + w;
    }
    // domain weights: likes attract, dislikes repel slightly
    state.domainWeights[card.domain] =
      (state.domainWeights[card.domain] ?? 0) + (base > 0 ? 1 : base < 0 ? -0.4 : 0);
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

// ---------- confidence ----------
export function computeConfidence(state: TasteState): number {
  const pos = state.signals.filter((s) => s.interaction === "like").length;
  const neg = state.signals.filter((s) => s.interaction === "dislike").length;
  const interactions = pos + neg;
  if (interactions === 0) return 0;
  const countScore = Math.min(1, interactions / 30); // 30 decisive interactions ≈ full
  const domainsCovered = new Set(
    state.signals.filter((s) => s.interaction !== "skip").map((s) => s.domain)
  ).size;
  const domainScore = Math.min(1, domainsCovered / Math.min(6, DOMAINS.length));
  const balance = Math.min(pos, neg) / Math.max(1, pos + neg); // having both poles adds info
  const polarityScore = 0.7 + 0.3 * balance;
  return Math.round(Math.min(1, countScore * 0.6 + domainScore * 0.25 + (polarityScore - 0.7) * 0.5 + 0.15 * domainScore) * 100) / 100;
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
  const posTagVector: Record<string, number> = {};
  const negTagVector: Record<string, number> = {};
  for (const s of state.signals) {
    const card = cardsById().get(s.cardId);
    if (!card) continue;
    const target = s.interaction === "like" ? posTagVector : s.interaction === "dislike" ? negTagVector : null;
    if (!target) continue;
    for (const t of card.tags) target[t] = (target[t] ?? 0) + 1;
  }

  const totalDomains = Object.entries(state.domainWeights).reduce(
    (a, [k, v]) => (v > 0 ? a + v : a),
    0
  );

  const out: ScoredCandidate[] = [];
  for (const card of SEED_CARDS) {
    if (seen.has(card.id)) continue;
    const qloo = qlooScores[card.id] ?? mockAffinity(card.id, posInterests);
    const cardTags = new Set(card.tags);
    let inter = 0;
    let unionSize = card.tags.length;
    for (const [t, w] of Object.entries(posTagVector)) {
      unionSize += w;
      if (cardTags.has(t)) inter += w;
    }
    let negOverlap = 0;
    for (const [t, w] of Object.entries(negTagVector)) if (cardTags.has(t)) negOverlap += w;
    const tagSim = unionSize > 0 ? Math.max(0, inter / unionSize - negOverlap * 0.15) : 0;

    // domain balance: prefer domains under-represented in positive weight
    const domW = state.domainWeights[card.domain] ?? 0;
    const balance = totalDomains > 0 ? Math.max(0, 1 - domW / totalDomains) : 1;

    const novelty = seen.size === 0 ? 1 : 1 - qloo;

    const score =
      WEIGHTS.qloo * qloo +
      WEIGHTS.bridge * (qlooScores[card.id] ?? 0) * 0 + // bridge merged into qloo in mock; live explainability boosts below
      WEIGHTS.tag * tagSim +
      WEIGHTS.balance * balance +
      WEIGHTS.novelty * novelty * 0.5; // dampened so novelty never swamps signal

    out.push({ card, score, parts: { qloo, bridge: qlooScores[card.id] ?? 0, tag: tagSim, balance, novelty }, pool: "exploit" });
  }
  return out.sort((a, b) => b.score - a.score);
}

function assignPools(ranked: ScoredCandidate[]): void {
  // exploit = top tier, adjacent = middle, novel = tail + unexplored domains
  const n = ranked.length;
  ranked.forEach((c, i) => {
    const pct = i / Math.max(1, n - 1);
    c.pool = pct < 0.3 ? "exploit" : pct < 0.7 ? "adjacent" : "novel";
  });
}

export function batchTargets(count: number): { exploit: number; adjacent: number; novel: number } {
  return {
    exploit: Math.round(count * 0.7),
    adjacent: Math.round(count * 0.2),
    novel: count - Math.round(count * 0.7) - Math.round(count * 0.2),
  };
}

// ---------- adaptive feed ----------
export async function nextBatch(session: {
  state: TasteState;
  currentRound: number;
}, count = 12): Promise<{ cards: TasteCard[]; adapted: boolean; pools: Record<string, ExplorationPool> }> {
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

  // Ask Qloo for cross-domain recommendations seeded by liked entities.
  // In live mode, seed cards are first resolved to real Qloo entity ids, and
  // we query insights per-domain (liked + unexplored) so the batch stays
  // cross-domain instead of collapsing into one entity type.
  const likedCardIds = decisive.filter((s) => s.interaction === "like").map((s) => s.entityId.replace(/^card:/, "")).slice(-12);
  const resolved = await resolveCardEntities(likedCardIds);
  const interestEntityIds = [...new Set(Object.values(resolved).map((r) => r.entityId))];

  let liveCards: TasteCard[] = [];
  if (adapter.mode === "live" && interestEntityIds.length > 0) {
    const likedDomains = [...new Set(decisive.filter((s) => s.interaction === "like").map((s) => s.domain))];
    const unexplored = DOMAINS.filter((d) => !likedDomains.includes(d) && (state.domainWeights[d] ?? 0) === 0);
    const targetDomains = [...likedDomains.slice(-2), ...unexplored.slice(0, 2)].slice(0, 4);
    const perDomain = await Promise.all(
      targetDomains.map((d) =>
        adapter.getRecommendations({ interests: interestEntityIds, domain: d, take: 4, excludeIds: likedCardIds })
      )
    );
    liveCards = perDomain.flatMap((r, i) =>
      r.entities.map((e) => liveEntityToCard(e, targetDomains[i]))
    );
    registerLiveCards(liveCards);
  }

  const recs = await adapter.getRecommendations({
    interests: interestEntityIds,
    take: 30,
    excludeIds: likedCardIds,
  });
  const qlooScores: Record<string, number> = {};
  for (const e of recs.entities) {
    const id = e.entityId.replace(/^card:/, "").replace(/^mock:/, "");
    qlooScores[id] = e.affinity ?? 0.5;
  }

  const ranked = scoreCandidates(state, qlooScores, seen);
  // Qloo-boosted candidates get a merge advantage (its affinity replaces pure-local)
  for (const c of ranked) {
    if (qlooScores[c.card.id] !== undefined) {
      c.score += WEIGHTS.bridge * 0.5 * (qlooScores[c.card.id] ?? 0);
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  assignPools(ranked);

  const targets = batchTargets(count);
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
  const liveSlots = Math.min(liveCards.length, 6, Math.floor(count / 2));
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
  for (const lc of liveCards) {
    if (picked.length >= count) break;
    if (seen.has(lc.id) || pickedTitles.has(lc.title.toLowerCase())) continue;
    pickedTitles.add(lc.title.toLowerCase());
    picked.push(lc);
    pools[lc.id] = likedDomains.has(lc.domain) ? "exploit" : "adjacent";
  }

  return { cards: picked.slice(0, count), adapted: true, pools };
}

// ---------- profile ----------
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

export function deriveArchetype(tagVector: Record<string, number>): { name: string; description: string } {
  const top = Object.entries(tagVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);
  let best: { score: number; a: (typeof ARCHETYPES)[number] } | null = null;
  for (const a of ARCHETYPES) {
    const score = a.match.reduce((acc, m) => acc + (top.includes(m) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, a };
  }
  if (!best) {
    const t = top.slice(0, 2).join(" + ") || "emerging";
    return { name: `Emerging ${t}`, description: "your taste is still forming — keep going" };
  }
  return { name: best.a.name, description: best.a.description };
}

export function buildProfile(session: {
  id: string;
  state: TasteState;
  profileVersions: unknown[];
}): TasteProfile {
  const state = session.state;
  const byId = cardsById();
  // live-graph entities are not in the seed corpus; resolve through the registry
  const lookup = (id: string) => byId.get(id) ?? getLiveCard(id);
  const likes = state.signals.filter((s) => s.interaction === "like");
  const dislikes = state.signals.filter((s) => s.interaction === "dislike");

  const entityWeight: Record<string, number> = {};
  for (const s of state.signals) {
    entityWeight[s.cardId] = (entityWeight[s.cardId] ?? 0) + s.weight;
  }
  const coreEntities = Object.entries(entityWeight)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => lookup(id))
    .filter(Boolean)
    .map((c) => ({ title: c!.title, domain: c!.domain, cardId: c!.id }));

  const inferredTags = Object.entries(state.tagVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 100) / 100 }));

  const totalPos = Object.values(state.domainWeights).reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const domainPreferences: Record<string, number> = {};
  for (const d of DOMAINS) {
    const w = Math.max(0, state.domainWeights[d] ?? 0);
    if (w > 0) domainPreferences[d] = Math.round((w / totalPos) * 100) / 100;
  }

  const clusters = DOMAINS.map((d) => {
    const cards = likes
      .map((s) => lookup(s.cardId))
      .filter((c): c is TasteCard => !!c && c.domain === d);
    const tags = [...new Set(cards.flatMap((c) => c.tags))]
      .map((t) => ({ t, w: state.tagVector[t] ?? 0 }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map((x) => x.t);
    return {
      domain: d,
      label: d.toUpperCase(),
      entities: cards.slice(0, 5).map((c) => c.title),
      tags,
    };
  }).filter((c) => c.entities.length > 0);

  // Unexpected connections: high-affinity candidates from domains the user
  // never liked, driven by bridges from their liked entities.
  const likedDomains = new Set(likes.map((s) => s.domain));
  const posInterests: Record<string, number> = {};
  likes.forEach((s) => (posInterests[s.cardId] = 1));
  const seenConns = new Set<string>();
  const unexpected: UnexpectedConnection[] = [];
  const ranked = SEED_CARDS.map((c) => ({ card: c, aff: mockAffinity(c.id, posInterests) }))
    .filter((x) => x.aff > 0.08)
    .sort((a, b) => b.aff - a.aff);
  for (const { card, aff } of ranked) {
    if (unexpected.length >= 4) break;
    if (likedDomains.has(card.domain)) continue;
    if (seenConns.has(card.id)) continue;
    // find bridge sources
    const bridges: string[] = [];
    for (const like of likes) {
      if (mockAffinity(card.id, { [like.cardId]: 1 }) > 0.15 && like.cardId !== card.id) {
        bridges.push(lookup(like.cardId)?.title ?? like.cardId);
      }
    }
    if (!bridges.length) continue;
    seenConns.add(card.id);
    unexpected.push({
      title: card.title,
      domain: card.domain,
      cardId: card.id,
      reason: `You never picked ${card.domain === "food" ? "this cuisine" : card.domain}, but your taste for ${bridges.slice(0, 3).join(", ")} strongly overlaps with it (${Math.round(aff * 100)}% affinity).`,
      bridges: bridges.slice(0, 4),
      qlooBacked: true,
      source: "local",
      affinity: aff,
    });
  }

  const archetype = deriveArchetype(state.tagVector);
  const conf = computeConfidence(state);
  const mode = getQlooAdapter().mode;

  const topTags = inferredTags.slice(0, 5).map((t) => t.tag);
  const tasteSummary = `Your selections suggest a pull toward ${topTags.slice(0, 3).join(", ")}${
    topTags.length > 3 ? `, with a streak of ${topTags.slice(3).join(" and ")}` : ""
  }.`;

  const narrative = `${archetype.name}. ${tasteSummary} You gravitate across ${new Set(likes.map((s) => s.domain)).size} domains — ${coreEntities
    .slice(0, 4)
    .map((e) => e.title)
    .join(", ")} are your strongest signals right now.`;

  return {
    sessionId: session.id,
    profileVersion: session.profileVersions.length + 1,
    interactionCount: state.signals.length,
    confidence: conf,
    archetype,
    coreEntities,
    positiveSignals: coreEntities.map((e) => ({ ...e, weight: entityWeight[e.cardId] ?? 0 })),
    negativeSignals: dislikes
      .slice(0, 6)
      .map((s) => {
        const c = lookup(s.cardId);
        return c ? { title: c.title, domain: c.domain, weight: s.weight } : null;
      })
      .filter(Boolean) as TasteProfile["negativeSignals"],
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

export { tagAffinity };

/**
 * Live-graph variant of "unexpected connections": queries /v2/insights for
 * domains the user has never liked and keeps entities whose explainability
 * names the user's own likes. Falls back silently — the local (deterministic)
 * connections in the profile remain, labeled "local inference".
 */
export async function enrichConnectionsLive(
  session: { state: TasteState },
  profile: TasteProfile
): Promise<TasteProfile> {
  const adapter = getQlooAdapter();
  if (adapter.mode !== "live") return profile;

  const state = session.state;
  const likes = state.signals.filter((s) => s.interaction === "like");
  if (likes.length < 2) return profile;
  const likedDomains = new Set(likes.map((s) => s.domain));

  const resolved = await resolveCardEntities(likes.map((s) => s.cardId).slice(-10));
  const interests = [...new Set(Object.values(resolved).map((r) => r.entityId))];
  if (!interests.length) return profile;

  const byId = cardsById();
  const nameFor = (id: string): string | undefined => {
    for (const [cardId, r] of Object.entries(resolved)) {
      if (r.entityId === id) return byId.get(cardId)?.title ?? r.name;
    }
    return getLiveCard(`qloo:${id}`)?.title;
  };

  // Probe unexplored domains first; if the user touched almost everything,
  // fall back to their weakest liked domains so the live graph still gets a say.
  const unexplored = DOMAINS.filter(
    (d) => !likedDomains.has(d) && (state.domainWeights[d] ?? 0) === 0 && DOMAIN_TO_QLOO_TYPE[d]
  );
  const weak = [...likedDomains]
    .filter((d) => DOMAIN_TO_QLOO_TYPE[d])
    .sort(
      (a, b) => (state.domainWeights[a] ?? 0) - (state.domainWeights[b] ?? 0)
    )
    .slice(0, 2);
  const targetDomains = [...unexplored, ...weak].slice(0, 3);
  if (!targetDomains.length) return profile;

  const existing = new Set(profile.unexpectedConnections.map((c) => c.title.toLowerCase()));
  const live: UnexpectedConnection[] = [];
  for (const d of targetDomains) {
    if (live.length >= 2) break;
    try {
      const recs = await adapter.getRecommendations({ interests, domain: d, take: 6, excludeIds: interests });
      for (const e of recs.entities) {
        if (live.length >= 2) break;
        if (existing.has(e.name.toLowerCase())) continue;
        const contributions = Object.entries(e.explainability ?? {}).sort((a, b) => b[1] - a[1]);
        const bridges = contributions
          .map(([id]) => nameFor(id))
          .filter(Boolean) as string[];
        if (!bridges.length) continue; // no grounded explanation — skip
        existing.add(e.name.toLowerCase());
        live.push({
          title: e.name,
          domain: d,
          reason: `You never picked ${d === "food" ? "this cuisine" : d}, but Qloo's live graph links it to ${bridges.slice(0, 2).join(" and ")} (${Math.round((e.affinity ?? 0.5) * 100)}% affinity).`,
          bridges: bridges.slice(0, 3),
          qlooBacked: true,
          source: "qloo",
          affinity: e.affinity,
        });
      }
    } catch {
      // per-domain failure must not break the profile
    }
  }
  if (!live.length) return profile;
  return { ...profile, unexpectedConnections: [...live, ...profile.unexpectedConnections].slice(0, 6) };
}
