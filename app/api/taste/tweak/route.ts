import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { applyInteraction, removeCardSignals } from "@/lib/taste/engine";
import { saveSession } from "@/lib/store/db";
import { cardsById } from "@/data/cards";
import { getLiveCard } from "@/lib/qloo/live-cards";

type Body = { action: "remove" | "boost"; cardId: string };

/** POST /api/taste/tweak — fine-tune the profile: drop a signal, or double down on one. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.cardId !== "string" || !["remove", "boost"].includes(body.action)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const session = await resolveSession();
  if (body.action === "remove") {
    removeCardSignals(session.state, body.cardId);
  } else {
    const card = cardsById().get(body.cardId) ?? getLiveCard(body.cardId);
    if (!card) return NextResponse.json({ error: "unknown card" }, { status: 400 });
    applyInteraction(session.state, card, "like", session.currentRound, `card:${card.id}`, "tweak");
  }
  await saveSession(session);
  return NextResponse.json({ ok: true, signals: session.state.signals.length });
}
