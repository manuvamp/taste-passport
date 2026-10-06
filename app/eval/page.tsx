"use client";

import { useState } from "react";
import { domainColor } from "@/components/domain";

type EvalRow = {
  persona: string;
  archetype: string;
  scenario: string;
  domainIntent: string;
  generic: { name: string; domain: string }[];
  taste: { name: string; domain: string; matchPct?: number }[];
  metrics: {
    personalizationRate: number;
    crossDomainBreadth: number;
    groundedPicks: number;
    totalPicks: number;
  };
};

type EvalResponse = {
  mode: string;
  ranAt: string;
  methodology: string;
  aggregate: {
    scenarios: number;
    avgPersonalizationRate: number;
    avgCrossDomainBreadth: number;
    groundedPickRate: number;
  };
  rows: EvalRow[];
};

export default function EvalPage() {
  const [state, setState] = useState<{ loading: boolean; data: EvalResponse | null; error: string | null }>({
    loading: false,
    data: null,
    error: null,
  });

  async function run() {
    setState({ loading: true, data: null, error: null });
    try {
      const res = await fetch("/api/eval");
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "eval failed");
      setState({ loading: false, data: (await res.json()) as EvalResponse, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return (
    <main className="flex-1 px-5 sm:px-8 pt-12 pb-24 max-w-5xl mx-auto w-full">
      <p className="overline mb-4">Evaluation</p>
      <h1 className="font-display text-4xl sm:text-5xl mb-3 leading-tight">Does the taste actually change the answer?</h1>
      <p className="dim mb-8 max-w-2xl leading-relaxed">
        Two demo personas run the same scenarios twice — once through a generic
        assistant, once grounded in their Qloo taste profile. We measure what
        changed, live against the current taste graph.
      </p>

      <div className="flex items-center gap-4 mb-10">
        <button onClick={run} disabled={state.loading} className="btn-primary text-sm">
          {state.loading ? "running scenarios… (up to a minute live)" : "Run the evaluation"}
        </button>
        {state.data && <span className="text-xs dim">ran {new Date(state.data.ranAt).toLocaleTimeString()} · {state.data.mode} graph</span>}
      </div>

      {state.error && <p className="text-red-300 text-sm mb-8">{state.error}</p>}

      {state.loading && (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl skeleton" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {state.data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-10">
            <Metric label="personalization" value={`${state.data.aggregate.avgPersonalizationRate}%`} hint="taste picks absent from the generic answer" />
            <Metric label="cross-domain breadth" value={String(state.data.aggregate.avgCrossDomainBreadth)} hint="distinct cultural domains per plan" />
            <Metric label="grounded picks" value={`${state.data.aggregate.groundedPickRate}%`} hint="picks with a Qloo match ≥ 60%" />
          </div>

          <p className="text-xs dim mb-8 max-w-2xl">{state.data.methodology}</p>

          <div className="space-y-4">
            {state.data.rows.map((r, i) => (
              <section key={i} className="panel p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
                  <span className="text-xs uppercase tracking-widest" style={{ color: r.persona === "maya" ? "#a78bfa" : "#fb923c" }}>
                    {r.persona} · {r.archetype}
                  </span>
                  <h2 className="font-display text-lg">{r.scenario}</h2>
                  <span className="ml-auto text-xs dim">
                    {r.metrics.personalizationRate}% personalized · {r.metrics.groundedPicks}/{r.metrics.totalPicks} grounded
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] dim mb-2">Generic</p>
                    <ul className="space-y-1.5">
                      {r.generic.map((g, j) => (
                        <li key={j} className="flex items-center gap-2 dim">
                          <span className="domain-dot" style={{ background: domainColor(g.domain) }} />
                          {g.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 mb-2">Taste-grounded</p>
                    <ul className="space-y-1.5">
                      {r.taste.map((t, j) => (
                        <li key={j} className="flex items-center gap-2">
                          <span className="domain-dot" style={{ background: domainColor(t.domain) }} />
                          {t.name}
                          {t.matchPct !== undefined && <span className="text-[10px] dim">{t.matchPct}%</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel-soft p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] dim mb-1">{label}</p>
      <p className="font-display text-3xl sm:text-4xl">{value}</p>
      <p className="text-[11px] dim mt-2 leading-snug">{hint}</p>
    </div>
  );
}
