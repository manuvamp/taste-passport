"use client";

import { useState } from "react";
import Link from "next/link";
import { domainColor } from "@/components/domain";

const PERSONAS = [
  {
    id: "maya",
    name: "Maya",
    color: "#a78bfa",
    likes: ["A24", "Frank Ocean", "Jil Sander", "Kyoto", "Church of the Light", "Nils Frahm"],
    dislikes: ["Gucci", "Sichuan Hotpot", "Mad Max: Fury Road"],
    hint: "quiet · minimal · atmospheric",
  },
  {
    id: "alex",
    name: "Alex",
    color: "#fb923c",
    likes: ["Gucci", "Bad Bunny", "Blade Runner 2049", "Sichuan Hotpot", "Tokyo", "Rave Culture"],
    dislikes: ["Nils Frahm", "Ryōan-ji", "Farnsworth House"],
    hint: "maximal · neon · after-dark",
  },
];

export default function DemoPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(persona: string) {
    setBusy(persona);
    setError(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!res.ok) throw new Error("failed to load persona");
      location.href = "/profile";
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(null);
    }
  }

  return (
    <main className="flex-1 px-5 sm:px-8 pt-12 pb-24 max-w-4xl mx-auto w-full">
      <p className="text-xs uppercase tracking-[0.25em] dim mb-4">Deterministic demo users</p>
      <h1 className="font-display text-4xl mb-3">Two people. Same system. Different worlds.</h1>
      <p className="dim mb-10 max-w-2xl leading-relaxed">
        Each persona replays a preset set of swipes as real taste signals, then
        generates a genuine profile. Load both to see how radically different two
        cultural fingerprints look — and how differently the agent answers for them.
      </p>

      {error && <p className="text-red-300 text-sm mb-6">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-5">
        {PERSONAS.map((p) => (
          <div key={p.id} className="border hairline rounded-3xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-1">
              <span className="domain-dot" style={{ background: p.color, width: 12, height: 12 }} />
              <h2 className="font-display text-2xl">{p.name}</h2>
            </div>
            <p className="dim text-xs uppercase tracking-widest mb-5">{p.hint}</p>
            <p className="text-xs dim mb-1">Loves</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {p.likes.map((l) => (
                <span key={l} className="text-[11px] border hairline rounded-full px-2.5 py-1">
                  {l}
                </span>
              ))}
            </div>
            <p className="text-xs dim mb-1">Pushed away</p>
            <div className="flex flex-wrap gap-1.5 mb-7">
              {p.dislikes.map((l) => (
                <span key={l} className="text-[11px] border hairline rounded-full px-2.5 py-1 line-through opacity-50">
                  {l}
                </span>
              ))}
            </div>
            <div className="mt-auto flex gap-2">
              <button
                onClick={() => load(p.id)}
                disabled={busy !== null}
                className="btn-primary flex-1 text-sm"
                style={busy === p.id ? { background: p.color } : undefined}
              >
                {busy === p.id ? "building profile…" : `Load ${p.name} →`}
              </button>
              <Link
                href="/agent?q=Plan%20my%20Saturday%20in%20Tokyo"
                className="btn-ghost text-sm !px-4 dim hover:text-[var(--ink)] whitespace-nowrap"
              >
                Agent
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
