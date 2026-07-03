import { describe, it, expect } from "vitest";
import { rankFeed, creatorMatchesNicheFilter, nicheCatalogOrClause } from "@/lib/discovery-feed";
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

describe("nicheCatalogOrClause", () => {
  it("matches array tags and primary_niche", () => {
    const or = nicheCatalogOrClause("fitness");
    expect(or).toContain("niches.cs.{fitness}");
    expect(or).toContain("primary_niche.ilike.%fitness%");
  });

  it("expands e-commerce synonyms (dropshipping, moneymaker, …)", () => {
    const or = nicheCatalogOrClause("e-commerce");
    expect(or).toContain("niches.cs.{e-commerce}");
    expect(or).toContain("niches.cs.{dropshipping}");
    expect(or).toContain("niches.cs.{moneymaker}");
    expect(or).toContain("niches.cs.{shopify}");
    expect(or).toContain("primary_niche.ilike.%dropshipping%");
  });
});

describe("creatorMatchesNicheFilter e-commerce", () => {
  it("matches dropshipping / moneymaker creators under e-commerce", () => {
    expect(creatorMatchesNicheFilter({ niches: ["dropshipping"] }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["moneymaker"] }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ primaryNiche: "shopify" }, "e-commerce")).toBe(true);
    expect(creatorMatchesNicheFilter({ niches: ["fitness"] }, "e-commerce")).toBe(false);
  });
});

describe("creatorMatchesNicheFilter", () => {
  it("matches travel but not fitness", () => {
    const travel = { primaryNiche: "voyage pas cher", niche: "travel", niches: ["travel"] };
    const fitness = { primaryNiche: "coach sportif", niche: "fitness", niches: ["fitness"] };
    expect(creatorMatchesNicheFilter(travel, "travel")).toBe(true);
    expect(creatorMatchesNicheFilter(travel, "fitness")).toBe(false);
    expect(creatorMatchesNicheFilter(fitness, "fitness")).toBe(true);
    expect(creatorMatchesNicheFilter(fitness, "travel")).toBe(false);
  });
});
