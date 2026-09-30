import { describe, expect, it } from "vitest";
import { creatorFiltersToParams, videoFiltersToParams, type CreatorFilterInput, type VideoFilterInput } from "./catalog-filter-params";
import { catalogQueryFromParams, countryOrClause, nicheClause } from "./catalog-query";
import { postedBounds, videoNicheClause, videoQueryFromParams } from "./creator-intel-read";
import { isViralVideo, medianViews } from "./viral";

const creatorBase: CreatorFilterInput = {
  platform: "tiktok",
  niche: "",
  followersRange: "",
  viewsFrom: "",
  engagement: "",
  reach: "",
  likes: "",
  comments: "",
  shares: "",
  viral: false,
  country: "",
  language: "",
  activity: "",
  hasEmail: false,
  verified: false,
};

const videoBase: VideoFilterInput = {
  niche: "",
  country: "",
  language: "",
  minViews: "",
  postedWithin: "",
  postedFrom: "",
  postedTo: "",
  mediaType: "",
  duration: "",
  hasProduct: false,
  viral: false,
  sort: "views",
};

describe("creator filters → /api/catalog params → CatalogQuery", () => {
  it("maps every filter of the bar", () => {
    const params = creatorFiltersToParams(
      {
        ...creatorBase,
        niche: "fitness",
        followersRange: "10-100k",
        viewsFrom: "50k",
        engagement: "6+",
        reach: "0.5",
        likes: "1k",
        comments: "100",
        shares: "10k",
        viral: true,
        country: "FR",
        language: "fr",
        activity: "7",
        hasEmail: true,
        verified: true,
      },
      "",
      "viral",
    );
    expect(params).toEqual({
      platform: "tiktok",
      sort: "viral",
      niche: "fitness",
      minFollowers: "10001",
      maxFollowers: "100000",
      minViews: "50000",
      minEngagement: "6",
      minReach: "0.5",
      minLikes: "1000",
      minComments: "100",
      minShares: "10000",
      viral: "1",
      country: "FR",
      language: "fr",
      activeWithinDays: "7",
      hasEmail: "1",
      verified: "1",
    });
    const q = catalogQueryFromParams(new URLSearchParams(params));
    expect(q).toMatchObject({
      niche: "fitness",
      minFollowers: 10_001,
      maxFollowers: 100_000,
      minViews: 50_000,
      minEngagement: 6,
      minReach: 0.5,
      minLikes: 1_000,
      minComments: 100,
      minShares: 10_000,
      viral: true,
      country: "FR",
      language: "fr",
      activeWithinDays: 7,
      hasEmail: true,
      verified: true,
      platform: "TikTok",
      sort: "viral",
    });
  });

  it("keeps performance filters on a name search, drops niche and place", () => {
    const params = creatorFiltersToParams({ ...creatorBase, niche: "beauty", country: "FR", engagement: "3+", followersRange: "500k+" }, "@Luna", "followers");
    expect(params).toMatchObject({ search: "Luna", minEngagement: "3", minFollowers: "500001" });
    expect(params.niche).toBeUndefined();
    expect(params.country).toBeUndefined();
  });

  it("ignores unknown values and empty filters", () => {
    expect(creatorFiltersToParams({ ...creatorBase, likes: "lots", country: "XX", activity: "abc" })).toEqual({ platform: "tiktok", sort: "followers" });
    const q = catalogQueryFromParams(new URLSearchParams("sort=nope&minViews=-5&minEngagement=abc&platform=TIKTOK"));
    expect(q.sort).toBe("followers");
    expect(q.minViews).toBeUndefined();
    expect(q.minEngagement).toBeUndefined();
    expect(q.platform).toBe("TikTok");
  });

  it("strips PostgREST syntax from a search", () => {
    expect(catalogQueryFromParams(new URLSearchParams({ search: "a,b(c)%*" })).search).toBe("abc");
  });
});

describe("SQL clauses", () => {
  it("country: known country, or unknown country in the country's language", () => {
    expect(countryOrClause("fr")).toBe("country_code.ilike.FR,and(country_code.is.null,language.ilike.fr)");
    expect(countryOrClause("US")).toBe("country_code.ilike.US");
    expect(countryOrClause("France")).toBe("country_code.ilike.FR,and(country_code.is.null,language.ilike.fr)");
    expect(countryOrClause("")).toBeNull();
  });

  it("niche: tags of the niche, else of its words", () => {
    expect(nicheClause("beauty")).toContain("niches.cs.{skincare}");
    const free = nicheClause("vegan food") ?? "";
    expect(free).toContain("niches.cs.{food}");
    expect(nicheClause("underwater basket")).not.toBeNull();
    expect(videoNicheClause("fitness")).toMatch(/^niches\.ov\.\{[^}]*gym[^}]*\},niche_key\.in\.\([^)]*\),hashtags\.ov\.\{/);
  });
});

describe("video filters → /api/videos params → VideoQuery", () => {
  it("maps every filter of the bar", () => {
    const qs = videoFiltersToParams(
      {
        ...videoBase,
        niche: "beauty",
        country: "FR",
        language: "fr",
        minViews: "100k",
        postedFrom: "2026-09-01",
        postedTo: "2026-09-15",
        mediaType: "carousel",
        duration: "short",
        hasProduct: true,
        viral: true,
        sort: "gained",
      },
      "serum",
      "tiktok",
      48,
    );
    const q = videoQueryFromParams(new URLSearchParams(qs));
    expect(q).toMatchObject({
      q: "serum",
      platform: "tiktok",
      niche: "beauty",
      country: "FR",
      language: "fr",
      minViews: 100_000,
      postedFrom: "2026-09-01",
      postedTo: "2026-09-15",
      mediaType: "carousel",
      duration: "short",
      hasProduct: true,
      viral: true,
      sort: "gained",
      offset: 48,
      limit: 48,
    });
  });

  it("accepts short and long formats and rejects bad dates", () => {
    expect(videoQueryFromParams(new URLSearchParams("mediaType=long")).mediaType).toBe("long");
    expect(videoQueryFromParams(new URLSearchParams("mediaType=gif")).mediaType).toBeUndefined();
    expect(videoQueryFromParams(new URLSearchParams("postedFrom=2026-13-45&postedTo=yesterday"))).toMatchObject({ postedFrom: undefined, postedTo: undefined });
    expect(videoFiltersToParams({ ...videoBase, postedFrom: "01/09/2026" }, "", "", 0)).not.toContain("postedFrom");
  });

  it("published-date bounds: the later start wins, the end day is included", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(postedBounds({ postedWithinDays: 7 }, now)).toEqual({ from: "2026-09-23T12:00:00.000Z", to: undefined });
    expect(postedBounds({ postedWithinDays: 30, postedFrom: "2026-09-20", postedTo: "2026-09-25" }, now)).toEqual({
      from: "2026-09-20T00:00:00.000Z",
      to: "2026-09-26T00:00:00.000Z",
    });
  });
});

describe("viral rule", () => {
  it("5x the median with a 100K floor", () => {
    expect(isViralVideo(500_000, 100_000)).toBe(true);
    expect(isViralVideo(499_999, 100_000)).toBe(false);
    expect(isViralVideo(99_999, 1_000)).toBe(false);
    expect(isViralVideo(100_000, 1_000)).toBe(true);
    expect(isViralVideo(5_000_000, null)).toBe(false);
    expect(isViralVideo(5_000_000, 0)).toBe(false);
  });

  it("median needs 3 videos with views", () => {
    expect(medianViews([10, 0, 20])).toBeNull();
    expect(medianViews([10, 30, 20])).toBe(20);
    expect(medianViews([10, 40, 20, 30])).toBe(25);
  });
});
