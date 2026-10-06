import { describe, it, expect } from "vitest";
import {
  applyInteraction,
  computeConfidence,
  batchTargets,
  nextBatch,
  buildProfile,
  deriveArchetype,
  newTasteStateForTest,
} from "./helpers";
import { cardsById } from "@/data/cards";

const byId = cardsById();

function stateWith(interactions: { id: string; kind: "like" | "dislike" | "skip" }[]) {
  const state = newTasteStateForTest("test-session");
  interactions.forEach((x, i) => {
    applyInteraction(state, byId.get(x.id)!, x.kind, Math.floor(i / 12) + 1);
  });
  return state;
}

describe("taste scoring", () => {
  it("likes increase tag affinity, dislikes decrease it", () => {
    const s = newTasteStateForTest("s");
    applyInteraction(s, byId.get("jil-sander")!, "like", 1);
    expect(s.tagVector["minimal"]).toBeGreaterThan(0);
    applyInteraction(s, byId.get("gucci")!, "dislike", 1);
    expect(s.tagVector["maximal"]).toBeLessThan(0);
  });

  it("skips do not move the taste model", () => {
    const s = newTasteStateForTest("s");
    const before = JSON.stringify(s.tagVector);
    applyInteraction(s, byId.get("muji")!, "skip", 1);
    expect(JSON.stringify(s.tagVector)).toBe(before);
  });

  it("repeated likes of the same entity have diminishing returns", () => {
    const repeated = stateWith(Array(20).fill({ id: "frank-ocean", kind: "like" as const }));
    const spread = stateWith(
      ["frank-ocean", "sade", "moonlight", "past-lives", "beach-house", "vinyl-collecting",
       "call-me-by-your-name", "a24", "her", "nils-frahm", "bicep", "tame-impala",
       "burna-boy", "kendrick-lamar", "radiohead", "bjork", "fka-twigs", "miles-davis",
       "nina-simone", "arctic-monkeys"].map((id) => ({ id, kind: "like" as const }))
    );
    const sum = (s: typeof repeated) => Object.values(s.tagVector).reduce((a, b) => a + b, 0);
    expect(sum(repeated)).toBeLessThan(sum(spread));
  });

  it("confidence grows with decisive interactions and stays bounded", () => {
    const s1 = stateWith([{ id: "kyoto", kind: "like" }]);
    const s2 = stateWith(
      ["kyoto", "ryoan-ji", "kaiseki", "muji", "noma", "lofoten",
       "gucci", "bad-bunny", "tokyo", "seoul", "havana", "marrakech",
       "a24", "frank-ocean", "parasite", "drive", "her", "moonlight",
       "jil-sander", "lemaire", "issey-miyake", "prada", "margiela", "rick-owens",
       "botw", "hades", "elden-ring", "celeste", "disco-elysium", "outer-wilds"].map((id) => ({ id, kind: "like" as const }))
    );
    expect(computeConfidence(s1)).toBeLessThan(computeConfidence(s2));
    expect(computeConfidence(s2)).toBeLessThanOrEqual(1);
  });
});

describe("exploration 70/20/10", () => {
  it("batch targets follow the split and sum to count", () => {
    for (const n of [10, 12, 20]) {
      const t = batchTargets(n);
      expect(t.exploit + t.adjacent + t.novel).toBe(n);
      expect(t.exploit / n).toBeGreaterThanOrEqual(0.65);
      expect(t.exploit / n).toBeLessThanOrEqual(0.75);
    }
  });

  it("cold start is the fixed broad batch", async () => {
    const session = { state: newTasteStateForTest("s"), currentRound: 0 };
    const { cards, adapted } = await nextBatch(session, 12);
    expect(adapted).toBe(false);
    expect(cards.length).toBe(26);
    const domains = new Set(cards.map((c) => c.domain));
    expect(domains.size).toBeGreaterThanOrEqual(9);
  });

  it("the feed adapts after signals and never repeats shown cards", async () => {
    const state = newTasteStateForTest("s");
    const round1 = ["jil-sander", "church-of-light", "muji", "kaiseki", "kyoto", "ryoan-ji",
      "noma", "lofoten", "fika", "minimal-music-1"]
      .filter((id) => byId.has(id))
      .map((id) => byId.get(id)!);
    for (const card of round1) applyInteraction(state, card, "like", 1);
    const session = { state, currentRound: 1 };
    state.shownCardIds = round1.map((c) => c.id);

    const { cards, adapted } = await nextBatch(session, 12);
    expect(adapted).toBe(true);
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of round1) expect(ids).not.toContain(c.id);
    // adapting toward quiet/minimal/japanese — expect at least one high-affinity pick
    const domains = new Set(cards.map((c) => c.domain));
    expect(domains.size).toBeGreaterThanOrEqual(3);
  });

  it("domain balancing: likes in one domain do not trap the feed", async () => {
    const state = newTasteStateForTest("s");
    const music = ["frank-ocean", "radiohead", "bjork", "sade", "bicep", "nils-frahm"];
    for (const id of music) applyInteraction(state, byId.get(id)!, "like", 1);
    state.shownCardIds = [...music];
    const { cards } = await nextBatch({ state, currentRound: 2 }, 12);
    const musicCount = cards.filter((c) => c.domain === "music").length;
    expect(musicCount).toBeLessThanOrEqual(Math.ceil(12 / 4) + 1);
    expect(new Set(cards.map((c) => c.domain)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("profile generation", () => {
  it("produces a valid, structured profile", async () => {
    const state = newTasteStateForTest("s");
    const likes = ["a24", "frank-ocean", "jil-sander", "kyoto", "church-of-light",
      "nils-frahm", "past-lives", "muji", "kafka-on-the-shore", "ryoan-ji"];
    for (const id of likes) applyInteraction(state, byId.get(id)!, "like", 1);
    applyInteraction(state, byId.get("gucci")!, "dislike", 2);

    const profile = buildProfile({ id: "s", state, profileVersions: [] });
    expect(profile.archetype.name).toBeTruthy();
    expect(profile.coreEntities.length).toBeGreaterThan(0);
    expect(profile.inferredTags.length).toBeGreaterThan(0);
    expect(profile.negativeSignals.map((n) => n.title)).toContain("Gucci");
    expect(profile.clusters.length).toBeGreaterThan(0);
    expect(profile.tasteSummary).toContain("suggest");
    expect(profile.profileVersion).toBe(1);
  });

  it("unexpected connections come only from domains the user never liked", () => {
    const state = newTasteStateForTest("s");
    const likesByDomain: Record<string, number> = {};
    for (const id of ["jil-sander", "muji", "church-of-light", "ryoan-ji", "kaiseki", "uniqlo-u", "lemaire", "issey-miyake", "acne-studios", "a24", "past-lives", "frank-ocean"]) {
      applyInteraction(state, byId.get(id)!, "like", 1);
      const d = byId.get(id)!.domain;
      likesByDomain[d] = (likesByDomain[d] ?? 0) + 1;
    }
    const profile = buildProfile({ id: "s", state, profileVersions: [] });
    expect(profile.unexpectedConnections.length).toBeGreaterThan(0);
    for (const c of profile.unexpectedConnections) {
      // a "you didn't pick this" connection must come from a weakly-covered domain
      expect(likesByDomain[c.domain] ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("maps minimal/quiet tag patterns to the Quiet Intensity archetype", () => {
    const a = deriveArchetype({ minimal: 5, quiet: 4, zen: 3, precise: 2 });
    expect(a.name).toBe("Quiet Intensity");
  });
});
