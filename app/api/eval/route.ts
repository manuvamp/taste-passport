import { NextResponse } from "next/server";
import { generatePlan } from "@/lib/agent/taste-agent";
import { buildProfile, applyInteraction } from "@/lib/taste/engine";
import { DEMO_PERSONAS, cardsById } from "@/data/cards";
import { getQlooAdapter } from "@/lib/qloo";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import type { Domain } from "@/lib/types";

/**
 * GET /api/eval — public evaluation: N scenarios through generic vs.
 * taste-grounded arms, scored on the same axes judges care about.
 *
 * Runs both demo personas (Maya, Alex) across fixed scenarios in throwaway
 * in-memory sessions. Deliberately read-only: nothing the eval does touches a
 * real user session. Rate-limited hard — it fans out Qloo calls.
 */

const SCENARIOS = [
  { request: "Plan my Saturday in Tokyo", expect: "travel" },
  { request: "Find me a restaurant in Lisbon", expect: "food" },
  { request: "What should I read, watch and listen to this month?", expect: "mixed" },
] as const;

const METRIC_DOMAINS = new Set(["music", "film", "tv", "art", "book", "game", "fashion", "travel", "food"]);

function personaProfile(persona: string) {
  const def = DEMO_PERSONAS[persona];
  // fresh in-memory session — never persisted
  const session = {
    id: `eval-${persona}`,
    createdAt: new Date().toISOString(),
    currentRound: 2,
    state: {
      sessionId: `eval-${persona}`,
      signals: [] as never[],
      shownCardIds: [],
      domainWeights: {},
      tagVector: {},
      explorationLevel: 1,
      confidence: 0,
      profileVersion: 0,
      lastUpdated: new Date().toISOString(),
    },
    profileVersions: [] as unknown[],
  };
  const byId = cardsById();
  for (const id of def.likes) {
    const c = byId.get(id);
    if (c) applyInteraction(session.state, c, "like", 1);
  }
  for (const id of def.dislikes) {
    const c = byId.get(id);
    if (c) applyInteraction(session.state, c, "dislike", 2);
  }
  return buildProfile(session);
}

export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "eval"), 3, 0.02)) {
    return NextResponse.json({ error: "evaluation is expensive — try again in a minute" }, { status: 429 });
  }
  const mode = getQlooAdapter().mode;
  const personas = ["maya", "alex"];
  const rows = [];

  for (const p of personas) {
    const profile = personaProfile(p);
    for (const s of SCENARIOS) {
      const [generic, taste] = await Promise.all([
        generatePlan(s.request, null, { withTaste: false }),
        generatePlan(s.request, profile, { withTaste: true }),
      ]);
      const gNames = new Set(generic.items.map((i) => i.name));
      const tItems = taste.items;
      const distinct = tItems.filter((i) => !gNames.has(i.name)).length;
      const domains = new Set(tItems.map((i) => i.domain).filter((d) => METRIC_DOMAINS.has(d))).size;
      const grounded = tItems.filter((i) => i.matchPct !== undefined && i.matchPct >= 60).length;
      rows.push({
        persona: p,
        archetype: profile.archetype.name,
        scenario: s.request,
        domainIntent: s.expect,
        generic: generic.items.map((i) => ({ name: i.name, domain: i.domain as Domain })),
        taste: tItems.map((i) => ({ name: i.name, domain: i.domain as Domain, matchPct: i.matchPct })),
        metrics: {
          personalizationRate: tItems.length ? Math.round((distinct / tItems.length) * 100) : 0,
          crossDomainBreadth: domains,
          groundedPicks: grounded,
          totalPicks: tItems.length,
        },
      });
    }
  }

  // aggregate
  const agg = rows.reduce(
    (a, r) => ({
      personalization: a.personalization + r.metrics.personalizationRate,
      breadth: a.breadth + r.metrics.crossDomainBreadth,
      grounded: a.grounded + r.metrics.groundedPicks,
      picks: a.picks + r.metrics.totalPicks,
    }),
    { personalization: 0, breadth: 0, grounded: 0, picks: 0 }
  );
  const n = rows.length || 1;

  return NextResponse.json(
    {
      mode,
      ranAt: new Date().toISOString(),
      methodology:
        "2 demo personas × 3 fixed scenarios, generic vs taste-grounded arms in parallel. Personalization = % of taste-arm picks absent from the generic arm. Breadth = distinct cultural domains per plan. Grounded = picks with Qloo match ≥ 60%.",
      aggregate: {
        scenarios: n,
        avgPersonalizationRate: Math.round(agg.personalization / n),
        avgCrossDomainBreadth: Math.round((agg.breadth / n) * 10) / 10,
        groundedPickRate: agg.picks ? Math.round((agg.grounded / agg.picks) * 100) : 0,
      },
      rows,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
