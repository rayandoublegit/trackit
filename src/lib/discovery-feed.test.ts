import { describe, it, expect } from "vitest";
import { rankFeed, creatorMatchesNicheFilter, creatorMatchesGeoFilter, nicheCatalogOrClause, nicheOrClause } from "@/lib/discovery-feed";
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";

function creator(p: Partial<DiscoveryCreatorResult> & { username: string }): DiscoveryCreatorResult {
  return {
    username: p.username, displayName: p.username, avatarUrl: "", followersCount: p.followersCount ?? 50_000,
    engagementRate: p.engagementRate ?? 8, engagementByFollower: 0, avgViews: p.avgViews ?? 40_000,
    postFrequency: 0, lastPostAt: null, authenticityScore: 90, qualityStatus: "ok", platform: "TikTok",
    bio: "", email: null, niche: "fitness", primaryNiche: "fitness", language: "unknown",
    location: null, countryCode: null, videoThumbnails: [],
  };
}

describe("rankFeed", () => {
  it("adds value fields, dedups, and sorts by valueScore desc", () => {
    const out = rankFeed([
      creator({ username: "big", followersCount: 6_700_000, engagementRate: 4.7, avgViews: 22_000 }),   // ~15
      creator({ username: "micro", followersCount: 45_000, engagementRate: 8, avgViews: 40_000 }),       // ~81
      creator({ username: "micro" }),                                                                    // dup -> dropped
      creator({ username: "mid", followersCount: 200_000, engagementRate: 7, avgViews: 90_000 }),        // ~76
    ]);
    expect(out.map((c) => c.username)).toEqual(["micro", "mid", "big"]);
    expect(out[0].valueScore).toBe(81);
    expect(out[0].estCpm).toBeGreaterThan(0);
    expect(out[0].valueTier).toBe("micro");
    expect(out[0].estCostPerPost).toBe(150);
  });
});

describe("nicheOrClause", () => {
  it("matches array tags and exact primary_niche", () => {
    const or = nicheOrClause("fitness");
    expect(or).toContain("niches.cs.{fitness}");
    expect(or).toContain('primary_niche.ilike."fitness"');
    expect(or).not.toContain("%fitness%");
  });

  it("uses strict e-commerce tags only (no fitness pollution)", () => {
    const or = nicheCatalogOrClause("e-commerce");
    expect(or).toContain("niches.cs.{e-commerce}");
    expect(or).toContain("niches.cs.{dropshipping}");
    expect(or).toContain("niches.cs.{shopify}");
    expect(or).not.toContain("moneymaker");
    expect(or).not.toContain("ugc");
    expect(or).not.toContain("sidehustle");
    expect(or).not.toContain("fitness");
  });

  it("uses strict saas tags only", () => {
    const or = nicheOrClause("saas");
    expect(or).toContain("niches.cs.{saas}");
    expect(or).toContain('primary_niche.ilike."saas"');
    expect(or).not.toContain("startup");
    expect(or).not.toContain("software");
    expect(or).not.toContain("fitness");
  });
});

describe("creatorMatchesNicheFilter", () => {
  it("keeps every niche isolated (no cross-niche leak)", () => {
    const travel = { primaryNiche: "travel", niche: "travel", niches: ["travel"] };
    const fitness = { primaryNiche: "fitness", niche: "fitness", niches: ["fitness"] };
    const food = { primaryNiche: "food", niches: ["food", "recipes"] };
    expect(creatorMatchesNicheFilter(travel, "travel")).toBe(true);
    expect(creatorMatchesNicheFilter(travel, "fitness")).toBe(false);
    expect(creatorMatchesNicheFilter(fitness, "fitness")).toBe(true);
    expect(creatorMatchesNicheFilter(fitness, "travel")).toBe(false);
    expect(creatorMatchesNicheFilter(fitness, "food")).toBe(false);
    expect(creatorMatchesNicheFilter(food, "food")).toBe(true);
    expect(creatorMatchesNicheFilter(food, "fitness")).toBe(false);
    expect(creatorMatchesNicheFilter(food, "beauty")).toBe(false);
  });

  it("maps sport/sports tags into fitness", () => {
    expect(creatorMatchesNicheFilter({ niches: ["sport"] }, "fitness")).toBe(true);
    expect(creatorMatchesNicheFilter({ primaryNiche: "Sports" }, "fitness")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["sport"] }, "travel")).toBe(false);
  });

  it("matches only exact e-commerce / saas tags", () => {
    expect(creatorMatchesNicheFilter({ niches: ["dropshipping"] }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["e-commerce"] }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ primaryNiche: "shopify" }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["fitness"] }, "e-commerce")).toBe(false);
    expect(creatorMatchesNicheFilter({ niches: ["ugc"] }, "e-commerce")).toBe(false);
    expect(creatorMatchesNicheFilter({ niches: ["moneymaker"] }, "e-commerce")).toBe(false);

    expect(creatorMatchesNicheFilter({ niches: ["saas"] }, "saas")).toBe(true);
    expect(creatorMatchesNicheFilter({ primaryNiche: "saas" }, "saas")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["startup"] }, "saas")).toBe(false);
    expect(creatorMatchesNicheFilter({ niches: ["fitness"] }, "saas")).toBe(false);
  });
});

describe("creatorMatchesGeoFilter", () => {
  it("matches country + language together", () => {
    const frFitness = { countryCode: "FR", language: "fr" };
    const usLifestyle = { countryCode: "US", language: "en" };
    expect(creatorMatchesGeoFilter(frFitness, { country: "FR", language: "fr" })).toBe(true);
    expect(creatorMatchesGeoFilter(frFitness, { country: "US", language: "en" })).toBe(false);
    expect(creatorMatchesGeoFilter(usLifestyle, { country: "US", language: "en" })).toBe(true);
    expect(creatorMatchesGeoFilter(usLifestyle, { country: "FR", language: "fr" })).toBe(false);
  });

  it("allows null country_code when country filter is set", () => {
    expect(creatorMatchesGeoFilter({ countryCode: null, language: "fr" }, { country: "FR", language: "fr" })).toBe(true);
    expect(creatorMatchesGeoFilter({ countryCode: "DE", language: "fr" }, { country: "FR", language: "fr" })).toBe(false);
  });
});
