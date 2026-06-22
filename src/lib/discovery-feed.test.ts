import { describe, it, expect } from "vitest";
import { rankFeed } from "@/lib/discovery-feed";
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
