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
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin mx-auto mb-5" />
          <p className="dim">Reading your taste…</p>
        </div>
      </main>
    );
  }

  const maxTag = Math.max(...profile.inferredTags.map((t) => t.weight), 1);
  const domains = Object.entries(profile.domainPreferences).sort((a, b) => b[1] - a[1]);
  const collage = picks.slice(0, 18);
  const sectionsFor = (group: string) => (recs ?? []).filter((s) => s.group === group);

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
          <p className="dim max-w-xl mx-auto leading-relaxed">{profile.archetype.description}</p>
          <p className="text-sm mt-3 max-w-lg mx-auto italic opacity-80">{profile.tasteSummary}</p>
          <div className="mt-4 inline-flex items-center gap-3 text-xs dim border hairline rounded-full px-4 py-2 bg-[var(--bg)]/60">
            <span>{profile.interactionCount} signals</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{domains.length} worlds</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{Math.round(profile.confidence * 100)}% mapped</span>
          </div>
        </div>
      </section>

      {/* traits */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-8">
        <div className="flex h-2 rounded-full overflow-hidden mb-3">
          {domains.map(([d, w]) => (
            <div key={d} style={{ width: `${w * 100}%`, background: domainColor(d) }} title={`${DOMAIN_LABEL[d] ?? d} ${Math.round(w * 100)}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.inferredTags.slice(0, 12).map((t) => (
            <span key={t.tag} className="text-sm border hairline rounded-full px-3 py-1" style={{ opacity: 0.45 + 0.55 * Math.sqrt(t.weight / maxTag) }}>
              {t.tag}
            </span>
          ))}
        </div>
      </section>

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

      {/* made for you */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-14">
        <h2 className="font-display text-2xl sm:text-3xl">Made for you</h2>
        <p className="dim text-sm mt-1 mb-4 max-w-xl">What our taste graph thinks you&apos;ll love — and what an AI with your passport would hand you.</p>
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-sm whitespace-nowrap rounded-full px-4 py-2 border ${tab === t.id ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "hairline dim"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "top" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {suggestions.slice(0, 18).map((g) => (
              <BoardTile key={g.cardId} g={g} open={open} setOpen={setOpen} boosted={boosted} boost={boost} remove={remove} hide={hide} />
            ))}
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
              <div className="py-10 flex justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--hairline)] border-t-[var(--ink)] animate-spin" />
              </div>
            ) : (
              <>
                {sectionsFor(tab).map((s) => (
                  <RecRow key={s.id} s={s} />
                ))}
                {sectionsFor(tab).length === 0 && <p className="dim text-sm">Nothing here yet — keep sharpening below and this fills in.</p>}
              </>
            )}
          </div>
        )}
      </section>

      {/* keep sharpening */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-14">
        <h2 className="font-display text-2xl">Keep sharpening it</h2>
        <p className="dim text-sm mt-1 mb-4">The more you add, the better any agent knows you.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { k: "vibes" as const, t: "More vibes", d: "Another pass at the picture wall." },
            { k: "feed" as const, t: "Back to your feed", d: "Endless picks tuned to what you've liked." },
            { k: "deeper" as const, t: "Retake the chapters", d: "Screen, instincts, spaces and style." },
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
    <div className="relative aspect-square rounded-xl overflow-hidden bg-[var(--bg-softer)]">
      <button type="button" onClick={() => setOpen(open === g.cardId ? null : g.cardId)} className="absolute inset-0 w-full h-full" aria-label={g.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
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

function RecRow({ s }: { s: RecSection }) {
  return (
    <div>
      <h3 className="font-display text-xl">{s.title}</h3>
      <p className="dim text-xs mb-3">{s.kicker}</p>
      {s.items.length === 0 ? (
        <p className="dim text-sm">Add your city above to see these.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
          {s.items.map((i) =>
            i.imageUrl ? (
              <div key={i.title} className="relative shrink-0 w-36 sm:w-44 aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--bg-softer)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.imageUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-display text-sm leading-tight">{i.title}</p>
                  {i.subtitle && <p className="text-[10px] dim truncate mt-0.5">{i.subtitle}</p>}
                  {i.why.length > 0 && <p className="text-[10px] opacity-70 truncate mt-0.5">Because {i.why[0]}</p>}
                </div>
              </div>
            ) : (
              <div key={i.title} className="shrink-0 w-44 sm:w-52 rounded-2xl border hairline p-4 flex flex-col">
                <p className="font-display text-base leading-tight">{i.title}</p>
                {i.subtitle && <p className="text-xs dim mt-1.5">{i.subtitle}</p>}
                {i.why.length > 0 && <p className="text-[11px] opacity-70 mt-auto pt-3">Because you picked {i.why.slice(0, 2).join(" & ")}</p>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
