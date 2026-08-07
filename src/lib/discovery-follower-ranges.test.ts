import { describe, expect, it } from "vitest";
import {
  creatorMatchesFollowerRange,
  DISCOVERY_FOLLOWER_RANGES,
  followerRangeBounds,
} from "@/lib/discovery-follower-ranges";

describe("DISCOVERY_FOLLOWER_RANGES", () => {
  it("keeps buckets exclusive (square — no overlap)", () => {
    const samples = [
      1_000, 5_000, 10_000, 10_001, 50_000, 100_000, 100_001, 250_000, 500_000, 500_001, 2_000_000,
    ];
    for (const followers of samples) {
      const hits = Object.entries(DISCOVERY_FOLLOWER_RANGES).filter(([, bounds]) =>
        creatorMatchesFollowerRange(followers, bounds)
      );
      expect(hits.length).toBe(1);
    }
  });

  it("puts micro creators in 1–10k and large fitness in 500k+", () => {
    expect(creatorMatchesFollowerRange(3_500, followerRangeBounds("1-10k"))).toBe(true);
    expect(creatorMatchesFollowerRange(3_500, followerRangeBounds("500k+"))).toBe(false);
    expect(creatorMatchesFollowerRange(750_000, followerRangeBounds("500k+"))).toBe(true);
    expect(creatorMatchesFollowerRange(750_000, followerRangeBounds("1-10k"))).toBe(false);
    expect(creatorMatchesFollowerRange(10_000, followerRangeBounds("1-10k"))).toBe(true);
    expect(creatorMatchesFollowerRange(10_000, followerRangeBounds("10-100k"))).toBe(false);
    expect(creatorMatchesFollowerRange(500_000, followerRangeBounds("100-500k"))).toBe(true);
    expect(creatorMatchesFollowerRange(500_000, followerRangeBounds("500k+"))).toBe(false);
  });

  it("rejects creators below 1k for the 1–10k bucket", () => {
    expect(creatorMatchesFollowerRange(999, followerRangeBounds("1-10k"))).toBe(false);
  });
});
