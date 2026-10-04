import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import {
  catalogRowToFeedCreator,
  CREATOR_GROWTH_COLUMNS,
  CREATOR_LIST_COLUMNS,
  CREATOR_VIDEO_STATS_COLUMNS,
  nicheOrClause,
  type FeedCreator,
} from "@/lib/discovery-feed";
import { creatorMatchesFollowerRange } from "@/lib/discovery-follower-ranges";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier } from "@/lib/creator-value";
import { searchRapidApiCreators } from "@/lib/rapidapi-creators";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { imgProxyUrl } from "@/lib/client-image-url";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { detectBrand } from "@/lib/brand-detect";

// One query for the creator catalog (creators_index), shared by /api/catalog
// and Mino's creator search, plus a live search through RapidAPI for what the
// catalog does not hold yet (Instagram today).
//
// What each filter reads (all in SQL, nothing re-filtered afterwards):
//   followers              followers
//   avg views              avg_views (median views of the latest posts), only when
//                          posts_analyzed > 0: seeded rows carry estimates, not measures
//   engagement             engagement_rate, in percent: (likes + comments + shares) / views
//   reach                  views_per_follower = avg views / followers (1 = 100%)
//   likes/comments/shares  avg_likes / avg_comments / avg_shares (medians per post)
//   viral video            viral_videos > 0 (rule in lib/viral.ts), migration 000047
//   growth                 followers_growth_pct_30d, migration 000044
//   exclude brands         is_brand (migration 000048), on unless excludeBrands === false;
//                          rows not classified yet are checked by name and bio (lib/brand-detect.ts)
// A filter on a value a creator does not have yet excludes that creator; any
// other filter keeps it. Platform is compared without case ("TikTok" = "tiktok").

export type CatalogPlatform = "TikTok" | "Instagram" | "YouTube";
export type CatalogSort = "followers" | "engagement" | "views" | "reach" | "recent" | "growth" | "viral";
export const CATALOG_SORTS: readonly CatalogSort[] = ["followers", "engagement", "views", "reach", "recent", "growth", "viral"];

export type CatalogQuery = {
  search?: string;
  niche?: string;
  language?: string;
  country?: string;
  minFollowers?: number;
  maxFollowers?: number;
  /** Percent, e.g. 6 = 6%. */
  minEngagement?: number;
  minViews?: number;
  maxViews?: number;
  hasEmail?: boolean;
  activeWithinDays?: number;
  verified?: boolean;
  /** Average views as a share of followers (1 = videos reach as many people as follow). */
  minReach?: number;
  minLikes?: number;
  minComments?: number;
  minShares?: number;
  /** At least one viral video (lib/viral.ts). */
  viral?: boolean;
  /** Follower growth over 30 days, in percent (needs tracked history). */
  minGrowthPct30d?: number;
  /** Hide brand / company accounts. On unless explicitly false. */
  excludeBrands?: boolean;
  platform?: CatalogPlatform;
  sort?: CatalogSort;
  offset?: number;
  limit?: number;
};

export type CatalogResult = { creators: FeedCreator[]; hasMore: boolean; error?: string };

const SORT_COLUMN: Record<CatalogSort, string> = {
  followers: "followers",
  engagement: "engagement_rate",
  views: "avg_views",
  reach: "views_per_follower",
  recent: "last_post_at",
  growth: "growth_score",
  viral: "max_video_views",
};

// Which optional columns exist: 0 = base, 1 = + growth (migration 000044),
// 2 = + video stats (migration 000047), 3 = + is_brand (migration 000048).
// Detected once, then cached; until a migration is applied the catalog keeps
// working without what it adds.
type SchemaLevel = 0 | 1 | 2 | 3;
let schemaLevel: SchemaLevel | null = null;

/** Tests only: forget the detected schema. */
export function resetCatalogSchemaCache() {
  schemaLevel = null;
}

function columnsFor(level: SchemaLevel): string {
  return [
    CREATOR_LIST_COLUMNS,
    level >= 1 ? CREATOR_GROWTH_COLUMNS : "",
    level >= 2 ? CREATOR_VIDEO_STATS_COLUMNS : "",
    level >= 3 ? "is_brand" : "",
  ]
    .filter(Boolean)
    .join(",");
}

export const isMissingColumn = (message: string) => /column .* does not exist|could not find the .* column/i.test(message);

// Creators with no known country count for a country when their content is in
// that country's language. English is shared by too many countries to infer one.
const COUNTRY_LANGUAGE: Record<string, string> = { FR: "fr", DE: "de", IT: "it", ES: "es", PT: "pt", BR: "pt" };

/** PostgREST `or` clause for a country filter (see COUNTRY_LANGUAGE). */
export function countryOrClause(
  country: string,
  cols: { country: string; language: string } = { country: "country_code", language: "language" },
): string | null {
  const cc = country.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (cc.length !== 2) return null;
  const lang = COUNTRY_LANGUAGE[cc];
  const exact = `${cols.country}.ilike.${cc}`;
  return lang ? `${exact},and(${cols.country}.is.null,${cols.language}.ilike.${lang})` : exact;
}

/**
 * Niche clause: the niche's own tags, or, for a free-text niche from Mino
 * ("vegan food"), the tags of each of its words.
 */
export function nicheClause(niche: string): string | null {
  const exact = nicheOrClause(niche);
  if (exact) return exact;
  const words = niche.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const items = new Set(words.flatMap((w) => (nicheOrClause(w) ?? "").split(",")).filter(Boolean));
  return items.size ? [...items].join(",") : null;
}

export function parsePlatform(raw: string | null | undefined): CatalogPlatform | undefined {
  const v = (raw || "").trim().toLowerCase();
  if (v === "instagram") return "Instagram";
  if (v === "youtube") return "YouTube";
  if (v === "tiktok") return "TikTok";
  return undefined;
}

function nonNeg(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}
const positive = (raw: string | null) => {
  const v = nonNeg(raw);
  return v ? v : undefined;
};
const flag = (raw: string | null) => raw === "1" || raw === "true";
/** Characters with a meaning in PostgREST filters are dropped from a free-text search. */
export const cleanSearch = (raw: string) =>
  raw
    .trim()
    .replace(/^@/, "")
    .replace(/[%_,()*"\\]/g, "")
    .trim();

/** Reads a CatalogQuery from URL search params (the /api/catalog contract). */
export function catalogQueryFromParams(p: URLSearchParams): CatalogQuery {
  const searchRaw = cleanSearch(p.get("search") || p.get("q") || "");
  const sort = p.get("sort") as CatalogSort | null;
  return {
    search: searchRaw.length >= 2 ? searchRaw : undefined,
    niche: p.get("niche") || undefined,
    language: (p.get("language") || "").trim().toLowerCase() || undefined,
    country: (p.get("country") || "").trim().toUpperCase() || undefined,
    minFollowers: nonNeg(p.get("minFollowers")),
    maxFollowers: nonNeg(p.get("maxFollowers")),
    minEngagement: positive(p.get("minEngagement")),
    minViews: positive(p.get("minViews")),
    maxViews: positive(p.get("maxViews")),
    hasEmail: flag(p.get("hasEmail")),
    activeWithinDays: positive(p.get("activeWithinDays")),
    verified: flag(p.get("verified")),
    minReach: positive(p.get("minReach")),
    minLikes: positive(p.get("minLikes")),
    minComments: positive(p.get("minComments")),
    minShares: positive(p.get("minShares")),
    viral: flag(p.get("viral")),
    minGrowthPct30d: positive(p.get("minGrowth")),
    // Brands are hidden unless the client sends excludeBrands=0.
    excludeBrands: p.get("excludeBrands") !== "0" && p.get("excludeBrands") !== "false",
    platform: parsePlatform(p.get("platform")),
    sort: sort && CATALOG_SORTS.includes(sort) ? sort : "followers",
    offset: Math.max(0, Math.floor(Number(p.get("offset")) || 0)),
    limit: Number(p.get("limit")) || undefined,
  };
}

/**
 * The catalog query. `client` defaults to the service-role client; the DB
 * tests pass one bound to a local Postgres.
 */
export async function queryCatalog(q: CatalogQuery, client?: SupabaseClient | null): Promise<CatalogResult> {
  const admin = client ?? getSupabaseAdmin();
  if (!admin) return { creators: [], hasMore: false, error: "no db" };
  let level: SchemaLevel = schemaLevel ?? 3;
  for (;;) {
    const result = await runCatalogQuery(admin, q, level);
    if (result.error && isMissingColumn(result.error) && level > 0) {
      level = (level - 1) as SchemaLevel;
      continue;
    }
    if (!result.error) schemaLevel = level;
    return result;
  }
}

async function runCatalogQuery(admin: SupabaseClient, q: CatalogQuery, level: SchemaLevel): Promise<CatalogResult> {
  // A filter on a value this database does not hold yet matches nobody.
  if ((q.viral && level < 2) || (q.minGrowthPct30d && level < 1)) return { creators: [], hasMore: false };

  const search = q.search ? cleanSearch(q.search) : "";
  const offset = Math.max(0, q.offset ?? 0);
  const maxLimit = search || q.niche ? 50 : 100;
  const defaultLimit = search ? 30 : q.niche ? 25 : 48;
  const limit = Math.min(maxLimit, Math.max(1, q.limit || defaultLimit));
  let sortKey: CatalogSort = q.sort ?? "followers";
  // Without tracked history, "growth" ranks by reach (views vs followers).
  if (sortKey === "growth" && level < 1) sortKey = "reach";
  if (sortKey === "viral" && level < 2) sortKey = "views";

  let query: any = admin.from("creators_index").select(columnsFor(level));
  const orGroups: string[] = [];

  // Stored platform values vary in case: ilike without wildcards = equality without case.
  if (q.platform) query = query.ilike("platform", q.platform);
  if (q.minFollowers != null) query = query.gte("followers", q.minFollowers);
  if (q.maxFollowers != null) query = query.lte("followers", q.maxFollowers);
  if (q.minEngagement) query = query.gte("engagement_rate", q.minEngagement);
  if (q.minViews || q.maxViews) query = query.gt("posts_analyzed", 0);
  if (q.minViews) query = query.gte("avg_views", q.minViews);
  if (q.maxViews) query = query.lte("avg_views", q.maxViews);
  if (q.minReach) query = query.gte("views_per_follower", q.minReach);
  if (q.minLikes) query = query.gte("avg_likes", q.minLikes);
  if (q.minComments) query = query.gte("avg_comments", q.minComments);
  if (q.minShares) query = query.gte("avg_shares", q.minShares);
  if (q.viral) query = query.gt("viral_videos", 0);
  if (q.minGrowthPct30d) query = query.gte("followers_growth_pct_30d", q.minGrowthPct30d);
  if (q.hasEmail) query = query.not("email", "is", null).neq("email", "");
  if (q.verified) query = query.gte("authenticity_score", 60);
  const excludeBrands = q.excludeBrands !== false;
  // `not is true` keeps creators not classified yet (null).
  if (excludeBrands && level >= 3) query = query.not("is_brand", "is", true);
  if (q.activeWithinDays) {
    const since = new Date(Date.now() - q.activeWithinDays * 86_400_000).toISOString();
    query = query.gte("last_post_at", since);
  }
  if (search) {
    // A name search is global: it ignores niche, country and language.
    const pattern = `%${search}%`;
    orGroups.push(`username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`);
  } else {
    if (q.language) query = query.ilike("language", q.language);
    if (q.country) {
      const or = countryOrClause(q.country);
      if (or) orGroups.push(or);
    }
    if (q.niche) {
      const or = nicheClause(q.niche);
      // A niche we have no tag for matches nobody (Mino then tries names and handles).
      if (!or) return { creators: [], hasMore: false };
      orGroups.push(or);
    }
  }
  // One `or` parameter holding every group, so no group can replace another.
  if (orGroups.length === 1) query = query.or(orGroups[0]);
  else if (orGroups.length > 1) query = query.or(`and(${orGroups.map((g) => `or(${g})`).join(",")})`);

  // Hand-picked creators lead the default browse; any other sort is a pure ranking.
  if (sortKey === "followers" && !search) query = query.order("is_curated", { ascending: false, nullsFirst: false });
  query = query.order(SORT_COLUMN[sortKey], { ascending: false, nullsFirst: false });
  // Creators without history yet rank after the tracked ones, by reach.
  if (sortKey === "growth") query = query.order("views_per_follower", { ascending: false, nullsFirst: false });
  if (sortKey !== "followers") query = query.order("followers", { ascending: false, nullsFirst: false });
  // A unique last key keeps pages stable: page 2 starts exactly where page 1 ended.
  query = query.order("username", { ascending: true }).range(offset, offset + limit);

  try {
    const { data, error } = await query;
    if (error) return { creators: [], hasMore: false, error: error.message };
    const rows = (data ?? []) as Record<string, unknown>[];
    const page = rows.slice(0, limit).filter((row) => !excludeBrands || !isBrandRow(row));
    return { creators: page.map(catalogRowToFeedCreator), hasMore: rows.length > limit };
  } catch (e) {
    return { creators: [], hasMore: false, error: e instanceof Error ? e.message : "catalog failed" };
  }
}

/** A brand by its stored flag, or, when not classified yet, by name and bio. */
export function isBrandRow(row: Record<string, unknown>): boolean {
  if (row.is_brand === true) return true;
  if (row.is_brand === false) return false;
  return detectBrand({
    username: typeof row.username === "string" ? row.username : "",
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    bio: typeof row.bio === "string" ? row.bio : "",
  }).isBrand;
}

function liveToFeedCreator(c: DiscoveryCreatorResult): FeedCreator {
  const cost = estimatedCostPerPost(c.followersCount);
  return {
    ...c,
    // TikTok photos go through the re-hosting avatar route; Instagram CDN links
    // expire and refuse hotlinking, so they are served through the image proxy.
    avatarUrl: !c.avatarUrl
      ? ""
      : c.platform === "Instagram"
        ? imgProxyUrl(c.avatarUrl)
        : feedAvatarUrlForCreator(c.username, c.avatarUrl),
    estCostPerPost: cost,
    estCpm: estimatedCpm(cost, c.avgViews),
    valueScore: valueScore(c.followersCount, c.engagementRate, c.avgViews),
    valueTier: valueTier(c.followersCount),
    topVideos: [],
  };
}

/** True when a live search provider is configured for this platform. */
export function liveSearchAvailable(platform: CatalogPlatform): boolean {
  if (!process.env.RAPIDAPI_KEY) return false;
  if (platform === "Instagram") return Boolean(process.env.RAPIDAPI_INSTAGRAM_HOST && process.env.RAPIDAPI_INSTAGRAM_SEARCH_URL);
  if (platform === "TikTok") return Boolean(process.env.RAPIDAPI_HOST && process.env.RAPIDAPI_SEARCH_URL);
  return false;
}

/** Live keyword search on the platform itself (RapidAPI), shaped like catalog rows. */
export async function liveCreatorSearch(
  keyword: string,
  platform: CatalogPlatform,
  limit: number,
  bounds: { minFollowers?: number; maxFollowers?: number; excludeBrands?: boolean } = {},
): Promise<FeedCreator[]> {
  if (!keyword.trim() || !liveSearchAvailable(platform)) return [];
  try {
    const rows = await searchRapidApiCreators(keyword.trim(), platform, Math.min(30, limit * 2));
    return rows
      .filter((c) => creatorMatchesFollowerRange(c.followersCount, { min: bounds.minFollowers, max: bounds.maxFollowers }))
      .filter((c) => bounds.excludeBrands === false || !detectBrand({ username: c.username, displayName: c.displayName, bio: c.bio }).isBrand)
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, limit)
      .map(liveToFeedCreator);
  } catch {
    return [];
  }
}
