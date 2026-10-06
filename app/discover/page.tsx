"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExplorationPool, TasteCard } from "@/lib/types";
import { cardImageSrc } from "@/components/card-image";
import { domainColor } from "@/components/domain";
import { VIBES } from "@/data/vibes";
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
const FEED_TARGET = 25; // picks in the feed before "Go deeper" is highlighted
const POOL_LABEL: Record<ExplorationPool, string> = { exploit: "your taste", adjacent: "nearby", novel: "a surprise" };
const IMAGES = vibeImages as Record<string, string[]>;

/** Resolves true only when the image is fully downloaded and decoded (never shows half-loaded cards). */
function preload(src: string, timeoutMs = 9000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      // decode so it paints instantly, but never let a stalled decode (background tab) block the wall
      Promise.race([img.decode?.().catch(() => {}), new Promise((r) => setTimeout(r, 1200))]).then(() => resolve(true));
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}

async function postLikes(ids: string[], cards?: TasteCard[]): Promise<Progress | null> {
  try {
    const res = await fetch("/api/interact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(ids.length === 1 ? { cardId: ids[0] } : { cardIds: ids }), interaction: "like", cards }),
    });
    return ((await res.json()) as { progress: Progress }).progress;
  } catch {
    return null; // never block the flow on one failed write
  }
}

function LoadingScreen({ label, pct }: { label: string; pct?: number }) {
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="text-center w-full max-w-xs">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin mx-auto mb-5" />
        <p className="dim text-sm">{label}</p>
        {pct !== undefined && (
          <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden mt-4">
            <div className="h-full bg-[var(--ink)] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return <div className="w-6 h-6 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin" />;
}

const STEPS = ["Vibes", "Your feed", "Refine", "Your DNA"];

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-[11px] dim">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={i === current ? "text-[var(--ink)] font-medium" : i < current ? "text-[var(--ink)] opacity-60" : ""}>
            {i + 1} {label}
          </span>
          {i < STEPS.length - 1 && <span className="w-3 h-px bg-[var(--hairline)]" />}
        </li>
      ))}
    </ol>
  );
}

/** Keeps progress from ever moving backwards when a slow response lands after a newer one. */
function mergeProgress(prev: Progress | null, next: Progress): Progress {
  if (!prev) return next;
  return {
    ...next,
    decisive: Math.max(prev.decisive, next.decisive),
    interactions: Math.max(prev.interactions, next.interactions),
    confidence: Math.max(prev.confidence, next.confidence),
  };
}

/**
 * Calls `fn` whenever the sentinel is within `margin` px of the viewport — or while it isn't
 * mounted yet (loading screen), so the first batch keeps loading. Scroll + short poll.
 */
function useNearBottom(ref: React.RefObject<HTMLElement | null>, fn: () => void, margin = 3000) {
  const cb = useRef(fn);
  useEffect(() => {
    cb.current = fn;
  });
  useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || el.getBoundingClientRect().top < window.innerHeight + margin) cb.current();
    };
    window.addEventListener("scroll", check, { passive: true });
    const t = setInterval(check, 400);
    return () => {
      window.removeEventListener("scroll", check);
      clearInterval(t);
    };
  }, [ref, margin]);
}

type Phase = "vibes" | "curated" | "deeper";

export default function Discover() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    const ls = window.localStorage;
    setPhase(ls.getItem("tp_feed_done") === "1" ? "deeper" : ls.getItem("tp_vibes_done") === "1" ? "curated" : "vibes");
  }, []);

  const go = (next: Phase, key: string) => {
    window.localStorage.setItem(key, "1");
    window.scrollTo({ top: 0 });
    setPhase(next);
  };

  if (!phase) return <main className="flex-1" />;
  if (phase === "vibes") return <VibeWall onDone={() => go("curated", "tp_vibes_done")} />;
  if (phase === "curated") return <CuratedFeed onNext={() => go("deeper", "tp_feed_done")} />;
  return <Chapters onProfile={() => router.push("/profile")} />;
}

/* ====================== PHASE 1 — vibe wall ====================== */

type Tile = { key: string; id: string; title: string; src: string };

/** Every photo of every theme, ordered so neither a theme nor a domain clusters; no photo twice. */
function buildTiles(): Tile[] {
  const themes = VIBES.filter((v) => IMAGES[v.id]?.length);
  const buckets = new Map<string, typeof themes>();
  for (const v of themes) buckets.set(v.domain, [...(buckets.get(v.domain) ?? []), v]);
  const lists = [...buckets.values()].sort((a, b) => b.length - a.length);
  const ordered: typeof themes = [];
  for (let i = 0; ordered.length < themes.length; i++) for (const l of lists) if (l[i]) ordered.push(l[i]);
  const out: Tile[] = [];
  const used = new Set<string>();
  for (let r = 0; r < 24; r++)
    for (const v of ordered) {
      const src = IMAGES[v.id][r];
      if (src && !used.has(src)) {
        used.add(src);
        out.push({ key: `${v.id}~${r}`, id: v.id, title: v.title, src });
      }
    }
  return out;
}

const FIRST_SCREEN = 60;

function VibeWall({ onDone }: { onDone: () => void }) {
  const tiles = useMemo(buildTiles, []);
  const [ready, setReady] = useState<Tile[]>([]);
  const [want, setWant] = useState(100); // how many tiles the wall should currently show
  const [picked, setPicked] = useState<Set<string>>(new Set()); // themes already picked — gone for good
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cursor = useRef(0);
  const inflight = useRef(0);
  const readyRef = useRef<Tile[]>([]);
  const pickedRef = useRef(picked);
  const wantRef = useRef(want);
  const visibleLen = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // keep a deep buffer of fully-loaded tiles ahead of what's on screen
  const pump = useCallback(() => {
    const available = () => readyRef.current.filter((t) => !pickedRef.current.has(t.id)).length;
    while (inflight.current < 10 && cursor.current < tiles.length && available() + inflight.current < wantRef.current + 160) {
      const t = tiles[cursor.current++];
      if (pickedRef.current.has(t.id)) continue;
      inflight.current++;
      preload(t.src).then((ok) => {
        inflight.current--;
        if (ok) {
          readyRef.current = [...readyRef.current, t];
          setReady(readyRef.current);
        }
        pump();
      });
    }
  }, [tiles]);

  useEffect(() => {
    wantRef.current = want;
    pickedRef.current = picked;
    pump();
  }, [want, picked, pump]);

  // a picked theme disappears entirely, so nothing you already chose ever comes back
  const visible = useMemo(() => ready.filter((t) => !picked.has(t.id)).slice(0, want), [ready, picked, want]);
  useEffect(() => {
    visibleLen.current = visible.length;
  }, [visible]);
  const exhausted = cursor.current >= tiles.length && inflight.current === 0;
  const loadingMore = visible.length < want && !exhausted;

  useNearBottom(sentinel, () => {
    if (visibleLen.current >= wantRef.current - 12) setWant((w) => w + 60);
  });

  const pick = useCallback((t: Tile) => {
    setPicked((s) => new Set(s).add(t.id));
    setPicks((p) => [...p, t.id]);
  }, []);

  const count = picks.length;
  const canGo = count >= MIN_PICKS;

  const finish = async () => {
    if (!canGo || busy) return;
    setBusy(true);
    await fetch("/api/session", { method: "POST" }).catch(() => {});
    await postLikes(picks);
    onDone();
  };

  if (ready.length < FIRST_SCREEN && !exhausted)
    return <LoadingScreen label="Hanging your wall…" pct={Math.min(100, Math.round((ready.length / FIRST_SCREEN) * 100))} />;

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-3 sm:px-8 pt-4 pb-3 max-w-7xl mx-auto w-full">
        <Steps current={0} />
        <h1 className="font-display text-2xl sm:text-3xl mt-2">Tap what feels like you.</h1>
        <p className="dim text-sm mt-1">
          Each pick swaps in something new. Choose {MIN_PICKS}–{IDEAL_PICKS} you&apos;d love — keep scrolling, there&apos;s plenty more.
        </p>
      </div>

      <div className="px-2 sm:px-8 pb-36 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 sm:gap-2">
          {visible.map((t) => (
            <VibeTile key={t.key} tile={t} onPick={pick} />
          ))}
        </div>
        <div ref={sentinel} className="h-16 flex items-center justify-center">
          {loadingMore && <Spinner />}
          {exhausted && <p className="dim text-sm">That&apos;s the whole wall — continue when you&apos;re ready.</p>}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 border-t hairline bg-[var(--bg)]/92 backdrop-blur-md px-4 sm:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs dim mb-1.5">
              {count < MIN_PICKS
                ? `${count} / ${MIN_PICKS} — ${MIN_PICKS - count} more to go`
                : count < IDEAL_PICKS
                  ? `${count} picked — a few more sharpens it`
                  : `${count} picked — great range`}
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
          <button onClick={finish} disabled={!canGo || busy} className="btn-primary text-sm whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed">
            {busy ? "Reading your taste…" : "Continue →"}
          </button>
        </div>
      </div>
    </main>
  );
}

const VibeTile = memo(function VibeTile({ tile, onPick }: { tile: Tile; onPick: (t: Tile) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile)}
      aria-label={tile.title}
      className="relative aspect-square rounded-lg sm:rounded-xl overflow-hidden select-none active:scale-90 transition-transform bg-[var(--bg-softer)]"
    >
      {/* already preloaded + decoded, so it paints instantly */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tile.src} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
    </button>
  );
});

/* ====================== shared: buffered, photo-only card source ====================== */

// Cards whose lead photo is a portrait are dropped: no faces, and no image-less cards.
const PORTRAIT_IDS = new Set(["kusama", "banksy", "basquiat", "kahlo", "murakami-takashi", "olafur-eliasson", "yohji-yamamoto", "vivienne-westwood", "rick-owens", "margiela"]);
const noPhoto = (c: TasteCard) => c.domain === "music" || PORTRAIT_IDS.has(c.id) || !cardImageSrc(c);

/**
 * Pulls batches from the adaptive feed in the background, preloads every photo, and queues only
 * fully-loaded cards. `take(n)` hands the UI cards that are guaranteed to paint instantly.
 */
function useCardSource(target: number, onProgress?: (p: Progress, mode: string) => void, domains?: string[]) {
  const domainQuery = domains?.length ? `&domains=${domains.join(",")}` : "";
  const buffer = useRef<TasteCard[]>([]);
  const seen = useRef(new Set<string>());
  const pools = useRef<Record<string, ExplorationPool>>({});
  const fetching = useRef(false);
  const emptyStreak = useRef(0);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ticks, setTicks] = useState(0); // bumps when new cards land in the buffer
  const cb = useRef(onProgress);
  useEffect(() => {
    cb.current = onProgress;
  });

  const fetchBatch = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      await fetch("/api/session", { method: "POST" }).catch(() => {});
      const res = await fetch(`/api/feed?count=24${domainQuery}`);
      const data = (await res.json()) as FeedResponse;
      cb.current?.(data.progress, data.mode);
      Object.assign(pools.current, data.pools);
      // dedupe by id and by title (live Qloo cards can twin seed cards)
      const fresh = data.cards.filter((c) => !seen.current.has(c.id) && !seen.current.has(c.title.toLowerCase()));
      fresh.forEach((c) => {
        seen.current.add(c.id);
        seen.current.add(c.title.toLowerCase());
      });
      const withPhoto = fresh.filter((c) => !noPhoto(c));
      const ok = await Promise.all(withPhoto.map((c) => preload(cardImageSrc(c)!)));
      const good = withPhoto.filter((_, i) => ok[i]);
      emptyStreak.current = good.length === 0 ? emptyStreak.current + 1 : 0;
      if (emptyStreak.current >= 8) setExhausted(true); // seeds rotate per call, so a few empty batches in a row are normal
      if (good.length) {
        // interleave domains so neighbouring cards never feel samey
        const lanes = new Map<string, TasteCard[]>();
        for (const c of good) lanes.set(c.domain, [...(lanes.get(c.domain) ?? []), c]);
        const mixed: TasteCard[] = [];
        for (let i = 0; mixed.length < good.length; i++) for (const l of lanes.values()) if (l[i]) mixed.push(l[i]);
        buffer.current.push(...mixed);
        setTicks((t) => t + 1);
      }
    } catch {
      // transient: the next tick retries
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [domainQuery]);

  // keep ~target cards queued so scrolling never waits on the network
  useEffect(() => {
    const t = setInterval(() => {
      if (!exhausted && buffer.current.length < target) fetchBatch();
    }, 350);
    return () => clearInterval(t);
  }, [exhausted, target, fetchBatch]);

  const take = useCallback((n: number) => buffer.current.splice(0, n), []);
  const buffered = useCallback(() => buffer.current.length, []);
  return { take, buffered, pools, exhausted, loading, ticks };
}

/* ====================== PHASE 2 — curated infinite feed ====================== */

const FIRST_FEED = 12;

type FeedProps = {
  onNext: () => void;
  domains?: string[];
  goal?: number;
  step?: number;
  nextLabel?: string;
  heading?: string;
  blurb?: string;
};

function CuratedFeed({ onNext, domains, goal = FEED_TARGET, step = 1, nextLabel = "Go deeper →", heading, blurb }: FeedProps) {
  const [cards, setCards] = useState<TasteCard[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState("mock");
  const [likes, setLikes] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const lenRef = useRef(0);

  const src = useCardSource(48, (p, m) => {
    setProgress((prev) => mergeProgress(prev, p));
    setMode(m);
  }, domains);
  const { take, buffered, exhausted, loading, ticks } = src;

  useEffect(() => {
    lenRef.current = cards.length;
  }, [cards]);

  const reveal = useCallback(
    (n: number) => {
      const next = take(n);
      if (next.length) setCards((prev) => [...prev, ...next]);
    },
    [take]
  );

  // keep the grid topped up as cards are liked away, and add more whenever the user nears the end
  useEffect(() => {
    if (lenRef.current < FIRST_FEED + 4 && buffered() > 0) reveal(12);
  }, [ticks, cards.length, buffered, reveal]);
  useNearBottom(sentinel, () => {
    if (buffered() > 0) reveal(12);
  });

  const like = useCallback((card: TasteCard) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    setLikes((n) => n + 1);
    postLikes([card.id], [card]).then((p) => p && setProgress((prev) => mergeProgress(prev, p)));
  }, []);

  const pct = Math.min(100, Math.round((likes / goal) * 100));
  const ready = likes >= goal;

  if (cards.length < FIRST_FEED && !exhausted) return <LoadingScreen label="Curating your feed…" />;

  return (
    <main className="flex-1 flex flex-col">
      <div className="sticky top-[57px] z-30 bg-[var(--bg)]/90 backdrop-blur-md border-b hairline">
        <div className="px-4 sm:px-8 py-2.5 flex items-center gap-4 max-w-6xl mx-auto w-full">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-xs dim mb-1.5 gap-3">
              <Steps current={step} />
              <span className="whitespace-nowrap">{ready ? "Range captured" : `${likes} / ${goal}`}</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--like)] transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button onClick={onNext} className={`text-sm !py-2 !px-4 whitespace-nowrap ${ready ? "btn-primary" : "btn-ghost"}`}>
            {nextLabel}
          </button>
        </div>
      </div>

      <section className="px-3 sm:px-8 pt-4 pb-24 max-w-6xl mx-auto w-full">
        {ready ? (
          <div className="panel-soft p-4 mb-4 text-center">
            <p className="font-display text-xl">That&apos;s a solid read of you.</p>
            <p className="dim text-sm mt-1 mb-3">{domains ? "Enough here — move on whenever you like." : "Next, we narrow in on one part of life at a time."}</p>
            <button onClick={onNext} className="btn-primary text-sm">
              {nextLabel}
            </button>
          </div>
        ) : (
          <div className="text-center mb-4">
            {heading && <h1 className="font-display text-2xl sm:text-3xl mb-1">{heading}</h1>}
            <p className="dim text-sm">{blurb ?? "Tap what you love — it swaps for something new. Keep scrolling for more."}</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {cards.map((card) => (
            <FeedCard key={card.id} card={card} pool={src.pools.current[card.id]} onLike={like} />
          ))}
        </div>
        <div ref={sentinel} className="h-20 flex items-center justify-center">
          {loading && !exhausted && <Spinner />}
        </div>
        {exhausted && (
          <div className="text-center pb-10">
            <p className="font-display text-2xl mb-2">You&apos;ve seen everything we have.</p>
            <button onClick={onNext} className="btn-primary text-sm">
              {nextLabel}
            </button>
          </div>
        )}
      </section>

      <p className="fixed bottom-1.5 right-3 text-[10px] dim z-20">
        taste graph: {mode === "live" ? "live" : "offline"}
        {progress ? ` · ${progress.confidenceLabel}` : ""}
      </p>
    </main>
  );
}

const FeedCard = memo(function FeedCard({ card, pool, onLike }: { card: TasteCard; pool?: ExplorationPool; onLike: (c: TasteCard) => void }) {
  const color = domainColor(card.domain);
  return (
    <button
      type="button"
      onClick={() => onLike(card)}
      aria-label={`Love ${card.title}`}
      className="relative aspect-[3/4] rounded-2xl overflow-hidden border hairline text-left active:scale-95 transition-transform bg-[var(--bg-softer)]"
    >
      {/* preloaded before this card was added, so no pop-in */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cardImageSrc(card)!} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.18em] rounded-full px-2 py-0.5 backdrop-blur-sm" style={{ background: `${color}33`, color }}>
          {card.domain}
        </span>
        {pool && pool !== "exploit" && <span className="text-[9px] rounded-full px-2 py-0.5 bg-black/45 backdrop-blur-sm dim">{POOL_LABEL[pool]}</span>}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3">
        <h3 className="font-display text-base sm:text-lg leading-tight">{card.title}</h3>
        <p className="text-[10px] dim truncate mt-1">{card.tags.slice(0, 3).join(" · ")}</p>
      </div>
    </button>
  );
});

/* ====================== PHASE 3 — three focused chapters ====================== */

const CHAPTERS = [
  { title: "Screen & page", blurb: "Films, series, books and games — tap the ones you'd happily lose a weekend to.", domains: ["film", "tv", "book", "game"] },
  { title: "Table & travel", blurb: "Meals, places and rituals — tap what you'd book, visit or make time for.", domains: ["food", "travel", "lifestyle"] },
  { title: "Look & space", blurb: "Fashion, art, buildings and brands — tap what looks like you.", domains: ["fashion", "art", "architecture", "brand"] },
];

function Chapters({ onProfile }: { onProfile: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("tp_chapter") ?? 0);
    if (saved > 0 && saved < CHAPTERS.length) setI(saved);
  }, []);
  const ch = CHAPTERS[i];
  const last = i === CHAPTERS.length - 1;
  return (
    <CuratedFeed
      key={i}
      step={2}
      domains={ch.domains}
      goal={8}
      heading={`${ch.title} · ${i + 1} of ${CHAPTERS.length}`}
      blurb={ch.blurb}
      nextLabel={last ? "See my Taste DNA →" : `Next: ${CHAPTERS[i + 1].title} →`}
      onNext={() => {
        window.scrollTo({ top: 0 });
        if (last) {
          window.localStorage.removeItem("tp_chapter");
          onProfile();
        } else {
          window.localStorage.setItem("tp_chapter", String(i + 1));
          setI(i + 1);
        }
      }}
    />
  );
}
