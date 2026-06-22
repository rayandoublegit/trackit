import { describe, it, expect } from "vitest";
import { scoreQuality } from "@/lib/creator-quality";
import type { CreatorMetrics } from "@/lib/creator-metrics";

const NOW = Date.UTC(2026, 5, 21);
function metrics(p: Partial<CreatorMetrics>): CreatorMetrics {
  return {
    avgViews: 0, avgLikes: 0, avgComments: 0, avgShares: 0,
    engagementRate: 5, engagementByFollower: 2, viewsPerFollower: 0.2,
    postsAnalyzed: 10, lastPostAt: new Date(NOW - 2 * 86400000).toISOString(),
    postFrequency: 3, ...p,
  };
}

describe("scoreQuality", () => {
  it("healthy creator scores high and is ok", () => {
    const r = scoreQuality(50_000, metrics({}), { nowMs: NOW });
    expect(r.authenticityScore).toBe(100);
    expect(r.qualityStatus).toBe("ok");
  });

  it("flags inflated reach (eresfitness-like)", () => {
    const r = scoreQuality(6_726_894, metrics({ viewsPerFollower: 0.0033, engagementRate: 4.65 }), { nowMs: NOW });
    expect(r.authenticityScore).toBeLessThanOrEqual(60);
    expect(r.qualityStatus).toBe("inflated");
  });

  it("flags dead accounts (no post in >90d)", () => {
    const r = scoreQuality(50_000, metrics({ lastPostAt: new Date(NOW - 120 * 86400000).toISOString() }), { nowMs: NOW });
    expect(r.qualityStatus).toBe("dead");
    expect(r.authenticityScore).toBeLessThan(80);
  });

  it("penalizes low engagement", () => {
    const r = scoreQuality(20_000, metrics({ engagementRate: 0.5 }), { nowMs: NOW });
    expect(r.authenticityScore).toBe(75);
  });
});
