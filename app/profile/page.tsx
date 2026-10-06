"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { TasteProfile } from "@/lib/types";
import { domainColor } from "@/components/domain";
import { ConnectAgent } from "@/components/connect-agent";

type Gallery = NonNullable<TasteProfile["gallery"]>;

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

async function tweak(action: "remove" | "boost", cardId: string) {
  await fetch("/api/taste/tweak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, cardId }) }).catch(() => {});
}

function Section({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
      <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
      {kicker && <p className="dim text-sm mt-1 mb-6 max-w-xl">{kicker}</p>}
      {!kicker && <div className="mb-6" />}
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // removed picks and dismissed suggestions
  const [boosted, setBoosted] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

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
  }, [load]);

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
  const restart = (from: "vibes" | "feed" | "deeper") => {
    const ls = window.localStorage;
    if (from === "vibes") ls.removeItem("tp_vibes_done");
    if (from === "vibes" || from === "feed") ls.removeItem("tp_feed_done");
    if (from === "deeper") ls.setItem("tp_feed_done", "1");
    if (from === "feed") ls.setItem("tp_vibes_done", "1");
    router.push("/discover");
  };

  type Item = { cardId: string; title: string; domain: string; imageUrl: string; kind: "pick" | "suggest"; why?: string[] };
  const [filter, setFilter] = useState<string>("all");
  const [show, setShow] = useState<"all" | "pick" | "suggest">("all");

  // one combined board: what you picked, with what we've learned you'd love woven through it
  const items: Item[] = useMemo(() => {
    const picks: Item[] = (profile?.gallery ?? []).filter((g) => !hidden.has(g.cardId)).map((g) => ({ ...g, kind: "pick" as const }));
    const pickIds = new Set(picks.map((p) => p.cardId));
    const sugg: Item[] = (profile?.suggestions ?? [])
      .filter((g) => !hidden.has(g.cardId) && !pickIds.has(g.cardId))
      .map((g) => ({ ...g, kind: "suggest" as const }));
    const out: Item[] = [];
    for (let i = 0, j = 0; i < picks.length || j < sugg.length; ) {
      if (i < picks.length) out.push(picks[i++]);
      if (j < sugg.length) out.push(sugg[j++]);
      if (i < picks.length) out.push(picks[i++]);
    }
    return out;
  }, [profile, hidden]);
  const domainsPresent = useMemo(() => [...new Set(items.map((i) => i.domain))], [items]);
  const shown = items.filter((i) => (filter === "all" || i.domain === filter) && (show === "all" || i.kind === show));
  const gallery: Gallery = useMemo(() => (profile?.gallery ?? []).filter((g) => !hidden.has(g.cardId)), [profile, hidden]);

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
  const collage = gallery.slice(0, 18);

  return (
    <main className="flex-1 pb-24">
      {/* 1 — hero over a collage of what you picked */}
      <section className="relative overflow-hidden mb-14">
        <div className="absolute inset-0 grid grid-cols-6 sm:grid-cols-9 gap-1 opacity-35" aria-hidden>
          {collage.map((g) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={g.cardId} src={g.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full aspect-square object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)]/40 via-[var(--bg)]/80 to-[var(--bg)]" />
        <div className="relative px-5 sm:px-8 pt-16 pb-12 max-w-3xl mx-auto text-center">
          <p className="overline mb-5">Your taste, decoded · {profile.mode === "live" ? "live" : "offline"} taste graph</p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="font-display text-4xl sm:text-6xl mb-4">
            {profile.archetype.name}
          </motion.h1>
          <p className="dim max-w-xl mx-auto leading-relaxed">{profile.archetype.description}</p>
          <p className="text-sm mt-5 max-w-lg mx-auto italic opacity-80">{profile.tasteSummary}</p>
          <div className="mt-6 inline-flex items-center gap-3 text-xs dim border hairline rounded-full px-4 py-2 bg-[var(--bg)]/60">
            <span>{profile.interactionCount} signals</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{domains.length} worlds</span>
            <span className="w-px h-3 bg-[var(--hairline)]" />
            <span>{Math.round(profile.confidence * 100)}% mapped</span>
          </div>
        </div>
      </section>

      {/* 2 — traits + world mix, compact */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-10">
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
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

      {/* 3 — one editable board: your picks + what we think you'd love */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <h2 className="font-display text-2xl sm:text-3xl">Your taste, editable</h2>
        <p className="dim text-sm mt-1 mb-4 max-w-xl">
          Everything here shapes what your agents recommend. Tap any picture — keep, boost or drop what you picked, and say yes or no to what we think you&apos;ll love.
        </p>
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
          {shown.slice(0, 60).map((g) => (
            <div key={g.cardId} className="relative aspect-square rounded-xl overflow-hidden bg-[var(--bg-softer)]">
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
                    onClick={() => (g.kind === "pick" ? remove(g.cardId) : (setHidden((h) => new Set(h).add(g.cardId)), setOpen(null)))}
                    className="btn-ghost !text-[11px] !py-1.5 !px-2"
                  >
                    {g.kind === "pick" ? "Remove" : "Not for me"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {shown.length === 0 && <p className="dim text-sm">Nothing here yet — keep sharpening below.</p>}
      </section>

      {/* 6 — keep refining */}
      <Section title="Keep sharpening it" kicker="The more you add, the better any agent knows you. Jump back into any step.">
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { k: "vibes" as const, t: "More vibes", d: "Another pass at the picture wall." },
            { k: "feed" as const, t: "Back to your feed", d: "Endless picks tuned to what you've liked." },
            { k: "deeper" as const, t: "Go deeper", d: "Browse by category: food, film, places…" },
          ].map((s) => (
            <button key={s.k} onClick={() => restart(s.k)} className="panel p-5 text-left hover:border-[var(--ink)] transition-colors">
              <p className="font-display text-lg">{s.t}</p>
              <p className="dim text-xs mt-1">{s.d}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* 7 — connect + data */}
      <Section title="Give this to your AI" kicker="Connect your taste to an agent so it recommends like it knows you.">
        <div className="max-w-3xl">
          <ConnectAgent />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
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
              ["tp_vibes_done", "tp_feed_done"].forEach((k) => window.localStorage.removeItem(k));
              location.href = "/";
            }}
            className="underline underline-offset-4 hover:text-red-300"
          >
            Clear my profile
          </button>
          <span>Private by default · anonymous session</span>
        </div>
      </Section>
    </main>
  );
}
