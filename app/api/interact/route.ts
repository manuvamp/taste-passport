import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { applyInteraction, computeConfidence, confidenceLabel } from "@/lib/taste/engine";
import { saveSession } from "@/lib/store/db";
import { cardsById } from "@/data/cards";
import { getLiveCard } from "@/lib/qloo/live-cards";

type Body = {
  cardId: string;
  interaction: "like" | "dislike" | "skip";
  source?: string;
};

/**
 * Record an interaction and update the taste state.
 * Accepts seed card ids and live Qloo entity cards ("qloo:<entity_id>").
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const card = cardsById().get(body.cardId) ?? getLiveCard(body.cardId);
  if (!card) return NextResponse.json({ error: "unknown card" }, { status: 400 });
  if (!["like", "dislike", "skip"].includes(body.interaction)) {
    return NextResponse.json({ error: "bad interaction" }, { status: 400 });
  }

  const session = await resolveSession();
  applyInteraction(session.state, card, body.interaction, session.currentRound, `card:${card.id}`, body.source ?? "feed");
  await saveSession(session);

  const decisive = session.state.signals.filter((s) => s.interaction !== "skip").length;
  const confidence = computeConfidence(session.state);

  return NextResponse.json({
    ok: true,
    progress: {
      interactions: session.state.signals.length,
      decisive,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      round: session.currentRound,
      readyForProfile: decisive >= 12,
      readyForFullProfile: decisive >= 30,
    },
  });
}
