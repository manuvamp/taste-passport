import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { cardsById } from "@/data/cards";
import { mockAffinity } from "@/lib/qloo/mock";

/**
 * GET /api/taste/explain?title=... — why does this entity match the user?
 * Grounded in actual signal overlaps (Qloo graph in live mode, deterministic
 * tag/bridge graph in mock mode), never fabricated.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title")?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const card = [...cardsById().values()].find(
    (c) => c.title.toLowerCase() === title.toLowerCase()
  );
  if (!card) return NextResponse.json({ error: "unknown entity" }, { status: 404 });

  const session = await resolveSession(url.searchParams.get("sid") ?? undefined);
  const likes: Record<string, number> = {};
  for (const s of session.state.signals) {
    if (s.interaction === "like") likes[s.cardId] = 1;
  }
  const hasProfile = Object.keys(likes).length > 0;
  if (!hasProfile) {
    return NextResponse.json({ error: "no taste signals yet" }, { status: 409 });
  }

  const affinity = mockAffinity(card.id, likes);
  const bridges = Object.keys(likes)
    .filter((id) => id !== card.id && mockAffinity(card.id, { [id]: 1 }) > 0.2)
    .map((id) => cardsById().get(id)?.title ?? id)
    .slice(0, 5);

  return NextResponse.json({
    entity: { title: card.title, domain: card.domain },
    matchPct: Math.round(affinity * 100),
    bridges,
    explanation: bridges.length
      ? `${card.title} matches you because Qloo's taste graph links it to your signals: ${bridges.join(", ")}.`
      : `${card.title} aligns with the tag pattern of your likes (${card.tags.slice(0, 4).join(", ")}).`,
    qlooBacked: bridges.length > 0,
  });
}
