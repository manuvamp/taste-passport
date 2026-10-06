"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { ExplorationPool, TasteCard } from "@/lib/types";
import { CardImage } from "@/components/card-image";
import { domainColor } from "@/components/domain";
import { VIBES, type Vibe } from "@/data/vibes";
import vibeImages from "@/data/vibe-images.json";

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

const MIN_PICKS = 20;
const IDEAL_PICKS = 30;
const POOL_LABEL: Record<ExplorationPool, string> = {
  exploit: "your taste",
  adjacent: "nearby",
  novel: "a surprise",
};

const IMAGES = vibeImages as Record<string, string>;

/** Interleave domains so every screenful of the wall mixes food, places, spaces, moods. */
function interleaved(vibes: Vibe[]): Vibe[] {
  const buckets = new Map<string, Vibe[]>();
  for (const v of vibes) buckets.set(v.domain, [...(buckets.get(v.domain) ?? []), v]);
  const lists = [...buckets.values()].sort((a, b) => b.length - a.length);
  const out: Vibe[] = [];
  for (let i = 0; out.length < vibes.length; i++) {
    for (const l of lists) if (l[i]) out.push(l[i]);
  }
  return out;
}

async function postLikes(ids: string[]): Promise<Progress | null> {
  try {
    const res = await fetch("/api/interact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids.length === 1 ? { cardId: ids[0], interaction: "like" } : { cardIds: ids, interaction: "like" }),
    });
    return ((await res.json()) as { progress: Progress }).progress;
  } catch {
    return null; // never block the flow on one failed write
  }
}

export default function Discover() {
  const router = useRouter();
  const [phase, setPhase] = useState<"vibes" | "curated">("vibes");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("tp_vibes_done") === "1") setPhase("curated");
    setReady(true);
  }, []);

  if (!ready) return <main className="flex-1" />;
  return phase === "vibes" ? (
    <VibeWall
      onDone={() => {
        window.localStorage.setItem("tp_vibes_done", "1");
        window.scrollTo({ top: 0 });
        setPhase("curated");
      }}
    />
  ) : (
    <CuratedFeed onProfile={() => router.push("/profile")} />
  );
}

/* ====================== PHASE 1 — vibe wall ====================== */

function VibeWall({ onDone }: { onDone: () => void }) {
  const vibes = useMemo(() => interleaved(VIBES), []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const count = picked.size;
  const canGo = count >= MIN_PICKS;

  const finish = async () => {
    if (!canGo || busy) return;
    setBusy(true);
    await fetch("/api/session", { method: "POST" }).catch(() => {});
    await postLikes([...picked]);
    onDone();
  };

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-3 sm:px-8 pt-4 pb-3 max-w-7xl mx-auto w-full">
        <h1 className="font-display text-2xl sm:text-3xl">Tap what feels like you.</h1>
        <p className="dim text-sm mt-1">
          Go on instinct — no wrong answers. Pick {MIN_PICKS}–{IDEAL_PICKS} you&apos;d love, skip the rest.
        </p>
      </div>

      <div className="px-2 sm:px-8 pb-36 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 sm:gap-2">
          {vibes.map((v, i) => (
            <VibeTile key={v.id} vibe={v} on={picked.has(v.id)} eager={i < 30} onToggle={toggle} />
          ))}
        </div>
      </div>

      {/* sticky progress + continue */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t hairline bg-[var(--bg)]/92 backdrop-blur-md px-4 sm:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs dim mb-1.5">
              <span>
                {count < MIN_PICKS
                  ? `${count} / ${MIN_PICKS} — ${MIN_PICKS - count} more to go`
                  : count < IDEAL_PICKS
                    ? `${count} picked — a few more sharpens it`
                    : `${count} picked — great range`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--hairline)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (count / IDEAL_PICKS) * 100)}%`,
                  background: canGo ? "var(--like)" : "linear-gradient(90deg,#8f8a80,var(--ink))",
                }}
              />
            </div>
          </div>
          <button
            onClick={finish}
            disabled={!canGo || busy}
            className="btn-primary text-sm whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {busy ? "Reading your taste…" : "Continue →"}
          </button>
        </div>
      </div>
    </main>
  );
}

const VibeTile = memo(function VibeTile({
  vibe,
  on,
  eager,
  onToggle,
}: {
  vibe: Vibe;
  on: boolean;
  eager: boolean;
  onToggle: (id: string) => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = IMAGES[vibe.id];
  const bg = `linear-gradient(145deg, hsl(${vibe.hue} 45% 22%), hsl(${(vibe.hue + 40) % 360} 40% 11%))`;
  return (
    <button
      type="button"
      onClick={() => onToggle(vibe.id)}
      aria-pressed={on}
      aria-label={vibe.title}
      className="relative aspect-square rounded-lg sm:rounded-xl overflow-hidden text-left select-none active:scale-95 transition-transform"
      style={{ background: bg, contentVisibility: "auto", containIntrinsicSize: "120px" }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-3xl sm:text-4xl opacity-90" aria-hidden>
        {vibe.emoji}
      </span>
      {src && imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={180}
          height={180}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgOk(false)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 px-1.5 pt-4 pb-1 text-[10px] sm:text-[11px] leading-tight font-medium bg-gradient-to-t from-black/80 to-transparent line-clamp-2">
        {vibe.title}
      </span>
      {on && (
        <span
          className="absolute inset-0 flex items-start justify-end p-1.5"
          style={{ boxShadow: "inset 0 0 0 3px var(--like)", background: "rgba(52,211,153,0.18)" }}
        >
          <span className="w-5 h-5 rounded-full bg-[var(--like)] text-black text-xs font-bold flex items-center justify-center">✓</span>
        </span>
      )}
    </button>
  );
});

/* ====================== PHASE 2 — curated infinite feed ====================== */

function CuratedFeed({ onProfile }: { onProfile: () => void }) {
  const [cards, setCards] = useState<TasteCard[]>([]);
  const [pools, setPools] = useState<Record<string, ExplorationPool>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState("mock");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const fetching = useRef(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const seen = useRef(new Set<string>());

  const loadMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      await fetch("/api/session", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/feed?count=16");
      const data = (await res.json()) as FeedResponse;
      // dedupe by id and by title (live Qloo cards can twin seed cards)
      const fresh = data.cards.filter((c) => !seen.current.has(c.id) && !seen.current.has(c.title.toLowerCase()));
      fresh.forEach((c) => {
        seen.current.add(c.id);
        seen.current.add(c.title.toLowerCase());
      });
      if (fresh.length === 0) setDone(true);
      setCards((prev) => [...prev, ...fresh]);
      setPools((prev) => ({ ...prev, ...data.pools }));
      setProgress(data.progress);
      setMode(data.mode);
    } catch {
      // transient failure: sentinel will retry on next intersection
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // infinite scroll: fetch the next batch well before the user reaches the end
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "1400px 0px" });
    io.observe(el);
    // fallback for environments where IntersectionObserver callbacks are throttled
    const onScroll = () => {
      if (el.getBoundingClientRect().top < window.innerHeight + 1400) loadMore();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [loadMore, done, cards.length]);

  const like = useCallback((card: TasteCard) => {
    // positive-only: a tap loves; a second tap just un-highlights (nothing negative is ever sent)
    setLiked((prev) => {
      if (prev.has(card.id)) {
        const n = new Set(prev);
        n.delete(card.id);
        return n;
      }
      postLikes([card.id]).then((p) => p && setProgress(p));
      return new Set(prev).add(card.id);
    });
  }, []);

  const decisive = progress?.decisive ?? 0;
  const pct = Math.round((progress?.confidence ?? 0) * 100);

  return (
    <main className="flex-1 flex flex-col">
      <div className="sticky top-[57px] z-30 bg-[var(--bg)]/90 backdrop-blur-md border-b hairline">
        <div className="px-4 sm:px-8 py-2.5 flex items-center gap-4 max-w-6xl mx-auto w-full">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs dim mb-1.5">
              <span>{decisive} picks · {progress?.confidenceLabel ?? "…"}</span>
              <span>{pct}% confidence</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--like)] transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button onClick={onProfile} className="btn-primary text-sm !py-2 !px-4 whitespace-nowrap">
            My Taste DNA →
          </button>
        </div>
      </div>

      <section className="px-3 sm:px-8 pt-4 pb-24 max-w-6xl mx-auto w-full">
        <p className="text-center dim text-sm mb-4">
          Now it gets specific. Tap what you love — just keep scrolling past the rest.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {cards.map((card, i) => (
            <FeedCard
              key={card.id}
              card={card}
              pool={pools[card.id]}
              loved={liked.has(card.id)}
              eager={i < 6}
              onLike={like}
            />
          ))}
          {(loading || (!done && cards.length > 0)) &&
            Array.from({ length: loading ? 12 : 4 }).map((_, i) => (
              <div key={`sk${i}`} className="aspect-[3/4] rounded-2xl skeleton" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
        </div>

        <div ref={sentinel} className="h-10" />

        {done && (
          <div className="text-center py-10">
            <p className="font-display text-2xl mb-2">You&apos;ve seen everything we have.</p>
            <p className="dim text-sm mb-5">That&apos;s plenty — your taste profile is ready for your agents.</p>
            <button onClick={onProfile} className="btn-primary text-sm">See my Taste DNA →</button>
          </div>
        )}
      </section>

      <p className="fixed bottom-1.5 right-3 text-[10px] dim z-20">taste graph: {mode === "live" ? "live" : "offline"}</p>
    </main>
  );
}

const FeedCard = memo(function FeedCard({
  card,
  pool,
  loved,
  eager,
  onLike,
}: {
  card: TasteCard;
  pool?: ExplorationPool;
  loved: boolean;
  eager: boolean;
  onLike: (c: TasteCard) => void;
}) {
  const color = domainColor(card.domain);
  return (
    <motion.button
      type="button"
      onClick={() => onLike(card)}
      aria-pressed={loved}
      aria-label={`Love ${card.title}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative aspect-[3/4] rounded-2xl overflow-hidden border hairline text-left active:scale-[0.98] transition-transform"
    >
      <CardImage card={card} width={400} eager={eager} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.18em] rounded-full px-2 py-0.5 backdrop-blur-sm" style={{ background: `${color}33`, color }}>
          {card.domain}
        </span>
        {pool && pool !== "exploit" && (
          <span className="text-[9px] rounded-full px-2 py-0.5 bg-black/45 backdrop-blur-sm dim">{POOL_LABEL[pool]}</span>
        )}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3">
        <h3 className="font-display text-base sm:text-lg leading-tight">{card.title}</h3>
        <p className="text-[10px] dim truncate mt-1">{card.tags.slice(0, 3).join(" · ")}</p>
      </div>
      {loved && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(52,211,153,0.2)", boxShadow: "inset 0 0 0 3px var(--like)" }}
        >
          <span className="text-4xl text-[var(--like)]" style={{ textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>♥</span>
        </span>
      )}
    </motion.button>
  );
});
