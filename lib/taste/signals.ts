import type { Domain, TasteCard, TasteState } from "@/lib/types";
import { SEED_CARDS, cardsById } from "@/data/cards";
import { VIBES, isVibe } from "@/data/vibes";
import { getLiveCard } from "@/lib/qloo/live-cards";
import { tagAffinity } from "@/lib/qloo/mock";
import { resolveCardEntities } from "@/lib/qloo/resolve";

/**
 * Shared "what did this person actually pick" layer. The feed, recommendations, profile and agent
 * all seed the taste graph from here, so every surface agrees on what someone loves and every
 * "because…" line names a thing they really tapped.
 */

export const lookupCard = (id: string): TasteCard | undefined => cardsById().get(id) ?? getLiveCard(id);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|—.*$/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const VIBE_BY_ID = new Map(VIBES.map((v) => [v.id, v]));

/** A seed card that is the same thing as a vibe tile ("Specialty Coffee" vs the "Specialty coffee" tile). */
export function isTwin(seed: TasteCard, vibeId: string): boolean {
  const v = VIBE_BY_ID.get(vibeId);
  if (!v) return false;
  const s = [norm(seed.title), norm(seed.wikiTitle ?? "")].filter(Boolean);
  const keys = [norm(v.title), norm(v.imageQuery ?? "")].filter((k) => k.length >= 4);
  return s.some((a) => keys.some((k) => a === k || a.startsWith(k + " ") || k.startsWith(a + " ")));
}

/** Liked card ids with their summed weight, strongest first. Passes/dislikes net against likes. */
export function likedWeights(state: TasteState): [string, number][] {
  const w: Record<string, number> = {};
  for (const s of state.signals) if (s.interaction !== "skip") w[s.cardId] = (w[s.cardId] ?? 0) + s.weight;
  return Object.entries(w)
    .filter(([id, v]) => v > 0 && lookupCard(id))
    .sort((a, b) => b[1] - a[1]);
}

export function likedIds(state: TasteState): Set<string> {
  return new Set(likedWeights(state).map(([id]) => id));
}

/** Every seed that is a twin of something the user liked — so we never "recommend" what they picked. */
export function pickedTwins(liked: Iterable<string>): Set<string> {
  const vibes = [...liked].filter(isVibe);
  const out = new Set<string>();
  if (!vibes.length) return out;
  for (const c of SEED_CARDS) if (vibes.some((v) => isTwin(c, v))) out.add(c.id);
  return out;
}

/**
 * An anchor seeds the taste graph. `label` is always something the user actually picked: the card
 * itself, or the vibe tile it stands in for ("Hot spring steam" → Onsen). `picked=false` anchors are
 * our own inferences (best local matches) and are never presented as the user's picks.
 */
export type Anchor = { cardId: string; label: string; picked: boolean; weight: number };

/**
 * Generic vibe tiles ("Ramen", "Misty forest") are not graph entities. Each is represented by its
 * closest real seed entity (its twin when one exists, else the best tag match).
 */
export function vibeProxies(vibeIds: string[], exclude: Set<string> = new Set()): Map<string, string[]> {
  const out = new Map<string, string[]>(); // seed id → vibe titles it stands in for
  for (const vid of vibeIds) {
    const v = VIBE_BY_ID.get(vid);
    if (!v) continue;
    const vt = new Set(v.tags);
    let best: { id: string; s: number } | null = null;
    for (const c of SEED_CARDS) {
      if (exclude.has(c.id) || c.domain === "music") continue;
      const s = isTwin(c, vid) ? 2 : tagAffinity(vt, new Set(c.tags)) + (c.domain === v.domain ? 0.05 : 0);
      if (s > 0.2 && (!best || s > best.s)) best = { id: c.id, s };
    }
    if (best) out.set(best.id, [...(out.get(best.id) ?? []), v.title]);
  }
  return out;
}

/**
 * Anchors for one part of the graph. Same-domain picks lead, then stand-ins for picked vibes of that
 * domain, then the best local matches in that domain (so the graph starts in the right neighbourhood),
 * then the strongest cross-domain picks (so taste still transfers across worlds).
 */
export function anchorsFor(state: TasteState, domains: Domain[] | null, opts: { max?: number; inferred?: TasteCard[] } = {}): Anchor[] {
  const max = opts.max ?? 8;
  const liked = likedWeights(state);
  const inDom = (d: Domain) => !domains || domains.includes(d);
  const out: Anchor[] = [];
  const have = new Set<string>();
  const push = (a: Anchor) => {
    if (have.has(a.cardId) || out.length >= max) return;
    have.add(a.cardId);
    out.push(a);
  };

  const real = liked.filter(([id]) => !isVibe(id));
  for (const [id, w] of real) {
    const c = lookupCard(id)!;
    if (inDom(c.domain) && c.domain !== "music") push({ cardId: id, label: c.title, picked: true, weight: w });
  }
  const vibeLikes = liked.filter(([id]) => isVibe(id));
  const proxies = vibeProxies(
    vibeLikes.map(([id]) => id),
    new Set(real.map(([id]) => id))
  );
  const proxyWeight = Object.fromEntries(vibeLikes.map(([id, w]) => [VIBE_BY_ID.get(id)?.title, w]));
  const ranked = [...proxies.entries()]
    .map(([seed, from]) => ({ seed, from, w: from.reduce((a, t) => a + (proxyWeight[t] ?? 0), 0) }))
    .sort((a, b) => b.w - a.w);
  for (const p of ranked) {
    const c = cardsById().get(p.seed)!;
    if (inDom(c.domain)) push({ cardId: p.seed, label: p.from[0], picked: true, weight: p.w });
  }
  const sameDomainCount = out.length;
  for (const c of opts.inferred ?? []) {
    if (out.length >= Math.max(sameDomainCount, max - 3)) break;
    if (inDom(c.domain) && !c.id.startsWith("qloo:")) push({ cardId: c.id, label: c.title, picked: false, weight: 0.5 });
  }
  if (domains) {
    // cross-domain transfer: the person's strongest overall picks
    for (const [id, w] of real.slice(0, 4)) {
      const c = lookupCard(id)!;
      if (c.domain !== "music") push({ cardId: id, label: c.title, picked: true, weight: w });
    }
    for (const p of ranked.slice(0, 3)) push({ cardId: p.seed, label: p.from[0], picked: true, weight: p.w });
  }
  return out.slice(0, max);
}

export type ResolvedAnchors = { ids: string[]; nameOf: Map<string, { label: string; picked: boolean }> };

/** Anchors → live/mock entity ids, with a reverse map so explainability can be named truthfully. */
export async function resolveAnchors(anchors: Anchor[]): Promise<ResolvedAnchors> {
  const resolved = await resolveCardEntities(anchors.map((a) => a.cardId));
  const ids: string[] = [];
  const nameOf = new Map<string, { label: string; picked: boolean }>();
  for (const a of anchors) {
    const r = resolved[a.cardId];
    if (!r || nameOf.has(r.entityId)) continue;
    ids.push(r.entityId);
    nameOf.set(r.entityId, { label: a.label, picked: a.picked });
    if (r.entityId.startsWith("card:")) nameOf.set(r.entityId.slice(5), { label: a.label, picked: a.picked }); // mock graph explains with bare ids
  }
  return { ids, nameOf };
}

/** Name the explainability contributions: what you picked ("because"), and our own inferences ("near"). */
export function explain(explainability: Record<string, number> | undefined, nameOf: ResolvedAnchors["nameOf"]): { because: string[]; near: string[] } {
  const because: string[] = [];
  const near: string[] = [];
  for (const [id] of Object.entries(explainability ?? {}).sort((a, b) => b[1] - a[1])) {
    const n = nameOf.get(id);
    if (!n) continue;
    const list = n.picked ? because : near;
    if (!list.includes(n.label)) list.push(n.label);
  }
  return { because: because.slice(0, 2), near: near.slice(0, 1) };
}

// ---------- grounded local explanations ----------

let _idf: Record<string, number> | null = null;
export function tagIdf(): Record<string, number> {
  if (_idf) return _idf;
  const all = [...SEED_CARDS, ...VIBES];
  const df: Record<string, number> = {};
  for (const c of all) for (const t of new Set(c.tags)) df[t] = (df[t] ?? 0) + 1;
  _idf = {};
  for (const [t, n] of Object.entries(df)) _idf[t] = Math.log(1 + all.length / n);
  return _idf;
}

/**
 * The user's picks that share the most distinctive tags with `tags` (IDF-weighted). A pick only counts
 * when it shares two or more tags (or one genuinely rare one), so every "because" is a real overlap.
 */
export function becauseOf(state: TasteState, tags: string[], opts: { exclude?: string; k?: number; min?: number } = {}): string[] {
  const idf = tagIdf();
  const want = new Set(tags);
  const scored: { title: string; s: number }[] = [];
  for (const [id, w] of likedWeights(state)) {
    if (id === opts.exclude) continue;
    const c = lookupCard(id);
    if (!c) continue;
    const shared = c.tags.filter((t) => want.has(t)).map((t) => idf[t] ?? 1);
    const s = shared.reduce((a, b) => a + b, 0);
    const strong = shared.length >= 2 ? s >= (opts.min ?? 4.5) : (shared[0] ?? 0) >= 4.5;
    if (strong) scored.push({ title: c.title, s: s * Math.min(1.5, 0.6 + w * 0.4) });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.k ?? 2)
    .map((x) => x.title);
}

const PROPER = new Set(["japanese", "french", "italian", "nordic", "korean", "moroccan", "danish", "turkish", "mexican", "cuban", "himalayan", "american", "british", "chinese", "indian", "thai", "mediterranean", "scandinavian", "african", "latin", "brazilian", "persian", "spanish", "greek"]);

/** "japanese-food" → "Japanese", "sweet-spicy" → "sweet & spicy" for user-facing copy. */
export function prettyTag(t: string): string {
  if (t.endsWith("-food")) {
    const c = t.slice(0, -5);
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  if (PROPER.has(t)) return t.charAt(0).toUpperCase() + t.slice(1);
  return t.replace("sweet-spicy", "sweet & spicy").replace(/-/g, " ");
}
