import { NextResponse } from "next/server";
import { SESSION_COOKIE, resolveSession } from "@/lib/session";
import { applyInteraction, buildProfile, computeConfidence } from "@/lib/taste/engine";
import { saveProfileVersion, saveSession, deleteSession } from "@/lib/store/db";
import { cardsById } from "@/data/cards";
import { getQlooAdapter } from "@/lib/qloo";

/** GET /api/taste/profile — the portable cultural taste profile (agent-facing). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = await resolveSession(url.searchParams.get("sid") ?? undefined);
  if (session.state.signals.length === 0) {
    return NextResponse.json({ error: "no taste signals yet" }, { status: 404 });
  }
  const profile = buildProfile(session);
  profile.confidence = computeConfidence(session.state);

  // persist a new version when signals changed since last version
  const last = session.profileVersions[session.profileVersions.length - 1];
  if (!last || last.interactionCount !== profile.interactionCount) {
    await saveProfileVersion(session, profile);
  }
  return NextResponse.json(profile, {
    headers: { "cache-control": "no-store" },
  });
}

/** DELETE /api/taste/profile — privacy: clear all taste data for this session. */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const session = await resolveSession(url.searchParams.get("sid") ?? undefined);
  await deleteSession(session.id);
  const res = NextResponse.json({ ok: true, deleted: session.id });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

type FeedbackBody = { cardId: string; feedback: "like" | "dislike" | "skip"; itemId?: string };

/** POST /api/taste/profile — continuous-learning feedback on recommendations. */
export async function POST(req: Request) {
  const body = (await req.json()) as FeedbackBody;
  const card = cardsById().get(body.cardId);
  if (!card) return NextResponse.json({ error: "unknown card" }, { status: 400 });
  const sid = new URL(req.url).searchParams.get("sid") ?? undefined;
  const session = await resolveSession(sid);
  applyInteraction(session.state, card, body.feedback, session.currentRound, `card:${card.id}`, `recommendation:${body.itemId ?? body.cardId}`);
  await saveSession(session);
  const profile = buildProfile(session);
  await saveProfileVersion(session, profile);
  return NextResponse.json({ ok: true, profileVersion: profile.profileVersion, confidence: profile.confidence, mode: getQlooAdapter().mode });
}
