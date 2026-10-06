"use client";

import { useEffect, useState } from "react";

type Stats = {
  mode: string;
  store: "kv" | "file";
  weights: Record<string, number>;
  totals: { sessions: number; interactions: number; profiles: number } | null;
  currentSession: {
    id: string;
    interactions: number;
    confidence: number;
    liked: string[];
    disliked: string[];
    domainWeights: Record<string, number>;
    tagVector: Record<string, number>;
  };
  qloo: {
    calls: number;
    cacheHits: number;
    cacheMisses: number;
    cacheSize: number;
    errors: number;
    lastError: string | null;
    avgLatencyMs: number;
    recent: { path: string; ms: number; ok: boolean; at: string }[];
  };
};

export default function DevPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/admin/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (!stats) {
    return (
      <main className="flex-1">
        <p className="dim animate-pulse p-8">loading stats…</p>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="px-5 sm:px-8 py-8 max-w-5xl mx-auto grid sm:grid-cols-2 gap-6 text-sm">
        <Panel title="Current taste state">
          <Row k="session" v={stats.currentSession.id.slice(0, 8)} />
          <Row k="interactions" v={String(stats.currentSession.interactions)} />
          <Row k="confidence" v={`${Math.round(stats.currentSession.confidence * 100)}%`} />
          <Row k="liked" v={stats.currentSession.liked.join(", ") || "—"} />
          <Row k="disliked" v={stats.currentSession.disliked.join(", ") || "—"} />
        </Panel>

        <Panel title="Qloo calls">
          <Row k="mode" v={stats.mode} />
          <Row k="calls" v={String(stats.qloo.calls)} />
          <Row k="cache hits / misses" v={`${stats.qloo.cacheHits} / ${stats.qloo.cacheMisses}`} />
          <Row k="cache size" v={String(stats.qloo.cacheSize)} />
          <Row k="avg latency" v={`${stats.qloo.avgLatencyMs} ms`} />
          <Row k="errors" v={String(stats.qloo.errors)} />
          {stats.qloo.lastError && <Row k="last error" v={stats.qloo.lastError} />}
        </Panel>

        <Panel title="Exploration ratio (current batch weights)">
          <Row
            k="70/20/10 targets"
            v="exploit 70% · adjacent 20% · novel 10%"
          />
          {Object.entries(stats.weights).map(([k, v]) => (
            <Row key={k} k={`weight:${k}`} v={String(v)} />
          ))}
        </Panel>

        <Panel title="Candidate signal — top tag vector">
          {Object.entries(stats.currentSession.tagVector).slice(0, 10).map(([t, w]) => (
            <Row key={t} k={t} v={String(Math.round(w * 100) / 100)} />
          ))}
        </Panel>

        <Panel title="Domain weights">
          {Object.entries(stats.currentSession.domainWeights).map(([d, w]) => (
            <Row key={d} k={d} v={String(w)} />
          ))}
        </Panel>

        <Panel title="Platform totals">
          <Row k="store" v={stats.store === "kv" ? "Vercel KV / Upstash" : "local JSON file"} />
          {stats.totals ? (
            <>
              <Row k="sessions" v={String(stats.totals.sessions)} />
              <Row k="interactions" v={String(stats.totals.interactions)} />
              <Row k="profile versions" v={String(stats.totals.profiles)} />
            </>
          ) : (
            <p className="dim text-xs">platform-wide totals unavailable on the shared KV store</p>
          )}
        </Panel>

        <Panel title="Connect your agent" className="sm:col-span-2">
          <p className="dim text-xs mb-3">
            Any MCP-capable agent can consume this profile. Session id:{" "}
            <code className="text-[var(--ink)]">{stats.currentSession.id}</code>
          </p>
          <div className="space-y-2 text-xs">
            <p className="dim">Hosted HTTP endpoint (share with judges):</p>
            <code className="block break-all bg-[var(--bg-soft)] border hairline rounded-lg px-3 py-2">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp?sid={stats.currentSession.id}
            </code>
            <p className="dim pt-1">Or the stdio server:</p>
            <code className="block break-all bg-[var(--bg-soft)] border hairline rounded-lg px-3 py-2">
              TASTE_PASSPORT_URL={typeof window !== "undefined" ? window.location.origin : ""} TASTE_SESSION_ID={stats.currentSession.id} node mcp/server.mjs
            </code>
          </div>
        </Panel>

        <Panel title="Recent Qloo calls" className="sm:col-span-2">
          {stats.qloo.recent.length === 0 && <p className="dim">no calls yet (mock adapter answers locally)</p>}
          {stats.qloo.recent.map((r, i) => (
            <Row key={i} k={r.path} v={`${r.ms} ms · ${r.ok ? "ok" : "ERR"} · ${r.at.slice(11, 19)}`} />
          ))}
        </Panel>
      </div>
    </main>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border hairline rounded-2xl p-5 ${className}`}>
      <h2 className="text-[10px] uppercase tracking-[0.25em] dim mb-3">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="dim shrink-0">{k}</span>
      <span className="text-right break-all">{v}</span>
    </div>
  );
}
