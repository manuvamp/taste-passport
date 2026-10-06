import { cardsById } from "@/data/cards";
import { DOMAIN_TO_QLOO_TYPE } from "@/lib/types";
import { cacheGet, cacheSet } from "@/lib/qloo/cache";
import { getQlooAdapter } from "@/lib/qloo";
import { getLiveCard } from "@/lib/qloo/live-cards";

/**
 * Entity resolution: our seed cards carry stable local ids; the live Qloo API
 * needs real entity ids. resolveCardEntities looks each card up via /search
 * (type-filtered, cached ~30 days) and also records the reverse map so
 * explainability contributions from the live graph can be named.
 *
 * In mock mode resolution is unnecessary (interests already use card ids) and
 * the helpers short-circuit.
 */

export type ResolvedEntity = { entityId: string; name: string };

const g = globalThis as unknown as { __tp_reverse?: Map<string, string> };

function reverseMap(): Map<string, string> {
  if (!g.__tp_reverse) g.__tp_reverse = new Map();
  return g.__tp_reverse;
}

/** Reverse lookup: real Qloo entity id -> seed card title (for explanations). */
export function qlooEntityName(entityId: string): string | undefined {
  return reverseMap().get(entityId);
}

/**
 * Resolve a batch of seed card ids to live Qloo entity ids.
 * Returns only the ones that resolved; failures are cached as misses for 6h
 * so we don't hammer /search with doomed queries.
 */
export async function resolveCardEntities(
  cardIds: string[]
): Promise<Record<string, ResolvedEntity>> {
  if (getQlooAdapter().mode !== "live") {
    // mock mode: interests are already card ids
    const out: Record<string, ResolvedEntity> = {};
    for (const id of cardIds) out[id] = { entityId: `card:${id}`, name: cardsById().get(id)?.title ?? id };
    return out;
  }

  const out: Record<string, ResolvedEntity> = {};
  const toResolve: typeof cardIds = [];
  for (const id of cardIds) {
    // live-graph cards are already real Qloo entities: "qloo:<entity_id>"
    if (id.startsWith("qloo:")) {
      const eid = id.slice(5);
      out[id] = { entityId: eid, name: getLiveCard(id)?.title ?? eid };
      continue;
    }
    const cached = cacheGet<ResolvedEntity | null>(`resolve:${id}`);
    if (cached !== undefined) {
      if (cached) out[id] = cached;
      continue;
    }
    toResolve.push(id);
  }

  // resolve concurrently through a small worker pool (cold-start batches
  // resolve ~15 new ids; sequential was ~10s, pool-of-5 trims it to ~2s).
  // Failures are cached briefly so transient errors don't poison the cache.
  const queue = toResolve.slice(0, 15);
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const card = cardsById().get(id);
      if (!card) continue;
      const type = DOMAIN_TO_QLOO_TYPE[card.domain];
      try {
        const results = await getQlooAdapter().searchEntities({
          query: card.wikiTitle ?? card.title,
          types: type ? [type] : undefined,
          take: 1,
        });
        const hit = results[0] ?? null;
        // misses retry in 10min; hits stick for 30 days
        cacheSet(`resolve:${id}`, hit, hit ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 10);
        if (hit) {
          out[id] = { entityId: hit.entityId, name: hit.name };
          reverseMap().set(hit.entityId, card.title);
        }
      } catch {
        // short retry window — a transient 429/timeout must not poison the cache
        cacheSet(`resolve:${id}`, null, 1000 * 60 * 10);
      }
    }
  });
  await Promise.allSettled(workers);
  return out;
}
