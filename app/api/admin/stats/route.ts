import { NextResponse } from "next/server";
import { qlooMetrics, cacheSize } from "@/lib/qloo/cache";
import { sessionStats, storeMode } from "@/lib/store/db";
import { getQlooAdapter } from "@/lib/qloo";
import { WEIGHTS, computeConfidence } from "@/lib/taste/engine";
import { resolveSession } from "@/lib/session";

/** GET /api/admin/stats — development-only debug dashboard. */
export async function GET() {
  const totals = await sessionStats();
  const session = await resolveSession();
  const avgLatency =
    qlooMetrics.calls > 0 ? Math.round(qlooMetrics.totalLatencyMs / qlooMetrics.calls) : 0;

  return NextResponse.json({
    mode: getQlooAdapter().mode,
    store: storeMode(),
    weights: WEIGHTS,
    totals,
    currentSession: {
      id: session.id,
      interactions: session.state.signals.length,
      confidence: computeConfidence(session.state),
      liked: session.state.signals.filter((s) => s.interaction === "like").map((s) => s.cardId),
      disliked: session.state.signals.filter((s) => s.interaction === "dislike").map((s) => s.cardId),
      domainWeights: session.state.domainWeights,
      tagVector: Object.fromEntries(
        Object.entries(session.state.tagVector).sort((a, b) => b[1] - a[1]).slice(0, 15)
      ),
    },
    qloo: {
      calls: qlooMetrics.calls,
      cacheHits: qlooMetrics.cacheHits,
      cacheMisses: qlooMetrics.cacheMisses,
      cacheSize: cacheSize(),
      errors: qlooMetrics.errors,
      lastError: qlooMetrics.lastError,
      avgLatencyMs: avgLatency,
      recent: qlooMetrics.log.slice(-10).reverse(),
    },
  });
}
