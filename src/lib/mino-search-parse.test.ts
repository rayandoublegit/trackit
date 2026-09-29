import { describe, expect, it } from "vitest";
import { describeSearch, parseCreatorSearch } from "./mino-search-parse";

describe("parseCreatorSearch", () => {
  it("ignores asks that are not creator searches", () => {
    expect(parseCreatorSearch("Schedule a call with Sarah tomorrow at 3pm")).toBeNull();
  });

  it("reads niche, platform, size, country and email", () => {
    expect(parseCreatorSearch("Find skincare creators on Instagram in France with 50k+ followers and email")).toEqual({
      niche: "skincare",
      platform: "Instagram",
      minFollowers: 50_000,
      maxFollowers: undefined,
      country: "FR",
      hasEmail: true,
    });
  });

  it("reads ranges and tiers", () => {
    const range = parseCreatorSearch("fitness tiktokers between 10k and 100k");
    expect(range).toMatchObject({ niche: "fitness", platform: "TikTok", minFollowers: 10_000, maxFollowers: 100_000 });
    const micro = parseCreatorSearch("micro influencers vegan food");
    expect(micro).toMatchObject({ niche: "vegan food", minFollowers: 10_000, maxFollowers: 100_000 });
    const under = parseCreatorSearch("search gaming creators under 1.5m in the US");
    expect(under).toMatchObject({ niche: "gaming", maxFollowers: 1_500_000, country: "US" });
  });

  it("describes a search in one line", () => {
    expect(describeSearch({ niche: "skincare", platform: "TikTok", minFollowers: 50_000, country: "FR", hasEmail: true })).toBe(
      "skincare · TikTok · 50K+ · FR · with email",
    );
  });
});
