import type { QlooEntity } from "@/lib/types";
import { cacheGet, cacheSet, measured } from "@/lib/qloo/cache";
import { BASE, fetchJson, normalizeEntity } from "@/lib/qloo/live";

/** Raw insights query (any type / tag / location filter) with caching + explainability. */
export async function qlooInsights(params: Record<string, string>, take = 12): Promise<QlooEntity[]> {
  const qs = new URLSearchParams({ ...params, take: String(take), sort_by: "affinity", "feature.explainability": "true" });
  const key = `insights:${qs.toString()}`;
  const cached = cacheGet<QlooEntity[]>(key);
  if (cached) return cached;
  const out = await measured(
    `/v2/insights?${params["filter.type"] ?? ""}`,
    async () => {
      const json = await fetchJson(`${BASE}/v2/insights?${qs.toString()}`);
      const entities = ((json.results ?? {}) as Record<string, unknown>).entities as unknown[] | undefined;
      return (entities ?? []).map((e) => normalizeEntity(e as Record<string, unknown>)).filter(Boolean) as QlooEntity[];
    },
    []
  );
  if (out.length) cacheSet(key, out);
  return out;
}

/** Resolve a free-text label ("sushi restaurant", "hiking") to a Qloo tag id with the given id prefix. */
export async function qlooTagId(query: string, prefix?: string): Promise<string | undefined> {
  const key = `tagid:${query}:${prefix ?? ""}`;
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return cached ?? undefined;
  try {
    const json = await fetchJson(`${BASE}/v2/tags?${new URLSearchParams({ "filter.query": query, take: "10" })}`);
    const tags = (((json.results ?? {}) as Record<string, unknown>).tags ?? []) as { id?: string }[];
    const hit = tags.find((t) => t.id && (!prefix || t.id.startsWith(prefix)));
    cacheSet(key, hit?.id ?? null, 1000 * 60 * 60 * 24);
    return hit?.id;
  } catch {
    return undefined;
  }
}
