"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TasteProfile } from "@/lib/types";
import { domainColor } from "@/components/domain";

export default function ProfilePage() {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWhy, setOpenWhy] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/taste/profile")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "no profile");
        return r.json();
      })
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-2xl mb-3">No taste profile yet</p>
          <p className="dim mb-6">{error}</p>
          <Link href="/discover" className="bg-[var(--ink)] text-[var(--bg)] px-6 py-3 rounded-full">
            Build my taste →
          </Link>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="dim animate-pulse">reading your cultural signals…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 pb-24">
      {/* hero */}
      <section className="px-5 sm:px-8 pt-14 pb-10 max-w-5xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.25em] dim mb-5">
          Your cultural fingerprint · v{profile.profileVersion} · {profile.mode} taste graph
        </p>
        <h1 className="font-display text-4xl sm:text-6xl mb-4">{profile.archetype.name}</h1>
        <p className="dim max-w-xl mx-auto leading-relaxed">{profile.archetype.description}</p>
        <div className="mt-6 inline-flex items-center gap-3 text-xs dim border hairline rounded-full px-4 py-2">
          <span>{profile.interactionCount} signals</span>
          <span className="w-px h-3 bg-[var(--hairline)]" />
          <span>{Math.round(profile.confidence * 100)}% confidence</span>
          <span className="w-px h-3 bg-[var(--hairline)]" />
          <span>{profile.tasteSummary}</span>
        </div>
      </section>

      {/* taste DNA constellation */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <div className="border hairline rounded-3xl p-6 sm:p-10 bg-[var(--bg-soft)]">
          <h2 className="font-display text-2xl mb-8">Taste DNA</h2>
          <Constellation profile={profile} />
        </div>
      </section>

      {/* strongest affinities */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <h2 className="font-display text-2xl mb-5">Your strongest affinities</h2>
        <div className="flex flex-wrap gap-2.5">
          {profile.coreEntities.map((e) => (
            <span
              key={e.cardId}
              className="flex items-center gap-2 border hairline rounded-full pl-2.5 pr-4 py-1.5 text-sm"
            >
              <span className="domain-dot" style={{ background: domainColor(e.domain) }} />
              {e.title}
            </span>
          ))}
          {profile.negativeSignals.slice(0, 3).map((e) => (
            <span
              key={`neg-${e.title}`}
              className="flex items-center gap-2 border hairline rounded-full pl-2.5 pr-4 py-1.5 text-sm line-through opacity-50"
              title="you pushed this away"
            >
              <span className="domain-dot" style={{ background: domainColor(e.domain) }} />
              {e.title}
            </span>
          ))}
        </div>
      </section>

      {/* unexpected connections */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-2xl">Unexpected connections</h2>
          <span className="text-[10px] uppercase tracking-widest dim">Qloo-derived</span>
        </div>
        <p className="dim text-sm mb-6">
          Things you never picked — but your combination of tastes points straight at them.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {profile.unexpectedConnections.map((c, i) => (
            <div key={c.title} className="border hairline rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="domain-dot" style={{ background: domainColor(c.domain) }} />
                <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: domainColor(c.domain) }}>
                  {c.domain}
                </span>
              </div>
              <h3 className="font-display text-xl mb-2">{c.title}</h3>
              <p className="dim text-sm leading-relaxed mb-3">{c.reason}</p>
              <button
                onClick={() => setOpenWhy(openWhy === i ? null : i)}
                className="text-xs underline underline-offset-4 dim hover:text-[var(--ink)]"
              >
                Why this?
              </button>
              {openWhy === i && (
                <p className="text-xs mt-3 border-l-2 pl-3 hairline dim">
                  Bridges from your profile: {c.bridges.join(" · ")}. Qloo&apos;s taste graph links
                  these entities to {c.title} — this connection was not hand-picked by you.
                </p>
              )}
            </div>
          ))}
          {profile.unexpectedConnections.length === 0 && (
            <p className="dim text-sm">Keep swiping — cross-domain discoveries appear after ~15 decisive picks.</p>
          )}
        </div>
      </section>

      {/* cultural world */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <h2 className="font-display text-2xl mb-6">Your cultural world</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--hairline)] border hairline rounded-2xl overflow-hidden">
          {profile.clusters.map((c) => (
            <div key={c.domain} className="bg-[var(--bg)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="domain-dot" style={{ background: domainColor(c.domain) }} />
                <span className="text-[10px] uppercase tracking-[0.2em] dim">{c.label}</span>
                <span className="ml-auto text-xs dim">
                  {Math.round((profile.domainPreferences[c.domain] ?? 0) * 100)}%
                </span>
              </div>
              <ul className="text-sm space-y-1">
                {c.entities.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              {c.tags.length > 0 && (
                <p className="text-[11px] dim mt-3">{c.tags.join(" · ")}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* agent + privacy */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto">
        <div className="border hairline rounded-3xl p-7 sm:p-10 text-center bg-[var(--bg-soft)]">
          <h2 className="font-display text-3xl mb-2">Your taste is ready.</h2>
          <p className="dim mb-7">Now let&apos;s see what an AI can do with it.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/agent?q=Plan%20my%20Saturday%20in%20Tokyo" className="bg-[var(--ink)] text-[var(--bg)] px-6 py-3 rounded-full text-sm">
              Plan something for me
            </Link>
            <Link href="/agent?q=Find%20me%20a%20restaurant%20in%20Lisbon" className="border hairline px-6 py-3 rounded-full text-sm">
              Recommend something for me
            </Link>
            <Link href="/agent?q=What%20should%20I%20read%2C%20watch%20and%20listen%20to%20this%20month%3F" className="border hairline px-6 py-3 rounded-full text-sm">
              Create something for me
            </Link>
          </div>
          <div className="mt-8 pt-6 border-t hairline flex flex-wrap justify-center gap-5 text-xs dim">
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
                location.href = "/";
              }}
              className="underline underline-offset-4 hover:text-red-300"
            >
              Clear my profile
            </button>
            <span>Private by default · anonymous session</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function Constellation({ profile }: { profile: TasteProfile }) {
  const nodes = profile.coreEntities.slice(0, 8);
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;
  const maxW = Math.max(...nodes.map((n, i) => profile.positiveSignals.find((p) => p.cardId === n.cardId)?.weight ?? 1), 1);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-xl mx-auto" role="img" aria-label="Taste DNA constellation of your strongest cultural signals">
      <circle cx={cx} cy={cy} r={size * 0.44} fill="none" stroke="var(--hairline)" />
      <circle cx={cx} cy={cy} r={size * 0.22} fill="none" stroke="var(--hairline)" strokeDasharray="2 5" />
      {nodes.map((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * R;
        const y = cy + Math.sin(angle) * R;
        const w = profile.positiveSignals.find((p) => p.cardId === n.cardId)?.weight ?? 1;
        const r = 10 + (w / maxW) * 18;
        const color = domainColor(n.domain);
        return (
          <g key={n.cardId}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={0.35} />
            <circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.9} />
            <text
              x={cx + Math.cos(angle) * (R + 34)}
              y={cy + Math.sin(angle) * (R + 34)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--ink-dim)"
            >
              {n.title.length > 18 ? n.title.slice(0, 17) + "…" : n.title}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={26} fill="var(--bg)" stroke="var(--ink)" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="var(--ink)" letterSpacing={2}>
        YOU
      </text>
    </svg>
  );
}
