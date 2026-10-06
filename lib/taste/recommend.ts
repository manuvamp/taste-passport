import type { TasteState } from "@/lib/types";
import { cardsById, SEED_CARDS } from "@/data/cards";
import { isVibe } from "@/data/vibes";
import { tagAffinity } from "@/lib/qloo/mock";
import { resolveCardEntities, qlooEntityName } from "@/lib/qloo/resolve";
import { qlooInsights, qlooTagId } from "@/lib/qloo/insights";
import { getQlooAdapter } from "@/lib/qloo";

export type RecItem = { title: string; subtitle?: string; imageUrl?: string; why: string[]; affinity?: number };
export type RecSection = { id: string; group: "watch" | "read" | "go" | "own"; title: string; kicker: string; items: RecItem[]; needsCity?: boolean };

/** Temperament → things to do. Resolved through Qloo's own activity tags in the user's city. */
const ACTIVITY_BY_TRAIT: [string[], string][] = [
  [["quiet", "zen", "minimal", "forest", "calm"], "yoga"],
  [["remote", "mountain", "forest", "epic"], "hiking"],
  [["craft", "handmade", "artisan"], "pottery"],
  [["neon", "night", "vibrant", "loud"], "live music"],
  [["coastal", "water", "summer", "tropical"], "swimming"],
  [["technical", "outdoor", "functional"], "climbing"],
  [["literary", "cozy", "warm"], "book club"],
  [["precise", "precision", "ritual"], "tea"],
];

type Entities = Awaited<ReturnType<typeof qlooInsights>>;

/** The user's strongest picks (plus real-entity stand-ins for generic vibes) as live Qloo entity ids. */
async function interestsFor(state: TasteState): Promise<string[]> {
  const weight: Record<string, number> = {};
  for (const sg of state.signals) if (sg.interaction === "like") weight[sg.cardId] = (weight[sg.cardId] ?? 0) + sg.weight;
  const liked = Object.entries(weight).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const seeds = liked.filter((id) => !isVibe(id) && !id.startsWith("qloo:")).slice(0, 6);
  const live = liked.filter((id) => id.startsWith("qloo:")).slice(0, 4);
  const vibes = liked.filter(isVibe).map((id) => cardsById().get(id)!).filter(Boolean);
  const proxy: Record<string, number> = {};
  for (const v of vibes) {
    const vt = new Set(v.tags);
    for (const c of SEED_CARDS) {
      if (seeds.includes(c.id)) continue;
      const a = tagAffinity(vt, new Set(c.tags));
      if (a > 0) proxy[c.id] = (proxy[c.id] ?? 0) + a;
    }
  }
  const proxies = Object.entries(proxy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const ids = [...new Set([...seeds, ...live, ...proxies])].slice(0, 10);
  const resolved = await resolveCardEntities(ids);
  return [...new Set(Object.values(resolved).map((r) => r.entityId))];
}

function toItems(entities: Entities, exclude: Set<string>, opts: { image?: boolean } = {}): RecItem[] {
  return entities
    .filter((e) => !exclude.has(e.name.toLowerCase()))
    .map((e) => {
      const why = Object.entries(e.explainability ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => qlooEntityName(id))
        .filter((n): n is string => !!n)
        .slice(0, 2);
      const sub = (e.tags ?? [])
        .map((t) => t.name)
        .filter((n) => !/^(person|podcasts?|other)$/i.test(n))
        .slice(0, 2)
        .join(" · ");
      return { title: e.name, subtitle: sub || undefined, imageUrl: e.imageUrl, why, affinity: e.affinity };
    })
    .filter((i) => (opts.image ? !!i.imageUrl : true));
}

export async function buildRecommendations(state: TasteState, city?: string): Promise<{ sections: RecSection[]; mode: "live" | "mock" }> {
  if (getQlooAdapter().mode !== "live") return { sections: [], mode: "mock" };
  const interests = await interestsFor(state);
  if (!interests.length) return { sections: [], mode: "live" };

  const picked = new Set<string>();
  for (const sg of state.signals) {
    const t = cardsById().get(sg.cardId)?.title;
    if (t) picked.add(t.toLowerCase());
  }
  const base = { "signal.interests.entities": interests.join(",") };
  const q = (type: string, extra: Record<string, string> = {}, take = 14) => qlooInsights({ "filter.type": type, ...base, ...extra }, take);

  const topTags = Object.entries(state.tagVector).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const cuisines = [...new Set(topTags.filter((t) => t.endsWith("-food")).map((t) => t.replace("-food", "")))].slice(0, 3);
  const activities = ACTIVITY_BY_TRAIT.filter(([tags]) => tags.some((t) => topTags.slice(0, 14).includes(t))).map(([, a]) => a).slice(0, 3);

  // two gentle waves (the API throttles bursts) and one retry for empties
  const get = async (type: string) => {
    let r = await q(type);
    if (!r.length) r = await q(type);
    return r;
  };
  const [films, series, games, books] = await Promise.all(["urn:entity:movie", "urn:entity:tv_show", "urn:entity:videogame", "urn:entity:book"].map(get));
  const [podcasts, artists, places, brands] = await Promise.all(["urn:entity:podcast", "urn:entity:artist", "urn:entity:destination", "urn:entity:brand"].map(get));

  let eat: RecItem[] = [];
  let doing: RecItem[] = [];
  if (city) {
    const loc = { "filter.location.query": city };
    const eatRes = await Promise.all(
      (cuisines.length ? cuisines : ["restaurant"]).map(async (c) => {
        const tag = await qlooTagId(c === "restaurant" ? "restaurant" : `${c} restaurant`, "urn:tag:");
        const es = await q("urn:entity:place", { ...loc, ...(tag ? { "filter.tags": tag } : {}) }, 6);
        return toItems(es, new Set(), { image: true }).map((i) => ({ ...i, subtitle: [c === "restaurant" ? "" : c, i.subtitle].filter(Boolean).join(" · ") }));
      })
    );
    eat = eatRes.flat();
    const actRes = await Promise.all(
      activities.map(async (a) => {
        const tag = await qlooTagId(a, "urn:tag:activities");
        if (!tag) return [] as RecItem[];
        const es = await q("urn:entity:place", { ...loc, "filter.tags": tag }, 5);
        return toItems(es, new Set(), { image: true }).map((i) => ({ ...i, subtitle: a }));
      })
    );
    doing = actRes.flat();
  }

  const S = (id: string, group: RecSection["group"], title: string, kicker: string, items: RecItem[], extra: Partial<RecSection> = {}): RecSection => ({ id, group, title, kicker, items, ...extra });
  const sections: RecSection[] = [
    S("films", "watch", "Films you'd love", "Matched to what you picked.", toItems(films, picked, { image: true })),
    S("series", "watch", "Series to start", "Shows that share your taste.", toItems(series, picked, { image: true })),
    S("games", "watch", "Games worth your time", "Worlds that fit your mood.", toItems(games, picked)),
    S("books", "read", "Books for your shelf", "Reads that sit close to your taste.", toItems(books, picked).filter((i) => i.title.length <= 60)),
    S("podcasts", "read", "Podcasts to put on", "Listens that match how you think.", toItems(podcasts, picked)),
    S("places", "go", "Places to go next", "Destinations that match your taste.", toItems(places, picked)),
    S("eat", "go", city ? `Where to eat in ${city}` : "Where to eat", "Restaurants and cafes in the cuisines you lean toward.", eat, { needsCity: !city }),
    S("do", "go", city ? `Things to do in ${city}` : "Things to do", "Activities that fit your temperament.", doing, { needsCity: !city }),
    S("brands", "own", "Brands with your taste", "Labels and makers that share your eye.", toItems(brands, picked)),
  ];
  return { sections: sections.filter((s) => s.items.length > 0 || s.needsCity), mode: "live" };
}
