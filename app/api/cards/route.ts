import { NextResponse } from "next/server";
import { SEED_CARDS } from "@/data/cards";

/** GET /api/cards — the seed card catalog (per card entity metadata). */
export async function GET() {
  return NextResponse.json({
    count: SEED_CARDS.length,
    cards: SEED_CARDS,
  });
}
