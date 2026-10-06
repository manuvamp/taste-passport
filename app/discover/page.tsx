"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import type { ExplorationPool, TasteCard } from "@/lib/types";
import { CardImage } from "@/components/card-image";
import { domainColor } from "@/components/domain";

type Progress = {
  interactions: number;
  decisive: number;
  confidence: number;
  confidenceLabel: string;
  round: number;
  readyForProfile: boolean;
  readyForFullProfile: boolean;
};

type FeedResponse = {
  cards: TasteCard[];
  adapted: boolean;
  pools: Record<string, ExplorationPool>;
  progress: Progress;
  mode: string;
};

type Decision = "like" | "dislike" | "skip";
type View = "deck" | "grid";

const POOL_LABEL: Record<ExplorationPool, string> = {
  exploit: "close to your taste",
  adjacent: "adjacent exploration",
  novel: "a deliberate surprise",
};

const POOL_HINT: Record<ExplorationPool, string> = {
  exploit: "fits the pattern behind your likes",
  adjacent: "a neighboring territory Qloo thinks you'll get",
  novel: "outside your current taste — on purpose",
};

export default function Discover() {
  const router = useRouter();
  const [queue, setQueue] = useState<TasteCard[]>([]);
  const [pools, setPools] = useState<Record<string, ExplorationPool>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [adaptedFlash, setAdaptedFlash] = useState(false);
  const [mode, setMode] = useState("mock");
  const [view, setView] = useState<View>("grid");
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [firstPick, setFirstPick] = useState<TasteCard | null>(null);
  const fetching = useRef(false);
  const gridTop = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("tp_view");
    if (saved === "deck" || saved === "grid") setView(saved);
  }, []);

  const switchView = (v: View) => {
    setView(v);
    window.localStorage.setItem("tp_view", v);
  };

  const loadFeed = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      await fetch("/api/session", { method: "POST" });
      const res = await fetch("/api/feed?count=12");
      const data = (await res.json()) as FeedResponse;
      setQueue((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const next = data.cards.filter((c) => !seen.has(c.id));
        if (next.length === 0 && data.cards.length === 0) setExhausted(true);
        return [...prev, ...next];
      });
      setPools((prev) => ({ ...prev, ...data.pools }));
      setProgress(data.progress);
      setMode(data.mode);
      if (data.adapted && data.progress.decisive > 0) {
        setAdaptedFlash(true);
        setTimeout(() => setAdaptedFlash(false), 3200);
      }
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const decide = useCallback(
    async (card: TasteCard, decision: Decision) => {
      setLastDecision(decision);
      setFirstPick((prev) => (decision === "like" && !prev ? card : prev));
      setQueue((q) => q.filter((c) => c.id !== card.id));
      try {
        const res = await fetch("/api/interact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: card.id, interaction: decision }),
        });
        const data = (await res.json()) as { progress: Progress };
        setProgress(data.progress);
      } catch {
        // keep swiping even if a single interaction fails
      }
    },
    []
  );

  // prefetch the next batch while there's still something to look at
  const prefetchAt = view === "grid" ? 6 : 2;
  useEffect(() => {
    if (!loading && queue.length <= prefetchAt && !exhausted) loadFeed();
  }, [queue.length, loading, prefetchAt, exhausted, loadFeed]);

  // scroll back to the top of the grid when a fresh batch lands
  const prevRound = useRef(0);
  useEffect(() => {
    const r = progress?.round ?? 0;
    if (view === "grid" && r > prevRound.current && prevRound.current > 0) {
      gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevRound.current = r;
  }, [progress?.round, view]);

  // keyboard controls (deck only — arrows map naturally to the top card)
  useEffect(() => {
    if (view !== "deck") return;
    const top = queue[0];
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide(top, "like");
      else if (e.key === "ArrowLeft") decide(top, "dislike");
      else if (e.key === "ArrowDown") decide(top, "skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, decide, view]);

  const decisive = progress?.decisive ?? 0;
  const pct = Math.min(100, Math.round((decisive / 30) * 100));
  const showCoach = decisive === 0 && !loading && queue.length > 0;

  return (
    <main className="flex-1 flex flex-col">
      {/* header */}
      <div ref={gridTop} className="px-5 sm:px-8 pt-5 pb-3 flex items-center gap-3 max-w-5xl mx-auto w-full">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-xs dim mb-1.5">
            <span>
              {decisive} decisive picks · {progress?.confidenceLabel ?? "…"}
            </span>
            <span>{Math.round((progress?.confidence ?? 0) * 100)}% confidence</span>
          </div>
          <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#8f8a80,var(--ink))" }}
            />
          </div>
        </div>

        {/* view toggle */}
        <div className="flex border hairline rounded-full overflow-hidden shrink-0" role="tablist" aria-label="Feed layout">
          {(["grid", "deck"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => switchView(v)}
              className={`text-xs px-3 py-2 transition-colors ${view === v ? "bg-[var(--ink)] text-[var(--bg)]" : "dim hover:text-[var(--ink)]"}`}
            >
              {v === "grid" ? "▦ Grid" : "☰ Deck"}
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push("/profile")}
          disabled={decisive < 12}
          className="btn-ghost text-sm !py-2 !px-4 whitespace-nowrap"
          title={decisive < 12 ? `React to ${12 - decisive} more to unlock` : "See your taste profile"}
        >
          Taste DNA{decisive >= 30 ? " ✓" : decisive >= 12 ? " →" : ""}
        </button>
      </div>

      {adaptedFlash && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-xs tracking-wide text-emerald-300/90 mb-1"
        >
          ✦ the feed just adapted to you — the taste graph reshaped this batch
        </motion.p>
      )}

      {/* coach mark: first contact */}
      {showCoach && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center px-6 pt-2 pb-1"
        >
          <p className="font-display text-xl sm:text-2xl mb-1">Tap <span style={{ color: "var(--like)" }}>♥</span> on what feels like you.</p>
          <p className="dim text-sm">The feed learns from every pick — no wrong answers.</p>
        </motion.div>
      )}

      {/* content */}
      {loading && (
        <section className="flex-1 px-5 sm:px-8 pb-24 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl skeleton"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <p className="dim text-center text-sm mt-6 animate-pulse">
            shuffling the cultural deck{mode === "live" ? " — waking up the taste graph" : ""}…
          </p>
        </section>
      )}

      {!loading && queue.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center dim text-center px-6">
          <p className="font-display text-2xl mb-2 text-[var(--ink)]">
            {exhausted ? "You've seen the whole deck." : "That's the deck for now."}
          </p>
          <p className="text-sm mb-6">
            {decisive >= 12
              ? "Your profile is ready — go see what the graph learned about you."
              : `React to ${Math.max(0, 12 - decisive)} more and your Taste DNA unlocks.`}
          </p>
          <div className="flex gap-3">
            {decisive >= 12 && (
              <button onClick={() => router.push("/profile")} className="btn-primary text-sm">
                See my Taste DNA →
              </button>
            )}
            <button onClick={() => { setExhausted(false); loadFeed(); }} className="btn-ghost text-sm">
              Deal me back in
            </button>
          </div>
        </div>
      )}

      {!loading && queue.length > 0 && view === "deck" && (
        <section className="flex-1 flex flex-col items-center justify-center px-5 pb-40 sm:pb-24">
          <div className="relative w-full max-w-sm" style={{ perspective: 1000 }}>
            {queue.slice(1, 3).reverse().map((c, i) => (
              <div
                key={c.id}
                className="absolute inset-0 rounded-3xl overflow-hidden border hairline"
                style={{
                  transform: `translateY(${(3 - i) * 10}px) scale(${1 - (3 - i) * 0.03})`,
                  zIndex: 1,
                }}
              >
                <CardImage card={c} alt="" />
              </div>
            ))}
            <SwipeCard
              key={queue[0].id}
              card={queue[0]}
              pool={pools[queue[0].id] ?? "exploit"}
              showPool={(progress?.round ?? 0) > 1}
              onDecide={(d) => decide(queue[0], d)}
            />
          </div>
          <div className="mt-6 flex items-center gap-3 text-xs dim">
            <span>← Nope</span>
            <span>↓ Skip</span>
            <span>→ Love</span>
          </div>
        </section>
      )}

      {!loading && queue.length > 0 && view === "grid" && (
        <section className="flex-1 px-5 sm:px-8 pb-24 pt-4">
          {!showCoach && (
            <p className="text-xs dim text-center mb-4">
              React to as many as you like — the next batch is already loading behind the scenes.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
            <AnimatePresence mode="popLayout">
              {queue.slice(0, 12).map((card, i) => (
                <GridCard
                  key={card.id}
                  card={card}
                  index={i}
                  pool={pools[card.id] ?? "exploit"}
                  showPool={(progress?.round ?? 0) > 1}
                  becauseOf={(progress?.round ?? 0) > 1 ? firstPick?.title ?? null : null}
                  eager={i < 4}
                  onDecide={(d) => decide(card, d)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* deck action bar */}
      {!loading && view === "deck" && queue.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center gap-5 z-20">
          <ActionBtn label="Nope" color="#ef4444" onClick={() => decide(queue[0], "dislike")} active={lastDecision === "dislike"} />
          <ActionBtn label="Skip" color="#8f8a80" onClick={() => decide(queue[0], "skip")} active={lastDecision === "skip"} />
          <ActionBtn label="Love" color="#34d399" onClick={() => decide(queue[0], "like")} active={lastDecision === "like"} />
        </div>
      )}

      <p className="fixed bottom-1.5 right-3 text-[10px] dim z-20">
        taste graph: {mode === "live" ? "live" : "offline (deterministic)"}
      </p>
    </main>
  );
}

/* ---------------- deck (swipe) ---------------- */

function SwipeCard({
  card,
  pool,
  showPool,
  onDecide,
}: {
  card: TasteCard;
  pool: ExplorationPool;
  showPool: boolean;
  onDecide: (d: Decision) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -40], [1, 0]);
  const color = domainColor(card.domain);

  return (
    <motion.div
      drag="x"
      style={{ x, rotate, zIndex: 5 }}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110) onDecide("like");
        else if (info.offset.x < -110) onDecide("dislike");
      }}
      whileTap={{ cursor: "grabbing" }}
      className="relative rounded-3xl overflow-hidden border hairline select-none cursor-grab active:shadow-2xl"
      role="group"
      aria-label={`${card.title} — ${card.domain}`}
    >
      <div className="aspect-[3/4]">
        <CardImage card={card} width={720} eager />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.2em] rounded-full px-2.5 py-1 backdrop-blur-sm"
            style={{ background: `${color}26`, color }}
          >
            {card.domain}
          </span>
          {showPool && (
            <span className="text-[10px] rounded-full px-2.5 py-1 bg-black/40 backdrop-blur-sm dim" title={POOL_HINT[pool]}>
              {POOL_LABEL[pool]}
            </span>
          )}
        </div>
        <motion.span
          style={{ opacity: likeOpacity }}
          className="absolute top-6 right-5 border-2 border-emerald-400 text-emerald-300 font-bold text-sm tracking-widest px-3 py-1 rounded-lg rotate-6"
        >
          LOVE
        </motion.span>
        <motion.span
          style={{ opacity: nopeOpacity }}
          className="absolute top-6 left-5 border-2 border-red-400 text-red-300 font-bold text-sm tracking-widest px-3 py-1 rounded-lg -rotate-6"
        >
          NOPE
        </motion.span>
        <div className="absolute bottom-0 inset-x-0 p-5">
          <h2 className="font-display text-2xl sm:text-3xl leading-tight mb-2">{card.title}</h2>
          <p className="text-xs dim flex flex-wrap gap-1.5">
            {card.tags.slice(0, 4).map((t) => (
              <span key={t} className="border hairline rounded-full px-2 py-0.5">
                {t}
              </span>
            ))}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------- grid (multi-card) ---------------- */

function GridCard({
  card,
  index,
  pool,
  showPool,
  becauseOf,
  eager,
  onDecide,
}: {
  card: TasteCard;
  index: number;
  pool: ExplorationPool;
  showPool: boolean;
  becauseOf: string | null;
  eager: boolean;
  onDecide: (d: Decision) => void;
}) {
  const color = domainColor(card.domain);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30, delay: Math.min(index * 0.045, 0.5) }}
      className="relative rounded-2xl overflow-hidden border hairline group"
      aria-label={`${card.title} — ${card.domain}`}
    >
      <div className="aspect-[3/4] relative">
        <CardImage card={card} width={480} eager={eager} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />

        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[9px] uppercase tracking-[0.18em] rounded-full px-2 py-0.5 backdrop-blur-sm"
            style={{ background: `${color}26`, color }}
          >
            {card.domain}
          </span>
          {showPool && (
            <span className="text-[9px] rounded-full px-2 py-0.5 bg-black/40 backdrop-blur-sm dim truncate" title={POOL_HINT[pool]}>
              {POOL_LABEL[pool]}
            </span>
          )}
        </div>

        {/* because-you-liked chip */}
        {becauseOf && showPool && pool !== "novel" && (
          <div className="absolute left-2.5 bottom-16 right-2.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] rounded-lg px-2 py-1 bg-black/60 backdrop-blur-sm dim inline-block">
              because you liked {becauseOf}
            </span>
          </div>
        )}

        {/* action buttons: always visible on touch, hover-revealed on desktop */}
        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={() => onDecide("like")}
            aria-label={`Love ${card.title}`}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-sm active:scale-90 transition-transform"
            style={{ borderColor: "#34d39955", color: "#34d399", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            ♥
          </button>
          <button
            onClick={() => onDecide("dislike")}
            aria-label={`Nope ${card.title}`}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-xs active:scale-90 transition-transform"
            style={{ borderColor: "#ef444455", color: "#ef4444", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            ✕
          </button>
          <button
            onClick={() => onDecide("skip")}
            aria-label={`Skip ${card.title}`}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-xs active:scale-90 transition-transform dim"
            style={{ borderColor: "#8f8a8044", color: "#8f8a80", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            ⤓
          </button>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-3">
          <h3 className="font-display text-base sm:text-lg leading-tight">{card.title}</h3>
          <p className="text-[10px] dim truncate mt-1">{card.tags.slice(0, 3).join(" · ")}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
  active,
}: {
  label: string;
  color: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-16 h-16 rounded-full border flex items-center justify-center text-xl transition-transform active:scale-90 hover:scale-105"
      style={{
        borderColor: `${color}55`,
        color,
        background: active ? `${color}22` : "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
      }}
    >
      {label === "Love" ? "♥" : label === "Nope" ? "✕" : "⤓"}
    </button>
  );
}
