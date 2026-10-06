import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildProfile } from "@/lib/taste/engine";
import { generatePlan } from "@/lib/agent/taste-agent";
import { getQlooAdapter } from "@/lib/qloo";

type Body = { request: string };

/**
 * POST /api/agent/compare — the "What Qloo changed" screen.
 * Runs the same request twice: generic vs taste-grounded, and summarizes
 * the delta. This is the single most important judging moment.
 */
export async function POST(req: Request) {
  const { request } = (await req.json()) as Body;
  if (!request?.trim()) {
    return NextResponse.json({ error: "request required" }, { status: 400 });
  }
  const sid = new URL(req.url).searchParams.get("sid") ?? undefined;
  const session = await resolveSession(sid);
  const hasProfile = session.state.signals.length > 0;
  const profile = hasProfile ? buildProfile(session) : null;

  const [generic, personalized] = await Promise.all([
    generatePlan(request.trim(), null, { withTaste: false }),
    hasProfile
      ? generatePlan(request.trim(), profile, { withTaste: true })
      : Promise.resolve(null),
  ]);

  const mode = getQlooAdapter().mode;
  const personalizedItems = personalized?.items ?? [];
  const genericItems = generic.items;
  const overlap = personalizedItems.filter((p) => genericItems.some((g) => g.name === p.name)).length;

  return NextResponse.json(
    {
      request,
      mode,
      hasProfile,
      profileAnchors: profile?.coreEntities.slice(0, 5).map((e) => e.title) ?? [],
      generic,
      personalized,
      delta: {
        itemsReplaced: Math.max(0, personalizedItems.length - overlap),
        explanation: hasProfile
          ? `${Math.max(0, personalizedItems.length - overlap)} of ${personalizedItems.length} picks differ from the generic answer — each grounded in your Qloo taste signals.`
          : "Build a taste profile first to see Qloo change the answer.",
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
