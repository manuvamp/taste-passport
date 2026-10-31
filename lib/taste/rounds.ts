import type { TasteState } from "@/lib/types";
import { SEED_CARDS } from "@/data/cards";
import { VIBES } from "@/data/vibes";
import CARD_IMAGES from "@/data/card-images.json";
import VIBE_IMAGES from "@/data/vibe-images.json";
import { tasteSimilarity } from "@/lib/taste/engine";
import { becauseOf, likedIds, pickedTwins, prettyTag } from "@/lib/taste/signals";

export type RoundOption = { id: string; title: string; vibe: string; images: string[] };
/** One four-way question: what to ask, why it's being asked of you, and the options (plus spares). */
export type Round = { kind: string; prompt: string; context?: string; options: RoundOption[] };

// Round kinds are things anyone can read at a glance: no places, no people-heavy fashion, no logos.
const KINDS = new Set(["film", "tv", "food", "art", "book", "hobby"]);
// games have no curated photos yet (live game cards come through the feed), so rounds skip them
const AUTO_KINDS = ["film", "tv", "food", "book", "art"]; // art last: few people-free photos
// hobby photos that came out off-theme or show faces
const HOBBY_SKIP = new Set(["h-climb", "h-skate", "h-boardgames", "h-guitar", "h-yoga"]);
const PORTRAITS = new Set(["kusama", "banksy", "basquiat", "kahlo", "murakami-takashi", "olafur-eliasson"]);

/** Concrete, situational questions — "what's for dinner" reads faster than "which do you prefer". */
const PROMPTS: Record<string, string[]> = {
  film: ["Friday night, one film. Which?", "Which would you press play on?", "One ticket left — which screening?", "Which film stays with you?"],
  tv: ["Which series do you start tonight?", "Which would you binge this weekend?", "One more episode of…?"],
  food: ["What's for dinner tonight?", "Where are you eating this weekend?", "Which table do you want a seat at?", "Which would you travel for?"],
  art: ["Which would you hang at home?", "Which room of the museum do you walk into?", "Which one makes you stop?"],
  book: ["Which do you read first?", "Which would you take on a long trip?", "Which would you pick up in a bookshop?"],
  game: ["Which world would you get lost in?", "Which would you play tonight?", "Which game would you lose a weekend to?"],
  hobby: ["Which would you actually do this weekend?", "Free Saturday. Which?", "Which would you sign up for?", "Which sounds like you?"],
};

type Cand = { id: string; title: string; tags: string[]; images: string[]; kind: string; fit: number };

/** Commons thumbs come at 360px; ask for the sharper 500px rendition. */
const sharper = (u: string) => u.replace(/\/(\d+)px-/, "/500px-");

function candidates(state: TasteState, kind: string): Cand[] {
  if (kind === "hobby") {
    const imgs = VIBE_IMAGES as Record<string, string[]>;
    return VIBES.filter((v) => v.id.startsWith("h-") && !HOBBY_SKIP.has(v.id) && imgs[v.id]?.length).map((v) => ({
      id: v.id,
      title: v.title,
      tags: v.tags,
      images: imgs[v.id].slice(0, 4).map(sharper),
      kind,
      fit: tasteSimilarity(state, v.tags),
    }));
  }
  const imgs = CARD_IMAGES as Record<string, string>;
  return SEED_CARDS.filter((c) => c.domain === kind && imgs[c.id] && !PORTRAITS.has(c.id)).map((c) => ({
    id: c.id,
    title: c.title.split(/\s[—–-]\s/)[0],
    tags: c.tags,
    images: [imgs[c.id]],
    kind,
    fit: tasteSimilarity(state, c.tags),
  }));
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const inter = b.filter((t) => A.has(t)).length;
  return inter / (A.size + b.length - inter || 1);
};

/** Readable mood line for an option: "Japanese · seasonal" rather than raw tags. */
const vibeLine = (tags: string[]) =>
  tags
    .filter((t) => !/^(unique|hong-kon)/.test(t))
    .slice(0, 2)
    .map(prettyTag)
    .join(" · ");

/**
 * One round = four options of the SAME kind: the best fit for this person, plus three that sit in
 * different moods but still suit them, so the choice tells us which way they lean. Two spares ride
 * along so the client can drop any bad photo.
 */
function oneRound(state: TasteState, kind: string, used: Set<string>, n: number): Round | null {
  const pool = candidates(state, kind).filter((c) => !used.has(c.id));
  if (pool.length < 4) return null;
  const maxFit = Math.max(...pool.map((c) => c.fit), 0.0001);
  const chosen: Cand[] = [];
  const jitter = () => Math.random() * 0.08;
  // anchor: strongest fit (with jitter so equal tastes don't see identical rounds)
  const first = [...pool].sort((a, b) => b.fit / maxFit + jitter() - (a.fit / maxFit + jitter()))[0];
  chosen.push(first);
  while (chosen.length < 6) {
    let best: Cand | null = null;
    let bestScore = -1;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      const diversity = 1 - Math.max(...chosen.map((x) => jaccard(x.tags, c.tags)));
      const score = 0.45 * (c.fit / maxFit) + 0.55 * diversity + jitter();
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  // tell people why this round looks the way it does — only when a real pick backs it up
  const because = first.fit > 0.05 ? becauseOf(state, first.tags, { exclude: first.id }) : [];
  const prompts = PROMPTS[kind] ?? ["Which one pulls you?"];
  return {
    kind,
    prompt: prompts[n % prompts.length],
    context: because.length ? `Tuned to your picks: ${because.join(" & ")}` : undefined,
    options: chosen.map((c) => ({ id: c.id, title: c.title, vibe: vibeLine(c.tags), images: c.images })),
  };
}

/** "auto" → kinds ordered by how little we know, so each round sharpens the blurriest part of the picture. */
function autoKinds(state: TasteState, taken: string[]): string[] {
  const count: Record<string, number> = {};
  for (const s of state.signals) if (s.interaction !== "skip") count[s.domain] = (count[s.domain] ?? 0) + 1;
  for (const k of taken) count[k] = (count[k] ?? 0) + 3; // spread a batch of auto rounds across kinds
  return [...AUTO_KINDS].sort((a, b) => (count[a] ?? 0) - (count[b] ?? 0));
}

export function buildRounds(state: TasteState, kinds: string[], exclude: string[] = [], offset = 0): Round[] {
  const liked = likedIds(state);
  const used = new Set([...exclude, ...liked, ...pickedTwins(liked)]);
  const out: Round[] = [];
  const taken: string[] = [];
  kinds.forEach((raw, i) => {
    // an auto round falls through to the next-least-known kind that can still fill four options
    let r: Round | null = null;
    for (const k of raw === "auto" ? autoKinds(state, taken) : [raw]) {
      if (KINDS.has(k) && (r = oneRound(state, k, used, offset + i))) break;
    }
    if (!r) return;
    taken.push(r.kind);
    r.options.slice(0, 4).forEach((o) => used.add(o.id)); // spares may reappear later
    out.push(r);
  });
  return out;
}
