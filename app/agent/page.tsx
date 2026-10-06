"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { AgentPlan, PlanItem } from "@/lib/agent/taste-agent";
import { domainColor } from "@/components/domain";

type CompareResponse = {
  request: string;
  mode: string;
  hasProfile: boolean;
  profileAnchors: string[];
  anyone: AgentPlan;
  generic: AgentPlan;
  personalized: AgentPlan | null;
  delta: { itemsReplaced: number; explanation: string };
};

type ProgressTick = { step: number; total: number; label: string | null; done: boolean };

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
  const [tick, setTick] = useState<ProgressTick | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poller.current) clearInterval(poller.current);
    poller.current = null;
  };

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    stopPolling();
    setState({ loading: true, data: null, error: null });
    setTick(null);
    const planId = crypto.randomUUID();
    // poll for coarse progress so the UI always shows movement
    poller.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/agent/progress?id=${planId}`);
        if (r.ok) setTick((await r.json()) as ProgressTick);
      } catch {
        // a missed tick is fine — next one lands
      }
    }, 1500);
    try {
      const res = await fetch("/api/agent/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: q.trim(), planId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "agent failed");
      }
      setState({ loading: false, data: (await res.json()) as CompareResponse, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e instanceof Error ? e.message : "failed" });
    } finally {
      stopPolling();
    }
  }, []);

  useEffect(() => stopPolling, []);

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
        <p className="overline mb-4">The Taste Agent</p>
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
          <button type="submit" disabled={state.loading} className="btn-primary text-sm">
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
          <div className="panel p-6 mb-8">
            <p className="mb-2">{state.error}</p>
            <div className="flex gap-3 text-sm">
              <Link href="/discover" className="underline underline-offset-4">Build my taste first</Link>
              <Link href="/demo" className="underline underline-offset-4 dim">or load a demo persona</Link>
            </div>
          </div>
        )}

        {state.loading && <PlanProgress tick={tick} />}

        {state.data && <Comparison data={state.data} />}
      </section>
    </main>
  );
}

function PlanProgress({ tick }: { tick: ProgressTick | null }) {
  const step = tick?.step ?? 0;
  const total = tick?.total ?? 6;
  const label = tick?.label ?? "reading your request";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel-soft p-6 mb-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-9 h-9 rounded-full border hairline flex items-center justify-center slow-pulse shrink-0">
          <span className="text-sm">✦</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}…</p>
          <p className="text-xs dim">working through the taste graph — live plans can take ~20s cold</p>
        </div>
      </div>
      <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#8f8a80,var(--ink))" }}
          animate={{ width: `${Math.max(8, (step / total) * 100)}%` }}
          transition={{ ease: "easeOut", duration: 0.6 }}
        />
      </div>
    </motion.div>
  );
}

function Comparison({ data }: { data: CompareResponse }) {
  if (!data.hasProfile || !data.personalized) {
    return (
      <div>
        <div className="panel p-6 sm:p-8 mb-8">
          <p className="overline mb-2">Anyone gets this</p>
          <h2 className="font-display text-2xl mb-3">The generic answer</h2>
          <p className="dim text-sm mb-6">{data.delta.explanation}</p>
          <PlanList plan={data.anyone} taste={false} />
        </div>
        <div className="panel-soft p-7 sm:p-8 text-center">
          <p className="font-display text-2xl mb-2">This could have been <em>yours.</em></p>
          <p className="dim text-sm mb-6 max-w-md mx-auto">
            With a taste profile, every pick above gets re-anchored in your signals — match scores and &quot;why this&quot; included.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/discover" className="btn-primary text-sm">Build a taste profile →</Link>
            <Link href="/demo" className="btn-ghost text-sm">Try a demo persona</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* what Qloo changed */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border rounded-3xl p-6 sm:p-8 mb-8"
        style={{ borderColor: "#34d39955", background: "#34d3990d" }}
      >
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-300 mb-2">What Qloo changed</p>
        <p className="font-display text-xl sm:text-2xl leading-snug">{data.delta.explanation}</p>
        <p className="dim text-xs mt-3">
          Anchors: {data.profileAnchors.join(" · ")} — taste graph: {data.mode}
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-6 sm:p-7 opacity-90">
          <p className="text-[10px] uppercase tracking-[0.25em] dim mb-1">Without my taste</p>
          <h2 className="font-display text-xl mb-4 dim">Generic AI</h2>
          <PlanList plan={data.generic} taste={false} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="border rounded-3xl p-6 sm:p-7"
          style={{ borderColor: "#e8e4dc44" }}
        >
          <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 mb-1">With my taste</p>
          <h2 className="font-display text-xl mb-4">Taste Passport</h2>
          <p className="text-sm dim mb-5">{data.personalized.intro}</p>
          <PlanList plan={data.personalized} taste />
        </motion.div>
      </div>
    </div>
  );
}

function PlanList({ plan, taste }: { plan: AgentPlan; taste: boolean }) {
  return (
    <ol className="space-y-4">
      {plan.items.map((item, i) => (
        <PlanRow key={`${item.name}-${i}`} item={item} taste={taste} rank={i + 1} index={i} />
      ))}
      {plan.items.length === 0 && <li className="dim text-sm">No result — try another request.</li>}
    </ol>
  );
}

function PlanRow({ item, taste, rank, index }: { item: PlanItem; taste: boolean; rank: number; index: number }) {
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
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: taste ? 0.1 + index * 0.08 : 0 }}
      className={`flex gap-3 ${taste ? "" : "opacity-70"}`}
    >
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
    </motion.li>
  );
}
