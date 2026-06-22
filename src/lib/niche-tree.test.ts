import { describe, it, expect } from "vitest";
import { getDailySlice, buildSeedTargets } from "@/lib/niche-tree";

describe("getDailySlice", () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  it("returns a slice of the requested size", () => {
    expect(getDailySlice(items, 0, 3)).toEqual([0, 1, 2]);
    expect(getDailySlice(items, 1, 3)).toEqual([3, 4, 5]);
  });
  it("wraps around deterministically", () => {
    expect(getDailySlice(items, 3, 3)).toEqual([9, 0, 1]);
  });
  it("covers every item across enough days", () => {
    const seen = new Set<number>();
    for (let d = 0; d < 10; d++) getDailySlice(items, d, 3).forEach((x) => seen.add(x));
    expect(seen.size).toBe(items.length);
  });
  it("handles empty / zero size", () => {
    expect(getDailySlice([], 0, 3)).toEqual([]);
    expect(getDailySlice(items, 0, 0)).toEqual([]);
  });
});

describe("buildSeedTargets", () => {
  it("still returns parent + sub targets", () => {
    const t = buildSeedTargets();
    expect(t.length).toBeGreaterThan(100);
    expect(t.find((x) => x.query === "fitness")).toBeTruthy();
  });
});
