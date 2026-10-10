import { describe, expect, it } from "vitest";
import { ANALYSIS_JSON_SCHEMA, asksForEmail, parseJsonObject, validateAnalysis } from "./mino-analysis";
import { NICHE_KEYS } from "./mino-filters";

const GOOD = {
  brand: "Maison Lumi",
  summary: "Cosmétiques bio fabriqués en France.",
  products: ["Sérum", "Crème", "Sérum"],
  niches: ["beauty", "skincare", "wellness"],
  audience: "Femmes 25-40 ans",
  countries: ["fr", "BE", "UK"],
  languages: ["fr", "FR", "en"],
  platforms: ["instagram", "tiktok", "snapchat"],
  followerTier: "micro",
  followerReason: "Budget de marque jeune.",
  keywords: ["skincare naturel", "routine peau", "cosmétiques bio", "clean beauty"],
  searches: ["créatrices skincare en France avec un email"],
  filters: { platform: "instagram", niche: "beauty", followersRange: "10-100k", country: "FR", language: "fr", hasEmail: false, engagement: "" },
};

describe("validateAnalysis", () => {
  it("keeps a good answer and dedupes lists", () => {
    const a = validateAnalysis(GOOD)!;
    expect(a.brand).toBe("Maison Lumi");
    expect(a.products).toEqual(["Sérum", "Crème"]);
    // "skincare" is a sub-niche: mapped to its parent and deduped.
    expect(a.niches).toEqual(["beauty", "wellness"]);
    expect(a.countries).toEqual(["FR", "BE", "GB"]);
    expect(a.languages).toEqual(["fr", "en"]);
    expect(a.platforms).toEqual(["instagram", "tiktok"]);
    expect(a.filters).toEqual({ platform: "instagram", niche: "beauty", followersRange: "10-100k", country: "FR", language: "fr" });
  });

  it("clamps unknown values instead of trusting them", () => {
    const a = validateAnalysis({
      ...GOOD,
      niches: ["cryptozoology", "fashion"],
      followerTier: "galactic",
      keywords: Array.from({ length: 20 }, (_, i) => `kw${i}`),
      summary: "x".repeat(2000),
      filters: { platform: "myspace", niche: "nope", followersRange: "1m+", country: "JP", language: "ja", hasEmail: "yes", engagement: "50+" },
    })!;
    expect(a.niches).toEqual(["fashion"]);
    expect(a.followerTier).toBe("micro");
    expect(a.keywords).toHaveLength(8);
    expect(a.summary.length).toBe(400);
    // Filters rebuilt from catalog values only.
    expect(a.filters).toEqual({ platform: "instagram", niche: "fashion", followersRange: "10-100k", country: "FR", language: "fr" });
  });

  it("drops a country or language the catalog does not filter on", () => {
    const a = validateAnalysis({ ...GOOD, countries: ["JP"], languages: ["ja"], filters: { ...GOOD.filters, country: "", language: "" } })!;
    expect(a.countries).toEqual(["JP"]);
    expect(a.filters.country).toBeUndefined();
    expect(a.filters.language).toBeUndefined();
  });

  it("requires an email filter when the user asked for emails", () => {
    expect(validateAnalysis(GOOD, { wantEmail: true })!.filters.hasEmail).toBe(true);
    expect(validateAnalysis({ ...GOOD, filters: { ...GOOD.filters, hasEmail: true } })!.filters.hasEmail).toBe(true);
  });

  it("maps the tier to a follower range when the filter is missing", () => {
    expect(validateAnalysis({ ...GOOD, followerTier: "macro", filters: {} })!.filters).toMatchObject({ followersRange: "500k+", platform: "instagram", niche: "beauty" });
  });

  it("rejects empty or broken answers", () => {
    expect(validateAnalysis(null)).toBeNull();
    expect(validateAnalysis("text")).toBeNull();
    expect(validateAnalysis([])).toBeNull();
    expect(validateAnalysis({ niches: ["nope"], keywords: [], summary: "" })).toBeNull();
  });
});

describe("parseJsonObject / schema / asksForEmail", () => {
  it("reads plain or fenced JSON", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonObject("nothing")).toBeNull();
  });
  it("only allows niche-tree keys in the schema", () => {
    expect(ANALYSIS_JSON_SCHEMA.properties.niches.items.enum).toEqual(NICHE_KEYS);
    expect(ANALYSIS_JSON_SCHEMA.properties.filters.properties.niche.enum).toEqual(NICHE_KEYS);
  });
  it("detects asks for emails in FR and EN", () => {
    expect(asksForEmail("propose-moi des influenceurs avec leurs emails")).toBe(true);
    expect(asksForEmail("with contact emails")).toBe(true);
    expect(asksForEmail("analyse mon site")).toBe(false);
  });
});
