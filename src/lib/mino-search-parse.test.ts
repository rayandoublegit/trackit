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

  it("reads views, engagement, viral and growth without taking them for followers or niche", () => {
    expect(parseCreatorSearch("Find fitness creators with 100k+ views and 5% engagement")).toMatchObject({
      niche: "fitness",
      minViews: 100_000,
      minEngagement: 5,
      minFollowers: undefined,
    });
    expect(parseCreatorSearch("beauty tiktokers over 50k followers with engagement above 8%")).toMatchObject({
      niche: "beauty",
      minFollowers: 50_000,
      minEngagement: 8,
    });
    expect(parseCreatorSearch("Trouve des créatrices skincare avec plus de 20k vues et un taux d'engagement de 6,5 %")).toMatchObject({
      niche: "skincare",
      minViews: 20_000,
      minEngagement: 6.5,
    });
    expect(parseCreatorSearch("fast growing gaming creators with viral videos")).toMatchObject({ niche: "gaming", viral: true, sort: "growth" });
    expect(parseCreatorSearch("créateurs food en forte croissance avec un fort engagement")).toMatchObject({ niche: "food", sort: "growth", minEngagement: 6 });
    expect(parseCreatorSearch("Find skincare creators")).toMatchObject({ minViews: undefined, minEngagement: undefined, viral: undefined, sort: undefined });
  });

  it("describes performance filters", () => {
    expect(describeSearch({ niche: "fitness", minViews: 100_000, minEngagement: 5, viral: true, sort: "growth" })).toBe(
      "fitness · 100K+ views · 5%+ engagement · viral video · fast growing",
    );
    expect(describeSearch({ niche: "fitness", minEngagement: 6.5 }, "fr")).toBe("fitness · 6,5 %+ d'engagement");
  });

  it("describes a search in one line", () => {
    expect(describeSearch({ niche: "skincare", platform: "TikTok", minFollowers: 50_000, country: "FR", hasEmail: true })).toBe(
      "skincare · TikTok · 50K+ · FR · with email",
    );
  });
});
