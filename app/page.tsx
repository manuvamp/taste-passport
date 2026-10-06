import Link from "next/link";
import { Nav } from "@/components/nav";
import { getQlooAdapter } from "@/lib/qloo";
import { SEED_CARDS } from "@/data/cards";

const FEATURES = [
  {
    title: "React, don't write",
    body: "No questionnaires. No typing your favorite band. Swipe a few images and the system reads the cultural pattern behind your choices.",
  },
  {
    title: "The feed adapts",
    body: "Every swipe reshapes the next batch: 70% deep cuts inside your taste, 20% adjacent explorations, 10% deliberate surprises.",
  },
  {
    title: "Grounded in Qloo",
    body: "Your picks resolve into real cultural entities on Qloo's taste graph — 250M+ entities — so taste transfers across music, film, food, fashion and place.",
  },
  {
    title: "Portable to any agent",
    body: "Your cultural fingerprint leaves the app: a JSON profile API and an MCP server any AI agent can consume before it answers you.",
  },
];

export default function Landing() {
  const mode = getQlooAdapter().mode;
  const domainCount = new Set(SEED_CARDS.map((c) => c.domain)).size;

  return (
    <main className="flex-1">
      <Nav mode={mode} />
      <section className="px-5 sm:px-8 pt-20 sm:pt-28 pb-16 max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-[0.25em] dim mb-6">
          A cultural taste layer for AI agents · Qloo-powered
        </p>
        <h1 className="font-display text-5xl sm:text-7xl leading-[1.02] mb-6">
          Teach AI
          <br />
          <em>what you love.</em>
        </h1>
        <p className="dim text-lg max-w-xl mb-10 leading-relaxed">
          Your taste is more than your favorite songs. Taste Passport learns the
          cultural patterns behind what you choose — then gives that context to
          your AI, so it stops guessing.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/discover"
            className="bg-[var(--ink)] text-[var(--bg)] font-medium px-7 py-3.5 rounded-full hover:opacity-90 transition-opacity"
          >
            Build my taste →
          </Link>
          <Link
            href="/demo"
            className="border hairline px-7 py-3.5 rounded-full hover:border-[var(--ink-dim)] transition-colors"
          >
            See two demo profiles
          </Link>
        </div>
        <p className="dim text-sm mt-6">
          ~40 swipes · {SEED_CARDS.length} seeded entities across {domainCount} domains · no signup
        </p>
      </section>

      <section className="px-5 sm:px-8 pb-24 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-px bg-[var(--hairline)] border hairline rounded-2xl overflow-hidden">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[var(--bg)] p-7">
              <h2 className="font-display text-xl mb-2">{f.title}</h2>
              <p className="dim text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 sm:px-8 pb-24 max-w-5xl mx-auto">
        <div className="border hairline rounded-2xl p-7 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] dim mb-4">The thesis</p>
          <p className="font-display text-2xl sm:text-3xl leading-snug">
            Agents can reason, plan and execute — but they don&apos;t know what
            an individual actually <em>likes</em>. Taste Passport fixes that
            before the question is even asked:
          </p>
          <pre className="mt-8 text-xs sm:text-sm dim overflow-x-auto leading-relaxed">{`you → swipes → cultural entities → Qloo taste graph
     → adaptive taste model → your cultural fingerprint
     → any AI agent → answers that feel like you`}</pre>
        </div>
      </section>

      <footer className="px-5 sm:px-8 py-8 border-t hairline flex flex-wrap gap-6 justify-between text-xs dim">
        <span>Taste Passport · built for the Qloo Agentic Hackathon</span>
        <span className="flex gap-5">
          <Link href="/api/taste/profile" className="hover:text-[var(--ink)]">Profile API</Link>
          <Link href="/dev" className="hover:text-[var(--ink)]">Dev dashboard</Link>
        </span>
      </footer>
    </main>
  );
}
