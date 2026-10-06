import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { nextBatch, computeConfidence, confidenceLabel } from "@/lib/taste/engine";
import { markShown } from "@/lib/store/db";
import { getQlooAdapter } from "@/lib/qloo";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/** Adaptive feed: returns the next batch, adapted to the user's taste state. */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "feed"), 40, 1)) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }
  const url = new URL(req.url);
  const count = Math.min(Number(url.searchParams.get("count") ?? 12), 24);
  const session = await resolveSession(url.searchParams.get("sid") ?? undefined);

  const { cards, adapted, pools } = await nextBatch(session, count);
  // round bumps once per batch served, so the client's "gallery wall N" logic
  // tracks what the user actually saw — not how many requests it took to serve
  await markShown(session, cards.map((c) => c.id), 1);

  const decisive = session.state.signals.filter((s) => s.interaction !== "skip").length;
  const confidence = computeConfidence(session.state);

  return NextResponse.json({
    cards,
    adapted,
    pools,
    progress: {
      interactions: session.state.signals.length,
      decisive,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      round: session.currentRound,
      readyForProfile: decisive >= 12,
      readyForFullProfile: decisive >= 30,
    },
    mode: getQlooAdapter().mode,
  });
}
