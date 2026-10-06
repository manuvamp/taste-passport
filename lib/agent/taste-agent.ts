import type { Domain, TasteProfile, QlooEntity } from "@/lib/types";
import { cardsById } from "@/data/cards";
import { getQlooAdapter } from "@/lib/qloo";
import { resolveCardEntities, qlooEntityName } from "@/lib/qloo/resolve";
import { getLiveCard } from "@/lib/qloo/live-cards";
import { llmWrite } from "@/lib/agent/llm";

/**
 * The Taste Agent: request + taste profile + Qloo cultural context -> a plan.
 * Two arms:
 *  - "withTaste": interests come from the user's Qloo-grounded profile
 *  - generic:     the same request answered with popularity only (no taste)
 * The delta between the two IS the product demo.
 */

const INTENT_DOMAINS: { re: RegExp; domain: Domain }[] = [
  { re: /\b(restaurant|dinner|lunch|breakfast|eat|food|ramen|sushi|brunch|coffee)\b/i, domain: "food" },
  { re: /\b(hotel|stay|sleep|airbnb|hostel)\b/i, domain: "travel" },
  { re: /\b(museum|gallery|art|exhibition)\b/i, domain: "art" },
  { re: /\b(music|concert|gig|album|band|dj|club|vinyl)\b/i, domain: "music" },
  { re: /\b(movie|film|cinema)\b/i, domain: "film" },
  { re: /\b(shop|shopping|fashion|clothes|clothing|vintage|sneakers)\b/i, domain: "fashion" },
  { re: /\b(book|bookstore|reading)\b/i, domain: "book" },
  { re: /\b(game|games|gaming|arcade)\b/i, domain: "game" },
  { re: /\b(architecture|building|neighborhood|walk|design|interior)\b/i, domain: "architecture" },
  { re: /\b(tv|series|show)\b/i, domain: "tv" },
];

const FULL_DAY_PLAN: Domain[] = ["food", "architecture", "art", "food", "music"];

export type PlanItem = {
  slot: string;
  domain: Domain;
  name: string;
  matchPct?: number;
  whyThis: string;
  source: "qloo" | "generic";
};

export type AgentPlan = {
  request: string;
  location: string | null;
  withTaste: boolean;
  intro: string;
  items: PlanItem[];
  groundedIn: string[]; // profile entities that drove the result
  qlooBacked: boolean;
};

function detectLocation(request: string): string | null {
  const m = request.match(/\b(?:in|visiting|to)\s+([A-Z][\w'-]+(?:\s[A-Z][\w'-]+)?)/);
  return m ? m[1] : null;
}

function detectDomains(request: string): Domain[] {
  const hits: Domain[] = [];
  for (const { re, domain } of INTENT_DOMAINS) if (re.test(request)) hits.push(domain);
  return hits.length ? hits : FULL_DAY_PLAN;
}

function interestsFromProfile(profile: TasteProfile, domain: Domain): string[] {
  // Core entities lead; domain-relevant likes get appended first.
  const domainLikes = profile.positiveSignals.filter((s) => s.domain === domain).map((s) => s.cardId);
  const rest = profile.positiveSignals.filter((s) => s.domain !== domain).map((s) => s.cardId);
  return [...domainLikes, ...rest].slice(0, 10);
}

/**
 * Generic arm: no user signals at all. In mock mode this returns fixed
 * "most popular" picks per domain — deliberately the answer a tasteless
 * assistant would give.
 */
async function genericPicks(domain: Domain, location: string | null): Promise<PlanItem[]> {
  const byId = cardsById();
  const POPULAR: Record<string, string[]> = {
    food: ["korean-bbq", "neapolitan-pizza", "japanese-ramen", "dim-sum"],
    travel: ["tokyo", "paris", "new-york", "london"],
    art: ["moma", "louvre", "van-gogh-museum"],
    music: ["arctic-monkeys", "bad-bunny", "daft-punk"],
    film: ["dune-2021", "eeaao", "oppenheimer"],
    fashion: ["uniqlo-u", "gucci", "the-north-face"],
    architecture: ["sydney-opera", "sagrada-familia", "guggenheim-bilbao"],
    book: ["one-hundred-years", "infinite-jest", "kafka-on-the-shore"],
    game: ["elden-ring", "botw", "hades"],
    tv: ["succession", "squid-game", "severance"],
    brand: ["muji", "lego", "patagonia"],
    lifestyle: ["specialty-coffee", "bouldering", "vinyl-collecting"],
  };
  const ids = (POPULAR[domain] ?? []).filter((id) => byId.has(id));
  const slotLabels = ["anytime", "backup"];
  return ids.slice(0, 3).map((id, i) => {
    const c = byId.get(id)!;
    return {
      slot: i === 0 ? "popular pick" : slotLabels[Math.min(i, slotLabels.length - 1)],
      domain,
      name: c.title,
      whyThis: location
        ? `A frequently recommended ${domain} option for visitors to ${location}.`
        : `A frequently recommended ${domain} option — popular, broadly liked, not derived from you.`,
      source: "generic" as const,
    };
  });
}

const SLOTS = ["Morning", "Midday", "Afternoon", "Evening", "Night"];

export async function generatePlan(
  request: string,
  profile: TasteProfile | null,
  opts: { withTaste: boolean; onStage?: (stage: number) => void }
): Promise<AgentPlan> {
  const location = detectLocation(request);
  const domains = detectDomains(request);
  const adapter = getQlooAdapter();
  const byId = cardsById();
  const items: PlanItem[] = [];
  const groundedIn: string[] = [];
  opts.onStage?.(0); // parsed intent / reading profile

  if (opts.withTaste && profile) {
    groundedIn.push(...profile.coreEntities.slice(0, 5).map((e) => e.title));
    // In live mode, profile card ids must become real Qloo entity ids before
    // they can seed /v2/insights; mock mode passes card ids straight through.
    const profileInterests = interestsFromProfile(profile, domains[0]);
    const resolvedMap = await resolveCardEntities(profileInterests);
    opts.onStage?.(1); // entities resolved — querying the graph now
    const interests = [...new Set(Object.values(resolvedMap).map((r) => r.entityId))];
    const usedNames = new Set<string>();
    const nameFor = (entityId: string): string | undefined => {
      if (entityId.startsWith("card:")) return byId.get(entityId.slice(5))?.title;
      return qlooEntityName(entityId) ?? getLiveCard(`qloo:${entityId}`)?.title ?? byId.get(entityId)?.title;
    };

    for (let i = 0; i < Math.min(domains.length, 5); i++) {
      const domain = domains[i];
      const recs = await adapter.getRecommendations({
        interests,
        domain,
        take: 8,
        excludeIds: interests,
        locationHint: location ?? undefined,
      });
      // never repeat a pick within one plan; skip the slot if the graph has
      // nothing fresh for this domain
      const pick: QlooEntity | undefined = recs.entities.find((e) => !usedNames.has(e.name));
      if (!pick) continue;
      usedNames.add(pick.name);
      const explainParts = Object.entries(pick.explainability ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, v]) => {
          const n = nameFor(id);
          return n ? `${n} (${Math.round(v * 100)}%)` : null;
        })
        .filter(Boolean);
      const match = pick.affinity ?? 0.6;
      items.push({
        slot: SLOTS[i] ?? `Stop ${i + 1}`,
        domain,
        name: pick.name,
        matchPct: Math.round(match * 100),
        whyThis: explainParts.length
          ? `Qloo links this to your taste for ${explainParts.join(", ")}.`
          : `Matches your ${domain} affinity signals (${Math.round(match * 100)}% cultural match).`,
        source: recs.source === "qloo" ? "qloo" : "qloo",
      });
    }
  }

  if (!items.length) {
    const generic: PlanItem[] = [];
    for (const d of domains.slice(0, 4)) generic.push(...(await genericPicks(d, location)));
    items.push(...generic.slice(0, 5));
  }

  const archetype = profile?.archetype.name ?? "a generic profile";
  const tasteLine = opts.withTaste && profile
    ? `Anchored in your taste signals: ${groundedIn.join(", ")}.`
    : "No taste profile used — this is the generic answer.";
  const fallbackIntro = `${opts.withTaste ? `Planned for ${archetype}` : "Generic plan"}${location ? ` — ${location}` : ""}. ${tasteLine}`;
  opts.onStage?.(2); // ranked + grounded

  const llmIntro = await llmWrite(
    "You write one-sentence, vivid intros for a culturally personalized itinerary. Never invent place names. Use only the provided items and taste signals.",
    `Request: "${request}". Plan items: ${items.map((i) => i.name).join(", ")}. Taste archetype: ${archetype}. Taste signals: ${groundedIn.join(", ")}. Write ONE intro sentence (max 30 words).`
  );

  return {
    request,
    location,
    withTaste: opts.withTaste,
    intro: llmIntro ?? fallbackIntro,
    items,
    groundedIn,
    qlooBacked: items.some((i) => i.source === "qloo"),
  };
}
