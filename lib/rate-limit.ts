/**
 * In-memory token-bucket rate limiting (process-local — fine for a single
 * instance / demo; on multi-instance serverless each instance gets its own
 * bucket, which still bounds abuse per instance).
 */

type Bucket = { tokens: number; at: number };

const g = globalThis as unknown as { __tp_rl?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  if (!g.__tp_rl) g.__tp_rl = new Map();
  const m = g.__tp_rl;
  if (m.size > 5000) m.clear(); // bound memory
  return m;
}

/**
 * Check-and-consume. Returns true if the request is allowed.
 * capacity = max burst; refillPerSec = sustained rate.
 */
export function rateLimit(key: string, capacity = 30, refillPerSec = 0.5): boolean {
  const m = buckets();
  const now = Date.now();
  const b = m.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSec);
  b.at = now;
  if (b.tokens < 1) {
    m.set(key, b);
    return false;
  }
  b.tokens -= 1;
  m.set(key, b);
  return true;
}

/** Best-effort client key for a request (ip if visible, else a constant). */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "anon";
  return `${scope}:${ip}`;
}
