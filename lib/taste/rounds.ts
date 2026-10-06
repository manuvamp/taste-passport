import type { TasteState } from "@/lib/types";
import { SEED_CARDS } from "@/data/cards";
import { VIBES } from "@/data/vibes";
import CARD_IMAGES from "@/data/card-images.json";
import VIBE_IMAGES from "@/data/vibe-images.json";
import { tasteSimilarity } from "@/lib/taste/engine";

export type RoundOption = { id: string; title: string; vibe: string; images: string[] };

// Round kinds are things anyone can read at a glance: no places, no people-heavy fashion, no logos.
const KINDS = new Set(["film", "tv", "food", "art", "book", "game", "hobby"]);
// hobby photos that came out off-theme or show faces
const HOBBY_SKIP = new Set(["h-climb", "h-skate", "h-boardgames", "h-guitar", "h-yoga"]);
const PORTRAITS = new Set(["kusama", "banksy", "basquiat", "kahlo", "murakami-takashi", "olafur-eliasson"]);

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

/**
 * One round = four options of the SAME kind: the best fit for this person, plus three that sit in
 * different moods but still suit them. Two spares ride along so the client can drop any bad photo.
 */
function oneRound(state: TasteState, kind: string, used: Set<string>, liked: Set<string>): RoundOption[] | null {
  const pool = candidates(state, kind).filter((c) => !used.has(c.id) && !liked.has(c.id));
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
  return chosen.map((c) => ({
    id: c.id,
    title: c.title,
    vibe: c.tags.filter((t) => !/^(unique|hong-kon)/.test(t)).slice(0, 2).join(" · "),
    images: c.images,
  }));
}

export function buildRounds(state: TasteState, kinds: string[], exclude: string[] = []): RoundOption[][] {
  const used = new Set(exclude);
  const liked = new Set(state.signals.filter((s) => s.interaction === "like").map((s) => s.cardId));
  const out: RoundOption[][] = [];
  for (const k of kinds.filter((x) => KINDS.has(x))) {
    const r = oneRound(state, k, used, liked);
    if (!r) continue;
    r.slice(0, 4).forEach((o) => used.add(o.id)); // spares may reappear later
    out.push(r);
  }
  return out;
}
