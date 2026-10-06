import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getOrCreateSession, saveSession } from "@/lib/store/db";
import { applyInteraction } from "@/lib/taste/engine";
import { DEMO_PERSONAS, cardsById } from "@/data/cards";
import { getQlooAdapter } from "@/lib/qloo";

/**
 * POST /api/demo { persona } — deterministic demo sessions (Maya / Alex).
 * Creates a fresh session, replays the persona's preset interactions as real
 * taste signals, and binds the cookie to it. Judges can compare the two.
 */
export async function POST(req: Request) {
  const { persona } = (await req.json()) as { persona: string };
  const def = DEMO_PERSONAS[persona];
  if (!def) return NextResponse.json({ error: "unknown persona" }, { status: 400 });

  const session = await getOrCreateSession(); // fresh session id
  session.currentRound = 2; // pretend two rounds happened
  for (const id of def.likes) {
    const card = cardsById().get(id);
    if (!card) continue;
    applyInteraction(session.state, card, "like", 1);
  }
  for (const id of def.dislikes) {
    const card = cardsById().get(id);
    if (!card) continue;
    applyInteraction(session.state, card, "dislike", 2);
  }
  await saveSession(session);

  const res = NextResponse.json({
    sessionId: session.id,
    persona,
    name: def.name,
    blurb: def.blurb,
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
