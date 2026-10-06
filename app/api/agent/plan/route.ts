import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildProfile } from "@/lib/taste/engine";
import { generatePlan } from "@/lib/agent/taste-agent";

type Body = { request: string; withTaste?: boolean };

/** POST /api/agent/plan — the Taste Agent: request + profile + Qloo -> plan. */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.request?.trim()) {
    return NextResponse.json({ error: "request required" }, { status: 400 });
  }
  const withTaste = body.withTaste !== false;
  let profile = null;
  if (withTaste) {
    const sid = new URL(req.url).searchParams.get("sid") ?? undefined;
    const session = await resolveSession(sid);
    if (session.state.signals.length === 0) {
      return NextResponse.json({ error: "no taste profile yet — build one first" }, { status: 409 });
    }
    profile = buildProfile(session);
  }
  const plan = await generatePlan(body.request.trim(), profile, { withTaste });
  return NextResponse.json(plan, { headers: { "cache-control": "no-store" } });
}
