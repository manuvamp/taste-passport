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

const MIN_PICKS = 15;
const IDEAL_PICKS = 25;
const FEED_TARGET = 20; // picks in the feed before "Go deeper" is highlighted
const POOL_LABEL: Record<ExplorationPool, string> = { exploit: "your taste", adjacent: "nearby", novel: "a surprise" };
const DOMAIN_NAME: Record<string, string> = { tv: "series", travel: "place", architecture: "space", lifestyle: "pastime", brand: "brand", book: "book", game: "game", food: "food", film: "film", art: "art", fashion: "fashion", music: "music" };
/** "japanese-food" → "Japanese food", "sci-fi" → "sci fi" */
const PROPER = /^(japanese|french|italian|nordic|korean|moroccan|danish|turkish|mexican|cuban|himalayan|american|british|chinese|indian|thai|greek|spanish|persian|african|latin|brazilian|german|dutch|soviet|colombian)$/;
const niceTag = (t: string) => {
  const w = t.endsWith("-food") ? t.slice(0, -5) : t;
  const cap = t.endsWith("-food") || PROPER.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  return t.endsWith("-food") ? `${cap} food` : cap.replace(/-/g, " ");
};

function Heart() {
  return (
    <span className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" aria-hidden>
      <span className="text-4xl drop-shadow-[0_2px_8px_rgba(0,0,0,.6)]" style={{ animation: "tp-heart .34s ease-out forwards", color: "var(--like)" }}>
        ♥
      </span>
    </span>
  );
}
const IMAGES = vibeImages as Record<string, string[]>;

/** Resolves true only when the image is fully downloaded and decoded (never shows half-loaded cards). */
function preload(src: string, timeoutMs = 9000, minW = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      // never show blurry or empty images: too small to look sharp at display size → skip it
      if (img.naturalWidth < minW || img.naturalHeight < minW * 0.5) return resolve(false);
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

/** One session handshake per page load, not one per batch. */
let sessionReady: Promise<unknown> | null = null;
function ensureSession() {
  return (sessionReady ??= fetch("/api/session", { method: "POST" }).catch(() => (sessionReady = null)));
}

/**
 * Every write goes through one queue: taps are sent in order and never race each other, and the feed
 * waits for pending writes so the next batch already reflects the latest picks.
 */
let writes: Promise<unknown> = Promise.resolve();
type Signal = { ids: string[]; interaction?: "like" | "dislike"; strength?: number; passed?: string[]; source?: string; cards?: TasteCard[] };
function send(sig: Signal): Promise<Progress | null> {
  const run = async () => {
    await ensureSession();
    try {
      const res = await fetch("/api/interact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(sig.ids.length === 1 ? { cardId: sig.ids[0] } : { cardIds: sig.ids }),
          interaction: sig.interaction ?? "like",
          strength: sig.strength,
          passed: sig.passed,
          source: sig.source,
          cards: sig.cards,
        }),
      });
      return ((await res.json()) as { progress?: Progress }).progress ?? null;
    } catch {
      return null; // never block the flow on one failed write
    }
  };
  const p = writes.then(run, run);
  writes = p;
  return p;
}
const postLikes = (ids: string[], cards?: TasteCard[], source?: string) => send({ ids, cards, source });

/** Take a pick back (in order with every other write). */
function unsend(cardId: string) {
  const run = () =>
    fetch("/api/taste/tweak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove", cardId }) }).catch(() => null);
  writes = writes.then(run, run);
}

/** The first feed batch, fetched while the wall is still being picked, so "Continue" lands on a ready feed. */
let feedPrefetch: Promise<FeedResponse | null> | null = null;
function prefetchFeed() {
  feedPrefetch ??= writes
    .catch(() => {})
    .then(() => fetch("/api/feed?count=24"))
    .then((r) => r.json() as Promise<FeedResponse>)
    .then((d) => {
      for (const c of d.cards ?? []) if (!noPhoto(c)) preload(cardImageSrc(c)!, 9000, 320); // warm the browser cache
      return d;
    })
    .catch(() => null);
}

/** Thumbnails of what you tapped on the wall, so the waits that follow show your own taste. */
function wallThumbs(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem("tp_wall_thumbs") ?? "[]") as string[];
  } catch {
    return [];
  }
}

function LoadingScreen({ label, pct, messages, thumbs }: { label: string; pct?: number; messages?: string[]; thumbs?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!messages?.length) return;
    const t = setInterval(() => setI((n) => n + 1), 1700);
    return () => clearInterval(t);
  }, [messages]);
  const shown = (thumbs ?? []).slice(0, 9);
  const line = messages?.length ? messages[Math.min(i, messages.length - 1)] : label;
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="text-center w-full max-w-xs">
        {shown.length >= 4 ? (
          <div className="grid grid-cols-3 gap-1.5 w-40 mx-auto mb-6">
            {shown.map((src, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" referrerPolicy="no-referrer" className="aspect-square w-full rounded-lg object-cover slow-pulse" style={{ animationDelay: `${(k % 3) * 0.25 + Math.floor(k / 3) * 0.25}s` }} />
            ))}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin mx-auto mb-5" />
        )}
        <p key={line} className="dim text-sm" style={{ animation: "tp-fade .4s ease-out" }}>
          {line}
        </p>
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
          <span className={`whitespace-nowrap ${i === current ? "text-[var(--ink)] font-medium" : i < current ? "text-[var(--ink)] opacity-60" : ""}`}>
            {i + 1}
            <span className={i === current ? "" : "hidden sm:inline"}> {label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="w-3 h-px bg-[var(--hairline)]" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * Fixed grid slots: tapping an item fades only that item out, and a fresh one fades into the
 * very same spot — nothing else moves. `next` supplies the replacement (undefined = close the gap).
 */
function useSlots<T>(next: () => T | undefined, keyOf: (t: T) => string) {
  const [slots, setSlots] = useState<T[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const lenRef = useRef(0);
  const keys = useRef(new Set<string>());
  useEffect(() => {
    lenRef.current = slots.length;
  }, [slots]);
  // next item whose key isn't already on screen (recycled cards can come back while still visible)
  const fresh = useCallback((): T | undefined => {
    for (let i = 0; i < 40; i++) {
      const t = next();
      if (t === undefined) return undefined;
      if (!keys.current.has(keyOf(t))) {
        keys.current.add(keyOf(t));
        return t;
      }
    }
    return undefined;
  }, [next, keyOf]);
  const fillTo = useCallback(
    (n: number) => {
      const add: T[] = [];
      while (lenRef.current + add.length < n) {
        const t = fresh();
        if (t === undefined) break;
        add.push(t);
      }
      if (add.length) setSlots((prev) => [...prev, ...add]);
    },
    [fresh]
  );
  const swap = useCallback(
    (key: string, withNext: boolean) => {
      keys.current.delete(key);
      const t = withNext ? fresh() : undefined; // outside the updater: React may run updaters twice in dev
      setSlots((prev) => prev.flatMap((x) => (keyOf(x) === key ? (t === undefined ? [] : [t]) : [x])));
      setLeaving((l) => {
        const n = new Set(l);
        n.delete(key);
        return n;
      });
    },
    [fresh, keyOf]
  );
  const replaceAt = useCallback(
    (key: string) => {
      setLeaving((l) => new Set(l).add(key));
      setTimeout(() => swap(key, true), 340);
    },
    [swap]
  );
  /** Drop an item immediately (e.g. its image failed) and fill the gap. */
  const dropAt = useCallback((key: string) => swap(key, true), [swap]);
  return { slots, leaving, fillTo, replaceAt, dropAt };
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

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const themes = VIBES.filter((v) => IMAGES[v.id]?.length && !v.id.startsWith("h-")); // hobbies have their own chapter
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
  const [picks, setPicks] = useState<Tile[]>([]);
  const [busy, setBusy] = useState(false);
  const cursor = useRef(0);
  const queue = useRef<Tile[]>(tiles);
  const lap = useRef(0);
  const inflight = useRef(0);
  const readyRef = useRef<Tile[]>([]);
  const pickedRef = useRef(picked);
  const wantRef = useRef(want);
  const visibleLen = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // keep a deep buffer of fully-loaded tiles ahead of what's on screen
  const pump = useCallback(() => {
    const available = () => readyRef.current.filter((t) => !pickedRef.current.has(t.id)).length;
    let guard = 0;
    while (inflight.current < 10 && guard++ < 400 && available() + inflight.current < wantRef.current + 160) {
      if (cursor.current >= queue.current.length) {
        // out of fresh tiles: start another lap, shuffled, so the wall never ends
        lap.current++;
        queue.current = [...queue.current, ...shuffled(tiles).map((x) => ({ ...x, key: `${x.key}#${lap.current}` }))];
      }
      const t = queue.current[cursor.current++];
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

  // next fresh, fully-loaded tile whose theme hasn't been picked and which isn't already on screen
  const usedKeys = useRef(new Set<string>());
  const nextTile = useCallback((): Tile | undefined => {
    const t = readyRef.current.find((x) => !usedKeys.current.has(x.key) && !pickedRef.current.has(x.id));
    if (t) usedKeys.current.add(t.key);
    return t;
  }, []);
  const tileKey = useCallback((t: Tile) => t.key, []);
  const { slots, leaving, fillTo, replaceAt, dropAt } = useSlots<Tile>(nextTile, tileKey);

  useEffect(() => {
    fillTo(want);
  }, [ready, want, fillTo]);
  useEffect(() => {
    visibleLen.current = slots.length;
  }, [slots]);
  const exhausted = false; // endless: laps reshuffle everything you haven't picked
  const loadingMore = slots.length < want;

  useNearBottom(sentinel, () => {
    if (visibleLen.current >= wantRef.current - 12) setWant((w) => w + 60);
  });

  const pick = useCallback(
    (t: Tile) => {
      // a picked theme is gone for good, so nothing you already chose ever comes back
      const next = new Set(pickedRef.current).add(t.id);
      pickedRef.current = next;
      setPicked(next);
      setPicks((p) => {
        if (p.length + 1 >= MIN_PICKS) prefetchFeed();
        return [...p, t];
      });
      postLikes([t.id], undefined, "wall");
      replaceAt(t.key);
    },
    [replaceAt]
  );

  /** Changed your mind: the pick is removed from your taste and its theme can come back to the wall. */
  const unpick = useCallback((t: Tile) => {
    const next = new Set(pickedRef.current);
    next.delete(t.id);
    pickedRef.current = next;
    setPicked(next);
    setPicks((p) => p.filter((x) => x.id !== t.id));
    unsend(t.id);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("tp_wall_thumbs", JSON.stringify(picks.slice(-12).map((t) => t.src)));
    } catch {}
  }, [picks]);

  const count = picks.length;
  const canGo = count >= MIN_PICKS;

  const finish = async () => {
    if (!canGo || busy) return;
    setBusy(true);
    await writes.catch(() => {});
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
          {slots.map((t) => (
            <VibeTile key={t.key} tile={t} onPick={pick} leaving={leaving.has(t.key)} onBroken={dropAt} />
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
            {picks.length > 0 && (
              <div className="flex items-center gap-1 mb-2 overflow-hidden" aria-label="Your picks — tap one to undo">
                {[...picks].reverse().slice(0, 12).map((t) => (
                  <button key={t.id} type="button" onClick={() => unpick(t)} title={`Undo ${t.title}`} className="relative shrink-0 group" style={{ animation: "tp-pop .25s ease-out" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.src} alt={t.title} referrerPolicy="no-referrer" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-[var(--hairline)] group-hover:opacity-40 transition" />
                    <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-xs">×</span>
                  </button>
                ))}
                {picks.length <= 3 && <span className="text-[10px] faint ml-1 whitespace-nowrap">tap a pick to undo</span>}
              </div>
            )}
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

const VibeTile = memo(function VibeTile({ tile, onPick, leaving, onBroken }: { tile: Tile; onPick: (t: Tile) => void; leaving: boolean; onBroken: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile)}
      aria-label={tile.title}
      style={{ animation: leaving ? "tp-picked .34s ease-in forwards" : "tp-pop .25s ease-out", contentVisibility: "auto", containIntrinsicSize: "auto 100px" }}
      className={`relative aspect-square rounded-lg sm:rounded-xl overflow-hidden select-none bg-[var(--bg-softer)] transition duration-150 ${leaving ? "pointer-events-none" : "active:scale-90 hover:brightness-110"}`}
    >
      {leaving && <Heart />}
      {/* already preloaded + decoded, so it paints instantly */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tile.src} alt="" referrerPolicy="no-referrer" onError={() => onBroken(tile.key)} className="absolute inset-0 w-full h-full object-cover" />
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
  const history = useRef<TasteCard[]>([]);
  const liked = useRef(new Set<string>());
  const exhausted = false; // endless: when the graph runs dry we replay what you haven't picked, shuffled
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
      const pre = !domainQuery && feedPrefetch ? await feedPrefetch : null;
      if (!domainQuery) feedPrefetch = null;
      let data: FeedResponse;
      if (pre?.cards) data = pre;
      else {
        await ensureSession();
        await writes.catch(() => {}); // the next batch should already know about the last few taps
        data = (await (await fetch(`/api/feed?count=24${domainQuery}`)).json()) as FeedResponse;
      }
      cb.current?.(data.progress, data.mode);
      Object.assign(pools.current, data.pools);
      // dedupe by id and by title (live Qloo cards can twin seed cards)
      const fresh = data.cards.filter((c) => !seen.current.has(c.id) && !seen.current.has(c.title.toLowerCase()));
      fresh.forEach((c) => {
        seen.current.add(c.id);
        seen.current.add(c.title.toLowerCase());
      });
      const withPhoto = fresh.filter((c) => !noPhoto(c));
      const ok = await Promise.all(withPhoto.map((c) => preload(cardImageSrc(c)!, 9000, 320)));
      const good = withPhoto.filter((_, i) => ok[i]);
      emptyStreak.current = good.length === 0 ? emptyStreak.current + 1 : 0;
      if (emptyStreak.current === 2) seen.current.clear(); // supply ran low: let the graph recycle cards you haven't picked
      if (good.length) history.current.push(...good);
      if (emptyStreak.current >= 2) {
        const known = new Set(buffer.current.map((c) => c.id));
        const replay = shuffled(history.current.filter((c) => !liked.current.has(c.id) && !known.has(c.id))).slice(0, 24);
        if (replay.length) {
          buffer.current.push(...replay);
          setTicks((t) => t + 1);
        }
      } // seeds rotate per call, so a few empty batches in a row are normal
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
      if (buffer.current.length < target) fetchBatch();
    }, 350);
    return () => clearInterval(t);
  }, [target, fetchBatch]);

  const take = useCallback((n: number) => buffer.current.splice(0, n), []);
  const buffered = useCallback(() => buffer.current.length, []);
  const markLiked = useCallback((id: string) => liked.current.add(id), []);
  return { take, buffered, pools, exhausted, loading, ticks, markLiked };
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
  const [likes, setLikes] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const src = useCardSource(48, undefined, domains);
  const { take, buffered, exhausted, loading, ticks } = src;

  const likedIds = useRef(new Set<string>());
  const nextCard = useCallback(() => {
    for (let i = 0; i < 40; i++) {
      const c = take(1)[0];
      if (!c) return undefined;
      if (!likedIds.current.has(c.id)) return c;
    }
    return undefined;
  }, [take]);
  const cardKey = useCallback((c: TasteCard) => c.id, []);
  const { slots: cards, leaving, fillTo, replaceAt, dropAt } = useSlots<TasteCard>(nextCard, cardKey);
  const lenRef = useRef(0);
  useEffect(() => {
    lenRef.current = cards.length;
  }, [cards]);

  // fill the first screen as photos land, and add more whenever the user nears the end
  useEffect(() => {
    if (buffered() > 0) fillTo(Math.max(lenRef.current, FIRST_FEED + 4));
  }, [ticks, buffered, fillTo]);
  useNearBottom(sentinel, () => {
    if (buffered() > 0) fillTo(lenRef.current + 12);
  });

  const like = useCallback(
    (card: TasteCard) => {
      likedIds.current.add(card.id);
      src.markLiked(card.id);
      replaceAt(card.id); // only this card leaves; a new one takes its place
      setLikes((n) => n + 1);
      postLikes([card.id], [card], "feed");
    },
    [replaceAt, src]
  );

  const pct = Math.min(100, Math.round((likes / goal) * 100));
  const ready = likes >= goal;

  if (cards.length < FIRST_FEED && !exhausted)
    return (
      <LoadingScreen
        label="Curating your feed…"
        thumbs={wallThumbs()}
        messages={["Reading what you picked…", "Asking the Qloo taste graph about you…", "Finding films, places and food that fit…", "Checking every photo is sharp…", "Almost there…"]}
      />
    );

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
            <FeedCard key={card.id} card={card} pool={src.pools.current[card.id]} onLike={like} leaving={leaving.has(card.id)} onBroken={dropAt} />
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

    </main>
  );
}

const FeedCard = memo(function FeedCard({ card, pool, onLike, leaving, onBroken }: { card: TasteCard; pool?: ExplorationPool; onLike: (c: TasteCard) => void; leaving: boolean; onBroken: (id: string) => void }) {
  const color = domainColor(card.domain);
  return (
    <button
      type="button"
      onClick={() => onLike(card)}
      aria-label={`Love ${card.title}`}
      style={{ animation: leaving ? "tp-picked .34s ease-in forwards" : "tp-pop .25s ease-out", contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}
      className={`relative aspect-[3/4] rounded-2xl overflow-hidden border hairline text-left bg-[var(--bg-softer)] transition duration-150 group ${leaving ? "pointer-events-none" : "active:scale-95"}`}
    >
      {/* preloaded before this card was added, so no pop-in */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cardImageSrc(card)!} alt="" referrerPolicy="no-referrer" onError={() => onBroken(card.id)} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] rounded-full pl-1.5 pr-2 py-0.5 bg-black/60 backdrop-blur-sm text-white/90">
          <span className="domain-dot !w-1.5 !h-1.5" style={{ background: color }} />
          {DOMAIN_NAME[card.domain] ?? card.domain}
        </span>
        {pool && pool !== "exploit" && <span className="text-[9px] rounded-full px-2 py-0.5 bg-black/45 backdrop-blur-sm dim">{POOL_LABEL[pool]}</span>}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3">
        <h3 className="font-display text-base sm:text-lg leading-tight">{card.title}</h3>
        <p className="text-[10px] dim truncate mt-1">{card.tags.slice(0, 3).map(niceTag).join(" · ")}</p>
      </div>
      {!leaving && (
        <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition" aria-hidden>
          ♥
        </span>
      )}
      {leaving && <Heart />}
    </button>
  );
});

/* ====================== PHASE 3 — a story in three chapters ====================== */

type RoundOption = { id: string; title: string; vibe: string; images: string[] };
type Round = { kind: string; prompt: string; context?: string; options: RoundOption[] };

type Chapter = { title: string; blurb: string; kinds: string[] };

const CHAPTERS: Chapter[] = [
  { title: "Your instincts", blurb: "Four at a time. Tap the one that feels most like you.", kinds: ["film", "food", "book", "tv", "food", "film", "book", "tv"] },
  { title: "Sports & hobbies", blurb: "How you'd actually spend a free day.", kinds: Array(8).fill("hobby") },
  { title: "Sharpen", blurb: "Last few, aimed at what we're least sure about.", kinds: Array(6).fill("auto") },
];

/** Options already shown this session, so later rounds never repeat them. */
const shownOptions = new Set<string>();

function Chapters({ onProfile }: { onProfile: () => void }) {
  const [i, setI] = useState(0);
  const [intro, setIntro] = useState(0); // which chapter's intro card is showing (-1 = none)
  const [hearing, setHearing] = useState<string[]>([]);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("tp_chapter") ?? 0);
    if (saved > 0 && saved < CHAPTERS.length) {
      setI(saved);
      setIntro(saved);
    }
  }, []);
  // a one-line read of what we've learned so far, refreshed at each chapter — proof we're listening
  useEffect(() => {
    let live = true;
    writes
      .catch(() => {})
      .then(() => fetch("/api/session", { cache: "no-store" }))
      .then((r) => r.json())
      .then((d: { hearing?: string[] }) => live && setHearing(d.hearing ?? []))
      .catch(() => {});
    if (i === CHAPTERS.length - 1) {
      // warm the taste graph for the results page while the last questions are answered
      const city = window.localStorage.getItem("tp_city");
      writes
        .catch(() => {})
        .then(() => fetch(`/api/taste/recommend${city ? `?city=${encodeURIComponent(city)}` : ""}`))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [i]);
  const ch = CHAPTERS[i];
  const last = i === CHAPTERS.length - 1;
  const finish = () => {
    window.localStorage.removeItem("tp_chapter");
    writes.catch(() => {}).then(onProfile);
  };
  const advance = () => {
    window.scrollTo({ top: 0 });
    if (last) return finish();
    window.localStorage.setItem("tp_chapter", String(i + 1));
    setIntro(i + 1);
    setI(i + 1);
  };
  return (
    <>
      {intro === i && <ChapterIntro n={i + 1} total={CHAPTERS.length} chapter={ch} hearing={hearing} onStart={() => setIntro(-1)} />}
      {/* the first round loads underneath the intro, so it's ready the moment you start */}
      <div className={intro === i ? "hidden" : "contents"}>
        <QuadRound key={i} kinds={ch.kinds} heading={`Chapter ${i + 1} of ${CHAPTERS.length} · ${ch.title}`} blurb={ch.blurb} hearing={hearing} onDone={advance} onSkip={finish} />
      </div>
    </>
  );
}

function ChapterIntro({ n, total, chapter, hearing, onStart }: { n: number; total: number; chapter: Chapter; hearing: string[]; onStart: () => void }) {
  useEffect(() => {
    const t = setTimeout(onStart, 2600);
    return () => clearTimeout(t);
  }, [onStart]);
  return (
    <main className="flex-1 flex items-center justify-center px-6 cursor-pointer" onClick={onStart} style={{ animation: "tp-fade .35s ease-out" }}>
      <div className="text-center max-w-sm">
        <div className="flex justify-center gap-1.5 mb-6">
          {Array.from({ length: total }, (_, k) => (
            <span key={k} className={`h-1 rounded-full transition-all ${k < n ? "w-8 bg-[var(--like)]" : "w-4 bg-[var(--hairline)]"}`} />
          ))}
        </div>
        <p className="text-[0.7rem] uppercase tracking-[0.25em] dim mb-3">
          Chapter {n} of {total}
        </p>
        <h1 className="font-display text-4xl sm:text-5xl mb-3">{chapter.title}</h1>
        <p className="dim mb-6">{chapter.blurb}</p>
        {hearing.length > 0 && (
          <div className="mb-7">
            <p className="text-xs faint mb-2">So far we&apos;re hearing</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {hearing.map((h) => (
                <span key={h} className="text-sm border hairline rounded-full px-3 py-1">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
        <button className="btn-primary text-sm" onClick={onStart}>
          Start →
        </button>
      </div>
    </main>
  );
}

/** Tries each candidate photo in order and keeps the first that is genuinely sharp. */
async function firstGoodImage(o: RoundOption): Promise<string | null> {
  for (const src of o.images) if (await preload(src, 7000, 380)) return src;
  return null;
}

/**
 * Four-way "which pulls you?". Each round is built for this person on the server (same kind of thing
 * in every option, different moods) one step ahead, so it already knows the choice made just before.
 * The pick counts strongly and the three passed over count lightly against, so every answer is relative.
 */
function QuadRound({ kinds, heading, blurb, hearing, onDone, onSkip }: { kinds: string[]; heading: string; blurb: string; hearing: string[]; onDone: () => void; onSkip: () => void }) {
  type Shown = { opt: RoundOption; src: string };
  type Ready = { round: Round; shown: Shown[] };
  const cache = useRef(new Map<number, Promise<Ready | null>>());
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<Ready | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  /** Ask the server for round n on top of every choice sent so far, and keep only sharp photos. */
  const build = useCallback(
    async (n: number, avoid: string[] = []): Promise<Ready | null> => {
      if (n >= kinds.length) return null;
      await writes.catch(() => {}); // build on the latest choices
      for (let attempt = 0; attempt < 2; attempt++) {
        const exclude = [...shownOptions, ...avoid].join(",");
        const data = (await fetch(`/api/taste/rounds?kinds=${kinds[n]}&offset=${n + attempt}${exclude ? `&exclude=${exclude}` : ""}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null)) as { rounds?: Round[] } | null;
        const round = data?.rounds?.[0];
        if (!round) return null;
        const checked = await Promise.all(round.options.map(async (opt) => ({ opt, src: await firstGoodImage(opt) })));
        const good = checked.filter((x): x is Shown => !!x.src).slice(0, 4);
        if (good.length >= 3) return { round, shown: good }; // otherwise ask once more for fresh options
        avoid = [...avoid, ...round.options.map((o) => o.id)];
      }
      return null;
    },
    [kinds]
  );

  const load = useCallback(
    (n: number): Promise<Ready | null> => {
      const hit = cache.current.get(n);
      if (hit) return hit;
      const p = build(n);
      cache.current.set(n, p);
      return p;
    },
    [build]
  );

  const show = useCallback(
    async (n: number) => {
      for (let k = n; k < kinds.length; k++) {
        const v = await load(k);
        if (!v) continue; // couldn't muster three sharp options — skip this one
        v.shown.forEach((x) => shownOptions.add(x.opt.id)); // only what was actually on screen is "seen"
        setChosen(null);
        setIdx(k);
        setView(v);
        load(k + 1);
        return;
      }
      onDone();
    },
    [kinds, load, onDone]
  );

  useEffect(() => {
    let live = true;
    load(0).then(() => {
      if (live) show(0);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: string) => {
    if (chosen || !view) return;
    setChosen(id);
    const passed = view.shown.map((x) => x.opt.id).filter((x) => x !== id);
    send({ ids: [id], strength: 1.6, passed, source: `round:${view.round.kind}` });
    rebuildNext();
    setTimeout(() => show(idx + 1), 380);
  };
  const noneOfThese = () => {
    if (chosen || !view) return;
    setChosen("none");
    send({ ids: view.shown.map((x) => x.opt.id), interaction: "dislike", strength: 0.4, source: `round:${view.round.kind}:none` });
    rebuildNext();
    setTimeout(() => show(idx + 1), 200);
  };
  /**
   * The next round was prefetched before this answer existed. Rebuild it on top of the answer (build()
   * waits for the write); if that takes longer than a beat, the prefetched round is shown instead.
   */
  const rebuildNext = () => {
    const next = idx + 1;
    const prefetched = load(next);
    const fresh = build(next);
    const beat = new Promise<null>((r) => setTimeout(() => r(null), 1200));
    cache.current.set(
      next,
      Promise.race([fresh, beat]).then(async (v) => v ?? (await prefetched))
    );
  };

  if (!view) return <LoadingScreen label="Choosing options for you…" thumbs={wallThumbs()} messages={["Choosing options for you…", "Making sure each one is a real choice…"]} />;
  const { round, shown } = view;
  const subline = round.context ?? (idx === 0 && hearing.length ? `So far we're hearing: ${hearing.join(" · ")}` : blurb);
  return (
    <main className="flex-1 flex flex-col px-3 sm:px-8 pt-4 pb-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <Steps current={2} />
        <button onClick={onSkip} className="text-xs dim underline underline-offset-4 hover:text-[var(--ink)] whitespace-nowrap">
          Skip to my profile →
        </button>
      </div>
      <p className="text-xs dim mt-3">{heading}</p>
      <h1 className="font-display text-2xl sm:text-3xl mt-1">{round.prompt}</h1>
      <p className="dim text-sm mt-1 mb-4">{subline}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {shown.map(({ opt, src }) => (
          <button
            key={`${idx}-${opt.id}`}
            type="button"
            onClick={() => choose(opt.id)}
            aria-label={opt.title}
            style={{ animation: "tp-pop .25s ease-out" }}
            className={`relative aspect-[4/5] rounded-2xl overflow-hidden border hairline transition duration-300 ${chosen ? (chosen === opt.id ? "scale-[1.03]" : "opacity-20 scale-95") : "active:scale-95"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-12">
              <p className="font-display text-base sm:text-lg leading-tight">{opt.title}</p>
              {opt.vibe && <p className="text-[10px] dim mt-0.5 truncate">{opt.vibe}</p>}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button onClick={noneOfThese} disabled={!!chosen} className="btn-ghost !text-xs !py-1.5 !px-3 whitespace-nowrap disabled:opacity-40">
          None of these
        </button>
        <div className="flex-1 h-1 rounded-full bg-[var(--hairline)] overflow-hidden">
          <div className="h-full bg-[var(--like)] transition-all duration-300" style={{ width: `${(idx / Math.max(1, kinds.length)) * 100}%` }} />
        </div>
        <span className="text-xs dim whitespace-nowrap">
          {idx + 1} / {kinds.length}
        </span>
      </div>
    </main>
  );
}
