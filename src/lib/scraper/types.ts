// Shapes shared by every scraping source. A source only fetches and parses;
// storing, history and ranking live in ingest.ts so any provider can be swapped
// without touching stored creators: every provider of a platform must return
// exactly these shapes, keyed by the public handle (never a provider id).

export type ScrapePlatform = "tiktok" | "instagram" | "youtube";
export const SCRAPE_PLATFORMS: readonly ScrapePlatform[] = ["tiktok", "instagram", "youtube"];

/** Provider behind a source. Only ScrapeCreators covers Instagram and YouTube today. */
export type ScrapeProvider = "scrapecreators" | "rapidapi";

export type ScrapedProfile = {
  /** Public handle, lowercase, no "@". */
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  bioLink: string | null;
  followers: number;
  following: number | null;
  totalLikes: number | null;
  videoCount: number | null;
  verified: boolean;
  /** TikTok Shop seller account (TikTok only). */
  seller?: boolean | null;
  /** Business category shown on the profile ("Clothing (Brand)", "Digital creator"…). */
  category?: string | null;
  /** Public contact e-mail (Instagram's email_from_biography / public_email, else one written in the bio). */
  email?: string | null;
  /** Private account: its posts can't be read (Instagram). */
  isPrivate?: boolean;
};

/**
 * short: TikTok videos, Instagram reels/videos, YouTube Shorts.
 * long: YouTube videos (not Shorts).
 */
export type VideoFormat = "short" | "long" | "photo" | "carousel";

export type ScrapedVideo = {
  id: string;
  postedAt: string | null;
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  mediaType: "video" | "photo" | "carousel";
  format: VideoFormat;
  coverUrl: string;
  shareUrl: string;
  musicTitle: string | null;
  isAd: boolean;
  hasProductLink: boolean;
  /** The product / shop page the post links to, when the source exposes it. */
  productUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** Language the platform detected for the caption (TikTok desc_language), when given. */
  language?: string;
  /** Country of the account that posted it (TikTok author.region), when given. */
  region?: string;
  /**
   * Other accounts on the post (Instagram: tagged people, co-authors, @mentions
   * in the caption). Never stored as such: Instagram discovery follows them.
   */
  related?: RelatedAccount[];
};

/** An account seen next to a creator (tagged, co-author, mention, similar account, hashtag post owner). */
export type RelatedAccount = { username: string; displayName: string; via: "coauthor" | "tag" | "mention" | "bio" | "similar" | "hashtag" | "search" };

/** followers is null when the search result does not say (the hit is then skipped). */
export type ScrapedSearchHit = { username: string; displayName: string; followers: number | null; avatarUrl: string };

/** Counts every external call (and credits when the provider reports them). */
export class CallMeter {
  calls = 0;
  credits = 0;
  readonly byProvider: Record<string, number> = {};

  record(provider: string, credits = 1): void {
    this.calls += 1;
    this.credits += credits;
    this.byProvider[provider] = (this.byProvider[provider] ?? 0) + 1;
  }

  merge(other: CallMeter): void {
    this.calls += other.calls;
    this.credits += other.credits;
    for (const [k, v] of Object.entries(other.byProvider)) this.byProvider[k] = (this.byProvider[k] ?? 0) + v;
  }
}

export interface CreatorSource {
  /** e.g. "scrapecreators-tiktok"; a fallback chain is "scrapecreators-tiktok>rapidapi-tiktok". */
  readonly name: string;
  readonly platform: ScrapePlatform;
  /** API calls one refresh (profile + recent videos) costs with this source. */
  readonly callsPerRefresh: number;
  available(): boolean;
  /** Null when the account does not exist (renamed, deleted, private). */
  profile(handle: string, meter?: CallMeter): Promise<ScrapedProfile | null>;
  videos(handle: string, count: number, meter?: CallMeter): Promise<ScrapedVideo[]>;
  search(keyword: string, count: number, meter?: CallMeter): Promise<ScrapedSearchHit[]>;
  /** Accounts the platform suggests next to this one (Instagram, optional: 1 call). */
  similar?(handle: string, meter?: CallMeter): Promise<ScrapedSearchHit[]>;
  /** Owners of recent posts under a hashtag (Instagram, optional: 1 call). */
  hashtag?(tag: string, meter?: CallMeter): Promise<ScrapedSearchHit[]>;
}

export function hashtagsOf(caption: string): string[] {
  const tags = new Set<string>();
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]{2,60})/gu)) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 30);
}
