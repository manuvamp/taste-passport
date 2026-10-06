import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";
import { buildRounds } from "@/lib/taste/rounds";

/** GET /api/taste/rounds?kinds=film,food,...&exclude=id,id — personalised four-option rounds. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kinds = (url.searchParams.get("kinds") ?? "").split(",").filter(Boolean).slice(0, 24);
  const exclude = (url.searchParams.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 400);
  const session = await resolveSession();
  return NextResponse.json({ rounds: buildRounds(session.state, kinds, exclude) }, { headers: { "cache-control": "no-store" } });
}
