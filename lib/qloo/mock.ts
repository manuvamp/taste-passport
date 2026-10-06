import type { Domain, QlooEntity, RecommendationResult } from "@/lib/types";
import { SEED_CARDS, cardsById } from "@/data/cards";
import { DOMAIN_TO_QLOO_TYPE } from "@/lib/types";

/**
 * Mock Qloo adapter — a deterministic local "taste graph" built from the seed
 * corpus. Uses tag-set affinity plus a curated cross-domain bridge table so
 * mock mode still demonstrates the core thesis: taste transfers across domains.
 * It exists so the app runs with zero credentials; live mode uses the real API.
 */

/** Curated cross-domain links: cardId -> related cardIds with strength. */
const BRIDGES: Record<string, Record<string, number>> = {
  "jil-sander": { "church-of-light": 0.9, muji: 0.85, "barcelona-pavilion": 0.8, kaiseki: 0.7, "villa-savoye": 0.7 },
  "frank-ocean": { "past-lives": 0.8, sade: 0.8, "call-me-by-your-name": 0.7, moonlight: 0.75, "vinyl-collecting": 0.6 },
  a24: { "past-lives": 0.85, moonlight: 0.85, eeaao: 0.85, her: 0.8, "portrait-lady-fire": 0.7 },
  kyoto: { "ryoan-ji": 0.95, kaiseki: 0.85, onsen: 0.85, hiroshige: 0.8, "ghost-of-tsushima": 0.7, zazen: 0.8, "church-of-light": 0.8 },
  "church-of-light": { "ryoan-ji": 0.85, "salk-institute": 0.8, "farnsworth-house": 0.75, "rothko-chapel": 0.8 },
  muji: { "uniqlo-u": 0.8, "barcelona-pavilion": 0.7, fika: 0.6, "specialty-coffee": 0.6 },
  noma: { lofoten: 0.8, "sauna-culture": 0.75, fika: 0.7, reykjavik: 0.75 },
  "blade-runner-2049": { tokyo: 0.75, drive: 0.8, severance: 0.7, "mr-robot": 0.7, "guggenheim-bilbao": 0.5 },
  "sichuan-hotpot": { "thai-street-food": 0.75, izakaya: 0.7, "korean-bbq": 0.8, hanoi: 0.6 },
  gucci: { kusama: 0.7, euphoria: 0.7, margiela: 0.4, "grand-budapest": 0.5 },
  "bad-bunny": { "mexico-city": 0.8, rosalia: 0.85, oaxacan: 0.7, havana: 0.65 },
  "twin-peaks": { "wind-up-bird": 0.7, "in-the-mood-for-love": 0.6, drive: 0.5 },
  "natural-wine": { "parisian-bistro": 0.7, loewe: 0.5, lisbon: 0.6 },
  "van-gogh-museum": { amalfi: 0.6, lofoten: 0.7 },
  "rave-culture": { bicep: 0.8, "aphex-twin": 0.75, tokyo: 0.5, euphoria: 0.6 },
  "beach-house": { "tame-impala": 0.7, "past-lives": 0.6, lofoten: 0.5 },
  "journey-game": { "dune-2021": 0.8, lofoten: 0.6, "rothko-chapel": 0.7 },
  "stardew-valley": { "sunday-baking": 0.7, fika: 0.7, "shinrin-yoku": 0.6 },
  "disco-elysium": { "la-haine": 0.7, "mr-robot": 0.6, basquiat: 0.6 },
  "botw": { "shinrin-yoku": 0.75, kyoto: 0.6, fallingwater: 0.5 },
};

const byId = cardsById();

function tokenize(tags: string[]): Set<string> {
  return new Set(tags);
}

/** Weighted jaccard over tag sets. */
export function tagAffinity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function bridgesFor(id: string): Record<string, number> {
  return BRIDGES[id] ?? {};
}

/** Affinity of a card against a weighted interest vector (cardId -> weight).
 *  Averaged across interests so the score stays meaningful as profiles grow. */
export function mockAffinity(cardId: string, interests: Record<string, number>): number {
  const card = byId.get(cardId);
  if (!card) return 0;
  const cardTags = tokenize(card.tags);
  let score = 0;
  let n = 0;
  for (const [interestId, w] of Object.entries(interests)) {
    if (interestId === cardId) continue;
    const ic = byId.get(interestId);
    if (!ic) continue;
    let s = tagAffinity(cardTags, tokenize(ic.tags));
    const bridge = bridgesFor(interestId)[cardId];
    if (bridge) s = Math.max(s, bridge);
    score += s * w;
    n += w;
  }
  return n > 0 ? Math.min(1, score / n) : 0;
}

function mockEntity(cardId: string, affinity?: number, explainability?: Record<string, number>): QlooEntity {
  const card = byId.get(cardId)!;
  return {
    entityId: `mock:${card.id}`,
    name: card.title,
    type: DOMAIN_TO_QLOO_TYPE[card.domain] ?? "urn:entity:brand",
    tags: card.tags.slice(0, 4).map((t) => ({ id: `urn:tag:mock:${t}`, name: t })),
    affinity,
    popularity: 0.5,
    explainability,
  };
}

export const mockAdapter = {
  mode: "mock" as const,

  async searchEntities(input: { query: string; types?: string[]; take?: number }): Promise<QlooEntity[]> {
    const q = input.query.trim().toLowerCase();
    const take = input.take ?? 5;
    const scored = SEED_CARDS.map((c) => {
      const t = c.title.toLowerCase();
      let s = t === q ? 1 : t.startsWith(q) ? 0.9 : t.includes(q) ? 0.7 : 0;
      if (s === 0) {
        // loose tag match
        s = c.tags.some((tag) => tag.includes(q)) ? 0.4 : 0;
      }
      if (s > 0 && input.types?.length && !input.types.includes(DOMAIN_TO_QLOO_TYPE[c.domain] ?? "")) s *= 0.5;
      return { c, s };
    })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, take);
    return scored.map(({ c }) => mockEntity(c.id));
  },

  /**
   * Cross-domain recommendations from interest entity ids ("mock:xx" or "xx").
   */
  async getRecommendations(input: {
    interests: string[];
    domain?: Domain;
    take?: number;
    excludeIds?: string[];
  }): Promise<RecommendationResult> {
    const start = Date.now();
    const take = input.take ?? 10;
    const interests: Record<string, number> = {};
    for (const raw of input.interests) interests[raw.replace(/^mock:/, "")] = 1;
    const exclude = new Set([...(input.excludeIds ?? []), ...Object.keys(interests)]);

    const candidates = SEED_CARDS.filter((c) => !exclude.has(c.id)).map((c) => {
      const aff = mockAffinity(c.id, interests);
      return { card: c, aff };
    });

    if (input.domain) {
      // same-domain request: keep only that domain but keep affinity ordering
      const only = candidates.filter((x) => x.card.domain === input.domain);
      const rows = only
        .sort((a, b) => b.aff - a.aff)
        .slice(0, take)
        .map(({ card, aff }) =>
          mockEntity(card.id, round(aff), explain(card.id, interests))
        );
      return { entities: rows, source: "mock", durationMs: Date.now() - start };
    }

    // Cross-domain pass: score everything, then keep the spread of domains.
    const ranked = candidates.filter((x) => x.aff > 0).sort((a, b) => b.aff - a.aff);
    const picked: typeof ranked = [];
    const seenDomainCount: Record<string, number> = {};
    for (const cand of ranked) {
      const n = seenDomainCount[cand.card.domain] ?? 0;
      if (n >= Math.max(2, Math.ceil(take / 4))) continue;
      seenDomainCount[cand.card.domain] = n + 1;
      picked.push(cand);
      if (picked.length >= take) break;
    }
    // Novel fill if not enough
    if (picked.length < take) {
      const rest = ranked.filter((x) => !picked.includes(x));
      picked.push(...rest.slice(0, take - picked.length));
    }
    return {
      entities: picked.map(({ card, aff }) => mockEntity(card.id, round(aff), explain(card.id, interests))),
      source: "mock",
      durationMs: Date.now() - start,
    };
  },

  async getTags(input: { q: string; take?: number }): Promise<{ id: string; name: string }[]> {
    const q = input.q.trim().toLowerCase();
    const all = new Set<string>();
    for (const c of SEED_CARDS) for (const t of c.tags) if (!q || t.includes(q)) all.add(t);
    return [...all].slice(0, input.take ?? 20).map((t) => ({ id: `urn:tag:mock:${t}`, name: t }));
  },
};

function explain(cardId: string, interests: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const card = byId.get(cardId);
  if (!card) return out;
  for (const [iid, w] of Object.entries(interests)) {
    const ic = byId.get(iid);
    if (!ic || iid === cardId) continue;
    let s = tagAffinity(tokenize(card.tags), tokenize(ic.tags));
    const bridge = bridgesFor(iid)[cardId];
    if (bridge) s = Math.max(s, bridge);
    if (s > 0) out[iid] = round(Math.min(1, s * w));
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
