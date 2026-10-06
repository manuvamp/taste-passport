import type { Domain, QlooEntity, RecommendationResult } from "@/lib/types";
import { DOMAIN_TO_QLOO_TYPE } from "@/lib/types";
import { cacheGet, cacheSet, measured } from "@/lib/qloo/cache";
import { mockAdapter } from "@/lib/qloo/mock";

/**
 * Live Qloo adapter.
 *
 * Contract (docs.qloo.com, Qloo Agentic Hackathon guide):
 *  - Base URL for hackathon keys: https://hackathon.api.qloo.com
 *  - Auth: X-Api-Key header
 *  - GET /search?query=&types=&take=           -> { success, results: [...] }
 *  - GET /v2/insights?filter.type=&signal.interests.entities=&take=
 *        &sort_by=affinity&feature.explainability=true
 *        -> { success, results: { entities: [...] } }
 *
 * Every call degrades gracefully: on any failure we fall back to the mock
 * graph so the product never hard-crashes without Qloo.
 */

const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

function headers(): HeadersInit {
  return { "X-Api-Key": process.env.QLOO_API_KEY ?? "", accept: "application/json" };
}

/** Tolerant normalizer — verified against the live hackathon API:
 *  entity_id, name, type ("urn:entity"), subtype ("urn:entity:place"),
 *  popularity, tags[{id,name}], properties.images[{url}],
 *  query.affinity (0..1), query.explainability["signal.interests.entities"][{entity_id,score}] */
function normalizeEntity(raw: Record<string, unknown>): QlooEntity | null {
  const entityId =
    (raw.entity_id as string) ?? (raw.id as string) ?? (raw.urn as string) ?? null;
  const name = (raw.name as string) ?? (raw.title as string) ?? null;
  if (!entityId || !name) return null;

  let tags: { id: string; name: string }[] | undefined;
  const rawTags = raw.tags as unknown;
  if (Array.isArray(rawTags)) {
    tags = rawTags
      .map((t) => {
        const tt = t as Record<string, unknown>;
        const id = (tt.id as string) ?? "";
        const nm = (tt.name as string) ?? id.split(":").pop() ?? "";
        return id ? { id, name: nm } : null;
      })
      .filter(Boolean) as { id: string; name: string }[];
  }

  const props = (raw.properties ?? {}) as Record<string, unknown>;
  let imageUrl: string | undefined;
  const images = props.images as unknown;
  if (Array.isArray(images) && images.length) {
    const first = images[0] as Record<string, unknown>;
    imageUrl = (first.url as string) ?? (typeof first === "string" ? first : undefined);
  }
  imageUrl =
    imageUrl ??
    (raw.image_url as string) ??
    (props.image_url as string) ??
    (props.image as string) ??
    undefined;

  const q = (raw.query ?? {}) as Record<string, unknown>;
  let explainability: Record<string, number> | undefined;
  const exRaw = q.explainability as Record<string, unknown> | undefined;
  if (exRaw) {
    if (Array.isArray(exRaw["signal.interests.entities"])) {
      explainability = {};
      for (const item of exRaw["signal.interests.entities"] as Record<string, unknown>[]) {
        const id = item.entity_id as string;
        const score = item.score as number;
        if (id && typeof score === "number") explainability[id] = score;
      }
    } else {
      // plain {entityId: score} form
      explainability = {};
      for (const [k, v] of Object.entries(exRaw)) {
        if (typeof v === "number") explainability[k] = v;
      }
    }
  }

  const loc = raw.location as Record<string, unknown> | undefined;
  const lat = loc?.lat as number | undefined;
  const lon = loc?.lon as number | undefined;

  return {
    entityId,
    name,
    type: (raw.subtype as string) ?? (raw.type as string) ?? (Array.isArray(raw.types) ? (raw.types as string[])[0] : "") ?? "",
    imageUrl,
    location: typeof lat === "number" && typeof lon === "number" ? { lat, lon } : undefined,
    tags,
    affinity: (q.affinity as number) ?? (raw.affinity as number) ?? undefined,
    popularity: (raw.popularity as number) ?? undefined,
    explainability,
  };
}

async function fetchJson(url: string, timeoutMs = 20000): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: headers(), signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Qloo ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export const liveAdapter = {
  mode: "live" as const,

  async searchEntities(input: { query: string; types?: string[]; take?: number }): Promise<QlooEntity[]> {
    const key = `search:${input.query}:${input.types?.join(",") ?? ""}:${input.take ?? 5}`;
    const cached = cacheGet<QlooEntity[]>(key);
    if (cached) return cached;
    const params = new URLSearchParams({ query: input.query, take: String(input.take ?? 5) });
    if (input.types?.length) params.set("types", input.types.join(","));
    const out = await measured(
      `/search?query=${encodeURIComponent(input.query)}`,
      async () => {
        const json = await fetchJson(`${BASE}/search?${params.toString()}`);
        const results = (json.results as unknown[]) ?? [];
        return results
          .map((r) => normalizeEntity(r as Record<string, unknown>))
          .filter(Boolean) as QlooEntity[];
      },
      []
    );
    if (out.length) cacheSet(key, out);
    return out;
  },

  /**
   * Cross-domain recommendations grounded in interest entity ids.
   * Falls back to the mock graph if the API call fails or returns nothing.
   */
  async getRecommendations(input: {
    interests: string[];
    domain?: Domain;
    take?: number;
    excludeIds?: string[];
    /** Optional city bias for places/destinations, e.g. "Tokyo". */
    locationHint?: string;
  }): Promise<RecommendationResult> {
    if (!input.interests.length) {
      return { entities: [], source: "mock", durationMs: 0 };
    }
    const filterType =
      (input.domain && DOMAIN_TO_QLOO_TYPE[input.domain]) || "urn:entity:place";
    const take = Math.min(input.take ?? 10, 50);

    // city bias: insights accepts filter.location.query=<place name>
    let locationQuery: string | undefined;
    if (input.locationHint) {
      const locKey = `loc:${input.locationHint.toLowerCase()}`;
      locationQuery = cacheGet<string>(locKey);
      if (!locationQuery) {
        locationQuery = input.locationHint;
        cacheSet(locKey, locationQuery);
      }
    }

    const key = `recs:${filterType}:${input.interests.join("|")}:${take}:${locationQuery ?? ""}`;
    const cached = cacheGet<QlooEntity[]>(key);
    if (cached) return { entities: cached, source: "qloo", durationMs: 0 };

    const params = new URLSearchParams({
      "filter.type": filterType,
      "signal.interests.entities": input.interests.join(","),
      take: String(take),
      sort_by: "affinity",
      "feature.explainability": "true",
    });
    if (locationQuery) params.set("filter.location.query", locationQuery);

    const out = await measured(
      `/v2/insights?filter.type=${filterType}&take=${take}`,
      async () => {
        const json = await fetchJson(`${BASE}/v2/insights?${params.toString()}`);
        const results = (json.results ?? {}) as Record<string, unknown>;
        const entities = (results.entities as unknown[]) ?? [];
        return entities
          .map((e) => normalizeEntity(e as Record<string, unknown>))
          .filter(Boolean) as QlooEntity[];
      },
      []
    );

    if (out.length) {
      cacheSet(key, out);
      return { entities: out, source: "qloo", durationMs: 0 };
    }
    // Graceful fallback to the local graph.
    return mockAdapter.getRecommendations(input);
  },

  async getTags(input: { q: string; take?: number }): Promise<{ id: string; name: string }[]> {
    const key = `tags:${input.q}:${input.take ?? 20}`;
    const cached = cacheGet<{ id: string; name: string }[]>(key);
    if (cached) return cached;
    const params = new URLSearchParams({ q: input.q, take: String(input.take ?? 20) });
    const out = await measured(
      `/v2/tags?q=${encodeURIComponent(input.q)}`,
      async () => {
        const json = await fetchJson(`${BASE}/v2/tags?${params.toString()}`);
        const results = (json.results as unknown[]) ?? [];
        return results
          .map((r) => {
            const rr = r as Record<string, unknown>;
            const id = (rr.id as string) ?? (rr.tag_id as string) ?? "";
            const name = (rr.name as string) ?? id.split(":").pop() ?? "";
            return id ? { id, name } : null;
          })
          .filter(Boolean) as { id: string; name: string }[];
      },
      []
    );
    if (out.length) cacheSet(key, out);
    return out;
  },
};
