import { describe, expect, it } from "vitest";
import {
  catalogFiltersToSearch,
  describeCatalogFilters,
  followersRangeFor,
  filtersToPrompt,
  nicheKeyFor,
  searchToCatalogFilters,
  widerFilters,
  type MinoCatalogFilters,
} from "./mino-filters";
import { parseCreatorSearch } from "./mino-search-parse";
import { creatorFiltersToParams } from "./catalog-filter-params";

describe("nicheKeyFor", () => {
  it("maps words, sub-niches and French labels to catalog keys", () => {
    expect(nicheKeyFor("beauty")).toBe("beauty");
    expect(nicheKeyFor("Beauté")).toBe("beauty");
    expect(nicheKeyFor("skincare")).toBe("beauty");
    expect(nicheKeyFor("cosmétiques")).toBe("beauty");
    expect(nicheKeyFor("Mode")).toBe("fashion");
    expect(nicheKeyFor("jeux vidéo")).toBe("gaming");
    expect(nicheKeyFor("vegan food")).toBe("food");
    expect(nicheKeyFor("e-commerce")).toBe("e-commerce");
    expect(nicheKeyFor("quantum physics")).toBe("");
  });
});

describe("followersRangeFor", () => {
  it("picks the closest catalog bucket", () => {
    expect(followersRangeFor(10_000, 100_000)).toBe("10-100k");
    expect(followersRangeFor(1_000, 10_000)).toBe("1-10k");
    expect(followersRangeFor(100_000, 1_000_000)).toBe("500k+");
    expect(followersRangeFor(1_000_000)).toBe("500k+");
    expect(followersRangeFor(50_000)).toBe("100-500k");
    expect(followersRangeFor(undefined, 50_000)).toBe("10-100k");
    expect(followersRangeFor()).toBeUndefined();
  });
});

describe("plain-language searches end to end", () => {
  it("« trouve des créatrices beauté en France avec un email »", () => {
    const s = parseCreatorSearch("trouve des créatrices beauté en France avec un email")!;
    expect(s).toMatchObject({ niche: "beauté", country: "FR", hasEmail: true });
    const f = searchToCatalogFilters(s);
    expect(f).toEqual({ platform: "tiktok", niche: "beauty", country: "FR", hasEmail: true });
    // The catalog bar turns these into the same /api/catalog params as a manual pick.
    const params = creatorFiltersToParams(
      { platform: f.platform, niche: f.niche!, followersRange: "", viewsFrom: "", engagement: "", reach: "", likes: "", comments: "", shares: "", viral: false, country: f.country!, language: "", activity: "", hasEmail: true, verified: false },
      "",
    );
    expect(params).toMatchObject({ platform: "tiktok", niche: "beauty", country: "FR", hasEmail: "1" });
  });

  it("« micro influenceurs fitness Instagram »", () => {
    const s = parseCreatorSearch("micro influenceurs fitness Instagram")!;
    expect(s).toMatchObject({ niche: "fitness", platform: "Instagram", minFollowers: 10_000, maxFollowers: 100_000 });
    expect(searchToCatalogFilters(s)).toEqual({ platform: "instagram", niche: "fitness", followersRange: "10-100k" });
  });

  it("goes from catalog filters back to a catalog search", () => {
    expect(catalogFiltersToSearch({ platform: "instagram", niche: "beauty", followersRange: "10-100k", country: "FR", language: "fr", hasEmail: true, engagement: "6+" })).toEqual({
      niche: "beauty",
      platform: "Instagram",
      minFollowers: 10_001,
      maxFollowers: 100_000,
      country: "FR",
      language: "fr",
      hasEmail: true,
      minEngagement: 6,
      viral: undefined,
    });
    expect(catalogFiltersToSearch({ platform: "tiktok" }, "candles").niche).toBe("candles");
  });
});

describe("filtersToPrompt", () => {
  const cases: MinoCatalogFilters[] = [
    { platform: "instagram", niche: "beauty", followersRange: "10-100k", country: "FR", hasEmail: true },
    { platform: "tiktok", niche: "fitness", followersRange: "500k+", country: "US" },
    { platform: "tiktok", niche: "food", followersRange: "100-500k", engagement: "6+" },
    { platform: "instagram", niche: "travel", followersRange: "1-10k", country: "GB" },
  ];
  for (const lang of ["fr", "en"] as const) {
    it(`reads back into the same filters (${lang})`, () => {
      for (const f of cases) {
        const prompt = filtersToPrompt(f, lang);
        const parsed = parseCreatorSearch(prompt);
        expect(parsed, prompt).not.toBeNull();
        expect(searchToCatalogFilters(parsed!), prompt).toEqual(f);
      }
    });
  }
});

describe("filtersToPrompt for every niche", () => {
  it("round-trips each catalog niche in both languages", async () => {
    const { NICHE_KEYS } = await import("./mino-filters");
    for (const lang of ["fr", "en"] as const) {
      for (const niche of NICHE_KEYS) {
        const f: MinoCatalogFilters = { platform: "instagram", niche, country: "FR" };
        const prompt = filtersToPrompt(f, lang);
        expect(searchToCatalogFilters(parseCreatorSearch(prompt)!), prompt).toEqual(f);
      }
    }
  });
});

describe("chips and wider searches", () => {
  it("labels each filter in the user's language", () => {
    const f: MinoCatalogFilters = { platform: "instagram", niche: "beauty", followersRange: "10-100k", country: "FR", language: "fr", hasEmail: true };
    expect(describeCatalogFilters(f, "fr").map((c) => c.label)).toEqual(["Instagram", "Beauté", "10K–100K abonnés", "France", "Français", "Avec email"]);
    expect(describeCatalogFilters(f, "en").map((c) => c.label)).toEqual(["Instagram", "Beauty", "10K–100K followers", "France", "French", "With email"]);
  });
  it("offers the same search with one filter less, widest first", () => {
    const wider = widerFilters({ platform: "tiktok", niche: "beauty", followersRange: "10-100k", country: "FR", hasEmail: true });
    expect(wider.map((w) => w.drop)).toEqual(["followersRange", "country", "hasEmail", "niche"]);
    expect(wider[0].filters).toEqual({ platform: "tiktok", niche: "beauty", country: "FR", hasEmail: true });
  });
});
