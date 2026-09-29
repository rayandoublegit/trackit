import { createClient } from "@supabase/supabase-js";
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import {
  catalogRowToFeedCreator,
  CREATOR_LIST_COLUMNS,
  creatorMatchesGeoFilter,
  creatorMatchesNicheFilter,
  nicheOrClause,
  type FeedCreator,
} from "@/lib/discovery-feed";
import { creatorMatchesFollowerRange } from "@/lib/discovery-follower-ranges";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier } from "@/lib/creator-value";
import { searchRapidApiCreators } from "@/lib/rapidapi-creators";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { imgProxyUrl } from "@/lib/client-image-url";

// One query for the creator catalog (creators_index), shared by /api/catalog
// and Mino's creator search, plus a live search through RapidAPI for what the
// catalog does not hold yet (Instagram today).

export type CatalogPlatform = "TikTok" | "Instagram" | "YouTube";
export type CatalogSort = "followers" | "engagement" | "views" | "reach" | "recent";

export type CatalogQuery = {
  search?: string;
  niche?: string;
  language?: string;
  country?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  minViews?: number;
  maxViews?: number;
  hasEmail?: boolean;
  activeWithinDays?: number;
  verified?: boolean;
  /** Average views as a share of followers (1 = videos reach as many people as follow). */
  minReach?: number;
  minLikes?: number;
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
};

export function parsePlatform(raw: string | null | undefined): CatalogPlatform | undefined {
  const v = (raw || "").trim().toLowerCase();
  if (v === "instagram") return "Instagram";
  if (v === "youtube") return "YouTube";
  if (v === "tiktok") return "TikTok";
  return undefined;
}

function nonNegInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Reads a CatalogQuery from URL search params (the /api/catalog contract). */
export function catalogQueryFromParams(p: URLSearchParams): CatalogQuery {
  const searchRaw = (p.get("search") || p.get("q") || "").trim().replace(/^@/, "");
  const sort = p.get("sort");
  return {
    search: searchRaw.length >= 2 ? searchRaw.replace(/[%_,()]/g, "") : undefined,
    niche: p.get("niche") || undefined,
    language: p.get("language") || undefined,
    country: (p.get("country") || "").trim().toUpperCase() || undefined,
    minFollowers: nonNegInt(p.get("minFollowers")),
    maxFollowers: nonNegInt(p.get("maxFollowers")),
    minEngagement: nonNegInt(p.get("minEngagement")),
    minViews: nonNegInt(p.get("minViews")),
    maxViews: nonNegInt(p.get("maxViews")),
    hasEmail: p.get("hasEmail") === "1" || p.get("hasEmail") === "true",
    activeWithinDays: nonNegInt(p.get("activeWithinDays")),
    verified: p.get("verified") === "1" || p.get("verified") === "true",
    minReach: Number(p.get("minReach")) > 0 ? Number(p.get("minReach")) : undefined,
    minLikes: nonNegInt(p.get("minLikes")),
    platform: parsePlatform(p.get("platform")),
    sort: sort === "engagement" || sort === "views" || sort === "reach" || sort === "recent" ? sort : "followers",
    offset: Math.max(0, Number(p.get("offset")) || 0),
    limit: Number(p.get("limit")) || undefined,
  };
}

export async function queryCatalog(q: CatalogQuery): Promise<CatalogResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { creators: [], hasMore: false, error: "no db" };
  const admin = createClient(url, key);

  const offset = Math.max(0, q.offset ?? 0);
  const maxLimit = q.search || q.niche ? 50 : 100;
  const defaultLimit = q.search ? 30 : q.niche ? 25 : 48;
  const limit = Math.min(maxLimit, Math.max(1, q.limit || defaultLimit));
  const sortColumn = SORT_COLUMN[q.sort ?? "followers"];
  const followerBounds = { min: q.minFollowers, max: q.maxFollowers };

  const applyFilters = (query: any) => {
    let out = query;
    if (q.platform) out = out.eq("platform", q.platform);
    if (q.minFollowers != null) out = out.gte("followers", q.minFollowers);
    if (q.maxFollowers != null) out = out.lte("followers", q.maxFollowers);
    if (q.minEngagement) out = out.gte("engagement_rate", q.minEngagement);
    if (q.minViews) out = out.gte("avg_views", q.minViews);
    if (q.maxViews) out = out.lte("avg_views", q.maxViews);
    if (q.hasEmail) out = out.not("email", "is", null).neq("email", "");
    if (q.verified) out = out.gte("authenticity_score", 60);
    if (q.minReach) out = out.gte("views_per_follower", q.minReach);
    if (q.minLikes) out = out.gte("avg_likes", q.minLikes);
    if (q.activeWithinDays) {
      const since = new Date(Date.now() - q.activeWithinDays * 86_400_000).toISOString();
      out = out.gte("last_post_at", since);
    }
    if (q.search) return out; // a name search ignores the audience filters below
    if (q.language) out = out.eq("language", q.language);
    if (q.country) out = out.or(`country_code.eq.${q.country},country_code.is.null`);
    if (q.niche) {
      const or = nicheOrClause(q.niche);
      if (or) out = out.or(or);
    }
    return out;
  };

  try {
    if (q.search) {
      const pattern = `%${q.search}%`;
      let sq = admin
        .from("creators_index")
        .select(CREATOR_LIST_COLUMNS)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`)
        .order(sortColumn, { ascending: false, nullsFirst: false })
        .range(offset, offset + limit);
      sq = applyFilters(sq);
      const { data, error } = await sq;
      if (error) return { creators: [], hasMore: false, error: error.message };
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return { creators: rows.slice(0, limit).map(catalogRowToFeedCreator), hasMore: rows.length > limit };
    }

    // Oversample when the niche safety net may drop rows after SQL.
    const fetchTo = q.niche ? offset + limit * 3 : offset + limit;
    let mq = admin
      .from("creators_index")
      .select(CREATOR_LIST_COLUMNS)
      .order(sortColumn, { ascending: false, nullsFirst: false })
      .range(offset, fetchTo);
    mq = applyFilters(mq);

    // Curated picks lead the first page, still inside the filters.
    let curated: Record<string, unknown>[] = [];
    if (offset === 0) {
      let cq = admin
        .from("creators_index")
        .select(CREATOR_LIST_COLUMNS)
        .eq("is_curated", true)
        .order(sortColumn, { ascending: false, nullsFirst: false })
        .limit(20);
      cq = applyFilters(cq);
      const cr = await cq;
      curated = ((cr.data ?? []) as unknown as Record<string, unknown>[]).filter((row) =>
        creatorMatchesFollowerRange(Number(row.followers ?? 0), followerBounds),
      );
    }

    const { data, error } = await mq;
    if (error) return { creators: [], hasMore: false, error: error.message };

    let rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (curated.length) {
      const seen = new Set(curated.map((r) => String(r.username || "").toLowerCase()));
      rows = [...curated, ...rows.filter((r) => !seen.has(String(r.username || "").toLowerCase()))];
    }
    const nicheFilter = q.niche;
    if (nicheFilter) {
      rows = rows.filter((row) =>
        creatorMatchesNicheFilter(
          {
            primaryNiche: typeof row.primary_niche === "string" ? row.primary_niche : "",
            niche: typeof row.primary_niche === "string" ? row.primary_niche : "",
            niches: Array.isArray(row.niches) ? (row.niches as string[]) : [],
          },
          nicheFilter,
        ),
      );
    }
    if (q.country || q.language) {
      rows = rows.filter((row) =>
        creatorMatchesGeoFilter(
          {
            countryCode: typeof row.country_code === "string" ? row.country_code : null,
            language: typeof row.language === "string" ? row.language : "",
          },
          { country: q.country, language: q.language },
        ),
      );
    }
    if (q.minFollowers != null || q.maxFollowers != null) {
      rows = rows.filter((row) => creatorMatchesFollowerRange(Number(row.followers ?? 0), followerBounds));
    }
    return { creators: rows.slice(0, limit).map(catalogRowToFeedCreator), hasMore: rows.length > limit };
  } catch (e) {
    return { creators: [], hasMore: false, error: e instanceof Error ? e.message : "catalog failed" };
  }
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
  bounds: { minFollowers?: number; maxFollowers?: number } = {},
): Promise<FeedCreator[]> {
  if (!keyword.trim() || !liveSearchAvailable(platform)) return [];
  try {
    const rows = await searchRapidApiCreators(keyword.trim(), platform, Math.min(30, limit * 2));
    return rows
      .filter((c) => creatorMatchesFollowerRange(c.followersCount, { min: bounds.minFollowers, max: bounds.maxFollowers }))
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, limit)
      .map(liveToFeedCreator);
  } catch {
    return [];
  }
}
