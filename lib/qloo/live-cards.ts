import type { Domain, QlooEntity, TasteCard } from "@/lib/types";

/**
 * Registry for entities discovered from the LIVE Qloo graph. Unlike the seed
 * corpus, these are not known ahead of time: the feed synthesizes TasteCards
 * from /v2/insights results, and interactions/profiles need to resolve them
 * later (next request, maybe another server instance of memory).
 */

const g = globalThis as unknown as { __tp_live_cards?: Map<string, TasteCard> };

function registry(): Map<string, TasteCard> {
  if (!g.__tp_live_cards) g.__tp_live_cards = new Map();
  return g.__tp_live_cards;
}

const SUBTYPE_TO_DOMAIN: Record<string, Domain> = {
  "urn:entity:artist": "music",
  "urn:entity:movie": "film",
  "urn:entity:tv_show": "tv",
  "urn:entity:brand": "brand",
  "urn:entity:destination": "travel",
  "urn:entity:book": "book",
  "urn:entity:video_game": "game",
  "urn:entity:podcast": "lifestyle",
  "urn:entity:person": "lifestyle",
  "urn:entity:place": "food", // place results requested for food/art/architecture
  "urn:entity": "lifestyle",
};

/** Synthesize a feed card from a live Qloo entity. */
export function liveEntityToCard(entity: QlooEntity, domain?: Domain): TasteCard {
  const id = `qloo:${entity.entityId}`;
  const subtype = entity.type || "urn:entity";
  const resolvedDomain: Domain =
    domain ?? SUBTYPE_TO_DOMAIN[subtype] ?? "lifestyle";
  return {
    id,
    title: entity.name,
    domain: resolvedDomain,
    tags: (entity.tags ?? []).slice(0, 4).map((t) => t.name.toLowerCase()),
    imageUrl: entity.imageUrl,
    qlooEntityId: entity.entityId,
    blurb: subtype,
  };
}

export function registerLiveCards(cards: TasteCard[]): void {
  const reg = registry();
  for (const c of cards) reg.set(c.id, c);
}

export function getLiveCard(id: string): TasteCard | undefined {
  return registry().get(id);
}

/** Resolve any card id — seed corpus first, then live registry. */
export function findCard(id: string): TasteCard | undefined {
  return registry().get(id);
}
