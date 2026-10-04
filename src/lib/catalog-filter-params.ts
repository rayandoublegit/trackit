import { followerRangeBounds } from "@/lib/discovery-follower-ranges";

// Catalog bar values → API query params, for Creators > Search (/api/catalog)
// and Creators > Videos (/api/videos). Pure and browser-safe.

export const VIEWS_VAL: Record<string, number> = { "10k": 10_000, "50k": 50_000, "100k": 100_000, "500k": 500_000, "1m": 1_000_000, "10m": 10_000_000 };
export const COUNT_VAL: Record<string, number> = { "100": 100, "1k": 1_000, "10k": 10_000, "100k": 100_000 };
/** Engagement options are percents: "6+" = 6% or more. */
export const ENGAGEMENT_VAL: Record<string, number> = { "3+": 3, "6+": 6, "9+": 9, "12+": 12 };
const COUNTRIES = new Set(["FR", "US", "GB", "DE", "BR", "ES", "IT", "PT", "CA"]);
const LANGUAGES = new Set(["fr", "en", "es", "de", "pt", "it"]);

export type CreatorFilterInput = {
  platform: string;
  niche: string;
  followersRange: string;
  viewsFrom: string;
  viewsTo?: string;
  engagement: string;
  /** Average views / followers, as a ratio ("0.5" = 50%). */
  reach: string;
  likes: string;
  comments: string;
  shares: string;
  viral: boolean;
  country: string;
  language: string;
  /** Last post within N days. */
  activity: string;
  hasEmail: boolean;
  verified: boolean;
  /** Hide brand / company accounts. The API hides them unless this is false. */
  excludeBrands?: boolean;
};

/** Query params for /api/catalog. A name search keeps the performance filters but drops niche and place. */
export function creatorFiltersToParams(f: CreatorFilterInput, search = "", sort = "followers"): Record<string, string> {
  const q = search.trim().replace(/^@/, "");
  const p: Record<string, string> = { platform: f.platform || "tiktok", sort };
  if (f.hasEmail) p.hasEmail = "1";
  if (f.verified) p.verified = "1";
  if (f.excludeBrands === false) p.excludeBrands = "0";
  if (f.viral) p.viral = "1";
  if (Number(f.activity) > 0) p.activeWithinDays = String(Number(f.activity));
  if (Number(f.reach) > 0) p.minReach = String(Number(f.reach));
  if (COUNT_VAL[f.likes]) p.minLikes = String(COUNT_VAL[f.likes]);
  if (COUNT_VAL[f.comments]) p.minComments = String(COUNT_VAL[f.comments]);
  if (COUNT_VAL[f.shares]) p.minShares = String(COUNT_VAL[f.shares]);
  if (VIEWS_VAL[f.viewsFrom]) p.minViews = String(VIEWS_VAL[f.viewsFrom]);
  if (f.viewsTo && VIEWS_VAL[f.viewsTo]) p.maxViews = String(VIEWS_VAL[f.viewsTo]);
  if (ENGAGEMENT_VAL[f.engagement]) p.minEngagement = String(ENGAGEMENT_VAL[f.engagement]);
  const followers = followerRangeBounds(f.followersRange);
  if (followers.min != null) p.minFollowers = String(followers.min);
  if (followers.max != null) p.maxFollowers = String(followers.max);
  if (q.length >= 2) {
    p.search = q;
    return p;
  }
  if (f.niche) p.niche = f.niche;
  if (COUNTRIES.has(f.country)) p.country = f.country;
  if (LANGUAGES.has(f.language)) p.language = f.language;
  return p;
}

export type VideoFilterInput = {
  niche: string;
  country: string;
  language: string;
  minViews: string;
  postedWithin: string;
  /** YYYY-MM-DD */
  postedFrom: string;
  /** YYYY-MM-DD */
  postedTo: string;
  mediaType: string;
  duration: string;
  hasProduct: boolean;
  viral: boolean;
  sort: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Query string for /api/videos. */
export function videoFiltersToParams(f: VideoFilterInput, search: string, platform: string, offset: number, limit = 48): string {
  const p = new URLSearchParams({ sort: f.sort || "views", offset: String(offset), limit: String(limit) });
  if (platform) p.set("platform", platform);
  if (search.trim().length >= 2) p.set("q", search.trim());
  if (f.niche) p.set("niche", f.niche);
  if (COUNTRIES.has(f.country)) p.set("country", f.country);
  if (LANGUAGES.has(f.language)) p.set("language", f.language);
  if (VIEWS_VAL[f.minViews]) p.set("minViews", String(VIEWS_VAL[f.minViews]));
  if (Number(f.postedWithin) > 0) p.set("postedWithin", String(Number(f.postedWithin)));
  if (DAY_RE.test(f.postedFrom)) p.set("postedFrom", f.postedFrom);
  if (DAY_RE.test(f.postedTo)) p.set("postedTo", f.postedTo);
  if (["video", "short", "long", "photo", "carousel"].includes(f.mediaType)) p.set("mediaType", f.mediaType);
  if (["short", "medium", "long"].includes(f.duration)) p.set("duration", f.duration);
  if (f.hasProduct) p.set("hasProduct", "1");
  if (f.viral) p.set("viral", "1");
  return p.toString();
}
