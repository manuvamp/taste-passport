"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
          <p className="font-display text-3xl mb-3">Your taste isn&apos;t learned yet</p>
          <p className="dim mb-2 max-w-sm mx-auto">{error}</p>
          <p className="dim text-sm mb-8">A dozen picks is all it takes.</p>
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
          <div className="w-14 h-14 rounded-full border hairline mx-auto mb-5 slow-pulse flex items-center justify-center">
            <span className="text-lg">✦</span>
          </div>
          <p className="dim animate-pulse">reading your cultural signals…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 pb-24">
      {/* hero */}
      <section className="px-5 sm:px-8 pt-14 pb-10 max-w-5xl mx-auto text-center">
        <p className="overline mb-5">
          Your cultural fingerprint · v{profile.profileVersion} · {profile.mode === "live" ? "live" : "offline"} taste graph
        </p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-4xl sm:text-6xl mb-4"
        >
          {profile.archetype.name}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="dim max-w-xl mx-auto leading-relaxed"
        >
          {profile.archetype.description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-6 inline-flex items-center gap-3 text-xs dim border hairline rounded-full px-4 py-2"
        >
          <span>{profile.interactionCount} signals</span>
          <span className="w-px h-3 bg-[var(--hairline)]" />
          <span>{Math.round(profile.confidence * 100)}% confidence</span>
        </motion.div>
        <p className="dim text-sm mt-5 max-w-lg mx-auto italic">{profile.tasteSummary}</p>
      </section>

      {/* taste DNA constellation */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <div className="panel-soft p-6 sm:p-10">
          <h2 className="font-display text-2xl mb-2">Taste DNA</h2>
          <p className="dim text-sm mb-8">Your strongest signals, orbiting you.</p>
          <Constellation profile={profile} />
        </div>
      </section>

      {/* strongest affinities */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-16">
        <h2 className="font-display text-2xl mb-5">Your strongest affinities</h2>
        <div className="flex flex-wrap gap-2.5">
          {profile.coreEntities.map((e, i) => (
            <motion.span
              key={e.cardId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i }}
              className="flex items-center gap-2 border hairline rounded-full pl-2.5 pr-4 py-1.5 text-sm"
            >
              <span className="domain-dot" style={{ background: domainColor(e.domain) }} />
              {e.title}
            </motion.span>
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
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="font-display text-2xl">Unexpected connections</h2>
          <span className="text-[10px] uppercase tracking-widest dim">
            {profile.mode === "live" ? "Qloo live graph" : "local inference"}
          </span>
        </div>
        <p className="dim text-sm mb-6">
          Things you never picked — but your combination of tastes points straight at them.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {profile.unexpectedConnections.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i }}
              className="panel p-5"
            >
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
                  Bridges from your profile: {c.bridges.join(" · ")}. The taste graph links
                  these entities to {c.title} — this connection was not hand-picked by you.
                </p>
              )}
            </motion.div>
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
        <div className="panel-soft p-7 sm:p-10 text-center">
          <h2 className="font-display text-3xl mb-2">Your taste is ready.</h2>
          <p className="dim mb-7">Now let&apos;s see what an AI can do with it.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/agent?q=Plan%20my%20Saturday%20in%20Tokyo" className="btn-primary text-sm">
              Plan my Saturday in Tokyo →
            </Link>
            <Link href="/agent?q=Find%20me%20a%20restaurant%20in%20Lisbon" className="btn-ghost text-sm">
              Find me a restaurant
            </Link>
            <Link href="/agent?q=What%20should%20I%20read%2C%20watch%20and%20listen%20to%20this%20month%3F" className="btn-ghost text-sm">
              What should I read, watch &amp; hear?
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
  const maxW = Math.max(...nodes.map((n) => profile.positiveSignals.find((p) => p.cardId === n.cardId)?.weight ?? 1), 1);

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
        const delay = 0.3 + i * 0.14;
        return (
          <g key={n.cardId}>
            <motion.line
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={color}
              strokeOpacity={0.35}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay, duration: 0.5, ease: "easeOut" }}
            />
            <motion.circle
              cx={x}
              cy={y}
              fill={color}
              initial={{ r: 0, opacity: 0 }}
              animate={{ r, opacity: 0.9 }}
              transition={{ delay, type: "spring", stiffness: 300, damping: 18 }}
            />
            <motion.text
              x={cx + Math.cos(angle) * (R + 34)}
              y={cy + Math.sin(angle) * (R + 34)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--ink-dim)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.25 }}
            >
              {n.title.length > 18 ? n.title.slice(0, 17) + "…" : n.title}
            </motion.text>
            <title>{`${n.title} — signal strength ${Math.round(w * 100) / 100}`}</title>
          </g>
        );
      })}
      <motion.circle
        cx={cx}
        cy={cy}
        fill="var(--bg)"
        stroke="var(--ink)"
        initial={{ r: 0 }}
        animate={{ r: 26 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      />
      <motion.text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill="var(--ink)"
        letterSpacing={2}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        YOU
      </motion.text>
    </svg>
  );
}
