import {
  CATALOG_COUNTRIES,
  CATALOG_LANGUAGES,
  NICHE_KEYS,
  TIER_RANGE,
  nicheKeyFor,
  type EngagementOption,
  type MinoCatalogFilters,
} from "@/lib/mino-filters";

// Mino's brand analysis (from a website and/or a photo): the JSON schema the
// model answers in, and the server-side check that clamps whatever comes back
// to values the app knows. Pure and browser-safe (the result is rendered by
// the chat and stored with it).

export type FollowerTier = "nano" | "micro" | "mid" | "macro";

export type MinoBrandAnalysis = {
  brand: string;
  summary: string;
  products: string[];
  /** Catalog niche keys (lib/niche-tree), most relevant first. */
  niches: string[];
  audience: string;
  /** ISO 3166-1 alpha-2, any country (filters only use the ones the catalog offers). */
  countries: string[];
  /** ISO 639-1. */
  languages: string[];
  platforms: ("tiktok" | "instagram")[];
  followerTier: FollowerTier;
  followerReason: string;
  keywords: string[];
  /** Ready-to-run searches in the user's language. */
  searches: string[];
  filters: MinoCatalogFilters;
};

/** What the chat stores with an analysis answer. */
export type MinoAnalysisMeta = {
  analysis: MinoBrandAnalysis;
  /** What was read: the site's host and/or "photo". */
  source: { site?: string; siteTitle?: string; image?: boolean };
  /** Filters actually used for the creators shown (may be wider than analysis.filters). */
  usedFilters: MinoCatalogFilters;
  /** Filters dropped to find someone, in order. */
  widened: (keyof MinoCatalogFilters)[];
};

const TIERS: FollowerTier[] = ["nano", "micro", "mid", "macro"];
const ENGAGEMENT: EngagementOption[] = ["3+", "6+", "9+", "12+"];

/** JSON schema for structured output. Kept to features structured outputs support (no min/max). */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "brand",
    "summary",
    "products",
    "niches",
    "audience",
    "countries",
    "languages",
    "platforms",
    "followerTier",
    "followerReason",
    "keywords",
    "searches",
    "filters",
  ],
  properties: {
    brand: { type: "string", description: "Brand or product name, empty if unknown." },
    summary: { type: "string", description: "2 sentences: what the brand sells and its positioning. In the user's language." },
    products: { type: "array", items: { type: "string" }, description: "Up to 6 main products or product types." },
    niches: { type: "array", items: { type: "string", enum: NICHE_KEYS }, description: "1 to 3 creator niches, most relevant first." },
    audience: { type: "string", description: "Target audience in one sentence, in the user's language." },
    countries: { type: "array", items: { type: "string" }, description: "Likely target countries, ISO 3166-1 alpha-2 codes, most likely first." },
    languages: { type: "array", items: { type: "string" }, description: "Content languages, ISO 639-1 codes, most likely first." },
    platforms: { type: "array", items: { type: "string", enum: ["tiktok", "instagram"] }, description: "Best platforms first." },
    followerTier: { type: "string", enum: TIERS, description: "nano 1K-10K, micro 10K-100K, mid 100K-500K, macro 500K+." },
    followerReason: { type: "string", description: "One sentence on why this creator size fits, in the user's language." },
    keywords: { type: "array", items: { type: "string" }, description: "4 to 8 short creator search keywords (1-3 words each)." },
    searches: {
      type: "array",
      items: { type: "string" },
      description: "3 to 5 short creator searches written as the user would type them, in the user's language.",
    },
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["platform", "niche", "followersRange", "country", "language", "hasEmail", "engagement"],
      properties: {
        platform: { type: "string", enum: ["tiktok", "instagram"] },
        niche: { type: "string", enum: NICHE_KEYS },
        followersRange: { type: "string", enum: ["1-10k", "10-100k", "100-500k", "500k+"] },
        country: { type: "string", enum: [...CATALOG_COUNTRIES, ""], description: "Empty when no catalog country fits." },
        language: { type: "string", enum: [...CATALOG_LANGUAGES, ""], description: "Empty when no catalog language fits." },
        hasEmail: { type: "boolean" },
        engagement: { type: "string", enum: [...ENGAGEMENT, ""] },
      },
    },
  },
} as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const s = str(item, maxLen);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

const ISO2 = /^[A-Z]{2}$/;
const ISO639 = /^[a-z]{2}$/;

/**
 * Clamps the model's answer to what the app can use: niches from the niche
 * tree only, ISO codes, known platforms and tiers, short strings, and filters
 * rebuilt from catalog values. Null when nothing usable came back.
 */
export function validateAnalysis(raw: unknown, opts: { wantEmail?: boolean } = {}): MinoBrandAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const niches = strList(o.niches, 6, 40)
    .map((n) => nicheKeyFor(n))
    .filter(Boolean)
    .filter((n, i, a) => a.indexOf(n) === i)
    .slice(0, 3);
  const countries = strList(o.countries, 6, 8)
    .map((c) => (c.toUpperCase() === "UK" ? "GB" : c.toUpperCase()))
    .filter((c) => ISO2.test(c))
    .slice(0, 4);
  const languages = strList(o.languages, 6, 8)
    .map((l) => l.toLowerCase().slice(0, 2))
    .filter((l) => ISO639.test(l))
    .filter((l, i, a) => a.indexOf(l) === i)
    .slice(0, 3);
  const platforms = strList(o.platforms, 4, 12)
    .map((p) => p.toLowerCase())
    .filter((p): p is "tiktok" | "instagram" => p === "tiktok" || p === "instagram");
  const tier = TIERS.includes(o.followerTier as FollowerTier) ? (o.followerTier as FollowerTier) : "micro";
  const keywords = strList(o.keywords, 8, 40);
  const summary = str(o.summary, 400);
  const brand = str(o.brand, 80);

  if (!niches.length && !keywords.length && !summary) return null;

  const f = (o.filters && typeof o.filters === "object" ? o.filters : {}) as Record<string, unknown>;
  const fPlatform = f.platform === "instagram" || f.platform === "tiktok" ? f.platform : undefined;
  const fNiche = typeof f.niche === "string" ? nicheKeyFor(f.niche) : "";
  const fCountry = typeof f.country === "string" ? f.country.toUpperCase() : "";
  const fLanguage = typeof f.language === "string" ? f.language.toLowerCase() : "";
  const inCatalog = (list: readonly string[], v: string) => list.includes(v);

  const filters: MinoCatalogFilters = { platform: fPlatform ?? platforms[0] ?? "tiktok" };
  const niche = fNiche || niches[0];
  if (niche) filters.niche = niche;
  filters.followersRange =
    f.followersRange === "1-10k" || f.followersRange === "10-100k" || f.followersRange === "100-500k" || f.followersRange === "500k+"
      ? f.followersRange
      : TIER_RANGE[tier];
  const country = inCatalog(CATALOG_COUNTRIES, fCountry) ? fCountry : countries.find((c) => inCatalog(CATALOG_COUNTRIES, c));
  if (country) filters.country = country;
  const language = inCatalog(CATALOG_LANGUAGES, fLanguage) ? fLanguage : languages.find((l) => inCatalog(CATALOG_LANGUAGES, l));
  if (language) filters.language = language;
  if (ENGAGEMENT.includes(f.engagement as EngagementOption)) filters.engagement = f.engagement as EngagementOption;
  if (opts.wantEmail || f.hasEmail === true) filters.hasEmail = true;

  return {
    brand,
    summary,
    products: strList(o.products, 6, 80),
    niches: niches.length ? niches : niche ? [niche] : [],
    audience: str(o.audience, 240),
    countries,
    languages,
    platforms: platforms.length ? [...new Set(platforms)] : [filters.platform],
    followerTier: tier,
    followerReason: str(o.followerReason, 240),
    keywords,
    searches: strList(o.searches, 5, 120),
    filters,
  };
}

/** Pulls the first JSON object out of a model reply (structured output is plain JSON; this also survives a code fence). */
export function parseJsonObject(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** True when the user asks for contact emails ("avec leurs emails", "with emails", "contact"). */
export function asksForEmail(text: string): boolean {
  return /\b(e-?mails?|mails?|courriels?|contacts?|joignables?|adresses?)\b/i.test(text);
}
