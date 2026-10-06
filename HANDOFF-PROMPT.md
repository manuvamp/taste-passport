# HANDOFF PROMPT — Taste Passport (copy everything below this line to the AI)

You are taking over **Taste Passport**, a working hackathon submission for the Qloo Agentic Hackathon (deadline Oct 31, 2026). It is functional and verified end-to-end. Your job is to make the whole experience better: polish the UI/UX, fix the weak spots listed below, and prepare it for public deployment and judging — **without breaking the core loop that already works.**

## What this project is

A visual, adaptive taste-learning system. The user reacts to ~40 image cards (like/dislike/skip). Every swipe maps to a cultural entity, the feed adapts using the Qloo taste graph (70% exploit / 20% adjacent / 10% novel), and after ~15-30 picks the user gets a "Taste DNA" profile. The profile is exposed to AI agents via a JSON API and an MCP server. The killer demo: the same request ("Plan my Saturday in Tokyo") answered generically vs. grounded in the user's taste profile, side by side.

## Where it is and how to run it

- Project folder: `taste-passport/` (Next.js 16 App Router, TypeScript, Tailwind, framer-motion)
- `npm install`
- `npm run dev` → http://localhost:3000 (or `npm run build && npm start`)
- `npx vitest run` → 27 tests (all green — keep them green)
- `node scripts/seed-cards.mjs` → validates the seed catalog
- The Qloo API key is already in `taste-passport/.env.local` (QLOO_MODE=live, QLOO_API_KEY, QLOO_BASE_URL=https://hackathon.api.qloo.com). **Never commit or print this key.** Never move it client-side.
- Full docs: `README.md` and `docs/HACKATHON.md` — read them first.

## What already works (DO NOT BREAK)

1. **Adaptive feed** (`/discover`): grid mode (12 cards at once, default) + deck mode (swipe with drag/arrow keys). Next batch prefetches while the user reacts. Live Qloo entities are injected into batches alongside a 174-card curated seed corpus.
2. **Live Qloo integration** (`lib/qloo/`): adapter with live+mock modes, TTL cache, graceful fallback to a deterministic local graph when Qloo fails. Entity resolver maps seed card ids → real Qloo entity ids (cached 30d). City bias works via `filter.location.query` (NOT `filter.location=<uuid>` — that 400s; lat/lon is parsed as WKT and also fails; `filter.location.query=<city name>` is the only thing that works).
3. **Taste DNA profile** (`/profile`): archetype, constellation SVG, clusters, "unexpected connections" with explainability, privacy controls (export JSON, delete profile).
4. **Taste Agent** (`/agent`): request + profile + Qloo → plan, shown side-by-side with a generic answer ("What Qloo changed" panel). Verified live: Tokyo request returns real Tokyo places (Sahsya Kanetanaka, TRUNK Hotel) at 90%+ match with named bridges from the user's likes.
5. **Demo personas** (`/demo`): Maya (quiet minimal) vs Alex (maximal neon) — one click each, produces radically different profiles.
6. **MCP server** (`mcp/server.mjs`): stdio JSON-RPC, 5 tools, tested.
7. **Images** (`/api/img`): 3-tier Wikipedia/Commons resolution, streamed same-origin. 29 ambiguous titles pinned via `wikiTitle` in `data/cards.ts`.
8. **API routes**: `/api/session`, `/api/feed`, `/api/interact`, `/api/taste/profile` (GET/POST/DELETE), `/api/taste/explain`, `/api/agent/plan`, `/api/agent/compare`, `/api/demo`, `/api/admin/stats`, `/api/cards`, `/api/img`.

## Weak spots — fix these, in this priority order

### P0 — must fix before submission
1. **Persistence is per-process JSON** (`lib/store/db.ts`). On Vercel serverless, sessions/profiles vanish between instances. Swap the tiny read/write interface for Vercel KV, Upstash Redis, or Supabase (env-driven; keep the JSON fallback for local dev). Acceptance: a profile created in one process survives a server restart with the same session cookie.
2. **Live-mode cold-start latency**: the first adaptive batch resolves up to 15 entities sequentially via /search (~10s). Parallelize resolution (Promise.allSettled with concurrency ~5), persist the resolution cache across restarts, and show the user something engaging while loading (skeleton grid, not a spinner). Acceptance: first adapted grid batch appears in <4s warm, <8s cold.
3. **Deploy to Vercel** and verify the public URL end-to-end (grid swipes → profile → agent compare → demo personas). Set QLOO_MODE/QLOO_API_KEY/QLOO_BASE_URL in the Vercel dashboard. Acceptance: judges can complete the full flow from a phone.
4. **Public GitHub repo** with MIT LICENSE visible, clean README, and no secrets in history (the key was only ever in .env.local — keep it that way).

### P1 — experience quality (the "can be better" part)
5. **Onboarding story**: the first screen after "Build my taste" should teach the interaction in 3 seconds (one line: "Tap ♥ on what feels like you. The deck learns."). Show the adaptation happening: after batch 2, briefly highlight 1-2 new cards with a subtle "new because you liked X" chip. Acceptance: a stranger understands the product in 10 seconds without explanation.
6. **First-paint polish**: images pop in late. Add blur-up placeholders or a subtle Ken Burns/settle animation so the grid feels alive; stagger card entrances.
7. **Grid card richness**: show the Qloo match reason on hover/long-press (pool label already exists; add the top bridge entity name when available from the feed response).
8. **Profile page wow**: the constellation is static SVG. Animate it (nodes drift in, lines draw), and add a shareable OG-image (`/api/og` with next/og) so "Taste DNA" can be shared as a card (opt-in only — taste is private by default).
9. **Agent page latency UX**: live plans take up to 20s cold. Stream progress steps ("reading your profile → querying Qloo → ranking") via a simple polling endpoint or SSE. Acceptance: the user sees movement every ~2s, never a frozen button.
10. **Empty/edge states**: brand-new session hitting /profile (currently a plain error), agent with no profile (exists — keep), feed exhaustion, Qloo outage (fallback works — make the fallback visible with a small "offline taste graph" note).
11. **Mobile pass**: test grid at 375px, deck swipe gestures on real touch, action buttons reachable; fix anything broken.

### P2 — judging strength
12. **Hosted MCP**: expose the same 5 tools over HTTP/SSE on Vercel (`/api/mcp`) so judges can connect Claude Desktop to the public URL, not localhost. Keep the stdio server for local use.
13. **Evaluation panel** (spec §39): a `/eval` page that runs N scenarios (restaurant/travel/film/music) through generic vs. taste arms and displays hit-rate/diversity/novelty side by side, stored per session. Even a small internal result displayed publicly strengthens "Technological Implementation".
14. **"Unexpected connections" in live mode** currently uses the local tag graph. Add a live-graph variant: for 2-3 of the user's core entities, fetch insights in a domain they never liked and surface the top surprise with real explainability. Label the source ("Qloo live graph" vs "local inference").
15. **Rate limiting** on API routes (simple in-memory token bucket is fine) and bound the JSON store size.

## Guardrails

- Do not invent Qloo API capabilities. The verified contract: `GET /search?query=&types=&take=`, `GET /v2/insights?filter.type=urn:entity:*&signal.interests.entities=&take=&sort_by=affinity&feature.explainability=true`, `filter.location.query=<name>`, auth header `X-Api-Key`. Affinity is at `query.affinity`, real type at `subtype`, images at `properties.images[].url`. Unsupported params are silently ignored; empty results usually mean bad params, not no data.
- Keep the adapter pattern (`lib/qloo/`): all Qloo calls go through it; mock mode must keep working with zero credentials.
- Keep explanations grounded: never show a match reason that isn't backed by adapter data (explainability or recorded signals).
- Keep taste language hedged ("your selections suggest…"), never "you are…".
- After each change: `npx vitest run` + `npm run build` + manually replay the golden path (swipe 8 in grid → profile → agent compare → demo persona). Fix what breaks before moving on.
- Commit in small steps with clear messages.

## Definition of done

A stranger with a phone can: open the public URL → tap ♥ on ~15 cards → see a Taste DNA they'd screenshot → ask "Plan my Saturday in Tokyo" → see picks that are visibly *them*, in Tokyo, with "Why this?" explanations → tap "Very me" and watch the profile learn. If any step of that is slow (>4s), confusing, or broken, it's not done.
