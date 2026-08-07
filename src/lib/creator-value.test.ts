import { describe, it, expect } from "vitest";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier, FREE_FEED_VISIBLE } from "@/lib/creator-value";

describe("estimatedCostPerPost", () => {
  it("tiers by followers", () => {
    expect(estimatedCostPerPost(5_000)).toBe(50);
    expect(estimatedCostPerPost(45_000)).toBe(150);
    expect(estimatedCostPerPost(200_000)).toBe(500);
    expect(estimatedCostPerPost(800_000)).toBe(1800);
    expect(estimatedCostPerPost(4_000_000)).toBe(5000);
    expect(estimatedCostPerPost(6_700_000)).toBe(12000);
  });
});

describe("valueTier", () => {
  it("labels by size", () => {
    expect(valueTier(5_000)).toBe("nano");
    expect(valueTier(45_000)).toBe("micro");
    expect(valueTier(200_000)).toBe("mid");
    expect(valueTier(800_000)).toBe("macro");
    expect(valueTier(4_000_000)).toBe("mega");
  });
});

describe("estimatedCpm", () => {
  it("cost per 1000 real views, rounded to 0.1", () => {
    expect(estimatedCpm(150, 40_000)).toBe(3.8); // 150 / 40
    expect(estimatedCpm(5000, 108_000)).toBeCloseTo(46.3, 1);
  });
  it("hides CPM when views sample is too thin", () => {
    expect(estimatedCpm(150, 0)).toBe(0);
    expect(estimatedCpm(50, 308)).toBe(0); // nano 1-post trap
  });
});

describe("valueScore", () => {
  it("micro engaged scores high", () => {
    expect(valueScore(45_000, 8, 40_000)).toBe(81);
  });
  it("mid scores well", () => {
    expect(valueScore(200_000, 7, 90_000)).toBe(76);
  });
  it("big healthy account is mediocre value", () => {
    expect(valueScore(4_000_000, 13, 108_000)).toBe(44);
  });
  it("big inflated account scores low", () => {
    expect(valueScore(6_700_000, 4.7, 22_000)).toBe(15);
  });
  it("clamps to 0-100", () => {
    const s = valueScore(5_000, 50, 50_000);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("FREE_FEED_VISIBLE", () => {
  it("defaults to 15 (screen-filling) when unset", () => expect(FREE_FEED_VISIBLE).toBe(15));
});
