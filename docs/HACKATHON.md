# Taste Passport — Hackathon Submission Notes

**Qloo Agentic Hackathon · "Agents, but with taste."**

## Product pitch (30 seconds)

AI agents can reason and plan, but they don't know what an individual actually
likes — every recommendation is an educated guess. Taste Passport gives agents
something they never get: a structured, explainable model of your cultural
taste. You teach it by reacting to images for ~40 swipes; Qloo's taste graph
turns every swipe into cross-domain cultural signal; the resulting fingerprint
is portable to any agent via a JSON API or MCP. The result: plans, picks and
discoveries that feel distinctly like you — and you can see exactly why.

## Qloo differentiation

This project **only works because of Qloo**:

| Without Qloo | With Qloo |
|---|---|
| pixel/visual similarity | cultural entity resolution |
| "more like what you liked" | cross-domain affinity transfer |
| unexplainable scores | per-signal explainability (which of your likes drove this) |
| a single-domain recommender | one fingerprint across music, film, food, fashion, travel, spaces, books, games, brands, art, lifestyle |

Concretely: the adaptive feed queries Qloo's insights on **every batch** (not
once at the end). Likes feed `signal.interests.entities`; results drive the next
cards. The `/api/agent/compare` endpoint proves the dependency: the identical
request answered generically vs. taste-grounded, with the item-level delta
displayed as the "What Qloo changed" screen.

In `mock` mode a deterministic local graph keeps the demo honest without a key;
in `live` mode the same adapter calls the documented hackathon endpoints
(`/search`, `/v2/insights` with `feature.explainability=true`).

## Architecture summary

- **Next.js 15 App Router** — one deployable, server routes keep the Qloo key server-side.
- **Qloo adapter** (`lib/qloo/`) — live + mock behind one interface, TTL cache, metrics, graceful degradation.
- **Taste engine** (`lib/taste/engine.ts`) — pure, unit-tested: signal weighting (like +1 / dislike −1, diminishing returns, recency), 70/20/10 exploration mix, domain balancing, confidence, profile builder with cross-domain "unexpected connections".
- **Taste Agent** (`lib/agent/`) — retrieval → Qloo ranking → grounded plan; LLM only polishes prose from structured data (never invents picks).
- **MCP server** (`mcp/server.mjs`) — 5 tools over stdio JSON-RPC for external agents.
- **Store** (`lib/store/db.ts`) — anonymous cookie sessions in a JSON store; small interface to swap for Postgres.

## Demo script (3–5 minutes)

1. Open the landing page. *"Instead of asking AI to guess what I like, I'm going to teach it."*
2. Click **Build my taste**. Swipe through the cold-start deck (keyboard arrows work too).
3. After the first batch: point at the toast — *"the feed just adapted to you — Qloo reshaped this batch."* Cards now carry pool labels ("close to your taste" / "adjacent exploration" / "a deliberate surprise").
4. Reach ~15–30 decisive picks. Click **See my Taste DNA**.
5. Walk the profile: archetype, constellation, clusters — then open **Unexpected connections** and expand *Why this?* (Qloo-backed bridges, not hand-picked).
6. Click **Plan something for me** → "Plan my Saturday in Tokyo".
7. The **What Qloo changed** panel: generic picks on the left, taste-grounded on the right with match % and per-item provenance.
8. Click **♥ Very me** on a pick — *"the profile just learned from that."*
9. Open **/demo**, load **Maya**, run the same Tokyo request → visibly different plan. Load **Alex** → radically different again.
10. Developer moment: show `/api/taste/profile` JSON and the `/dev` dashboard (Qloo latency, cache, weights).

## Judging criteria mapping

**Technological implementation** — real Qloo integration per current docs
(hackathon base URL, `X-Api-Key`, `/search`, `/v2/insights`, explainability),
adapter + cache + metrics, graceful degradation, 27 unit tests pinning the
algorithm contracts, MCP server, key never client-exposed (enforced by test).

**Design** — editorial dark aesthetic, drag/swipe + keyboard feed, Taste DNA
constellation, Wrapped-style archetype hero; premium feel over dashboard feel.

**Potential impact** — the profile is intentionally portable: travel, dining,
fashion, gifting, hospitality, any lifestyle-adjacent agent can consume it via
API/MCP today. Privacy-first (anonymous sessions, export, delete) makes the
taste-data category credible.

**Quality of the idea** — non-obvious framing: not a recommender, but *taste
acquisition → portable agent context*. The 70/20/10 exploration stance ("taste
isn't a prison") and grounded explainability show understanding of both the
recommendation problem and agent-context problem.

## What we'd build next (roadmap)

1. Postgres/Supabase store behind the same interface (multi-instance persistence).
2. Live-vision entity resolution: photo → CLIP embedding → nearest seed entity → Qloo (the adapter and card model already carry the fields).
3. Public shareable "taste cards" (opt-in), multi-agent demos (calendar agent, shopping agent consuming `get_taste_context`).
4. Benchmark harness: panel users rate A/B/C arms (generic / self-described / Taste Passport) on hit-rate, novelty, cross-domain relevance.

## Honest limitations

- Mock graph is a deterministic stand-in (documented, labeled in UI) — flip to
  `live` with a key for the real thing.
- LLM (optional) only rephrases structured Qloo-derived data; it never invents
  recommendations.
- Confidence is a product indicator, not a psychometric claim — copy says
  "your selections suggest…", never "you are…".
