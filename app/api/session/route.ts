import { NextResponse } from "next/server";
import { SESSION_COOKIE, resolveSession } from "@/lib/session";
import { getQlooAdapter } from "@/lib/qloo";
import { prettyTag, tagIdf } from "@/lib/taste/signals";

/** Create or return the anonymous session (cookie-based). */
export async function POST() {
  const session = await resolveSession();
  const res = NextResponse.json({
    sessionId: session.id,
    interactions: session.state.signals.length,
    mode: getQlooAdapter().mode,
  });
  res.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}

export async function GET() {
  const session = await resolveSession();
  // the three most distinctive things we've heard so far (a rare tag says more than "warm")
  const idf = tagIdf();
  const hearing = Object.entries(session.state.tagVector)
    .filter(([t, w]) => w > 0.8 && !["warm", "quiet", "classic", "modern", "simple"].includes(t))
    .sort((a, b) => b[1] * Math.sqrt(idf[b[0]] ?? 1) - a[1] * Math.sqrt(idf[a[0]] ?? 1))
    .slice(0, 3)
    .map(([t]) => prettyTag(t));
  return NextResponse.json({
    sessionId: session.id,
    interactions: session.state.signals.length,
    confidence: session.state.confidence,
    hearing,
    mode: getQlooAdapter().mode,
  });
}
