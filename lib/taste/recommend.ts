import type { Domain, QlooEntity, TasteCard, TasteState } from "@/lib/types";
import { SEED_CARDS } from "@/data/cards";
import { VIBES, isVibe } from "@/data/vibes";
import { qlooInsights, qlooTagIds } from "@/lib/qloo/insights";
import { getQlooAdapter } from "@/lib/qloo";
import { resolveCardEntities } from "@/lib/qloo/resolve";
import { imageFor, scoreCandidates, tasteSimilarity } from "@/lib/taste/engine";
import { anchorsFor, becauseOf, explain, likedIds, likedWeights, lookupCard, pickedTwins, prettyTag, resolveAnchors, type ResolvedAnchors } from "@/lib/taste/signals";

/**
 * "Made for you". Every live section seeds the Qloo graph with anchors from its own world (your
 * picks there, real stand-ins for your vibe tiles, the best local matches), then re-ranks by how well
 * each result's tags fit your taste. Every "because" names something you actually picked; our own
 * inferences are labelled "near". Curated local sections are always there, so it is never empty.
 */

export type RecItem = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** Things the user actually picked that this is linked to. */
  why: string[];
  /** Our own inferred anchors it sits close to (never presented as the user's picks). */
  near?: string[];
  affinity?: number;
  cardId?: string;
};
export type RecSection = {
  id: string;
  group: "top" | "watch" | "read" | "go" | "own";
  title: string;
  kicker: string;
  items: RecItem[];
  needsCity?: boolean;
};

/** Hobby tile → how to find a place for it in a city (Qloo place-tag search phrases, best first). */
const HOBBY_PLACES: Record<string, string[]> = {
  "h-hiking": ["hiking area", "hiking"], "h-trail": ["hiking area", "hiking"], "h-surf": ["surf school", "surfing"],
  "h-run": ["running track", "park"], "h-cycle": ["bicycle rental", "cycling park"], "h-bike-tour": ["bicycle rental"],
  "h-yoga": ["yoga studio"], "h-pilates": ["pilates studio"], "h-climb": ["climbing gym", "rock climbing"],
  "h-swim": ["swimming pool"], "h-football": ["football field", "soccer field"], "h-basketball": ["basketball court"],
  "h-tennis": ["tennis court", "tennis club"], "h-skate": ["skatepark"], "h-ski": ["ski resort"], "h-snowboard": ["ski resort"],
  "h-camp": ["campground"], "h-fish": ["fishing"], "h-chess": ["chess club", "board game cafe"], "h-boardgames": ["board game cafe", "board games"],
  "h-gaming": ["video arcade", "gaming cafe"], "h-guitar": ["music school", "live music venue"], "h-piano": ["music school", "concert hall"],
  "h-pottery": ["pottery classes", "pottery", "ceramics studio"], "h-knit": ["yarn store", "fabric store"], "h-embroider": ["fabric store"],
  "h-garden": ["botanical garden", "garden center"], "h-cook": ["cooking class"], "h-bake": ["bakery", "cooking class"],
  "h-photo": ["photography", "art gallery"], "h-paint": ["art studio", "art gallery"], "h-sketch": ["art gallery", "art studio"],
  "h-read": ["bookstore", "library"], "h-gym": ["gym", "fitness center"], "h-sail": ["sailing club", "marina"], "h-rowing": ["rowing club"],
  "h-kayak": ["kayaking", "canoe and kayak rental"], "h-paddle": ["paddleboarding", "kayaking"], "h-golf": ["golf course"],
  "h-wood": ["woodworking", "hardware store"], "h-birds": ["nature preserve", "park"], "h-stars": ["planetarium", "observatory"],
  "h-motor": ["race track", "karting"], "h-archery": ["archery range"], "h-badminton": ["badminton court"], "h-pingpong": ["table tennis"],
  "h-volleyball": ["volleyball court", "beach"], "h-baseball": ["baseball field"], "h-cricket": ["cricket ground"], "h-rugby": ["rugby"],
  "h-hockey": ["ice skating rink"], "h-iceskate": ["ice skating rink"], "h-horse": ["horseback riding", "stable"], "h-fencing": ["fencing club"],
  "h-boxing": ["boxing gym"], "h-bowling": ["bowling alley"], "h-billiards": ["pool hall", "billiards"], "h-darts": ["pub", "darts"],
  "h-dive": ["scuba diving", "dive shop"], "h-bees": ["farm", "nature preserve"], "h-dj": ["night club", "record store"],
  "h-sing": ["karaoke", "live music venue"], "h-code": ["coworking space", "library"], "h-robots": ["makerspace", "science museum"],
  "h-3dprint": ["makerspace"], "h-puzzle": ["board game cafe", "toy store"], "h-candles": ["craft store"], "h-brew": ["brewery", "brewpub"],
  "h-roast": ["coffee roasters", "coffee shop"], "h-cocktails": ["cocktail bar"], "h-bbq": ["barbecue restaurant"], "h-forage": ["nature preserve", "forest"],
  "h-thrift": ["thrift store", "flea market"], "h-vinyl": ["record store"], "h-filmmaking": ["movie theater", "film school"], "h-dog": ["dog park", "park"],
  "h-cars": ["car museum", "race track"], "h-planes": ["aviation museum", "airfield"],
};

/** Temperament → something to do, for people who skipped the hobby chapter. */
const ACTIVITY_BY_TRAIT: [string[], string][] = [
  [["quiet", "zen", "minimal", "forest", "calm"], "h-yoga"],
  [["remote", "mountain", "forest", "epic"], "h-hiking"],
  [["craft", "handmade", "artisan"], "h-pottery"],
  [["neon", "night", "vibrant", "loud"], "h-dj"],
  [["coastal", "water", "summer", "tropical"], "h-swim"],
  [["technical", "outdoor", "functional"], "h-climb"],
  [["literary", "cozy", "warm"], "h-read"],
  [["precise", "precision", "ritual"], "h-roast"],
];

// hotels and hostels tag themselves with every nearby activity — not a place to go *do* something
const LODGING = /(^|[^a-z])(hotels?|hostels?|motels?|lodging|resorts?|guest ?houses?|apartments?|bed and breakfast|inns?)($|[^a-z])/i;

// for non-food hobbies a café or restaurant is never "the place to do it"
const EATERY = /:(restaurant|cafe|coffee_shop|bar|bakery|fast_food)(:|$)/i;
const FOOD_HOBBIES = new Set(["h-cook", "h-bake", "h-cocktails", "h-bbq", "h-brew", "h-roast", "h-darts"]);

const HOBBY_IMAGES = VIBES.filter((v) => v.id.startsWith("h-"));

/** How well a live entity's own Qloo tags fit the user's taste vector (0..1, word-level). */
function tagFit(e: QlooEntity, vec: Record<string, number>, scale: number): number {
  let s = 0;
  for (const t of e.tags ?? []) {
    for (const w of t.name.toLowerCase().split(/[^a-z]+/)) if (w.length > 2 && (vec[w] ?? 0) > 0) s += vec[w];
  }
  return Math.min(1, s / scale);
}

function toItems(entities: QlooEntity[], ctx: { exclude: Set<string>; nameOf: ResolvedAnchors["nameOf"]; vec: Record<string, number>; scale: number }, opts: { image?: boolean; take?: number } = {}): RecItem[] {
  return entities
    .filter((e) => !ctx.exclude.has(e.name.toLowerCase()) && (!opts.image || e.imageUrl))
    .map((e) => {
      // Qloo affinity leads; your own tags break ties; household names get a gentle nudge down
      const score = (e.affinity ?? 0.5) * 0.7 + tagFit(e, ctx.vec, ctx.scale) * 0.3 - ((e.popularity ?? 0) > 0.995 ? 0.06 : 0);
      return { e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.take ?? 14)
    .map(({ e }) => {
      const { because, near } = explain(e.explainability, ctx.nameOf);
      const sub = (e.tags ?? [])
        .map((t) => t.name)
        .filter((n) => !/^(person|podcasts?|other|movie|tv|book|video ?game)$/i.test(n))
        .slice(0, 2)
        .join(" · ");
      return { title: e.name, subtitle: sub || undefined, imageUrl: e.imageUrl, why: because, near, affinity: e.affinity };
    });
}

const itemFor = (state: TasteState, c: TasteCard, subtitle?: string): RecItem => ({
  title: c.title,
  subtitle: subtitle ?? c.tags.slice(0, 2).map(prettyTag).join(" · "),
  imageUrl: imageFor(c),
  why: becauseOf(state, c.tags, { exclude: c.id }),
  cardId: c.id,
});

/** Hobbies you might love: ones you didn't pick that fit your taste, each with the picks that point to it. */
function hobbySuggestions(state: TasteState, liked: Set<string>): RecItem[] {
  return HOBBY_IMAGES.filter((h) => !liked.has(h.id) && imageFor(h))
    .map((h) => ({ h, s: tasteSimilarity(state, h.tags) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 10)
    .map(({ h }) => itemFor(state, h, h.tags.slice(0, 2).map(prettyTag).join(" · ")));
}

/** Always-available picks from the curated graph, grouped like the live sections. Never empty. */
function localSections(state: TasteState): { sections: RecSection[]; ranked: TasteCard[] } {
  const liked = likedIds(state);
  const twins = pickedTwins(liked);
  const scored = scoreCandidates(state, {}, new Set([...liked, ...twins])).filter((c) => c.card.domain !== "music" && !isVibe(c.card.id) && imageFor(c.card));
  // a section only shows things that genuinely share your tags — an empty section beats a wrong one
  const ranked = scored.filter((c) => c.parts.tag > 0.04).map((c) => c.card);
  const pick = (domains: Domain[], n: number) => ranked.filter((c) => domains.includes(c.domain)).slice(0, n).map((c) => itemFor(state, c));

  // cuisines: score each kitchen by every dish and vibe you picked from it — and say which ones
  const food = [...SEED_CARDS, ...VIBES].filter((c) => c.domain === "food" && imageFor(c));
  const byCuisine = new Map<string, TasteCard[]>();
  for (const c of food) {
    const tag = c.tags.find((t) => t.endsWith("-food"));
    if (tag) byCuisine.set(tag, [...(byCuisine.get(tag) ?? []), c]);
  }
  const vecScore = (c: TasteCard) => c.tags.reduce((a, t) => a + Math.max(0, state.tagVector[t] ?? 0), 0);
  const cuisines = [...byCuisine.entries()]
    .map(([tag, cards]) => ({ tag, cards, s: (state.tagVector[tag] ?? 0) * 2 + cards.reduce((a, c) => a + vecScore(c), 0) / cards.length }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map(({ tag, cards }): RecItem => {
      const picked = cards.filter((c) => liked.has(c.id)).map((c) => c.title);
      const best = [...cards].sort((a, b) => vecScore(b) - vecScore(a));
      return {
        title: prettyTag(tag),
        subtitle: best.filter((c) => !isVibe(c.id)).slice(0, 3).map((c) => c.title).join(" · ") || best[0].title,
        imageUrl: imageFor(best.find((c) => !liked.has(c.id)) ?? best[0]),
        why: picked.slice(0, 2),
      };
    });

  const hobbies = likedWeights(state)
    .filter(([id]) => id.startsWith("h-"))
    .map(([id]) => lookupCard(id)!);

  const S = (id: string, group: RecSection["group"], title: string, kicker: string, items: RecItem[]): RecSection => ({ id, group, title, kicker, items });
  const sections = [
    S("cuisines", "go", "Cuisines you'd love", "Ranked by the dishes and flavours you picked.", cuisines),
    S("l-food", "go", "Dishes & tables to try", "Food close to what you picked.", pick(["food"], 12)),
    S("l-hobbies", "go", hobbies.length ? "More things you'd enjoy doing" : "Things you'd enjoy doing", "Pastimes that fit how you like to spend time.", hobbySuggestions(state, liked)),
    S("l-rituals", "go", "Rituals & pastimes", "Small pleasures that match your pace.", pick(["lifestyle"], 12)),
    S("l-places", "go", "Places that fit you", "Destinations and spaces you'd feel at home in.", pick(["travel", "architecture"], 12)),
    S("l-screen", "watch", "Worth watching", "Films and series close to what you picked.", pick(["film", "tv"], 12)),
    S("l-games", "watch", "Worth playing", "Games with your mood.", pick(["game"], 12)),
    S("l-read", "read", "Worth reading", "Books close to your taste.", pick(["book"], 12)),
    S("l-art", "read", "Art & culture", "Galleries, movements and makers you'd connect with.", pick(["art"], 12)),
    S("l-own", "own", "Brands & objects", "Things that share your eye.", pick(["brand", "fashion"], 12)),
  ].filter((x) => x.items.length > 0);
  return { sections, ranked };
}

/** Find places for a hobby in a city: try each place-tag phrase until Qloo returns something. */
async function venuesFor(hobbyId: string, interests: string[], city: string): Promise<QlooEntity[]> {
  const v = lookupCard(hobbyId);
  const phrases = HOBBY_PLACES[hobbyId] ?? [v?.title.toLowerCase() ?? ""];
  for (const phrase of phrases) {
    const tags = await qlooTagIds(phrase, ["urn:tag:category:place:", "urn:tag:genre:place:", "urn:tag:activities:place:"]);
    for (const tag of tags.slice(0, 2)) {
      const es = await qlooInsights({ "filter.type": "urn:entity:place", "filter.tags": tag, "filter.location.query": city, ...(interests.length ? { "signal.interests.entities": interests.join(",") } : {}) }, 5);
      if (es.length) return es;
    }
  }
  return [];
}

/** Live sections: what each asks the graph for, and which of your worlds anchor it. */
const LIVE: { id: string; group: RecSection["group"]; title: string; kicker: string; type: string; domains: Domain[]; image?: boolean; maxTitle?: number }[] = [
  { id: "films", group: "watch", title: "Films you'd love", kicker: "Matched to what you picked.", type: "urn:entity:movie", domains: ["film"], image: true },
  { id: "series", group: "watch", title: "Series to start", kicker: "Shows that share your taste.", type: "urn:entity:tv_show", domains: ["tv", "film"], image: true },
  { id: "games", group: "watch", title: "Games worth your time", kicker: "Worlds that fit your mood.", type: "urn:entity:videogame", domains: ["game"] },
  { id: "books", group: "read", title: "Books for your shelf", kicker: "Reads that sit close to your taste.", type: "urn:entity:book", domains: ["book"], maxTitle: 60 },
  { id: "artists", group: "read", title: "Artists to put on", kicker: "Music that moves the way your picks do.", type: "urn:entity:artist", domains: ["music", "film"] },
  { id: "podcasts", group: "read", title: "Podcasts to put on", kicker: "Listens that match how you think.", type: "urn:entity:podcast", domains: ["book", "film", "tv"] },
  { id: "places", group: "go", title: "Places to go next", kicker: "Destinations that match your taste.", type: "urn:entity:destination", domains: ["travel", "architecture"] },
  { id: "brands", group: "own", title: "Brands with your taste", kicker: "Labels and makers that share your eye.", type: "urn:entity:brand", domains: ["brand", "fashion"] },
];

/** Best of everything, one from each world in turn, photos only. */
function topSection(sections: RecSection[]): RecSection {
  const lanes = sections.filter((s) => s.id !== "cuisines").map((s) => s.items.filter((i) => i.imageUrl));
  const out: RecItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 18 && lanes.some((l) => l[i]); i++)
    for (const l of lanes) {
      const it = l[i];
      if (it && !seen.has(it.title.toLowerCase()) && out.length < 18) {
        seen.add(it.title.toLowerCase());
        out.push(it);
      }
    }
  return { id: "top", group: "top", title: "Top picks", kicker: "The best of everything below, in one place.", items: out };
}

export async function buildRecommendations(state: TasteState, city?: string): Promise<{ sections: RecSection[]; mode: "live" | "mock" }> {
  const { sections: local, ranked } = localSections(state);
  const done = (sections: RecSection[], mode: "live" | "mock") => {
    const cuisines = sections.filter((x) => x.id === "cuisines");
    const rest = sections.filter((x) => x.id !== "cuisines");
    return { sections: [topSection(rest), ...cuisines, ...rest], mode };
  };
  if (getQlooAdapter().mode !== "live") return done(local, "mock");

  // resolve every anchor once up front (cached ~30 days), so the section queries below don't race on /search
  const plans = LIVE.map((l) => ({ l, anchors: anchorsFor(state, l.domains, { max: 8, inferred: ranked }) }));
  const foodAnchors = anchorsFor(state, ["food", "travel"], { max: 8, inferred: ranked });
  await resolveCardEntities([...new Set([...plans, { anchors: foodAnchors }].flatMap((p) => p.anchors.map((a) => a.cardId)))]);

  const picked = new Set<string>();
  for (const [id] of likedWeights(state)) {
    const c = lookupCard(id);
    if (c) picked.add(c.title.toLowerCase());
  }
  const vec = state.tagVector;
  const scale = Math.max(1, ...Object.values(vec)) * 1.5;

  const run = async ({ l, anchors }: (typeof plans)[number]): Promise<RecSection> => {
    const ra = await resolveAnchors(anchors);
    const S = (items: RecItem[]): RecSection => ({ id: l.id, group: l.group, title: l.title, kicker: l.kicker, items });
    if (!ra.ids.length) return S([]);
    const q = () => qlooInsights({ "filter.type": l.type, "signal.interests.entities": ra.ids.join(",") }, 24);
    let es = await q();
    if (!es.length) es = await q(); // one retry for a transient empty
    let items = toItems(es, { exclude: picked, nameOf: ra.nameOf, vec, scale }, { image: l.image });
    if (l.maxTitle) items = items.filter((i) => i.title.length <= l.maxTitle!);
    return S(items);
  };
  // two gentle waves: the API throttles bursts
  const first = await Promise.all(plans.slice(0, 4).map(run));
  const [second, { eat, doing }] = await Promise.all([Promise.all(plans.slice(4).map(run)), cityPicks()]);
  const liveSections = [...first, ...second];

  /** Restaurants in your cuisines and places for your hobbies — only when we know your city. */
  async function cityPicks(): Promise<{ eat: RecItem[]; doing: RecItem[] }> {
    let eat: RecItem[] = [];
    let doing: RecItem[] = [];
    if (city) {
      const loc = { "filter.location.query": city };
      const fa = await resolveAnchors(foodAnchors);
      const interests: Record<string, string> = fa.ids.length ? { "signal.interests.entities": fa.ids.join(",") } : {};
      const lean = (t: string) => (state.tagVector[t] ?? 0) * (t === "american-food" ? 0.5 : 1);
      const cuisines = Object.keys(vec)
        .filter((t) => t.endsWith("-food") && vec[t] > 0)
        .sort((a, b) => lean(b) - lean(a))
        .slice(0, 3)
        .map((t) => t.slice(0, -5));
      const eatRes = await Promise.all(
        (cuisines.length ? cuisines : ["restaurant"]).map(async (c) => {
          const tags = await qlooTagIds(c === "restaurant" ? "restaurant" : `${c} restaurant`, ["urn:tag:genre:place:restaurant:", "urn:tag:category:place:", "urn:tag:"]);
          const es = await qlooInsights({ "filter.type": "urn:entity:place", ...loc, ...interests, ...(tags[0] ? { "filter.tags": tags[0] } : {}) }, 6);
          return toItems(es, { exclude: new Set(), nameOf: fa.nameOf, vec, scale }, { image: true }).map((i) => ({ ...i, subtitle: [c === "restaurant" ? "" : prettyTag(`${c}-food`), i.subtitle].filter(Boolean).join(" · ") }));
        })
      );
      eat = eatRes.flat();

      // what you do: the hobbies you picked first, then ones your temperament points to
      const topTags = Object.entries(vec).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
      const hobbies = [
        ...likedWeights(state).filter(([id]) => id.startsWith("h-")).map(([id]) => id),
        ...ACTIVITY_BY_TRAIT.filter(([tags]) => tags.some((t) => topTags.includes(t))).map(([, h]) => h),
      ].filter((h, i, a) => a.indexOf(h) === i).slice(0, 6); // some hobbies have no venue in a given city
      const likedHobbies = likedIds(state);
      const actRes = await Promise.all(
        hobbies.map(async (h) => {
          const eatery = !FOOD_HOBBIES.has(h);
        const es = (await venuesFor(h, fa.ids, city)).filter(
          (e) => !LODGING.test(e.name) && !(e.tags ?? []).some((t) => LODGING.test(t.name) || LODGING.test(t.id) || (eatery && EATERY.test(t.id)))
        );
          const title = lookupCard(h)?.title ?? h;
          return toItems(es, { exclude: new Set(), nameOf: fa.nameOf, vec, scale }, { image: true, take: 4 }).map((i) => ({
            ...i,
            subtitle: title,
            why: likedHobbies.has(h) ? [title] : i.why,
          }));
        })
      );
      doing = actRes.flat();
    }
    return { eat, doing };
  }

  const uniq = (items: RecItem[]) => items.filter((it, i) => items.findIndex((x) => x.title === it.title) === i);
  const extra: RecSection[] = [
    { id: "eat", group: "go", title: city ? `Where to eat in ${city}` : "Where to eat", kicker: "Restaurants in the cuisines you lean toward.", items: uniq(eat), needsCity: !city },
    { id: "do", group: "go", title: city ? `Things to do in ${city}` : "Things to do near you", kicker: "Places for the things you like doing.", items: uniq(doing), needsCity: !city },
  ];
  const live = [...liveSections, ...extra].map((s) => ({ ...s, items: uniq(s.items) })).filter((x) => x.items.length > 0 || x.needsCity);
  // live graph sections lead each tab; the always-available curated ones follow
  return done([...live, ...local], "live");
}
