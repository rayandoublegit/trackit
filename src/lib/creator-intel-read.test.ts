import { describe, expect, it } from "vitest";
import { caseVariants, videoQueryFromParams } from "@/lib/creator-intel-read";

describe("caseVariants", () => {
  it("lists the spellings an `in` filter needs", () => {
    expect(caseVariants("fitness")).toEqual(["fitness", "Fitness", "FITNESS"]);
    expect(caseVariants("Weight loss")).toEqual(["Weight loss", "weight loss", "Weight Loss", "WEIGHT LOSS"]);
    expect(caseVariants("  ")).toEqual([]);
  });
});

describe("videoQueryFromParams source", () => {
  it("reads the snapshot paging flag", () => {
    expect(videoQueryFromParams(new URLSearchParams("source=snapshot&offset=24&limit=24"))).toMatchObject({ source: "snapshot", offset: 24, limit: 24 });
    expect(videoQueryFromParams(new URLSearchParams("source=other")).source).toBeUndefined();
  });
});
