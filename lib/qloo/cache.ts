// Simple in-process TTL cache + Qloo call metrics for the admin dashboard.

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24h — the taste graph is stable

export const qlooMetrics = {
  calls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  totalLatencyMs: 0,
  lastError: null as string | null,
  log: [] as { path: string; ms: number; cached: boolean; ok: boolean; at: string }[],
};

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    qlooMetrics.cacheHits++;
    return hit.value as T;
  }
  if (hit) store.delete(key);
  qlooMetrics.cacheMisses++;
  return undefined;
}

export function cacheSet(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS) {
  if (store.size > 5000) store.clear(); // crude bound; fine for a demo process
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheClear() {
  store.clear();
}

export function cacheSize() {
  return store.size;
}

/** Wrap an external call with metrics + graceful error capture. */
export async function measured<T>(
  path: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  const start = Date.now();
  qlooMetrics.calls++;
  try {
    const out = await fn();
    const ms = Date.now() - start;
    qlooMetrics.totalLatencyMs += ms;
    qlooMetrics.log.push({ path, ms, cached: false, ok: true, at: new Date().toISOString() });
    return out;
  } catch (e) {
    qlooMetrics.errors++;
    qlooMetrics.lastError = e instanceof Error ? e.message : String(e);
    qlooMetrics.log.push({ path, ms: Date.now() - start, cached: false, ok: false, at: new Date().toISOString() });
    return fallback;
  } finally {
    if (qlooMetrics.log.length > 200) qlooMetrics.log = qlooMetrics.log.slice(-200);
  }
}
