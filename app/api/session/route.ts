import { NextResponse } from "next/server";
import { SESSION_COOKIE, resolveSession } from "@/lib/session";
import { getQlooAdapter } from "@/lib/qloo";

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
  return NextResponse.json({
    sessionId: session.id,
    interactions: session.state.signals.length,
    confidence: session.state.confidence,
    mode: getQlooAdapter().mode,
  });
}
