import { describe, it, expect } from "vitest";
import { applyInteraction, buildProfile, computeConfidence, newTasteStateForTest } from "./helpers";
import { cardsById } from "@/data/cards";
import { buildRounds } from "@/lib/taste/rounds";
import { anchorsFor, becauseOf, isTwin, likedIds, pickedTwins } from "@/lib/taste/signals";
import { mockAdapter } from "@/lib/qloo/mock";
import { buildRecommendations } from "@/lib/taste/recommend";

const byId = cardsById();
const QUIET_WALL = ["v-ramen", "v-sushi", "v-kyoto", "v-zen-garden", "v-tea", "v-concrete", "v-forest", "v-onsen", "v-film-grain", "v-vinyl", "v-cozy-room", "v-bookstore", "v-anime", "v-pastry", "v-coffee", "v-calligraphy", "v-bamboo", "v-library", "v-ceramics", "v-rain-window"];

function quietState() {
  const s = newTasteStateForTest("q");
  for (const id of QUIET_WALL) applyInteraction(s, byId.get(id)!, "like", 1);
  for (const id of ["h-hiking", "h-pottery", "h-read", "past-lives", "kaiseki", "spirited-away"]) applyInteraction(s, byId.get(id)!, "like", 2, `card:${id}`, "round", 1.6);
  return s;
}

describe("relative choices", () => {
  it("a deliberate choice counts more than a tap, and passing an option over is a light negative", () => {
    const tap = newTasteStateForTest("a");
    applyInteraction(tap, byId.get("drive")!, "like", 1);
    const chose = newTasteStateForTest("b");
    applyInteraction(chose, byId.get("drive")!, "like", 1, "card:drive", "round", 1.6);
    expect(chose.signals[0].weight).toBeGreaterThan(tap.signals[0].weight);

    applyInteraction(chose, byId.get("dune-2021")!, "dislike", 1, "card:dune-2021", "round:passed", 0.25);
    const pass = chose.signals[1];
    expect(pass.weight).toBeLessThan(0);
    expect(Math.abs(pass.weight)).toBeLessThan(0.4);
    // choosing one film over three others must not make you look anti-film
    applyInteraction(chose, byId.get("alien-1979")!, "dislike", 1, "card:alien-1979", "round:passed", 0.25);
    applyInteraction(chose, byId.get("la-haine")!, "dislike", 1, "card:la-haine", "round:passed", 0.25);
    expect(chose.domainWeights.film).toBeGreaterThan(0);
  });

  it("confidence stays modest after only a wall of vibe taps", () => {
    const s = newTasteStateForTest("c");
    for (const id of QUIET_WALL) applyInteraction(s, byId.get(id)!, "like", 1);
    expect(computeConfidence(s)).toBeLessThan(0.6);
  });
});

describe("profile edits", () => {
  it("removing a liked pick keeps what was passed over elsewhere", async () => {
    const { removeCardSignals } = await import("@/lib/taste/engine");
    const s = newTasteStateForTest("r");
    applyInteraction(s, byId.get("drive")!, "like", 1);
    for (const id of ["blade-runner-2049", "la-haine"]) applyInteraction(s, byId.get(id)!, "dislike", 1, `card:${id}`, "round:passed", 0.25);
    const noirBefore = s.tagVector.noir;
    removeCardSignals(s, "drive");
    expect(s.tagVector.noir ?? 0).toBeLessThanOrEqual(0); // the like is gone, the passes remain
    expect(s.tagVector.neon).toBeLessThan(0);
    expect(noirBefore).toBeGreaterThan(s.tagVector.noir ?? 0);
  });
});

describe("grounded explanations", () => {
  it("'because' only ever names things the user actually picked", () => {
    const s = quietState();
    const liked = new Set([...likedIds(s)].map((id) => byId.get(id)!.title));
    for (const id of ["kyoto", "ryoan-ji", "noma", "muji", "paterson-2016", "gucci"]) {
      for (const name of becauseOf(s, byId.get(id)!.tags)) expect(liked.has(name)).toBe(true);
    }
    expect(becauseOf(s, ["maximal", "loud"])).toEqual([]); // nothing they picked shares these
  });

  it("vibe tiles are stood in for by real entities, but labelled with the tile the user tapped", () => {
    const s = quietState();
    const anchors = anchorsFor(s, ["lifestyle", "travel"], { max: 10 });
    const proxy = anchors.find((a) => a.cardId === "onsen");
    expect(proxy?.label).toBe("Hot spring steam");
    for (const a of anchors) expect(a.picked).toBe(true);
  });

  it("never recommends the twin of something already picked", () => {
    expect(isTwin(byId.get("specialty-coffee")!, "v-coffee")).toBe(true);
    const s = quietState();
    const twins = pickedTwins(likedIds(s));
    expect(twins.has("specialty-coffee")).toBe(true);
    const profile = buildProfile({ id: "q", state: s, profileVersions: [] });
    for (const sg of profile.suggestions ?? []) expect(twins.has(sg.cardId)).toBe(false);
  });
});

describe("personal profile", () => {
  it("threads, hobbies and the narrative are built from real picks", () => {
    const s = quietState();
    const p = buildProfile({ id: "q", state: s, profileVersions: [] });
    const liked = new Set([...likedIds(s)].map((id) => byId.get(id)!.title));
    expect(p.threads!.length).toBeGreaterThan(0);
    for (const t of p.threads!) for (const item of t.items) expect(liked.has(item)).toBe(true);
    expect(p.hobbies!.map((h) => h.title)).toEqual(expect.arrayContaining(["Hiking", "Pottery"]));
    expect(p.narrative).toContain(p.threads![0].items[0]);
    expect(p.day!.length).toBeGreaterThanOrEqual(3);
    expect(p.day!.find((d) => d.slot === "Afternoon")?.title).toBe("Hiking"); // a hobby they said they'd do
  });
});

describe("adaptive rounds", () => {
  it("rounds are same-kind, skip what was picked, and auto rounds always find a kind that can fill", () => {
    const s = quietState();
    const rounds = buildRounds(s, ["food", "hobby", "auto", "auto", "auto", "auto"]);
    expect(rounds.length).toBe(6);
    const liked = likedIds(s);
    const twins = pickedTwins(liked);
    for (const r of rounds) {
      expect(r.options.length).toBeGreaterThanOrEqual(4);
      expect(r.prompt.length).toBeGreaterThan(5);
      for (const o of r.options) expect(liked.has(o.id) || twins.has(o.id)).toBe(false);
    }
    // the food round's options are all food; vibe lines are readable, not raw tags
    for (const o of rounds[0].options) expect(o.vibe).not.toMatch(/-food/);
  });

  it("no option is repeated across a batch of rounds", () => {
    const rounds = buildRounds(quietState(), ["film", "film", "book", "tv"]);
    const shown = rounds.flatMap((r) => r.options.slice(0, 4).map((o) => o.id));
    expect(new Set(shown).size).toBe(shown.length);
  });
});

describe("mock graph", () => {
  it("accepts card:-prefixed interests (what entity resolution returns in mock mode)", async () => {
    const r = await mockAdapter.getRecommendations({ interests: ["card:kyoto", "card:ryoan-ji"], take: 5 });
    expect(r.entities.length).toBeGreaterThan(0);
    expect(r.entities[0].affinity ?? 0).toBeGreaterThan(0);
  });

  it("recommendations are never empty and lead with a best-of section", async () => {
    const { sections, mode } = await buildRecommendations(quietState());
    expect(mode).toBe("mock");
    expect(sections[0].id).toBe("top");
    expect(sections[0].items.length).toBeGreaterThan(0);
    expect(sections.find((x) => x.id === "l-hobbies")?.items.length).toBeGreaterThan(0);
  });
});
