// Shapes shared by every scraping source. A source only fetches and parses;
// storing, history and ranking live in ingest.ts so any provider can be swapped.

export type ScrapePlatform = "tiktok" | "instagram" | "youtube";

export type ScrapedProfile = {
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
};

export type ScrapedVideo = {
  id: string;
  postedAt: string | null;
  caption: string;
  hashtags: string[];
  durationSeconds: number | null;
  mediaType: "video" | "photo" | "carousel";
  coverUrl: string;
  shareUrl: string;
  musicTitle: string | null;
  isAd: boolean;
  hasProductLink: boolean;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type ScrapedSearchHit = { username: string; displayName: string; followers: number; avatarUrl: string };

export interface CreatorSource {
  readonly name: string;
  readonly platform: ScrapePlatform;
  available(): boolean;
  profile(username: string): Promise<ScrapedProfile | null>;
  videos(username: string, count: number): Promise<ScrapedVideo[]>;
  search(keyword: string, count: number): Promise<ScrapedSearchHit[]>;
}

export function hashtagsOf(caption: string): string[] {
  const tags = new Set<string>();
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]{2,60})/gu)) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 30);
}
