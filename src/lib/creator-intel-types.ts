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
  shareUrl: string;
  caption: string;
  hashtags: string[];
  mediaType: "video" | "photo" | "carousel";
  durationSeconds: number | null;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  viewsGained7d: number | null;
  hasProductLink: boolean;
};

export type CreatorProfileData = {
  creator: FeedCreator;
  history: HistoryPoint[];
  videos: LibraryVideo[];
  similar: FeedCreator[];
  hashtags: { tag: string; count: number }[];
  mix: { videos: number; photos: number; avgDurationSeconds: number | null; productLinkShare: number | null };
  /** "tracked": videos and history come from the scraper; "snapshot": only the stored top videos. */
  depth: "tracked" | "snapshot";
};

export type VideoLibraryResult = { videos: LibraryVideo[]; hasMore: boolean; source: "tracked" | "snapshot" };
