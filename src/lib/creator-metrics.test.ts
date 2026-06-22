import { describe, it, expect } from "vitest";
import { median, computeMetrics, type VideoStat } from "@/lib/creator-metrics";

function vid(p: Partial<VideoStat>): VideoStat {
  return { playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, createTime: 0, isAd: false, ...p };
}

describe("median", () => {
  it("odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("even length", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("empty", () => expect(median([])).toBe(0));
});

describe("computeMetrics", () => {
  const NOW = Date.UTC(2026, 5, 21) / 1000; // seconds
  const day = 86400;

  it("uses real medians and excludes ads", () => {
    const videos = [
      vid({ playCount: 20000, likeCount: 900, commentCount: 80, shareCount: 20, createTime: NOW - day }),
      vid({ playCount: 24000, likeCount: 1100, commentCount: 100, shareCount: 40, createTime: NOW - 2 * day }),
      vid({ playCount: 999999, likeCount: 1, commentCount: 1, shareCount: 1, createTime: NOW - 3 * day, isAd: true }),
    ];
    const m = computeMetrics(1_000_000, videos, { nowMs: NOW * 1000 });
    expect(m.postsAnalyzed).toBe(2); // ad excluded
    expect(m.avgViews).toBe(22000); // median of 20000, 24000
    expect(m.engagementRate).toBeGreaterThan(4); // ~ (1000+1240)/... per view
    expect(m.viewsPerFollower).toBeCloseTo(0.022, 3);
    expect(m.lastPostAt).toBe(new Date((NOW - day) * 1000).toISOString());
  });

  it("returns zeros for no videos", () => {
    const m = computeMetrics(1000, [], { nowMs: NOW * 1000 });
    expect(m.avgViews).toBe(0);
    expect(m.postsAnalyzed).toBe(0);
    expect(m.lastPostAt).toBeNull();
  });

  it("ignores zero-view videos in per-view engagement", () => {
    const videos = [vid({ playCount: 0, likeCount: 5, createTime: NOW })];
    const m = computeMetrics(1000, videos, { nowMs: NOW * 1000 });
    expect(m.engagementRate).toBe(0);
  });
});
