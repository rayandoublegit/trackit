import type { FeedCreator } from "@/lib/discovery-feed";

// What the creator profile page and the video library receive from the API.

export type HistoryPoint = { day: string; followers: number | null; avgViews: number | null; engagement: number | null };

export type LibraryVideo = {
  platform: string;
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followers: number;
  niche: string;
  countryCode: string | null;
  cover: string;
  /** Tried only when `cover` fails to load (a route that refetches the cover). */
  coverFallback?: string;
  shareUrl: string;
  caption: string;
  hashtags: string[];
  mediaType: "video" | "photo" | "carousel";
  /** short (TikTok, Reels, YouTube Shorts), long (YouTube videos over 3 min), photo, carousel. */
  format: "short" | "long" | "photo" | "carousel";
  durationSeconds: number | null;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  viewsGained7d: number | null;
  /** The video links a product (TikTok Shop anchor or a stored product URL). */
  hasProductLink: boolean;
  /** The product link itself, when the source exposes it. */
  productUrl: string | null;
  /** Views >= max(100K, 5x the creator's median views) — lib/viral.ts. Null when unknown. */
  isViral: boolean | null;
};

export type CreatorProfileData = {
  creator: FeedCreator;
  history: HistoryPoint[];
  videos: LibraryVideo[];
  similar: FeedCreator[];
  hashtags: { tag: string; count: number }[];
  mix: { videos: number; photos: number; avgDurationSeconds: number | null; productLinkShare: number | null; viralVideos: number | null };
  /** "tracked": videos and history come from the scraper; "snapshot": only the stored top videos. */
  depth: "tracked" | "snapshot";
};

export type VideoLibraryResult = {
  videos: LibraryVideo[];
  hasMore: boolean;
  source: "tracked" | "snapshot";
  /** No tracked video yet, and a filter needs data only tracked videos have (format, length, product). */
  needsTracking?: boolean;
  /** Free plan: more videos match than the plan shows (upgrade to see them). */
  teaserLocked?: boolean;
};
