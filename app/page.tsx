import Link from "next/link";
import { ConnectAgent } from "@/components/connect-agent";
import { VIBES } from "@/data/vibes";
import vibeImages from "@/data/vibe-images.json";

const IMAGES = vibeImages as Record<string, string[]>;
// decorative strip of real tiles from phase one (people-free, photo-backed)
const STRIP = VIBES.filter((v) => IMAGES[v.id]?.length).filter((_, i) => i % 5 === 0).slice(0, 16);

const STEPS = [
  { n: "1", title: "Tap your vibes", body: "A wall of ~120 pictures — dishes, places, rooms, moods. Tap 20–30 that feel like you. About a minute, no typing." },
  { n: "2", title: "Go deeper", body: "An endless feed of specific films, music, brands and places chosen by the Qloo taste graph. Tap what you love, scroll past the rest." },
  { n: "3", title: "Plug it into your AI", body: "Your taste becomes a profile any agent can read through MCP or a simple API — so it recommends like it knows you." },
];

const TOOLS = [
  ["get_taste_context", "A compact taste summary to drop into any prompt"],
  ["get_taste_profile", "Archetype, core entities, domains, unexpected connections"],
  ["recommend_for_context", "“Dinner in Tokyo” → picks grounded in your taste"],
  ["explain_taste_match", "Why a thing does (or doesn't) fit you"],
  ["record_feedback", "Your agent teaches the profile as you react"],
];

export default function Landing() {
  return (
    <main className="flex-1">
      <section className="px-5 sm:px-8 pt-14 sm:pt-24 pb-10 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.25em] dim mb-5">Your taste, as an API</p>
        <h1 className="font-display text-5xl sm:text-7xl leading-[1.02] mb-6">
          Your AI doesn&apos;t know
          <br />
          <em>what you like.</em>
        </h1>
        <p className="dim text-lg max-w-xl mx-auto mb-9 leading-relaxed">
          Tap through a few pictures. Taste Passport builds a portable taste profile you can connect to
          Claude, other AI agents or your own code — so every recommendation fits you.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-3">
          <Link href="/discover" className="btn-primary px-8 py-3.5 text-base">
            Build my taste — 1 minute →
          </Link>
          <Link href="/demo" className="btn-ghost px-6 py-3.5">
            See an example profile
          </Link>
        </div>
        <p className="faint text-xs mt-5">No signup · works on your phone</p>
      </section>

      <section className="px-3 sm:px-8 pb-16 max-w-5xl mx-auto" aria-hidden>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2">
          {STRIP.map((v, i) => (
            <div
              key={v.id}
              className={`relative aspect-square rounded-lg sm:rounded-xl overflow-hidden ${i >= 8 ? "hidden sm:block" : ""}`}
              style={{ background: `hsl(${v.hue} 40% 18%)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={IMAGES[v.id][0]} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-4 text-[10px] bg-gradient-to-t from-black/80 to-transparent">{v.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 sm:px-8 pb-20 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="border hairline rounded-2xl p-6">
              <span className="font-display text-3xl dim">{s.n}</span>
              <h2 className="font-display text-xl mt-2 mb-2">{s.title}</h2>
              <p className="dim text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 sm:px-8 pb-20 max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.25em] dim mb-3">For your agent</p>
        <h2 className="font-display text-3xl sm:text-4xl mb-3">One line to connect.</h2>
        <p className="dim mb-6 max-w-xl">
          Once you&apos;ve built your taste you get a personal link. Paste it into any MCP-capable agent, or call the API directly.
        </p>
        <ConnectAgent live={false} />
        <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {TOOLS.map(([name, desc]) => (
            <li key={name}>
              <code className="text-xs bg-[var(--bg-softer)] rounded px-1.5 py-0.5">{name}</code>
              <span className="dim ml-2">{desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="px-5 sm:px-8 py-8 border-t hairline flex flex-wrap gap-6 justify-between text-xs dim">
        <span>Taste Passport · powered by the Qloo taste graph</span>
        <span className="flex gap-5">
          <Link href="/eval" className="hover:text-[var(--ink)]">Live evaluation</Link>
          <Link href="/api/mcp" className="hover:text-[var(--ink)]">MCP endpoint</Link>
          <Link href="/dev" className="hover:text-[var(--ink)]">Dev dashboard</Link>
        </span>
      </footer>
    </main>
  );
}
