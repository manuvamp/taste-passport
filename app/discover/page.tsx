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

/**
 * Calls `fn` whenever the sentinel is within `margin` px of the viewport — or while it isn't
 * mounted yet (loading screen), so the first batch keeps loading. Scroll + short poll.
 */
function useNearBottom(ref: React.RefObject<HTMLElement | null>, fn: () => void, margin = 1400) {
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
    const t = setInterval(check, 500);
    return () => {
      window.removeEventListener("scroll", check);
      clearInterval(t);
    };
  }, [ref, margin]);
}

export default function Discover() {
  const router = useRouter();
  const [phase, setPhase] = useState<"vibes" | "curated" | null>(null);

  useEffect(() => {
    setPhase(window.localStorage.getItem("tp_vibes_done") === "1" ? "curated" : "vibes");
  }, []);

  if (!phase) return <main className="flex-1" />;
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

type Tile = { key: string; id: string; title: string; src: string };

/** Every photo of every theme, ordered so the same theme/domain never clusters. */
function buildTiles(): Tile[] {
  const themes = VIBES.filter((v) => IMAGES[v.id]?.length);
  const buckets = new Map<string, typeof themes>();
  for (const v of themes) buckets.set(v.domain, [...(buckets.get(v.domain) ?? []), v]);
  const lists = [...buckets.values()].sort((a, b) => b.length - a.length);
  const ordered: typeof themes = [];
  for (let i = 0; ordered.length < themes.length; i++) for (const l of lists) if (l[i]) ordered.push(l[i]);
  const out: Tile[] = [];
  for (let r = 0; r < 12; r++)
    for (const v of ordered) {
      const src = IMAGES[v.id][r];
      if (src) out.push({ key: `${v.id}~${r}`, id: v.id, title: v.title, src });
    }
  return out;
}

const FIRST_SCREEN = 60;

function VibeWall({ onDone }: { onDone: () => void }) {
  const tiles = useMemo(buildTiles, []);
  const [ready, setReady] = useState<Tile[]>([]);
  const [want, setWant] = useState(100); // how many tiles the wall should currently show
  const [taken, setTaken] = useState<Set<string>>(new Set()); // tile keys already picked (removed)
  const [picks, setPicks] = useState<string[]>([]); // theme ids picked
  const [busy, setBusy] = useState(false);
  const cursor = useRef(0);
  const inflight = useRef(0);
  const loaded = useRef(0);
  const takenCount = useRef(0);
  const wantRef = useRef(want);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // keep a buffer of fully-loaded tiles ahead of what's visible
  const pump = useCallback(() => {
    while (inflight.current < 8 && cursor.current < tiles.length && loaded.current < wantRef.current + takenCount.current + 40) {
      const t = tiles[cursor.current++];
      inflight.current++;
      preload(t.src).then((ok) => {
        inflight.current--;
        if (ok) {
          loaded.current++;
          setReady((r) => [...r, t]);
        }
        pump();
      });
    }
  }, [tiles]);

  useEffect(() => {
    wantRef.current = want;
    takenCount.current = taken.size;
    pump();
  }, [want, taken, pump]);

  const visible = useMemo(() => ready.filter((t) => !taken.has(t.key)).slice(0, want), [ready, taken, want]);
  const exhausted = cursor.current >= tiles.length && inflight.current === 0;

  useNearBottom(sentinel, () => setWant((w) => (w < ready.length - taken.size + 40 ? w + 40 : w)));

  const pick = useCallback((t: Tile) => {
    // tile disappears; the next preloaded one slides into its place
    setTaken((s) => new Set(s).add(t.key));
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
        <h1 className="font-display text-2xl sm:text-3xl">Tap what feels like you.</h1>
        <p className="dim text-sm mt-1">
          Each pick swaps in a new picture. Choose {MIN_PICKS}–{IDEAL_PICKS} you&apos;d love — keep scrolling for more.
        </p>
      </div>

      <div className="px-2 sm:px-8 pb-36 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 sm:gap-2">
          {visible.map((t) => (
            <VibeTile key={t.key} tile={t} onPick={pick} />
          ))}
        </div>
        <div ref={sentinel} className="h-10" />
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
      <img src={tile.src} alt="" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 px-1.5 pt-4 pb-1 text-[10px] sm:text-[11px] leading-tight font-medium bg-gradient-to-t from-black/80 to-transparent line-clamp-2">
        {tile.title}
      </span>
    </button>
  );
});

/* ====================== PHASE 2 — curated infinite feed ====================== */

// Cards whose lead photo is a portrait are dropped: no faces, and no image-less cards.
const PORTRAIT_IDS = new Set(["kusama", "banksy", "basquiat", "kahlo", "murakami-takashi", "olafur-eliasson", "yohji-yamamoto", "vivienne-westwood", "rick-owens", "margiela"]);
const noPhoto = (c: TasteCard) => c.domain === "music" || PORTRAIT_IDS.has(c.id) || !cardImageSrc(c);

const FIRST_FEED = 8;

function CuratedFeed({ onProfile }: { onProfile: () => void }) {
  const [cards, setCards] = useState<TasteCard[]>([]);
  const [pools, setPools] = useState<Record<string, ExplorationPool>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState("mock");
  const [done, setDone] = useState(false);
  const fetching = useRef(false);
  const emptyStreak = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const seen = useRef(new Set<string>());

  const loadMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      await fetch("/api/session", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/feed?count=20");
      const data = (await res.json()) as FeedResponse;
      setProgress(data.progress);
      setMode(data.mode);
      setPools((prev) => ({ ...prev, ...data.pools }));
      // dedupe by id and by title (live Qloo cards can twin seed cards)
      const fresh = data.cards.filter((c) => !seen.current.has(c.id) && !seen.current.has(c.title.toLowerCase()));
      fresh.forEach((c) => {
        seen.current.add(c.id);
        seen.current.add(c.title.toLowerCase());
      });
      if (data.cards.length === 0) {
        setDone(true);
        return;
      }
      // only cards whose photo is fully loaded ever reach the screen
      const withPhoto = fresh.filter((c) => !noPhoto(c));
      const ok = await Promise.all(withPhoto.map((c) => preload(cardImageSrc(c)!)));
      const shown = withPhoto.filter((_, i) => ok[i]);
      emptyStreak.current = shown.length === 0 ? emptyStreak.current + 1 : 0;
      if (emptyStreak.current >= 5) setDone(true);
      if (shown.length) setCards((prev) => [...prev, ...shown]);
    } catch {
      // transient: the next near-bottom check retries
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // keep fetching until the first screen is full, and whenever the user nears the end
  useNearBottom(sentinel, () => !done && loadMore());

  const like = useCallback((card: TasteCard) => {
    // positive-only: card disappears, the next one slides in
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    postLikes([card.id]).then((p) => p && setProgress(p));
  }, []);

  const decisive = progress?.decisive ?? 0;
  const pct = Math.round((progress?.confidence ?? 0) * 100);

  if (cards.length < FIRST_FEED && !done) return <LoadingScreen label="Curating your feed…" />;

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
        <p className="text-center dim text-sm mb-4">Tap what you love — it swaps for something new. Keep scrolling for more.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {cards.map((card) => (
            <FeedCard key={card.id} card={card} pool={pools[card.id]} onLike={like} />
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
      <img src={cardImageSrc(card)!} alt="" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
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
