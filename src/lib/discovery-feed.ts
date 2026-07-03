import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import { clientImageUrl } from "@/lib/client-image-url";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { liveSearchAndEnrich } from "@/lib/discovery-live";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { NICHE_TREE } from "@/lib/niche-tree";
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
  playUrl?: string;
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

function mapVideoThumbnails(raw: unknown): DiscoveryCreatorResult["videoThumbnails"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const t = row as { views?: number; thumbnail?: string | null; url?: string | null };
    return {
      views: Number(t.views ?? 0),
      thumbnail: clientImageUrl(t.thumbnail) || null,
      url: t.url ?? null,
    };
  });
}

function dbRowToCreator(c: Record<string, unknown>): DiscoveryCreatorResult {
  return {
    username: String(c.username), displayName: String(c.display_name ?? c.username),
    avatarUrl: feedAvatarUrlForCreator(String(c.username), String(c.avatar_url ?? "")),
    followersCount: Number(c.followers ?? 0),
    engagementRate: Number(c.engagement_rate ?? 0),
    engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: Number(c.avg_views ?? 0), postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: (c.last_post_at as string) ?? null, authenticityScore: Number(c.authenticity_score ?? 0),
    qualityStatus: String(c.quality_status ?? "ok"), platform: String(c.platform ?? "TikTok"),
    bio: String(c.bio ?? ""), email: (c.email as string) ?? null, niche: String(c.primary_niche ?? ""),
    primaryNiche: String(c.primary_niche ?? ""), language: String(c.language ?? "unknown"),
    location: (c.location as string) ?? null, countryCode: (c.country_code as string) ?? null,
    videoThumbnails: mapVideoThumbnails(c.video_thumbnails),
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

// UI niche label -> DB tokens. primary_niche / niches are raw (multi-lingual)
// search terms, so we match a small synonym set with ILIKE / array-contains.
const NICHE_TOKENS: Record<string, string[]> = {
  fitness: ["fitness", "gym", "workout", "musculation", "sport", "abnehmen", "palestra"],
  beauty: ["beaut", "makeup", "maquill", "maquiag", "skincare", "schminken", "trucco"],
  food: ["food", "recipe", "recett", "receta", "receita", "cook", "cuisine", "rezept", "ricett"],
  fashion: ["fashion", "mode", "moda", "outfit", "style", "ootd", "vintage"],
  tech: ["tech", "gadget", "coding", "ai ", "ia "],
  finance: ["finance", "money", "invest", "finanz", "argent", "crypto"],
  travel: ["travel", "voyage", "viaje", "trip", "backpack", "globe", "destination"],
  gaming: ["gaming", "game", "gamer", "valorant"],
  lifestyle: ["lifestyle", "minimalism", "productivity", "selfcare", "routine", "quotidien", "vlog"],
  wellness: ["wellness", "mentalhealth", "meditation", "yoga", "bien", "santé", "sante", "wellbeing"],
  business: ["business", "entrepreneur", "marketing", "ecommerce", "startup", "freelance", "founder"],
  "e-commerce": [
    "e-commerce",
    "ecom",
    "ecommerce",
    "dropshipping",
    "shopify",
    "amazon",
    "amazonfba",
    "dtc",
    "ugc",
    "tiktokshop",
    "moneymaker",
    "moneymaking",
    "sidehustle",
    "passiveincome",
    "onlinebusiness",
    "printondemand",
    "productreview",
  ],
  saas: ["saas", "software", "b2b", "startup", "nocode", "productled", "aitools"],
};

// Map UI labels (FR/EN) to a niche key.
const LABEL_TO_NICHE: Record<string, string> = {
  fitness: "fitness", beauté: "beauty", beaute: "beauty", beauty: "beauty",
  food: "food", mode: "fashion", fashion: "fashion", tech: "tech",
  finance: "finance", voyage: "travel", travel: "travel", gaming: "gaming", jeux: "gaming",
  lifestyle: "lifestyle", wellness: "wellness", business: "business",
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

/** Client-side guard: creator text fields match the selected niche filter. */
export function creatorMatchesNicheFilter(
  creator: { primaryNiche?: string; niche?: string; niches?: string[] },
  label: string
): boolean {
  if (!label.trim()) return true;
  const tokens = nicheTokensFor(resolveNicheKey(label));
  const hay = [
    creator.primaryNiche || "",
    creator.niche || "",
    ...(creator.niches || []),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.some((t) => hay.includes(t.toLowerCase()));
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

/** Fast niche filter: array tags only (indexed GIN). Prefer this for search latency. */
export function nicheOrClause(label: string): string | null {
  const tags = nicheTagsFor(label);
  if (!tags.length) return null;
  // OR de tous les tags: un createur compte s'il a la niche OU une sous-niche.
  return tags.map((t) => `niches.cs.{${t}}`).join(",");
}

/**
 * Catalogue: tags array + primary_niche.
 * Heavier than nicheOrClause — use only when recall matters more than speed.
 */
export function nicheCatalogOrClause(label: string): string | null {
  const tags = nicheTagsFor(label);
  if (!tags.length) return null;
  const clauses = new Set<string>();
  for (const t of tags) {
    clauses.add(`niches.cs.{${t}}`);
    clauses.add(`primary_niche.ilike.%${t}%`);
  }
  // Always include the canonical key on primary_niche for older rows.
  const key = resolveNicheKey(label);
  if (key) clauses.add(`primary_niche.ilike.%${key}%`);
  return [...clauses].join(",");
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
  "niches",
].join(",");


export function catalogRowToFeedCreator(c: Record<string, unknown>): FeedCreator {
  return dbRowToFeedCreator(c);
}

function dbRowToFeedCreator(c: Record<string, unknown>): FeedCreator {
  const base = dbRowToCreator(c);
  const estCostPerPost = estimatedCostPerPost(base.followersCount);
  const tv = Array.isArray(c.top_videos) ? (c.top_videos as Record<string, unknown>[]) : [];
  const topVideos: FeedVideo[] = tv.slice(0, 6).map((v) => ({
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

  const build = () => {
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
    // FR strict ejecte les createurs FR dont country_code est NULL (le scraper
    // ne le remplit pas toujours). On accepte le pays demande OU null: la langue
    // (filtree juste apres) garantit deja qu'ils sont du bon marche.
    if (filters.country) q = q.or(`country_code.eq.${filters.country},country_code.is.null`);
    if (filters.language) q = q.eq("language", filters.language);
    if (filters.niche) {
      const or = nicheOrClause(filters.niche);
      if (or) q = q.or(or);
    }
    return q;
  };

  const sortCol = filters.sort === "engagement" ? "engagement_rate" : filters.sort === "followers" ? "followers" : "value_score";

  // Helper: applique le tri avec fallback si value_score absent.
  const runOrdered = async (q: ReturnType<typeof build>, from: number, to: number) => {
    let r = await q.order(sortCol, { ascending: false, nullsFirst: false }).range(from, to);
    if (r.error && sortCol === "value_score") {
      r = await build().order("followers", { ascending: false }).range(from, to);
    }
    return r;
  };

  // 1) CURATED/SCRIPTED d'abord: les createurs ajoutes a la main (tag 'curated'
  //    OU video_thumbnails non-vide = marqueur indestructible de curation).
  //    Ils passent devant les scrapes, pour toutes les niches.
  const curatedQ = build().or("niches.cs.{curated},video_thumbnails.neq.[]");
  const { data: curatedData } = await runOrdered(curatedQ, offset, offset + limit - 1);
  const curatedRows = (curatedData || []).map(dbRowToFeedCreator);

  const seen = new Set(curatedRows.map((c) => c.username));
  let creators = [...curatedRows];

  // 2) Completer avec le reste (scrapes) si on n'a pas atteint la limite.
  //    On ne filtre PAS sur video_thumbnails en SQL (comparaison JSONB fragile):
  //    on prend simplement les createurs de la niche pas encore vus, et le dedup
  //    par username via `seen` ecarte ceux deja sortis par la couche curated.
  if (creators.length < limit) {
    const need = limit - creators.length;
    // On sur-echantillonne (need*3) pour absorber les doublons deja vus.
    const { data: restData } = await runOrdered(build(), 0, Math.max(need * 3, need) - 1);
    for (const row of (restData || []).map(dbRowToFeedCreator)) {
      if (creators.length >= limit) break;
      if (seen.has(row.username)) continue;
      seen.add(row.username);
      creators.push(row);
    }
  }

  // hasMore: vrai si on a rempli la page entiere (probablement plus derriere).
  const hasMore = creators.length >= limit;
  return { creators: creators.slice(0, limit), hasMore };
}
