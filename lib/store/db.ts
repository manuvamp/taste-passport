import type { TasteProfile, TasteSignal, TasteState } from "@/lib/types";
import fs from "fs";
import path from "path";

/**
 * Persistence for anonymous taste sessions.
 *
 * Two backends behind one small async interface:
 *  - Vercel KV / Upstash Redis when KV_REST_API_URL + KV_REST_API_TOKEN are set
 *    (production on Vercel — sessions survive across serverless instances).
 *  - A single JSON file with debounced writes otherwise (zero-infra local dev).
 *
 * Sessions expire after 30 days in KV; the JSON store is pruned to the most
 * recently active 2000 sessions so the file stays bounded.
 */

export type SessionRecord = {
  id: string;
  createdAt: string;
  currentRound: number;
  state: TasteState;
  profileVersions: TasteProfile[];
};

const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const MAX_SESSIONS = 2000;
const KV_PREFIX = "tp:session:";

/* ------------------------------------------------------------------ */
/* backend detection                                                   */
/* ------------------------------------------------------------------ */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const useKv = Boolean(KV_URL && KV_TOKEN);

async function kv<T>(command: (string | number)[]): Promise<T | null> {
  const res = await fetch(`${KV_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`kv ${command[0]} failed: ${res.status}`);
  const data = (await res.json()) as { result: T };
  return data.result ?? null;
}

/* ------------------------------------------------------------------ */
/* JSON-file backend (local dev)                                        */
/* ------------------------------------------------------------------ */

const DATA_DIR = process.env.TASTE_DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

type JsonDB = { sessions: Record<string, SessionRecord> };

const g = globalThis as unknown as { __tp_db?: JsonDB; __tp_timer?: NodeJS.Timeout };

function fileDb(): JsonDB {
  if (g.__tp_db) return g.__tp_db;
  let loaded: JsonDB = { sessions: {} };
  try {
    if (fs.existsSync(FILE)) {
      loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as JsonDB;
    }
  } catch {
    loaded = { sessions: {} };
  }
  g.__tp_db = loaded;
  return loaded;
}

/** Debounced trailing write; swallows read-only filesystems (memory-only mode). */
function fileSave() {
  if (g.__tp_timer) return;
  g.__tp_timer = setTimeout(() => {
    g.__tp_timer = undefined;
    try {
      const d = fileDb();
      prune(d);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(d));
    } catch {
      // read-only fs — memory-only mode
    }
  }, 250);
}

/** Bound the store: keep the most recently active MAX_SESSIONS sessions. */
function prune(d: JsonDB) {
  const ids = Object.keys(d.sessions);
  if (ids.length <= MAX_SESSIONS) return;
  ids
    .sort((a, b) => d.sessions[b].state.lastUpdated.localeCompare(d.sessions[a].state.lastUpdated))
    .slice(MAX_SESSIONS)
    .forEach((id) => delete d.sessions[id]);
}

/* ------------------------------------------------------------------ */
/* unified interface (async — KV is remote)                             */
/* ------------------------------------------------------------------ */

export async function getSession(id: string): Promise<SessionRecord | null> {
  if (useKv) {
    try {
      return await kv<SessionRecord>(["GET", KV_PREFIX + id]);
    } catch {
      return null; // KV hiccup — treat as a fresh session rather than 500
    }
  }
  return fileDb().sessions[id] ?? null;
}

export async function putSession(rec: SessionRecord): Promise<void> {
  if (useKv) {
    try {
      await kv(["SET", KV_PREFIX + rec.id, JSON.stringify(rec), "EX", SESSION_TTL_S]);
    } catch {
      // best-effort persist; the request still succeeds from memory of caller
    }
    return;
  }
  fileDb().sessions[rec.id] = rec;
  fileSave();
}

export async function deleteSession(id: string): Promise<void> {
  if (useKv) {
    try {
      await kv(["DEL", KV_PREFIX + id]);
    } catch {
      // best effort
    }
    return;
  }
  delete fileDb().sessions[id];
  fileSave();
}

/** Stats for the admin dashboard (JSON mode only has full visibility). */
export async function sessionStats(): Promise<{ sessions: number; interactions: number; profiles: number } | null> {
  if (useKv) return null; // SCAN over a shared KV is not worth it for a demo dashboard
  const sessions = Object.values(fileDb().sessions);
  return {
    sessions: sessions.length,
    interactions: sessions.reduce((a, s) => a + s.state.signals.length, 0),
    profiles: sessions.reduce((a, s) => a + s.profileVersions.length, 0),
  };
}

export function storeMode(): "kv" | "file" {
  return useKv ? "kv" : "file";
}

/* ------------------------------------------------------------------ */
/* session lifecycle helpers                                            */
/* ------------------------------------------------------------------ */

export function newTasteState(sessionId: string): TasteState {
  return {
    sessionId,
    signals: [],
    shownCardIds: [],
    domainWeights: {},
    tagVector: {},
    explorationLevel: 1,
    confidence: 0,
    profileVersion: 0,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getOrCreateSession(id?: string): Promise<SessionRecord> {
  if (id) {
    const existing = await getSession(id);
    if (existing) return existing;
  }
  const sid = id || crypto.randomUUID();
  const rec: SessionRecord = {
    id: sid,
    createdAt: new Date().toISOString(),
    currentRound: 0,
    state: newTasteState(sid),
    profileVersions: [],
  };
  await putSession(rec);
  return rec;
}

// ---- mutation helpers: mutate `rec` then persist it ------------------

export async function markShown(rec: SessionRecord, cardIds: string[], roundBump = 1): Promise<void> {
  const set = new Set(rec.state.shownCardIds);
  for (const c of cardIds) set.add(c);
  rec.state.shownCardIds = [...set];
  rec.currentRound += roundBump;
  await putSession(rec);
}

export async function saveProfileVersion(rec: SessionRecord, profile: TasteProfile): Promise<void> {
  rec.profileVersions.push(profile);
  rec.state.profileVersion = profile.profileVersion;
  await putSession(rec);
}

/** Persist a session after its state was mutated in place (applyInteraction etc). */
export async function saveSession(rec: SessionRecord): Promise<void> {
  rec.state.lastUpdated = new Date().toISOString();
  await putSession(rec);
}
