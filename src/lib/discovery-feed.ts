import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import { liveSearchAndEnrich } from "@/lib/discovery-live";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { createClient } from "@supabase/supabase-js";
import {
  estimatedCostPerPost,
  estimatedCpm,
  valueScore,
  valueTier,
  type ValueTier,
} from "@/lib/creator-value";

export interface FeedVideo {
  id: string;
  cover: string;
  shareUrl: string;
  playCount: number;
}

export interface FeedCreator extends DiscoveryCreatorResult {
  valueScore: number;
  estCostPerPost: number;
  estCpm: number;
  valueTier: ValueTier;
  topVideos?: FeedVideo[];
}

export type FeedFilters = {
  niche?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  country?: string;
  language?: string;
  sort?: "followers" | "engagement";
};

// Niches aggregated to build the cross-niche feed. Override with FEED_NICHES
// (comma-separated) and FEED_LIMIT_PER_NICHE to control credit spend.
const DEFAULT_NICHES = ["fitness", "beauty", "food", "fashion", "tech"];

export function feedNiches(): string[] {
  const raw = process.env.FEED_NICHES;
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_NICHES;
}

// Pure: attach value fields, dedup by username, sort by valueScore desc.
export function rankFeed(creators: DiscoveryCreatorResult[]): FeedCreator[] {
  const seen = new Set<string>();
  const out: FeedCreator[] = [];
  for (const c of creators) {
    if (!c.username || seen.has(c.username)) continue;
    seen.add(c.username);
    const estCostPerPost = estimatedCostPerPost(c.followersCount);
    out.push({
      ...c,
      estCostPerPost,
      estCpm: estimatedCpm(estCostPerPost, c.avgViews),
      valueScore: valueScore(c.followersCount, c.engagementRate, c.avgViews),
      valueTier: valueTier(c.followersCount),
    });
  }
  return out.sort((a, b) => b.valueScore - a.valueScore);
}

let cache: { at: number; creators: FeedCreator[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

function dbRowToCreator(c: Record<string, unknown>): DiscoveryCreatorResult {
  return {
    username: String(c.username), displayName: String(c.display_name ?? c.username),
    avatarUrl: String(c.avatar_url ?? ""), followersCount: Number(c.followers ?? 0),
    engagementRate: Number(c.engagement_rate ?? 0), engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: Number(c.avg_views ?? 0), postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: (c.last_post_at as string) ?? null, authenticityScore: Number(c.authenticity_score ?? 0),
    qualityStatus: String(c.quality_status ?? "ok"), platform: String(c.platform ?? "TikTok"),
    bio: String(c.bio ?? ""), email: (c.email as string) ?? null, niche: String(c.primary_niche ?? ""),
    primaryNiche: String(c.primary_niche ?? ""), language: String(c.language ?? "unknown"),
    location: (c.location as string) ?? null, countryCode: (c.country_code as string) ?? null,
    videoThumbnails: Array.isArray(c.video_thumbnails) ? (c.video_thumbnails as DiscoveryCreatorResult["videoThumbnails"]) : [],
  };
}

// I/O: build the cross-niche feed. DB-first in prod; live aggregation locally.
export async function buildFeed(opts: { limitPerNiche?: number } = {}): Promise<FeedCreator[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.creators;

  const hasDb = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
  let pool: DiscoveryCreatorResult[] = [];

  if (hasDb) {
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabaseAdmin
      .from("creators_index")
      .select("*")
      .eq("enrichment_status", "enriched")
      .neq("quality_status", "dead")
      .neq("quality_status", "inflated")
      .gte("authenticity_score", 40)
      .order("followers", { ascending: false })
      .limit(120);
    pool = (data || []).map(dbRowToCreator);
  }

  // Cold start (empty enriched DB) or no DB: live-aggregate so the feed is never
  // empty. The value/rentabilité ranking sinks low-value creators to the bottom.
  if (pool.length === 0 && process.env.SCRAPECREATORS_API_KEY) {
    const limit = Number(opts.limitPerNiche ?? process.env.FEED_LIMIT_PER_NICHE ?? 3);
    for (const niche of feedNiches()) {
      try {
        const part = await liveSearchAndEnrich(niche, normalizeDiscoveryFilters({ niche, includeLowQuality: true }), { limit });
        pool.push(...part);
      } catch {
        // skip a niche on error
      }
    }
  }

  const ranked = rankFeed(pool);
  cache = { at: Date.now(), creators: ranked };
  return ranked;
}

// UI niche label -> DB tokens. primary_niche / niches are raw (multi-lingual)
// search terms, so we match a small synonym set with ILIKE / array-contains.
const NICHE_TOKENS: Record<string, string[]> = {
  fitness: ["fitness", "gym", "workout", "musculation", "sport", "abnehmen", "palestra"],
  beauty: ["beaut", "makeup", "maquill", "maquiag", "skincare", "schminken", "trucco"],
  food: ["food", "recipe", "recett", "receta", "receita", "cook", "cuisine", "rezept", "ricett"],
  fashion: ["fashion", "mode", "moda", "outfit", "style", "ootd", "vintage"],
  tech: ["tech", "gadget", "coding", "ai ", "ia "],
  finance: ["finance", "money", "invest", "finanz", "argent", "crypto"],
  travel: ["travel", "voyage", "viaje", "trip", "backpack"],
  gaming: ["gaming", "game", "gamer", "valorant"],
};

// Map UI labels (FR/EN) to a niche key.
const LABEL_TO_NICHE: Record<string, string> = {
  fitness: "fitness", beauté: "beauty", beaute: "beauty", beauty: "beauty",
  food: "food", mode: "fashion", fashion: "fashion", tech: "tech",
  finance: "finance", voyage: "travel", travel: "travel", gaming: "gaming", jeux: "gaming",
};

function nicheOrClause(label: string): string | null {
  const key = LABEL_TO_NICHE[label.trim().toLowerCase()] ?? label.trim().toLowerCase();
  const tokens = NICHE_TOKENS[key] ?? [key];
  return tokens.map((t) => `primary_niche.ilike.%${t}%`).join(",");
}

function dbRowToFeedCreator(c: Record<string, unknown>): FeedCreator {
  const base = dbRowToCreator(c);
  const estCostPerPost = estimatedCostPerPost(base.followersCount);
  const tv = Array.isArray(c.top_videos) ? (c.top_videos as Record<string, unknown>[]) : [];
  const topVideos: FeedVideo[] = tv.slice(0, 6).map((v) => ({
    id: String(v.id ?? ""),
    cover: String(v.cover ?? ""),
    shareUrl: String(v.shareUrl ?? ""),
    playCount: Number(v.playCount ?? 0),
  }));
  return {
    ...base,
    estCostPerPost,
    estCpm: estimatedCpm(estCostPerPost, base.avgViews),
    valueScore: valueScore(base.followersCount, base.engagementRate, base.avgViews),
    valueTier: valueTier(base.followersCount),
    topVideos,
  };
}

// Filterable + paginated feed straight from the DB. Used by the redesigned feed
// (server-side filters + infinite scroll). Ordered by followers (or engagement).
export async function buildFeedPage(
  filters: FeedFilters,
  offset: number,
  limit: number
): Promise<{ creators: FeedCreator[]; hasMore: boolean }> {
  const hasDb = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!hasDb) return { creators: [], hasMore: false };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let q = admin
    .from("creators_index")
    .select("*")
    .eq("enrichment_status", "enriched")
    .neq("quality_status", "dead")
    .gte("authenticity_score", 30);

  if (filters.platform) q = q.eq("platform", filters.platform);
  if (filters.minFollowers) q = q.gte("followers", filters.minFollowers);
  if (filters.maxFollowers) q = q.lte("followers", filters.maxFollowers);
  if (filters.minEngagement) q = q.gte("engagement_rate", filters.minEngagement);
  if (filters.country) q = q.eq("country_code", filters.country);
  if (filters.language) q = q.eq("language", filters.language);
  if (filters.niche) {
    const or = nicheOrClause(filters.niche);
    if (or) q = q.or(or);
  }

  const sortCol = filters.sort === "engagement" ? "engagement_rate" : "followers";
  q = q.order(sortCol, { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error || !data) return { creators: [], hasMore: false };
  return { creators: data.map(dbRowToFeedCreator), hasMore: data.length === limit };
}
