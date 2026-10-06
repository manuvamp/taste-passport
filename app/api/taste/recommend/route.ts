import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildRecommendations } from "@/lib/taste/recommend";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/** GET /api/taste/recommend?city= — taste-matched picks across film, TV, games, books, podcasts, music, places, food, activities and brands. */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "recommend"), 20, 1)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const url = new URL(req.url);
  const city = (url.searchParams.get("city") ?? "").replace(/[^\p{L}\p{N} ,.'-]/gu, "").slice(0, 60).trim() || undefined;
  const session = await resolveSession();
  if (session.state.signals.length === 0) return NextResponse.json({ error: "no taste signals yet" }, { status: 404 });
  const out = await buildRecommendations(session.state, city);
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
