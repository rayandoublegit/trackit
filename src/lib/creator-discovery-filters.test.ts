import { describe, it, expect } from "vitest";
import { normalizeDiscoveryFilters, DEFAULT_QUALITY_GATE } from "@/lib/creator-discovery-filters";

const NOW = Date.UTC(2026, 5, 21);

describe("normalizeDiscoveryFilters", () => {
  it("applies the default quality gate and engagement-first sort", () => {
    const f = normalizeDiscoveryFilters({ niche: "fitness", platform: "TikTok" }, NOW);
    expect(f.platform).toBe("TikTok");
    expect(f.nicheTokens).toContain("fitness");
    expect(f.minAuthenticity).toBe(DEFAULT_QUALITY_GATE.minAuthenticity);
    expect(f.excludeStatuses).toEqual(DEFAULT_QUALITY_GATE.excludeStatuses);
    expect(f.sort[0]).toEqual({ column: "engagement_rate", ascending: false });
  });

  it("computes activeSince from activeWithinDays", () => {
    const f = normalizeDiscoveryFilters({ niche: "food", activeWithinDays: 30 }, NOW);
    expect(f.activeSince).toBe(new Date(NOW - 30 * 86400000).toISOString());
  });

  it("honors followers/views/engagement bounds", () => {
    const f = normalizeDiscoveryFilters({ niche: "x", minFollowers: 1000, maxFollowers: 50000, minEngagement: 3, minViews: 5000 }, NOW);
    expect(f.followers).toEqual({ gte: 1000, lte: 50000 });
    expect(f.minEngagement).toBe(3);
    expect(f.minViews).toBe(5000);
  });

  it("includeLowQuality disables the gate", () => {
    const f = normalizeDiscoveryFilters({ niche: "x", includeLowQuality: true }, NOW);
    expect(f.minAuthenticity).toBe(0);
    expect(f.excludeStatuses).toEqual([]);
  });

  it("hasEmail flag", () => {
    expect(normalizeDiscoveryFilters({ niche: "x", hasEmail: true }, NOW).hasEmail).toBe(true);
  });
});
