import type { Domain, QlooEntity, RecommendationResult } from "@/lib/types";
import { liveAdapter } from "@/lib/qloo/live";
import { mockAdapter } from "@/lib/qloo/mock";

export type QlooAdapter = {
  mode: "mock" | "live";
  searchEntities(input: { query: string; types?: string[]; take?: number }): Promise<QlooEntity[]>;
  getRecommendations(input: {
    interests: string[];
    domain?: Domain;
    take?: number;
    excludeIds?: string[];
    locationHint?: string;
  }): Promise<RecommendationResult>;
  getTags(input: { q: string; take?: number }): Promise<{ id: string; name: string }[]>;
};

/**
 * Adapter factory. QLOO_MODE=live + QLOO_API_KEY switches to the real API.
 * Default is mock so the repo runs with zero credentials.
 */
export function getQlooAdapter(): QlooAdapter {
  const mode = process.env.QLOO_MODE === "live" && process.env.QLOO_API_KEY ? "live" : "mock";
  return mode === "live" ? (liveAdapter as QlooAdapter) : (mockAdapter as QlooAdapter);
}

export { mockAdapter, liveAdapter };
