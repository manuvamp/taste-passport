"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { TasteProfile } from "@/lib/types";
import type { RecSection } from "@/lib/taste/recommend";
import { domainColor } from "@/components/domain";
import { ConnectAgent } from "@/components/connect-agent";

const DOMAIN_LABEL: Record<string, string> = {
  food: "Food & drink",
  travel: "Places",
  film: "Film",
  tv: "Series",
  book: "Books",
  game: "Games",
  architecture: "Spaces",
  art: "Art",
  fashion: "Fashion",
  brand: "Brands & objects",
  lifestyle: "Lifestyle",
  music: "Music",
};

/** "japanese-food" → "Japanese food", "sci-fi" → "sci fi" */
const PROPER = /^(japanese|french|italian|nordic|korean|moroccan|danish|turkish|mexican|cuban|himalayan|american|british|chinese|indian|thai|greek|spanish|persian|african|latin|brazilian|german|dutch|soviet|colombian)$/;
const niceTag = (t: string) => {
  const w = t.endsWith("-food") ? t.slice(0, -5) : t;
  const cap = t.endsWith("-food") || PROPER.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  return t.endsWith("-food") ? `${cap} food` : cap.replace(/-/g, " ");
};

/** Where a recommendation goes when tapped: a web search scoped to its kind (and city, for places). */
function lookUp(i: { title: string; subtitle?: string }, section: string, city: string): string {
  const kind: Record<string, string> = { films: "film", series: "tv series", games: "video game", books: "book", artists: "music", podcasts: "podcast", brands: "brand", places: "travel", eat: city, do: city };
  const extra = kind[section] ?? "";
  return `https://www.google.com/search?q=${encodeURIComponent(`${i.title} ${extra}`.trim())}`;
}

type Item = { cardId: string; title: string; domain: string; imageUrl: string; kind: "pick" | "suggest"; why?: string[] };

async function tweak(action: "remove" | "boost", cardId: string) {
  await fetch("/api/taste/tweak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, cardId }) }).catch(() => {});
}

const TABS = [
  { id: "top", label: "Top picks" },
  { id: "watch", label: "Watch & play" },
  { id: "read", label: "Read & listen" },
  { id: "go", label: "Go & eat" },
  { id: "own", label: "Brands" },
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [boosted, setBoosted] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("top");
  const [recs, setRecs] = useState<RecSection[] | null>(null);
  const [city, setCity] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [show, setShow] = useState<"all" | "pick" | "suggest">("all");
  const [shared, setShared] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);

  const load = useCallback(() => {
    return fetch("/api/taste/profile", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "no profile");
        return r.json();
      })
      .then((p: TasteProfile) => setProfile(p))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    try {
      setThumbs(JSON.parse(window.localStorage.getItem("tp_wall_thumbs") ?? "[]") as string[]);
      const c = window.localStorage.getItem("tp_city") ?? "";
      setCity(c);
      setCityDraft(c);
    } catch {}
  }, [load]);

  const hasProfile = !!profile;
  // recommendations come straight from the Qloo graph, seeded by what we've learned
  useEffect(() => {
    if (!hasProfile) return;
    let live = true;
    fetch(`/api/taste/recommend${city ? `?city=${encodeURIComponent(city)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setRecs(d.sections ?? []))
      .catch(() => live && setRecs([]));
    return () => {
      live = false;
    };
  }, [city, hasProfile]);

  const remove = async (cardId: string) => {
    setHidden((h) => new Set(h).add(cardId));
    setOpen(null);
    await tweak("remove", cardId);
    load();
  };
  const boost = async (cardId: string) => {
    setBoosted((b) => new Set(b).add(cardId));
    await tweak("boost", cardId);
    load();
  };
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const restart = (from: "vibes" | "feed" | "deeper") => {
    const ls = window.localStorage;
    if (from === "vibes") ls.removeItem("tp_vibes_done");
    if (from === "vibes" || from === "feed") {
      ls.removeItem("tp_feed_done");
      ls.removeItem("tp_chapter");
    }
    if (from === "feed") ls.setItem("tp_vibes_done", "1");
    if (from === "deeper") {
      ls.setItem("tp_feed_done", "1");
      ls.removeItem("tp_chapter");
    }
    router.push("/discover");
  };

  const picks: Item[] = useMemo(() => (profile?.gallery ?? []).filter((g) => !hidden.has(g.cardId)).map((g) => ({ ...g, kind: "pick" as const })), [profile, hidden]);
  const suggestions: Item[] = useMemo(() => {
    const have = new Set(picks.map((p) => p.cardId));
    return (profile?.suggestions ?? []).filter((g) => !hidden.has(g.cardId) && !have.has(g.cardId)).map((g) => ({ ...g, kind: "suggest" as const }));
  }, [profile, hidden, picks]);

  const board: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (let i = 0, j = 0; i < picks.length || j < suggestions.length; ) {
      if (i < picks.length) out.push(picks[i++]);
      if (j < suggestions.length) out.push(suggestions[j++]);
      if (i < picks.length) out.push(picks[i++]);
    }
    return out;
  }, [picks, suggestions]);
  const domainsPresent = useMemo(() => [...new Set(board.map((i) => i.domain))], [board]);
  const shown = board.filter((i) => (filter === "all" || i.domain === filter) && (show === "all" || i.kind === show));

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-3xl mb-3">Your taste isn&apos;t learned yet</p>
          <p className="dim mb-2 max-w-sm mx-auto">{error}</p>
          <p className="dim text-sm mb-8">Pick a few things you love and it takes shape.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/discover" className="btn-primary text-sm">
              Build my taste →
            </Link>
            <Link href="/demo" className="btn-ghost text-sm">
              Load a demo persona
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          {thumbs.length >= 4 ? (
            <div className="grid grid-cols-3 gap-1.5 w-40 mx-auto mb-6">
              {thumbs.slice(0, 9).map((src, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" referrerPolicy="no-referrer" className="aspect-square w-full rounded-lg object-cover slow-pulse" style={{ animationDelay: `${(k % 3) * 0.25 + Math.floor(k / 3) * 0.25}s` }} />
              ))}
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin mx-auto mb-5" />
          )}
          <p className="dim">Reading your taste…</p>
          <p className="faint text-xs mt-1">Finding the threads that run through your picks</p>
        </div>
      </main>
    );
  }

  const day = profile.day ?? [];
  const maxTag = Math.max(...profile.inferredTags.map((t) => t.weight), 1);
  const domains = Object.entries(profile.domainPreferences).sort((a, b) => b[1] - a[1]);
  const collage = picks.slice(0, 18);
  const sectionsFor = (group: string) => (recs ?? []).filter((s) => s.group === group);
  const topLive = (recs ?? []).find((s) => s.id === "top")?.items ?? [];

  /** A shareable one-paragraph read of your taste (native share sheet on phones, clipboard elsewhere). */
  const share = async () => {
    const lines = [
      `My taste: ${profile.archetype.name}${profile.archetype.secondary ? ` (with a ${profile.archetype.secondary.replace(/^The /, "")} streak)` : ""}.`,
      ...(profile.threads ?? []).slice(0, 3).map((t) => `${t.label}: ${t.items.slice(0, 3).join(", ")}`),
      `Built with Taste Passport — ${window.location.origin}`,
    ];
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "My Taste Passport", text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {}
  };

  const saveCity = () => {
    const c = cityDraft.trim();
    try {
      window.localStorage.setItem("tp_city", c);
    } catch {}
    setRecs(null);
    setCity(c);
  };

  return (
    <main className="flex-1 pb-24">
      {/* hero over a collage of what you picked */}
      <section className="relative overflow-hidden mb-6">
        <div className="absolute inset-0 grid grid-cols-6 sm:grid-cols-9 gap-1 opacity-30" aria-hidden>
          {collage.map((g) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={g.cardId} src={g.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full aspect-square object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)]/30 via-[var(--bg)]/80 to-[var(--bg)]" />
        <div className="relative px-5 sm:px-8 pt-8 pb-6 max-w-3xl mx-auto text-center">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="font-display text-4xl sm:text-6xl mb-3">
            {profile.archetype.name}
          </motion.h1>
          {profile.archetype.secondary && <p className="text-sm dim -mt-1 mb-3">with a {profile.archetype.secondary.replace(/^The /, "")} streak</p>}
          <p className="dim max-w-xl mx-auto leading-relaxed">{profile.narrative}</p>
          <p className="text-xs mt-3 max-w-lg mx-auto italic opacity-60">{profile.archetype.description}</p>
          <div className="mt-4 inline-flex items-center gap-3 text-xs dim border hairline rounded-full px-4 py-2 bg-[var(--bg)]/60">
            <span>{profile.interactionCount} signals</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{domains.length} worlds</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{Math.round(profile.confidence * 100)}% mapped</span>
          </div>
          <div className="mt-4">
            <button onClick={share} className="btn-ghost !text-xs !py-2 !px-4 bg-[var(--bg)]/60">
              {shared ? "Copied — paste it anywhere" : "Share my taste"}
            </button>
          </div>
        </div>
      </section>

      {/* traits */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-8">
        <div className="flex h-2 rounded-full overflow-hidden mb-2">
          {domains.map(([d, w]) => (
            <div key={d} style={{ width: `${w * 100}%`, background: domainColor(d) }} title={`${DOMAIN_LABEL[d] ?? d} ${Math.round(w * 100)}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs dim mb-4">
          {domains.slice(0, 6).map(([d, w]) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="domain-dot" style={{ background: domainColor(d) }} />
              {DOMAIN_LABEL[d] ?? d} <span className="faint">{Math.round(w * 100)}%</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.inferredTags.slice(0, 12).map((t) => (
            <span key={t.tag} className="text-sm border hairline rounded-full px-3 py-1" style={{ opacity: 0.45 + 0.55 * Math.sqrt(t.weight / maxTag) }}>
              {niceTag(t.tag)}
            </span>
          ))}
        </div>
      </section>

      {/* threads: the themes you kept coming back to, with the real picks behind each */}
      {(profile.threads?.length ?? 0) > 0 && (
        <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
          <h2 className="text-sm uppercase tracking-[0.18em] dim mb-4">What you kept coming back to</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {profile.threads!.map((t) => (
              <div key={t.tag} className="panel-soft p-4 flex gap-3 items-center">
                <div className="flex -space-x-3 shrink-0">
                  {t.items.slice(0, 3).map((title) => {
                    const g = picks.find((p) => p.title === title);
                    return g ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={title} src={g.imageUrl} alt="" referrerPolicy="no-referrer" className="w-11 h-11 rounded-full object-cover border-2 border-[var(--bg)]" />
                    ) : null;
                  })}
                </div>
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight capitalize">{t.label}</p>
                  <p className="text-xs dim truncate">{t.items.join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
          {(profile.hobbies?.length ?? 0) > 0 && (
            <p className="text-sm dim mt-4">
              <span className="text-[var(--ink)]">How you spend your time:</span> {profile.hobbies!.map((h) => h.title).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* made for you */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-14">
        <h2 className="font-display text-2xl sm:text-3xl">Made for you</h2>
        <p className="dim text-sm mt-1 mb-4 max-w-xl">Picked from the Qloo taste graph around what you chose. Tap anything to look it up.</p>
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-sm whitespace-nowrap rounded-full px-4 py-2 border ${tab === t.id ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "hairline dim"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "top" &&
          (topLive.length >= 6 ? (
            <RecRow s={{ id: "top", group: "top", title: "", kicker: "", items: topLive }} bare />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {suggestions.slice(0, 18).map((g) => (
                <BoardTile key={g.cardId} g={g} open={open} setOpen={setOpen} boosted={boosted} boost={boost} remove={remove} hide={hide} />
              ))}
            </div>
          ))}
        {tab === "top" && topLive.length >= 6 && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.18em] dim mb-2">From your picks — tap to say yes or no</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {suggestions.slice(0, 12).map((g) => (
                <BoardTile key={g.cardId} g={g} open={open} setOpen={setOpen} boosted={boosted} boost={boost} remove={remove} hide={hide} />
              ))}
            </div>
          </div>
        )}

        {tab !== "top" && (
          <div className="space-y-8">
            {tab === "go" && (
              <div className="flex gap-2 items-center">
                <input
                  value={cityDraft}
                  onChange={(e) => setCityDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveCity()}
                  placeholder="Your city — for restaurants & things to do"
                  className="flex-1 bg-transparent border hairline rounded-full px-4 py-2 text-sm outline-none focus:border-[var(--ink)]"
                />
                <button onClick={saveCity} className="btn-primary !text-sm !py-2 !px-4">
                  {city ? "Update" : "Set"}
                </button>
              </div>
            )}
            {recs === null ? (
              <div className="space-y-8" aria-label="Loading recommendations">
                {[0, 1].map((r) => (
                  <div key={r}>
                    <div className="h-5 w-48 rounded bg-[var(--bg-softer)] mb-3 animate-pulse" />
                    <div className="flex gap-3 overflow-hidden">
                      {Array.from({ length: 6 }, (_, k) => (
                        <div key={k} className="shrink-0 w-36 sm:w-44 aspect-[3/4] rounded-2xl bg-[var(--bg-softer)] animate-pulse" />
                      ))}
                    </div>
                  </div>
                ))}
                <p className="dim text-xs">Asking the taste graph about you…</p>
              </div>
            ) : (
              <>
                {sectionsFor(tab).map((s) => (
                  <RecRow key={s.id} s={s} city={city} />
                ))}
                {sectionsFor(tab).length === 0 && <p className="dim text-sm">Nothing here yet — keep sharpening below and this fills in.</p>}
              </>
            )}
          </div>
        )}
      </section>

      {/* a day made for you, assembled from what we think you'd love */}
      {day.length >= 3 && (
        <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
          <h2 className="text-sm uppercase tracking-[0.18em] dim mb-4">A day made for you</h2>
          <div className={`grid grid-cols-2 gap-3 ${day.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
            {day.map((d) => (
              <div key={d.slot} data-tile className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-[var(--bg-softer)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.imageUrl} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.closest("[data-tile]") as HTMLElement | null)?.style.setProperty("display", "none"))} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <div className="absolute top-2.5 left-2.5 text-[10px] uppercase tracking-[0.18em] rounded-full px-2 py-0.5 bg-black/55 backdrop-blur-sm">{d.slot}</div>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-display text-base leading-tight">{d.title}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{d.why.length ? `Because you picked ${d.why[0]}` : d.line}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* outside your usual: cross-domain jumps, each grounded in what you picked */}
      {profile.unexpectedConnections.length > 0 && (
        <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
          <h2 className="text-sm uppercase tracking-[0.18em] dim mb-4">Outside your usual — but very you</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {profile.unexpectedConnections.slice(0, 4).map((u) => (
              <div key={u.title} className="panel-soft p-3 flex gap-3 items-start">
                {u.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.imageUrl} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} className="w-16 h-20 rounded-lg object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-display text-base leading-tight">{u.title}</p>
                  <p className="text-xs dim mt-1 leading-snug">{u.reason}</p>
                  <p className="text-[10px] dim mt-1.5 uppercase tracking-[0.14em]">{u.source === "qloo" ? "Qloo live graph" : "local inference"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* taste signature: where you sit on five spectrums */}
      {profile.axes && (
        <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
          <h2 className="text-sm uppercase tracking-[0.18em] dim mb-4">Your taste signature</h2>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">
            {profile.axes.map((a) => (
              <div key={a.left}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className={a.value < 0.45 ? "text-[var(--ink)]" : "dim"}>{a.left}</span>
                  <span className={a.value > 0.55 ? "text-[var(--ink)]" : "dim"}>{a.right}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-[var(--hairline)]">
                  <motion.div
                    className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--like)] shadow"
                    initial={{ left: "50%" }}
                    animate={{ left: `${Math.round(a.value * 100)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* your picks — one row, full editor behind "view all" */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm uppercase tracking-[0.18em] dim">What you picked</h2>
          <button onClick={() => setEditing(true)} className="text-sm underline underline-offset-4 hover:text-[var(--ink)] dim">
            View all &amp; edit ({picks.length}) →
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {picks.slice(0, 16).map((g) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={g.cardId} src={g.imageUrl} alt={g.title} referrerPolicy="no-referrer" className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover" />
          ))}
        </div>
      </section>

      {/* keep sharpening */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-14">
        <h2 className="font-display text-2xl">Keep sharpening it</h2>
        <p className="dim text-sm mt-1 mb-4">The more you add, the better any agent knows you.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { k: "vibes" as const, t: "More vibes", d: "Another pass at the picture wall." },
            { k: "feed" as const, t: "Back to your feed", d: "Endless picks tuned to what you've liked." },
            { k: "deeper" as const, t: "Retake the chapters", d: "Instincts, hobbies and a final sharpen." },
          ].map((s) => (
            <button key={s.k} onClick={() => restart(s.k)} className="panel p-5 text-left hover:border-[var(--ink)] transition-colors">
              <p className="font-display text-lg">{s.t}</p>
              <p className="dim text-xs mt-1">{s.d}</p>
            </button>
          ))}
        </div>
      </section>

      {/* connect + data */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl">Give this to your AI</h2>
        <p className="dim text-sm mt-1 mb-4">Connect your taste to an agent so it recommends like it knows you.</p>
        <div className="max-w-3xl">
          <ConnectAgent />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/agent?q=Plan%20my%20Saturday%20in%20Tokyo" className="btn-primary text-sm">
            Try it: plan my Saturday →
          </Link>
          <Link href="/agent?q=Find%20me%20a%20restaurant%20in%20Lisbon" className="btn-ghost text-sm">
            Find me a restaurant
          </Link>
        </div>
        <div className="mt-8 pt-6 border-t hairline flex flex-wrap gap-5 text-xs dim">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "taste-profile.json";
              a.click();
            }}
            className="underline underline-offset-4 hover:text-[var(--ink)]"
          >
            Export profile JSON
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete all taste signals for this session?")) return;
              await fetch("/api/taste/profile", { method: "DELETE" });
              ["tp_vibes_done", "tp_feed_done", "tp_chapter"].forEach((k) => window.localStorage.removeItem(k));
              router.push("/");
            }}
            className="underline underline-offset-4 hover:text-red-300"
          >
            Clear my profile
          </button>
          <span>Private by default · anonymous session</span>
        </div>
      </section>

      {/* full editor */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[var(--bg)] overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl sm:text-3xl">Edit your taste</h2>
              <button onClick={() => setEditing(false)} className="btn-primary !text-sm !py-2 !px-4">
                Done
              </button>
            </div>
            <p className="dim text-sm mb-4 max-w-xl">Tap any picture — boost or remove what you picked, and say yes or no to what we think you&apos;ll love. Your profile updates instantly.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(["all", "pick", "suggest"] as const).map((k) => (
                <button key={k} onClick={() => setShow(k)} className={`text-xs rounded-full px-3 py-1.5 border ${show === k ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "hairline dim"}`}>
                  {k === "all" ? "Everything" : k === "pick" ? "You picked" : "We think you'd love"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-3 mb-3 [scrollbar-width:none]">
              {["all", ...domainsPresent].map((d) => (
                <button key={d} onClick={() => setFilter(d)} className={`text-xs whitespace-nowrap rounded-full px-3 py-1.5 border ${filter === d ? "border-[var(--ink)]" : "hairline dim"}`}>
                  {d === "all" ? "All" : DOMAIN_LABEL[d] ?? d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {shown.map((g) => (
                <BoardTile key={g.cardId} g={g} open={open} setOpen={setOpen} boosted={boosted} boost={boost} remove={remove} hide={hide} />
              ))}
            </div>
            {shown.length === 0 && <p className="dim text-sm">Nothing here.</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function BoardTile({
  g,
  open,
  setOpen,
  boosted,
  boost,
  remove,
  hide,
}: {
  g: Item;
  open: string | null;
  setOpen: (id: string | null) => void;
  boosted: Set<string>;
  boost: (id: string) => void;
  remove: (id: string) => void;
  hide: (id: string) => void;
}) {
  return (
    <div data-tile className="relative aspect-square rounded-xl overflow-hidden bg-[var(--bg-softer)]">
      <button type="button" onClick={() => setOpen(open === g.cardId ? null : g.cardId)} className="absolute inset-0 w-full h-full" aria-label={g.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.imageUrl} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.closest("[data-tile]") as HTMLElement | null)?.style.setProperty("display", "none"))} className="w-full h-full object-cover" />
      </button>
      {g.kind === "suggest" && <span className="absolute top-1 left-1 text-[9px] rounded-full px-1.5 py-0.5 bg-black/60 backdrop-blur-sm">for you</span>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6 pointer-events-none">
        <p className="text-[10px] leading-tight truncate">{g.title}</p>
      </div>
      {open === g.cardId && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col justify-center gap-1.5 p-2">
          {g.kind === "suggest" && g.why && g.why.length > 0 && <p className="text-[9px] dim leading-tight text-center">Because {g.why.slice(0, 2).join(" & ")}</p>}
          <button
            onClick={() => {
              boost(g.cardId);
              setOpen(null);
            }}
            disabled={boosted.has(g.cardId)}
            className="btn-primary !text-[11px] !py-1.5 !px-2 disabled:opacity-50"
          >
            {g.kind === "suggest" ? "Yes, add it" : boosted.has(g.cardId) ? "Boosted" : "More like this"}
          </button>
          <button
            onClick={() => {
              if (g.kind === "pick") remove(g.cardId);
              else {
                hide(g.cardId);
                setOpen(null);
              }
            }}
            className="btn-ghost !text-[11px] !py-1.5 !px-2"
          >
            {g.kind === "pick" ? "Remove" : "Not for me"}
          </button>
        </div>
      )}
    </div>
  );
}

function whyLine(i: RecSection["items"][number], long = false): string | null {
  if (i.why.length) return `Because you picked ${(long ? i.why.slice(0, 2) : i.why.slice(0, 1)).join(" & ")}`;
  if (i.near?.length) return `Close to ${i.near[0]}`;
  return null;
}

function RecRow({ s, bare, city = "" }: { s: RecSection; bare?: boolean; city?: string }) {
  return (
    <div>
      {!bare && <h3 className="font-display text-xl">{s.title}</h3>}
      {!bare && <p className="dim text-xs mb-3">{s.kicker}</p>}
      {s.items.length === 0 ? (
        <p className="dim text-sm">Add your city above to see these.</p>
      ) : (
        <div className={bare ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" : "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"}>
          {s.items.map((i) =>
            i.imageUrl ? (
              <a key={i.title} href={lookUp(i, s.id, city)} target="_blank" rel="noopener noreferrer" data-tile className={`group relative block ${bare ? "" : "shrink-0 w-36 sm:w-44"} aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--bg-softer)] hover:ring-1 hover:ring-[var(--ink-dim)] transition`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.imageUrl} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.closest("[data-tile]") as HTMLElement | null)?.style.setProperty("display", "none"))} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-display text-sm leading-tight">{i.title}</p>
                  {i.subtitle && <p className="text-[10px] dim truncate mt-0.5">{i.subtitle}</p>}
                  {whyLine(i) && <p className="text-[10px] opacity-75 truncate mt-0.5">{whyLine(i)}</p>}
                </div>
                <span className="absolute top-2 right-2 text-[10px] rounded-full px-2 py-0.5 bg-black/55 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition">Look up ↗</span>
              </a>
            ) : (
              <a key={i.title} href={lookUp(i, s.id, city)} target="_blank" rel="noopener noreferrer" className={`${bare ? "" : "shrink-0 w-44 sm:w-52"} rounded-2xl border hairline p-4 flex flex-col hover:border-[var(--ink-dim)] transition`}>
                <p className="font-display text-base leading-tight">{i.title}</p>
                {i.subtitle && <p className="text-xs dim mt-1.5">{i.subtitle}</p>}
                {whyLine(i, true) && <p className="text-[11px] opacity-70 mt-auto pt-3">{whyLine(i, true)}</p>}
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
}
