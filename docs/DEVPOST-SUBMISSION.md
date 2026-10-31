# Devpost submission: Taste Passport (Qloo Agentic Hackathon)

Hackathon: https://qloo.devpost.com/  (deadline Oct 31 2026, 11:45 AM GMT+8)

## Basic fields
- Project name: Taste Passport
- Tagline / elevator pitch (short, max 200 chars):
  Teach AI what you love. Tap pictures, pick between four, and Qloo's taste graph turns it into one portable cultural fingerprint any AI agent can use via API or MCP.
- Try it out links:
  - https://taste-passport-nu.vercel.app
  - https://github.com/manuvamp/taste-passport
- Demo video: YouTube link (Manu will provide; leave EMPTY if not given)
- Built with (tags, add one at a time): qloo, next.js, react, typescript, tailwindcss, framer-motion, node.js, vercel, mcp, vitest

## Project story (Markdown, paste into "About the project" / story field)

## Inspiration
AI agents can reason, plan and book things, but they are culturally blind about *you*. Ask one for "a perfect Saturday in Tokyo" and you get the world's most average Saturday. We wanted to fix the input side: before the question is even asked, the agent should already hold a structured, explainable model of your taste.

## What it does
Taste Passport turns a few minutes of tapping into a portable cultural fingerprint.

1. **Vibe wall**: tap 15–25 people-free photos (dishes, places, rooms, textures) that feel like you. Each pick swaps in something new.
2. **Adaptive feed**: every card resolves to a real cultural entity (artist, film, brand, place, book, game). Each batch is re-scored against Qloo and mixed 70% close to your taste, 20% adjacent, 10% deliberate surprise.
3. **Four-way rounds**: three short chapters of "which one?" questions (film, food, books, art, TV, sports & hobbies), each built from your previous answer, plus a "Sharpen" chapter that targets what we know least about.
4. **Taste DNA**: an archetype, a constellation of your clusters, and *Unexpected connections*: cross-domain bridges from Qloo with a "Why this?" that cites which of your signals drove each one.
5. **Agent mode**: "Plan my Saturday in Tokyo" answered twice, generically and taste-grounded, side by side in a **What Qloo changed** panel with match % and per-item provenance. Tapping "♥ Very me" feeds back into the profile.
6. **Portable**: any agent can read the profile through a JSON API or an MCP server (`get_taste_context`, `recommend_for_context`, `explain_taste_match`, `record_feedback`, and more), hosted over HTTP or run locally over stdio.

## How we built it
- **Next.js App Router** on Vercel. All Qloo calls run in server routes, so the API key never reaches the browser (a test enforces it).
- **Qloo adapter**: `/search` for entity resolution and `/v2/insights` with explainability for cross-domain affinity, behind one interface with a TTL cache, metrics and graceful fallback.
- **Taste engine**: pure, unit-tested TypeScript. Likes attract and dislikes repel with diminishing returns, recency weighting and per-domain balancing. Ranking: `0.40·qlooAffinity + 0.25·bridgeSimilarity + 0.15·tagSimilarity + 0.10·domainBalance + 0.10·novelty`. In four-way rounds the pick counts ×1.6 and the three passed-over options count lightly against (×0.25), so every answer is relative.
- **Taste agent**: retrieval → Qloo ranking → grounded plan. The optional LLM only polishes prose from structured Qloo-derived data; it never invents picks.
- **MCP server** with the same tools for external agents, plus `/demo` personas (Maya and Alex) and a `/dev` dashboard showing Qloo latency, cache and weights.

## Challenges we ran into
- Making a photo tap mean something cultural: every card had to map to a real entity, and food and lifestyle photos had to actually match the dish or activity they stood for.
- Keeping rounds feeling personal and fast: each round is built one step ahead on the server so it reflects the choice just made.
- Balancing exploitation and exploration so the profile doesn't become a filter bubble ("taste isn't a prison").

## Accomplishments that we're proud of
- Cross-domain transfer you can see: liking Jil Sander, Kyoto and A24 surfaces kaiseki, Ryōan-ji and ambient piano, with Qloo's explanation for each link.
- The side-by-side "What Qloo changed" view, which makes the value of taste data obvious in one screen.
- A profile that is actually portable today through API and MCP, with anonymous sessions, export and delete.

## What we learned
Taste transfers across domains far more than single-domain recommenders assume, and Qloo's graph makes that transfer explainable. Agents get dramatically better at personal requests when they get structured taste context rather than a longer prompt.

## What's next for Taste Passport
- Postgres/Supabase persistence behind the same store interface.
- Photo → embedding → entity resolution for any image you upload.
- Opt-in shareable taste cards, and more agents consuming `get_taste_context` (calendar, shopping, travel).
- A benchmark where panel users rate generic vs self-described vs Taste Passport answers on hit rate, novelty and cross-domain relevance.

## ADDENDUM: paste these sections at the END of the project story (after "What's next")

## Problem statement
AI agents give everyone the same "average" answer for personal requests (where to eat, what to watch, how to spend a Saturday) because they have no structured, explainable signal about the person's cultural taste. Questionnaires are tedious and self-descriptions are vague.

## Qloo APIs used, and why they fit
We call the Qloo hackathon API (`https://hackathon.api.qloo.com`) directly from server routes:
- **`GET /search`** for entity resolution: every card the user taps maps to a real Qloo entity ID, so a tap becomes a cultural signal rather than a pixel similarity.
- **`GET /v2/insights`** with `signal.interests.entities`, `filter.type`, `sort_by=affinity` and `feature.explainability=true` for cross-domain recommendations. Explainability tells us which of the user's own picks drove each result, so every "Why this?" is grounded in Qloo data, not written by an LLM.
- **`GET /v2/tags`** to map broad concepts (cuisines, genres, moods) to Qloo tags. The optional `filter.location.query` biases plans to a city.
Results are cached (TTL), metered, and degrade gracefully to curated cards if a call fails.

## Request → result (redacted, real example)
1. User taps a Jil Sander look and a Kyoto street. `/search?query=Jil Sander&take=1` → brand `Jil Sander` (`3DF8B961-…`); `/search?query=Kyoto&types=urn:entity:destination&take=1` → destination `Kyoto` (`95E19B2C-…`). Entity choice: we take the top result constrained to the card's domain type, so "Kyoto" resolves to the destination, not a restaurant or song of the same name.
2. `/v2/insights?filter.type=urn:entity:artist&signal.interests.entities=<Jil Sander>,<Kyoto>&take=5&sort_by=affinity&feature.explainability=true` → artists **FKA twigs, Kate Bush, Aaliyah**, with tags like *Art Pop*, *Avant-Garde*, *Ethereal*, *Trip Hop*.
3. The taste engine blends Qloo affinity (40%) with bridge, tag, domain-balance and novelty scores, shows the result as "close to your taste", and cites the contributing picks in "Why this?". The API key header is never sent to the browser.

## Setup (clean environment)
Requires Node.js 20+.
```
git clone https://github.com/manuvamp/taste-passport.git
cd taste-passport
npm install
cp .env.example .env.local
# runs with zero credentials in mock mode (deterministic local graph).
# For real Qloo data, edit .env.local:
#   QLOO_MODE=live
#   QLOO_API_KEY=<your hackathon key>
#   QLOO_BASE_URL=https://hackathon.api.qloo.com
npm run dev        # http://localhost:3000
npx vitest run     # unit tests
```
Then visit `/demo` to load the Maya/Alex personas and `/agent` for the side-by-side Tokyo plan. The MCP server lives in `mcp/` (see README).

## Responsible data handling
- The Qloo key stays server-side; a test fails the build if it could reach client code.
- Sessions are anonymous (random cookie ID). No names, emails or device IDs are collected or sent to Qloo. Qloo only receives entity IDs, tag queries and an optional city name.
- Users can export or delete their profile.

## Known limitations (what the result does NOT establish)
- Qloo results describe what groups of people with similar tastes tend to like. They are not a prediction of what one individual will do, and the profile copy says "your selections suggest…", never "you are…".
- The confidence score reflects how much signal we have, not a psychometric measurement.
- Photo-to-entity mapping uses a curated card catalog; arbitrary photos are not yet resolved.
- The store is a single JSON file (fine for a demo, not multi-instance production).
- We have not yet run a user study proving taste-grounded plans beat generic ones; the side-by-side view is qualitative evidence only.
- The optional LLM only rephrases Qloo-derived data; with it off, all text comes from templates.

## Other fields
- Team: solo, Manu (the logged-in Devpost account). Do not invite anyone.
- Any question not covered here (country, Qloo usage questions, etc.): write down the question text and leave it blank for the main agent.
