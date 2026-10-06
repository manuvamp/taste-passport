import { describe, it, expect } from "vitest";
import { mockAdapter, mockAffinity, tagAffinity } from "@/lib/qloo/mock";
import { getQlooAdapter } from "@/lib/qloo";
import { cardsById } from "@/data/cards";

describe("mock Qloo adapter", () => {
  it("resolves entities by search", async () => {
    const results = await mockAdapter.searchEntities({ query: "Jil Sander" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Jil Sander");
    expect(results[0].entityId).toMatch(/^mock:/);
  });

  it("search is case-insensitive and tolerant", async () => {
    const results = await mockAdapter.searchEntities({ query: "kyoto" });
    expect(results[0].name).toBe("Kyoto");
  });

  it("recommendations come back ranked with explainability data", async () => {
    const recs = await mockAdapter.getRecommendations({
      interests: ["jil-sander", "kyoto", "a24", "frank-ocean"],
      take: 10,
    });
    expect(recs.entities.length).toBeGreaterThan(0);
    expect(recs.source).toBe("mock");
    const affinities = recs.entities.map((e) => e.affinity ?? 0);
    expect([...affinities].sort((a, b) => b - a)).toEqual(affinities); // ranked desc
    const withExplain = recs.entities.filter((e) => Object.keys(e.explainability ?? {}).length > 0);
    expect(withExplain.length).toBeGreaterThan(0);
  });

  it("cross-domain: quiet/minimal interests surface lifestyle & architecture, not only fashion", async () => {
    const recs = await mockAdapter.getRecommendations({
      interests: ["jil-sander", "church-of-light", "ryoan-ji", "muji"],
      take: 12,
    });
    const domains = new Set(recs.entities.map((e) => e.type));
    expect(domains.size).toBeGreaterThanOrEqual(2);
    // bridge: jil-sander → church-of-light must score high
    expect(mockAffinity("church-of-light", { "jil-sander": 1 })).toBeGreaterThanOrEqual(0.85);
  });

  it("domain-filtered requests only return that domain", async () => {
    const recs = await mockAdapter.getRecommendations({
      interests: ["kyoto", "muji", "a24"],
      domain: "food",
      take: 5,
    });
    for (const e of recs.entities) {
      expect(e.type).toBe("urn:entity:place");
    }
  });

  it("excludes already-seen/liked entities", async () => {
    const recs = await mockAdapter.getRecommendations({
      interests: ["kyoto"],
      take: 10,
      excludeIds: ["kyoto", "ryoan-ji"],
    });
    const names = recs.entities.map((e) => e.name);
    expect(names).not.toContain("Kyoto");
  });
});

describe("adapter factory", () => {
  it("defaults to mock without credentials", () => {
    delete process.env.QLOO_MODE;
    delete process.env.QLOO_API_KEY;
    expect(getQlooAdapter().mode).toBe("mock");
  });

  it("switches to live when mode + key are set", () => {
    process.env.QLOO_MODE = "live";
    process.env.QLOO_API_KEY = "test-key";
    expect(getQlooAdapter().mode).toBe("live");
    delete process.env.QLOO_MODE;
    delete process.env.QLOO_API_KEY;
  });
});

describe("tag affinity math", () => {
  it("is symmetric and bounded", () => {
    const a = new Set(["minimal", "quiet", "zen"]);
    const b = new Set(["quiet", "zen", "craft"]);
    const ab = tagAffinity(a, b);
    expect(ab).toBeCloseTo(tagAffinity(b, a));
    expect(ab).toBeGreaterThan(0);
    expect(ab).toBeLessThanOrEqual(1);
    expect(tagAffinity(new Set(), b)).toBe(0);
  });

  it("every seed card resolves via cardsById", () => {
    const byId = cardsById();
    expect(byId.size).toBeGreaterThanOrEqual(150);
  });
});
