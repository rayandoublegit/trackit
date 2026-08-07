import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import { clientImageUrl } from "@/lib/client-image-url";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { liveSearchAndEnrich } from "@/lib/discovery-live";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { NICHE_TREE } from "@/lib/niche-tree";
import { displayVideoThumbnails } from "@/lib/tiktok-video-thumbs";
import { createClient } from "@supabase/supabase-js";
import {
  estimatedCostPerPost,
  estimatedCpm,
  valueScore,
  valueTier,
  type ValueTier,
} from "@/lib/creator-value";
import { creatorMatchesFollowerRange } from "@/lib/discovery-follower-ranges";

export interface FeedVideo {
  id: string;
  cover: string;
  shareUrl: string;
  playUrl?: string;
  playCount: number;
}

export interface FeedCreator extends DiscoveryCreatorResult {
  valueScore: number;
  estCostPerPost: number;
  estCpm: number;
  valueTier: ValueTier;
  topVideos?: FeedVideo[];
  /** Hand-picked creator — pinned first in feed results. */
  isCurated?: boolean;
}

export function isCuratedFeedCreator(c: Pick<FeedCreator, "isCurated" | "niches">): boolean {
  if (c.isCurated) return true;
  return (c.niches ?? []).some((n) => String(n).toLowerCase() === "curated");
}

export type FeedFilters = {
  niche?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  country?: string;
  language?: string;
  sort?: "value" | "followers" | "engagement";
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

function mapVideoThumbnails(
  videoThumbnails: unknown,
  topVideos: unknown
): DiscoveryCreatorResult["videoThumbnails"] {
  const thumbs = displayVideoThumbnails(
    Array.isArray(videoThumbnails) ? videoThumbnails : [],
    Array.isArray(topVideos) ? topVideos : [],
    3
  );
  return thumbs.map((t) => ({
    views: t.views,
    thumbnail: clientImageUrl(t.thumbnail) || null,
    url: t.url,
  }));
}

function readIsCurated(c: Record<string, unknown>): boolean {
  if (c.is_curated === true) return true;
  const niches = Array.isArray(c.niches) ? (c.niches as string[]) : [];
  return niches.some((n) => String(n).toLowerCase() === "curated");
}

function dbRowToCreator(c: Record<string, unknown>): DiscoveryCreatorResult {
  const postsAnalyzed = Number(c.posts_analyzed ?? 0);
  // Guard legacy rows where a single post was stored as "7 posts/week".
  const rawFrequency = Number(c.post_frequency ?? 0);
  const postFrequency = postsAnalyzed >= 2 ? rawFrequency : 0;
  return {
    username: String(c.username), displayName: String(c.display_name ?? c.username),
    avatarUrl: feedAvatarUrlForCreator(String(c.username), String(c.avatar_url ?? "")),
    followersCount: Number(c.followers ?? 0),
    engagementRate: Number(c.engagement_rate ?? 0),
    engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: Number(c.avg_views ?? 0),
    avgLikes: Number(c.avg_likes ?? 0),
    avgComments: Number(c.avg_comments ?? 0),
    avgShares: Number(c.avg_shares ?? 0),
    viewsPerFollower: Number(c.views_per_follower ?? 0),
    postsAnalyzed,
    postFrequency,
    lastPostAt: (c.last_post_at as string) ?? null, authenticityScore: Number(c.authenticity_score ?? 0),
    qualityStatus: String(c.quality_status ?? "ok"), platform: String(c.platform ?? "TikTok"),
    bio: String(c.bio ?? ""), email: (c.email as string) ?? null, niche: String(c.primary_niche ?? ""),
    primaryNiche: String(c.primary_niche ?? ""), language: String(c.language ?? "unknown"),
    location: (c.location as string) ?? null, countryCode: (c.country_code as string) ?? null,
    videoThumbnails: mapVideoThumbnails(c.video_thumbnails, c.top_videos),
    niches: Array.isArray(c.niches) ? (c.niches as string[]) : [],
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

// Exact tags only (niches[] / primary_niche). No partials, no cross-niche terms.
const NICHE_TOKENS: Record<string, string[]> = {
  fitness: [
    "fitness",
    "gym",
    "workout",
    "musculation",
    "bodybuilding",
    "calisthenics",
    "crossfit",
    "powerlifting",
    "sport",
    "sports",
  ],
  beauty: ["beauty", "beaute", "makeup", "maquillage", "skincare", "haircare", "grwm"],
  food: ["food", "recipe", "recipes", "recette", "recettes", "cuisine", "baking", "mealprep", "vegan"],
  fashion: ["fashion", "mode", "moda", "outfit", "outfits", "ootd", "streetwear", "menswear", "womenswear"],
  tech: ["tech", "gadgets", "coding", "smarthome", "techreviews", "pcbuilds"],
  finance: ["finance", "investing", "crypto", "personalfinance", "stocks", "budgeting", "realestate"],
  travel: ["travel", "voyage", "voyages", "viaje", "backpacking", "vanlife", "solotravel", "digitalnomad"],
  gaming: ["gaming", "gamer", "esports", "valorant", "fortnite", "minecraft"],
  lifestyle: ["lifestyle", "minimalism", "vlog", "thatgirl", "dayinmylife", "slowliving"],
  wellness: ["wellness", "mentalhealth", "meditation", "yoga", "wellbeing", "biohacking", "holistic"],
  business: ["business", "entrepreneur", "marketing", "startup", "freelance", "founder", "agency", "smallbusiness"],
  pets: ["pets", "dogs", "cats", "petcare", "puppytraining"],
  home: ["home", "interiordesign", "homedecor", "diyhome", "organization"],
  parenting: ["parenting", "momlife", "dadlife", "babytips", "pregnancy"],
  "e-commerce": [
    "e-commerce",
    "ecom",
    "ecommerce",
    "dropshipping",
    "shopify",
    "amazonfba",
    "tiktokshop",
    "dtc",
    "printondemand",
    "shopifydropshipping",
  ],
  saas: ["saas", "b2bsaas", "productled", "saastok", "microsaas"],
};

// Map UI labels (FR/EN) to a niche key.
const LABEL_TO_NICHE: Record<string, string> = {
  fitness: "fitness",
  sport: "fitness",
  sports: "fitness",
  beauté: "beauty", beaute: "beauty", beauty: "beauty",
  food: "food", cuisine: "food",
  mode: "fashion", fashion: "fashion",
  tech: "tech",
  finance: "finance",
  voyage: "travel", travel: "travel",
  gaming: "gaming", jeux: "gaming",
  lifestyle: "lifestyle",
  wellness: "wellness", "bien-etre": "wellness", "bien-être": "wellness",
  business: "business",
  pets: "pets", animaux: "pets",
  home: "home", maison: "home",
  parenting: "parenting", parentalite: "parenting",
  ecom: "e-commerce", ecommerce: "e-commerce", "e-commerce": "e-commerce",
  saas: "saas",
};

export function resolveNicheKey(label: string): string {
  const norm = label.trim().toLowerCase();
  return LABEL_TO_NICHE[norm] ?? norm;
}

function nicheTokensFor(key: string): string[] {
  const base = NICHE_TOKENS[key] ?? [key];
  const subs = NICHE_TREE[key] ?? [];
  return [...new Set([key, ...base, ...subs])];
}

/** Client-side guard: creator must carry an exact niche tag (no substring pollution). */
export function creatorMatchesNicheFilter(
  creator: { primaryNiche?: string; niche?: string; niches?: string[] },
  label: string
): boolean {
  if (!label.trim()) return true;
  const tags = new Set(nicheTagsFor(label));
  if (!tags.size) return true;

  for (const n of creator.niches ?? []) {
    if (tags.has(String(n).trim().toLowerCase())) return true;
  }
  const primary = String(creator.primaryNiche || creator.niche || "")
    .trim()
    .toLowerCase();
  return Boolean(primary && tags.has(primary));
}

/** Client/server guard: country and language filters (null country_code passes when country set). */
export function creatorMatchesGeoFilter(
  creator: { countryCode?: string | null; language?: string },
  opts: { country?: string; language?: string }
): boolean {
  if (opts.language) {
    const want = opts.language.toLowerCase();
    const lang = String(creator.language ?? "").toLowerCase();
    if (lang !== want) return false;
  }
  if (opts.country) {
    const want = opts.country.toUpperCase();
    const cc = creator.countryCode?.toUpperCase() ?? null;
    if (cc && cc !== want) return false;
  }
  return true;
}

// Tags valides pour une niche: canonique + synonymes (NICHE_TOKENS) + sous-niches.
// On reste sur des tags d'array (niches.cs.{...}), jamais d'ILIKE de bio, donc
// pas de pollution cross-niche. Les sous-niches scrapees rentables remontent.
export function nicheTagsFor(label: string): string[] {
  const key = resolveNicheKey(label);
  if (!key) return [];
  const tokens = NICHE_TOKENS[key] ?? [];
  const subs = NICHE_TREE[key] ?? [];
  // Tags "propres" (lettres/chiffres/tirets) pour le filtre SQL array.
  return [...new Set([key, ...tokens, ...subs])]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => /^[a-z0-9-]+$/i.test(t));
}

/**
 * Fast niche filter: exact array tags (GIN) + exact primary_niche.
 * No ILIKE %wildcards% — avoids fitness/etc. leaking into e-commerce / saas.
 */
export function nicheOrClause(label: string): string | null {
  const tags = nicheTagsFor(label);
  if (!tags.length) return null;
  const clauses = new Set<string>();
  for (const t of tags) {
    clauses.add(`niches.cs.{${t}}`);
    // Exact primary_niche (case-insensitive). Quote tags with hyphens.
    clauses.add(`primary_niche.ilike."${t}"`);
  }
  return [...clauses].join(",");
}

/** Alias kept for callers that used the heavier catalogue filter. */
export function nicheCatalogOrClause(label: string): string | null {
  return nicheOrClause(label);
}

/** Columns needed to render a discovery/catalog card (avoid select *). */
export const CREATOR_LIST_COLUMNS = [
  "username",
  "display_name",
  "avatar_url",
  "followers",
  "engagement_rate",
  "engagement_by_follower",
  "avg_views",
  "avg_likes",
  "avg_comments",
  "avg_shares",
  "views_per_follower",
  "posts_analyzed",
  "post_frequency",
  "last_post_at",
  "authenticity_score",
  "quality_status",
  "platform",
  "bio",
  "email",
  "primary_niche",
  "language",
  "location",
  "country_code",
  "video_thumbnails",
  "top_videos",
  "niches",
  "is_curated",
].join(",");


export function catalogRowToFeedCreator(c: Record<string, unknown>): FeedCreator {
  return dbRowToFeedCreator(c);
}

function dbRowToFeedCreator(c: Record<string, unknown>): FeedCreator {
  const base = dbRowToCreator(c);
  const estCostPerPost = estimatedCostPerPost(base.followersCount);
  const tv = Array.isArray(c.top_videos) ? (c.top_videos as Record<string, unknown>[]) : [];
  const topVideos: FeedVideo[] = tv.slice(0, 3).map((v) => ({
    id: String(v.id ?? ""),
    cover: clientImageUrl(String(v.cover ?? "")),
    shareUrl: String(v.shareUrl ?? ""),
    playUrl: String(v.playUrl ?? ""),
    playCount: Number(v.playCount ?? 0),
  }));
  return {
    ...base,
    estCostPerPost,
    estCpm: estimatedCpm(estCostPerPost, base.avgViews),
    valueScore: valueScore(base.followersCount, base.engagementRate, base.avgViews),
    valueTier: valueTier(base.followersCount),
    topVideos,
    isCurated: readIsCurated(c),
  };
}

function passesFeedSquareFilters(
  creator: FeedCreator,
  filters: FeedFilters
): boolean {
  if (filters.niche && !creatorMatchesNicheFilter(creator, filters.niche)) {
    return false;
  }
  if (
    !creatorMatchesFollowerRange(creator.followersCount, {
      min: filters.minFollowers,
      max: filters.maxFollowers,
    })
  ) {
    return false;
  }
  return true;
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

  const build = (opts: { requireAuthenticity: boolean; nicheInSql: boolean }) => {
    let q = admin
      .from("creators_index")
      .select("*")
      .eq("enrichment_status", "enriched")
      .neq("quality_status", "dead");
    // Curated/manual rows often ship with authenticity_score 0/null — don't drop them.
    if (opts.requireAuthenticity) q = q.gte("authenticity_score", 30);
    if (filters.platform) q = q.eq("platform", filters.platform);
    // Use != null so minFollowers=0 / exact bucket edges are applied.
    if (filters.minFollowers != null) q = q.gte("followers", filters.minFollowers);
    if (filters.maxFollowers != null) q = q.lte("followers", filters.maxFollowers);
    if (filters.minEngagement != null && filters.minEngagement > 0) {
      q = q.gte("engagement_rate", filters.minEngagement);
    }
    // FR strict ejecte les createurs FR dont country_code est NULL (le scraper
    // ne le remplit pas toujours). On accepte le pays demande OU null: la langue
    // (filtree juste apres) garantit deja qu'ils sont du bon marche.
    if (filters.country) q = q.or(`country_code.eq.${filters.country},country_code.is.null`);
    if (filters.language) q = q.eq("language", filters.language);
    if (opts.nicheInSql && filters.niche) {
      const or = nicheOrClause(filters.niche);
      if (or) q = q.or(or);
    }
    return q;
  };

  const sortCol = filters.sort === "engagement" ? "engagement_rate" : filters.sort === "followers" ? "followers" : "value_score";

  const runOrdered = async (
    makeQ: () => ReturnType<typeof build>,
    from: number,
    to: number
  ) => {
    let r = await makeQ().order(sortCol, { ascending: false, nullsFirst: false }).range(from, to);
    if (r.error && sortCol === "value_score") {
      r = await makeQ().order("followers", { ascending: false }).range(from, to);
    }
    return r;
  };

  // 1) CURATED first — niche applied in JS so a second .or() cannot wipe SQL niche.
  //    Oversample then square-filter so 1–10k / 500k+ buckets stay exclusive.
  const curatedMake = () =>
    build({ requireAuthenticity: false, nicheInSql: false }).or(
      "is_curated.eq.true,niches.cs.{curated},video_thumbnails.neq.[]"
    );
  const { data: curatedData } = await runOrdered(curatedMake, 0, Math.max(limit * 4, 48) - 1);
  const curatedRows = (curatedData || [])
    .map(dbRowToFeedCreator)
    .filter((c) => passesFeedSquareFilters(c, filters));

  const seen = new Set(curatedRows.map((c) => c.username));
  let creators = [...curatedRows];

  // 2) Fill with scrapes (authenticity + niche in SQL), then square-filter again.
  if (creators.length < limit) {
    const need = limit - creators.length;
    const scrapedMake = () => build({ requireAuthenticity: true, nicheInSql: true });
    const { data: restData } = await runOrdered(
      scrapedMake,
      offset,
      offset + Math.max(need * 3, need) - 1
    );
    for (const row of (restData || []).map(dbRowToFeedCreator)) {
      if (creators.length >= limit) break;
      if (seen.has(row.username)) continue;
      if (!passesFeedSquareFilters(row, filters)) continue;
      seen.add(row.username);
      creators.push(row);
    }
  }

  const hasMore = creators.length >= limit;
  return { creators: creators.slice(0, limit), hasMore };
}
