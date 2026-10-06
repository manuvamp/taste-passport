import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildProfile } from "@/lib/taste/engine";
import { generatePlan } from "@/lib/agent/taste-agent";
import { getQlooAdapter } from "@/lib/qloo";
import { planProgressStart, planProgressTick, planProgressDone, planProgressFail } from "@/lib/agent/progress";
import { rateLimit, clientKey } from "@/lib/rate-limit";

type Body = { request: string; planId?: string };

/**
 * POST /api/agent/compare — the "What Qloo changed" screen.
 * Runs the same request twice: generic vs taste-grounded, and summarizes
 * the delta. This is the single most important judging moment.
 *
 * The response header x-plan-id lets the client poll /api/agent/progress for
 * coarse step ticks while a live (cold) plan is being generated.
 */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "compare"), 20, 0.34)) {
    return NextResponse.json({ error: "slow down — the agent is thinking about your last request" }, { status: 429 });
  }
  const { request, planId: clientPlanId } = (await req.json()) as Body;
  if (!request?.trim()) {
    return NextResponse.json({ error: "request required" }, { status: 400 });
  }
  // the client may mint its own planId so it can start polling immediately
  const planId = planProgressStart(typeof clientPlanId === "string" && clientPlanId.length <= 64 ? clientPlanId : undefined);
  try {
    const sid = new URL(req.url).searchParams.get("sid") ?? undefined;
    const session = await resolveSession(sid);
    const hasProfile = session.state.signals.length > 0;
    const profile = hasProfile ? buildProfile(session) : null;

    const [generic, personalized] = await Promise.all([
      generatePlan(request.trim(), null, {
        withTaste: false,
        onStage: (i) => planProgressTick(planId, i),
      }),
      hasProfile
        ? generatePlan(request.trim(), profile, {
            withTaste: true,
            onStage: (i) => planProgressTick(planId, 2 + i),
          })
        : Promise.resolve(null),
    ]);

  const mode = getQlooAdapter().mode;
  const personalizedItems = personalized?.items ?? [];
  const genericItems = generic.items;
  const overlap = personalizedItems.filter((p) => genericItems.some((g) => g.name === p.name)).length;
  planProgressDone(planId);

  return NextResponse.json(
    {
      request,
      mode,
      hasProfile,
      profileAnchors: profile?.coreEntities.slice(0, 5).map((e) => e.title) ?? [],
      anyone: generic, // the tasteless arm — useful as a baseline even without a profile
      generic,
      personalized,
      delta: {
        itemsReplaced: Math.max(0, personalizedItems.length - overlap),
        explanation: hasProfile
          ? `${Math.max(0, personalizedItems.length - overlap)} of ${personalizedItems.length} picks differ from the generic answer — each grounded in your Qloo taste signals.`
          : "Build a taste profile first to see Qloo change the answer.",
      },
    },
    { headers: { "cache-control": "no-store", "x-plan-id": planId } }
  );
  } catch (e) {
    planProgressFail(planId, e instanceof Error ? e.message : "agent failed");
    throw e;
  }
}
