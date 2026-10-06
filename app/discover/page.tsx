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
type Phase = "gallery" | "grid" | "deck";

const GALLERY_ROUNDS = 2;
const GALLERY_COUNT = 20;

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

// stable per-card aspect ratio for the masonry gallery
function aspectFor(id: string): string {
  const ratios = ["1 / 1", "4 / 5", "3 / 4", "4 / 3", "16 / 10"];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ratios[h % ratios.length];
}

export default function Discover() {
  const router = useRouter();
  const [queue, setQueue] = useState<TasteCard[]>([]);
  const [pools, setPools] = useState<Record<string, ExplorationPool>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [adaptedFlash, setAdaptedFlash] = useState(false);
  const [mode, setMode] = useState("mock");
  const [view, setView] = useState<View>("grid");
  const [galleryDone, setGalleryDone] = useState(false);
  const [galleryWall, setGalleryWall] = useState(0); // walls the user went through (client-side)
  const [galleryLiked, setGalleryLiked] = useState<string[]>([]);
  const [firstPick, setFirstPick] = useState<TasteCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const fetching = useRef(false);
  const wall = useRef(0); // gallery epoch: increments on "Next wall" so stale fetches are discarded
  const gridTop = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("tp_view");
    if (saved === "deck" || saved === "grid") setView(saved);
    if (window.localStorage.getItem("tp_gallery_done") === "1") setGalleryDone(true);
  }, []);

  const switchView = (v: View) => {
    setView(v);
    window.localStorage.setItem("tp_view", v);
  };

  const round = progress?.round ?? 0;
  // gallery progression is client-side (walls seen), not server rounds —
  // feed fetches fire in bursts and would otherwise skip walls
  const phase: Phase = galleryDone || galleryWall >= GALLERY_ROUNDS ? view : "gallery";

  const finishGallery = useCallback(() => {
    setGalleryDone(true);
    window.localStorage.setItem("tp_gallery_done", "1");
  }, []);

  const loadFeed = useCallback(
    async (count = 12) => {
      if (fetching.current) return;
      fetching.current = true;
      const epoch = wall.current;
      try {
        await fetch("/api/session", { method: "POST" });
        const res = await fetch(`/api/feed?count=${count}`);
        const data = (await res.json()) as FeedResponse;
        if (epoch !== wall.current) return; // user moved to the next wall mid-flight — discard
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
    },
    []
  );

  useEffect(() => {
    loadFeed(GALLERY_COUNT);
  }, [loadFeed]);

  const decide = useCallback(async (card: TasteCard, decision: Decision) => {
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
      // keep going even if a single interaction fails
    }
  }, []);

  // gallery tap = instant like (card stays, marked)
  const galleryTap = useCallback(
    (card: TasteCard) => {
      if (galleryLiked.includes(card.id)) {
        setGalleryLiked((l) => l.filter((id) => id !== card.id));
        // untap doesn't erase the signal server-side — skip signals are neutral anyway,
        // so we simply don't send another one. Visual toggle only.
        return;
      }
      setGalleryLiked((l) => [...l, card.id]);
      setFirstPick((prev) => prev ?? card);
      fetch("/api/interact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, interaction: "like" }),
      })
        .then((r) => r.json())
        .then((d) => setProgress((d as { progress: Progress }).progress))
        .catch(() => {});
    },
    [galleryLiked]
  );

  // prefetch the next batch while there's still something to look at
  useEffect(() => {
    if (loading || exhausted) return;
    if (phase === "gallery" && queue.length < GALLERY_COUNT) loadFeed(GALLERY_COUNT);
    if (phase === "grid" && queue.length <= 6) loadFeed(12);
    if (phase === "deck" && queue.length <= 2) loadFeed(12);
  }, [queue.length, loading, exhausted, phase, loadFeed]);

  // scroll to top when a fresh batch lands in the depth grid
  const prevRound = useRef(0);
  useEffect(() => {
    if (phase === "grid" && round > prevRound.current && prevRound.current > 0) {
      gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevRound.current = round;
  }, [round, phase]);

  // keyboard controls (deck only)
  useEffect(() => {
    if (phase !== "deck") return;
    const top = queue[0];
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide(top, "like");
      else if (e.key === "ArrowLeft") decide(top, "dislike");
      else if (e.key === "ArrowDown") decide(top, "skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, decide, phase]);

  const decisive = progress?.decisive ?? 0;
  const pct = Math.min(100, Math.round((decisive / 30) * 100));

  return (
    <main className="flex-1 flex flex-col">
      {/* header */}
      <div ref={gridTop} className="px-5 sm:px-8 pt-5 pb-3 flex items-center gap-3 max-w-6xl mx-auto w-full">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-xs dim mb-1.5">
            <span>
              {phase === "gallery"
                ? `${galleryLiked.length} picked · warm-up ${Math.min(galleryWall + 1, GALLERY_ROUNDS)}/${GALLERY_ROUNDS}`
                : `${decisive} decisive picks · ${progress?.confidenceLabel ?? "…"}`}
            </span>
            <span>{Math.round((progress?.confidence ?? 0) * 100)}% confidence</span>
          </div>
          <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(pct, galleryLiked.length * 2)}%`, background: "linear-gradient(90deg,#8f8a80,var(--ink))" }}
            />
          </div>
        </div>

        {phase !== "gallery" && (
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
        )}

        <button
          onClick={() => router.push("/profile")}
          disabled={decisive < 12}
          className="btn-ghost text-sm !py-2 !px-4 whitespace-nowrap"
          title={decisive < 12 ? `React to ${12 - decisive} more to unlock` : "See your taste profile"}
        >
          Taste DNA{decisive >= 30 ? " ✓" : decisive >= 12 ? " →" : ""}
        </button>
      </div>

      {adaptedFlash && phase !== "gallery" && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-xs tracking-wide text-emerald-300/90 mb-1"
        >
          ✦ the feed just adapted to you — the taste graph reshaped this batch
        </motion.p>
      )}

      {/* ================= GALLERY (visual warm-up) ================= */}
      {phase === "gallery" && !loading && (
        <section className="flex-1 flex flex-col px-4 sm:px-8 pb-32 max-w-6xl mx-auto w-full">
          <div className="text-center pt-2 pb-5">
            <p className="font-display text-2xl sm:text-3xl mb-1">What pulls your eye?</p>
            <p className="dim text-sm">Tap anything that feels like you. No names, no right answers — go on instinct.</p>
          </div>
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 [column-fill:_balance]">
            {queue.slice(0, GALLERY_COUNT).map((card, i) => (
              <GalleryTile
                key={card.id}
                card={card}
                index={i}
                liked={galleryLiked.includes(card.id)}
                onTap={() => galleryTap(card)}
              />
            ))}
          </div>
          {/* floating next bar */}
          <div className="fixed bottom-6 inset-x-0 flex justify-center z-20 px-5">
            <button
              onClick={() => {
                wall.current += 1; // invalidates any in-flight fetch for the old wall
                setQueue([]);
                setGalleryLiked([]);
                setGalleryWall((w) => w + 1);
                if (galleryWall + 1 >= GALLERY_ROUNDS) {
                  finishGallery();
                  loadFeed(12);
                } else {
                  loadFeed(GALLERY_COUNT);
                }
              }}
              className="btn-primary text-sm shadow-2xl flex items-center gap-3"
              style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
            >
              {galleryWall + 1 >= GALLERY_ROUNDS ? "Start the real thing" : "Next wall"}
              <span className="opacity-60">→</span>
              {galleryLiked.length > 0 && (
                <span className="bg-[var(--bg)] text-[var(--ink)] rounded-full text-xs px-2 py-0.5">
                  {galleryLiked.length} ♥
                </span>
              )}
            </button>
          </div>
        </section>
      )}

      {/* loading skeleton */}
      {loading && (
        <section className="flex-1 px-5 sm:px-8 pb-24 pt-4 max-w-6xl mx-auto w-full">
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="mb-3 rounded-2xl skeleton break-inside-avoid"
                style={{ aspectRatio: aspectFor(`skel-${i}`), animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
          <p className="dim text-center text-sm mt-6 animate-pulse">
            hanging the gallery{mode === "live" ? " — waking up the taste graph" : ""}…
          </p>
        </section>
      )}

      {/* exhausted */}
      {!loading && phase !== "gallery" && queue.length === 0 && (
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
            <button onClick={() => { setExhausted(false); loadFeed(12); }} className="btn-ghost text-sm">
              Deal me back in
            </button>
          </div>
        </div>
      )}

      {/* ================= DEPTH GRID ================= */}
      {!loading && phase === "grid" && queue.length > 0 && (
        <section className="flex-1 px-5 sm:px-8 pb-24 pt-4 max-w-5xl mx-auto w-full">
          <p className="text-xs dim text-center mb-4">
            Now with names. Tap a card to ♥ it — ✕ or ⤓ to steer away.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <AnimatePresence mode="popLayout">
              {queue.slice(0, 12).map((card, i) => (
                <GridCard
                  key={card.id}
                  card={card}
                  index={i}
                  pool={pools[card.id] ?? "exploit"}
                  showPool={(progress?.round ?? 0) > GALLERY_ROUNDS}
                  becauseOf={(progress?.round ?? 0) > GALLERY_ROUNDS ? firstPick?.title ?? null : null}
                  eager={i < 4}
                  onDecide={(d) => decide(card, d)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* ================= DECK ================= */}
      {!loading && phase === "deck" && queue.length > 0 && (
        <section className="flex-1 flex flex-col items-center justify-center px-5 pb-40 sm:pb-24">
          <div className="relative w-full max-w-sm" style={{ perspective: 1000 }}>
            {queue.slice(1, 3).reverse().map((c, i) => (
              <div
                key={c.id}
                className="absolute inset-0 rounded-3xl overflow-hidden border hairline"
                style={{ transform: `translateY(${(3 - i) * 10}px) scale(${1 - (3 - i) * 0.03})`, zIndex: 1 }}
              >
                <CardImage card={c} alt="" />
              </div>
            ))}
            <SwipeCard
              key={queue[0].id}
              card={queue[0]}
              pool={pools[queue[0].id] ?? "exploit"}
              showPool={(progress?.round ?? 0) > GALLERY_ROUNDS}
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

      {/* deck action bar */}
      {!loading && phase === "deck" && queue.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center gap-5 z-20">
          <ActionBtn label="Nope" color="#ef4444" onClick={() => decide(queue[0], "dislike")} />
          <ActionBtn label="Skip" color="#8f8a80" onClick={() => decide(queue[0], "skip")} />
          <ActionBtn label="Love" color="#34d399" onClick={() => decide(queue[0], "like")} />
        </div>
      )}

      <p className="fixed bottom-1.5 right-3 text-[10px] dim z-20">
        taste graph: {mode === "live" ? "live" : "offline (deterministic)"}
      </p>
    </main>
  );
}

/* ---------------- gallery tile (visual warm-up) ---------------- */

function GalleryTile({ card, index, liked, onTap }: { card: TasteCard; index: number; liked: boolean; onTap: () => void }) {
  const color = domainColor(card.domain);
  return (
    <motion.button
      type="button"
      onClick={onTap}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.7), duration: 0.4, ease: "easeOut" }}
      className="relative mb-3 w-full break-inside-avoid rounded-2xl overflow-hidden cursor-pointer text-left group"
      style={{ aspectRatio: aspectFor(card.id) }}
      aria-pressed={liked}
      aria-label={`Pick tile ${index + 1}`}
    >
      <div className="absolute inset-0">
        <CardImage card={card} width={420} eager={index < 8} alt="" />
      </div>
      {/* hover sheen */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors" />
      {/* liked state */}
      <AnimatePresence>
        {liked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: `${color}33`, boxShadow: `inset 0 0 0 2px ${color}` }}
          >
            <motion.span
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="text-3xl"
              style={{ color, textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
            >
              ♥
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
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

/* ---------------- depth grid card (click-anywhere = like) ---------------- */

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
      {/* whole card = like */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onDecide("like")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDecide("like");
          }
        }}
        className="aspect-[3/4] relative cursor-pointer"
        aria-label={`Love ${card.title}`}
      >
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

        {/* corner hint: tap = like */}
        <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full border flex items-center justify-center text-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          style={{ borderColor: "#34d39955", color: "#34d399", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          aria-hidden
        >
          ♥
        </div>

        {/* small ✕ / ⤓ — stopPropagation so they don't trigger the card tap */}
        <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDecide("dislike"); }}
            aria-label={`Nope ${card.title}`}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-xs active:scale-90 transition-transform"
            style={{ borderColor: "#ef444455", color: "#ef4444", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            ✕
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDecide("skip"); }}
            aria-label={`Skip ${card.title}`}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-xs active:scale-90 transition-transform dim"
            style={{ borderColor: "#8f8a8044", color: "#8f8a80", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            ⤓
          </button>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-3 pr-20">
          <h3 className="font-display text-base sm:text-lg leading-tight">{card.title}</h3>
          <p className="text-[10px] dim truncate mt-1">{card.tags.slice(0, 3).join(" · ")}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-16 h-16 rounded-full border flex items-center justify-center text-xl transition-transform active:scale-90 hover:scale-105"
      style={{ borderColor: `${color}55`, color, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }}
    >
      {label === "Love" ? "♥" : label === "Nope" ? "✕" : "⤓"}
    </button>
  );
}
