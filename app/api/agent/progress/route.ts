import { NextResponse } from "next/server";
import { planProgressGet, PLAN_STEPS } from "@/lib/agent/progress";

/** GET /api/agent/progress?id=… — coarse plan-generation ticks for the agent UI. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const p = planProgressGet(id);
  return NextResponse.json(
    {
      found: Boolean(p),
      step: p?.step ?? 0,
      total: PLAN_STEPS.length,
      label: p ? PLAN_STEPS[Math.min(p.step, PLAN_STEPS.length - 1)] : null,
      done: p?.done ?? false,
      error: p?.error,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
