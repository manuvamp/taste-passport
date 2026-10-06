"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AgentPlan, PlanItem } from "@/lib/agent/taste-agent";
import { domainColor } from "@/components/domain";

type CompareResponse = {
  request: string;
  mode: string;
  hasProfile: boolean;
  profileAnchors: string[];
  generic: AgentPlan;
  personalized: AgentPlan | null;
  delta: { itemsReplaced: number; explanation: string };
};

const EXAMPLES = [
  "Plan my Saturday in Tokyo",
  "I'm visiting New York next weekend. Give me a day that feels like me.",
  "Find me a restaurant in Lisbon",
  "What should I read, watch and listen to this month?",
];

type PlanState = { loading: boolean; data: CompareResponse | null; error: string | null };

export default function AgentPage() {
  return (
    <Suspense fallback={
      <main className="flex-1 flex items-center justify-center">
        <p className="dim animate-pulse">loading the agent…</p>
      </main>
    }>
      <AgentContent />
    </Suspense>
  );
}

function AgentContent() {
  const params = useSearchParams();
  const [request, setRequest] = useState(params.get("q") ?? "");
  const [state, setState] = useState<PlanState>({ loading: false, data: null, error: null });

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setState({ loading: true, data: null, error: null });
    try {
      const res = await fetch("/api/agent/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: q.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "agent failed");
      }
      setState({ loading: false, data: (await res.json()) as CompareResponse, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e instanceof Error ? e.message : "failed" });
    }
  }, []);

  useEffect(() => {
    const q = params.get("q");
    if (q && !state.data && !state.loading) {
      setRequest(q);
      run(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex-1 pb-24">
      <section className="px-5 sm:px-8 pt-12 max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-[0.25em] dim mb-4">The Taste Agent</p>
        <h1 className="font-display text-4xl sm:text-5xl mb-3 leading-tight">
          Now AI knows what <em>feels like you.</em>
        </h1>
        <p className="dim mb-8 max-w-2xl leading-relaxed">
          The same request, answered two ways: a generic assistant vs. one holding
          your Taste Passport. Every personalized pick is grounded in Qloo&apos;s
          taste graph through your profile.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(request);
          }}
          className="flex flex-col sm:flex-row gap-3 mb-4"
        >
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Ask for a plan, a pick, a discovery…"
            aria-label="Your request"
            className="flex-1 bg-[var(--bg-soft)] border hairline rounded-full px-5 py-3.5 text-sm outline-none focus:border-[var(--ink-dim)]"
          />
          <button
            type="submit"
            disabled={state.loading}
            className="bg-[var(--ink)] text-[var(--bg)] rounded-full px-7 py-3.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {state.loading ? "thinking…" : "Ask the agent"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mb-10">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setRequest(ex);
                run(ex);
              }}
              className="text-xs border hairline rounded-full px-3.5 py-1.5 dim hover:text-[var(--ink)] hover:border-[var(--ink-dim)] transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        {state.error && (
          <div className="border hairline rounded-2xl p-6 mb-8">
            <p className="mb-2">{state.error}</p>
            {state.error.includes("no taste") && (
              <div className="flex gap-3 text-sm">
                <Link href="/discover" className="underline underline-offset-4">Build my taste first</Link>
                <Link href="/demo" className="underline underline-offset-4 dim">or load a demo persona</Link>
              </div>
            )}
          </div>
        )}

        {state.loading && (
          <p className="dim animate-pulse">retrieving your taste profile → querying Qloo → ranking…</p>
        )}

        {state.data && <Comparison data={state.data} />}
      </section>
    </main>
  );
}

function Comparison({ data }: { data: CompareResponse }) {
  if (!data.hasProfile || !data.personalized) {
    return (
      <div className="border hairline rounded-3xl p-8">
        <h2 className="font-display text-2xl mb-3">Generic answer</h2>
        <p className="dim text-sm mb-6">{data.delta.explanation}</p>
        <PlanList plan={data.generic} taste={false} />
        <Link href="/discover" className="inline-block mt-8 bg-[var(--ink)] text-[var(--bg)] px-6 py-3 rounded-full text-sm">
          Build a taste profile →
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* what Qloo changed */}
      <div className="border rounded-3xl p-6 sm:p-8 mb-8" style={{ borderColor: "#34d39955", background: "#34d3990d" }}>
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300 mb-2">What Qloo changed</p>
        <p className="font-display text-xl sm:text-2xl leading-snug">{data.delta.explanation}</p>
        <p className="dim text-xs mt-3">
          Anchors: {data.profileAnchors.join(" · ")} — taste graph: {data.mode}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="border hairline rounded-3xl p-6 sm:p-7 opacity-90">
          <p className="text-[10px] uppercase tracking-[0.25em] dim mb-1">Without my taste</p>
          <h2 className="font-display text-xl mb-4 dim">Generic AI</h2>
          <PlanList plan={data.generic} taste={false} />
        </div>
        <div className="border rounded-3xl p-6 sm:p-7" style={{ borderColor: "#e8e4dc44" }}>
          <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 mb-1">With my taste</p>
          <h2 className="font-display text-xl mb-4">Taste Passport</h2>
          <p className="text-sm dim mb-5">{data.personalized.intro}</p>
          <PlanList plan={data.personalized} taste />
        </div>
      </div>
    </div>
  );
}

function PlanList({ plan, taste }: { plan: AgentPlan; taste: boolean }) {
  return (
    <ol className="space-y-4">
      {plan.items.map((item, i) => (
        <PlanRow key={`${item.name}-${i}`} item={item} taste={taste} rank={i + 1} />
      ))}
      {plan.items.length === 0 && <li className="dim text-sm">No result — try another request.</li>}
    </ol>
  );
}

function PlanRow({ item, taste, rank }: { item: PlanItem; taste: boolean; rank: number }) {
  const [sent, setSent] = useState<"like" | "dislike" | null>(null);
  const color = domainColor(item.domain);

  async function feedback(kind: "like" | "dislike") {
    setSent(kind);
    // find the matching seed card to attribute the signal
    const res = await fetch("/api/cards");
    const { cards } = (await res.json()) as { cards: { id: string; title: string }[] };
    const card = cards.find((c) => c.title === item.name);
    if (!card) return;
    await fetch("/api/taste/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: card.id, feedback: kind, itemId: item.name }),
    });
  }

  return (
    <li className={`flex gap-3 ${taste ? "" : "opacity-70"}`}>
      <span className="dim text-xs pt-1 w-5 shrink-0">{String(rank).padStart(2, "0")}</span>
      <div className="flex-1 border-b hairline pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="domain-dot" style={{ background: color }} />
          <span className="text-[10px] uppercase tracking-[0.18em] dim">{item.slot}</span>
          {item.matchPct !== undefined && (
            <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: `${color}22`, color }}>
              {item.matchPct}% match
            </span>
          )}
          <span className="text-[10px] dim">{item.source === "qloo" ? "· qloo-grounded" : "· popular pick"}</span>
        </div>
        <h3 className="font-display text-lg mt-1">{item.name}</h3>
        <p className="dim text-xs leading-relaxed mt-1">{item.whyThis}</p>
        {taste && (
          <div className="mt-2 flex gap-2">
            {(["like", "dislike"] as const).map((k) => (
              <button
                key={k}
                onClick={() => feedback(k)}
                disabled={sent !== null}
                className={`text-[11px] border hairline rounded-full px-2.5 py-1 transition-colors disabled:opacity-60 ${
                  sent === k ? "text-[var(--ink)] border-[var(--ink-dim)]" : "dim hover:text-[var(--ink)]"
                }`}
                title="Teach it — updates your profile"
              >
                {k === "like" ? "♥ Very me" : "✕ Not me"}
              </button>
            ))}
            {sent && <span className="text-[11px] text-emerald-300 self-center">profile updated ✓</span>}
          </div>
        )}
      </div>
    </li>
  );
}
