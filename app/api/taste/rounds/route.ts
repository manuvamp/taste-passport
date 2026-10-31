import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildRounds } from "@/lib/taste/rounds";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * GET /api/taste/rounds?kinds=film,food,auto&exclude=id,id&offset=3 — personalised four-option rounds.
 * The client asks for a round or two at a time, so each one reflects the choices made just before it.
 */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "rounds"), 60, 2)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const url = new URL(req.url);
  const kinds = (url.searchParams.get("kinds") ?? "").split(",").filter(Boolean).slice(0, 24);
  const exclude = (url.searchParams.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 400);
  const offset = Math.max(0, Math.min(1000, Number(url.searchParams.get("offset")) || 0));
  const session = await resolveSession();
  return NextResponse.json({ rounds: buildRounds(session.state, kinds, exclude, offset) }, { headers: { "cache-control": "no-store" } });
}
