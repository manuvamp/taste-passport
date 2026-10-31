import { NextResponse } from "next/server";
import { SESSION_COOKIE, resolveSession } from "@/lib/session";
import { applyInteraction, computeConfidence, confidenceLabel } from "@/lib/taste/engine";
import { updateSession } from "@/lib/store/db";
import { cardsById } from "@/data/cards";
import { DOMAINS, type Domain, type TasteCard, type TasteState } from "@/lib/types";
import { getLiveCard, registerLiveCards } from "@/lib/qloo/live-cards";

type Body = {
  cardId?: string;
  /** batch of likes (vibe wall submit) — one round trip instead of 25 */
  cardIds?: string[];
  /** options shown alongside the chosen one but passed over — a light negative, so choices are relative */
  passed?: string[];
  /** live Qloo cards the server may not remember (serverless) — re-registered from the client copy */
  cards?: { id: string; title: string; domain: string; tags?: string[]; imageUrl?: string; qlooEntityId?: string }[];
  interaction: "like" | "dislike" | "skip";
  /** 0..2 — how much this signal should count (a deliberate four-way choice > a scroll-by tap) */
  strength?: number;
  source?: string;
};

const PASS_STRENGTH = 0.25;

/**
 * Record interactions and update the taste state.
 * Accepts seed card ids, vibe/hobby ids and live Qloo entity cards ("qloo:<entity_id>").
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const known = new Set(DOMAINS as string[]);
  registerLiveCards(
    (body.cards ?? [])
      .filter((c) => typeof c?.id === "string" && c.id.startsWith("qloo:") && typeof c.title === "string" && known.has(c.domain) && !getLiveCard(c.id))
      .slice(0, 5)
      .map((c) => ({
        id: c.id.slice(0, 80),
        title: c.title.slice(0, 120),
        domain: c.domain as Domain,
        tags: (c.tags ?? []).slice(0, 6).map((t) => String(t).slice(0, 40)),
        imageUrl: typeof c.imageUrl === "string" ? c.imageUrl.slice(0, 500) : undefined,
        qlooEntityId: typeof c.qlooEntityId === "string" ? c.qlooEntityId.slice(0, 80) : undefined,
      }))
  );
  const find = (id: unknown) => (typeof id === "string" ? cardsById().get(id) ?? getLiveCard(id) : undefined);
  const ids = Array.isArray(body.cardIds) ? body.cardIds : body.cardId ? [body.cardId] : [];
  const cards = ids.slice(0, 60).map(find);
  if (cards.length === 0 || cards.some((c) => !c)) return NextResponse.json({ error: "unknown card" }, { status: 400 });
  if (!["like", "dislike", "skip"].includes(body.interaction)) {
    return NextResponse.json({ error: "bad interaction" }, { status: 400 });
  }
  const passed = (Array.isArray(body.passed) ? body.passed : []).slice(0, 6).map(find).filter((c): c is TasteCard => !!c);
  const strength = typeof body.strength === "number" ? Math.max(0, Math.min(2, body.strength)) : 1;
  const source = typeof body.source === "string" ? body.source.slice(0, 40) : "feed";

  const apply = (state: TasteState, round: number) => {
    for (const card of cards) applyInteraction(state, card!, body.interaction, round, `card:${card!.id}`, source, strength);
    for (const card of passed) applyInteraction(state, card, "dislike", round, `card:${card.id}`, `${source}:passed`, PASS_STRENGTH);
  };

  const session = await resolveSession();
  // write against the freshest copy so concurrent taps (and slow feed requests) never drop a signal
  const rec = await updateSession(session.id, (r) => apply(r.state, r.currentRound));
  if (!rec) return NextResponse.json({ error: "session ended" }, { status: 410 }); // deleted mid-flight: don't resurrect it

  const decisive = rec.state.signals.filter((s) => s.interaction !== "skip").length;
  const confidence = computeConfidence(rec.state);

  const res = NextResponse.json({
    ok: true,
    progress: {
      interactions: rec.state.signals.length,
      decisive,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      round: rec.currentRound,
      readyForProfile: decisive >= 12,
      readyForFullProfile: decisive >= 30,
    },
  });
  // a first interaction can arrive before the client ever asked for a session — keep the cookie pinned
  res.cookies.set(SESSION_COOKIE, rec.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
