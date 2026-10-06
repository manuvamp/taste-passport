/**
 * Coarse plan-progress tracker (in-memory, process-local).
 * The agent page polls /api/agent/progress?id=… while /api/agent/compare runs,
 * so a live cold-start (up to ~20s) shows movement instead of a frozen button.
 * Best-effort: on multi-instance hosts progress may not share the instance with
 * the compare call — the UI handles "unknown" ticks gracefully.
 */

export const PLAN_STEPS = [
  "reading your taste profile",
  "resolving cultural entities",
  "querying the Qloo taste graph",
  "ranking cross-domain picks",
  "grounding explanations",
  "final polish",
] as const;

type Progress = { step: number; done: boolean; error?: string; at: number };

const g = globalThis as unknown as { __tp_plan_progress?: Map<string, Progress> };

function store(): Map<string, Progress> {
  if (!g.__tp_plan_progress) g.__tp_plan_progress = new Map();
  // bound + expire: keep entries for 5 minutes max
  const s = g.__tp_plan_progress;
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of s) if (v.at < cutoff) s.delete(k);
  return s;
}

export function planProgressStart(id?: string): string {
  const pid = id ?? crypto.randomUUID();
  store().set(pid, { step: 0, done: false, at: Date.now() });
  return pid;
}

export function planProgressTick(id: string, step: number) {
  const s = store();
  const cur = s.get(id);
  // only move forward — parallel arms tick interleaved
  if (cur && step > cur.step) s.set(id, { ...cur, step, at: Date.now() });
}

export function planProgressDone(id: string) {
  const s = store();
  const cur = s.get(id);
  if (cur) s.set(id, { ...cur, done: true, at: Date.now() });
}

export function planProgressFail(id: string, error: string) {
  const s = store();
  s.set(id, { step: 0, done: true, error, at: Date.now() });
}

export function planProgressGet(id: string): Progress | null {
  return store().get(id) ?? null;
}
