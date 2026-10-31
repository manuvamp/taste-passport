import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { applyInteraction, removeCardSignals } from "@/lib/taste/engine";
import { updateSession } from "@/lib/store/db";
import type { TasteState } from "@/lib/types";
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
  const card = cardsById().get(body.cardId) ?? getLiveCard(body.cardId);
  if (body.action === "boost" && !card) return NextResponse.json({ error: "unknown card" }, { status: 400 });
  const apply = (state: TasteState, round: number) => {
    if (body.action === "remove") removeCardSignals(state, body.cardId);
    else applyInteraction(state, card!, "like", round, `card:${card!.id}`, "tweak");
  };
  const fresh = await updateSession(session.id, (rec) => apply(rec.state, rec.currentRound));
  if (!fresh) return NextResponse.json({ error: "session ended" }, { status: 410 });
  return NextResponse.json({ ok: true, signals: fresh.state.signals.length });
}
