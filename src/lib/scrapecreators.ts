/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VideoStat } from "@/lib/creator-metrics";

export interface CreatorProfile {
  followers: number;
  verified: boolean;
  bio: string;
  displayName: string;
  videoCount: number;
}

const BASE = "https://api.scrapecreators.com";

function apiKey(): string {
  const k = process.env.SCRAPECREATORS_API_KEY;
  if (!k) throw new Error("SCRAPECREATORS_API_KEY is not set");
  return k;
}

async function scGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`ScrapeCreators ${path} -> HTTP ${res.status}`);
  return res.json();
}

// ---- pure parsers ----
export function parseProfile(raw: any): CreatorProfile {
  const u = raw?.user ?? {};
  const s = raw?.stats ?? {};
  return {
    followers: Number(s.followerCount ?? 0),
    verified: Boolean(u.verified),
    bio: String(u.signature ?? ""),
    displayName: String(u.nickname ?? ""),
    videoCount: Number(s.videoCount ?? 0),
  };
}

export function parseVideos(raw: any): VideoStat[] {
  const list = (raw?.aweme_list ?? []) as any[];
  return list.map((a) => {
    const st = a?.statistics ?? {};
    return {
      playCount: Number(st.play_count ?? 0),
      likeCount: Number(st.digg_count ?? 0),
      commentCount: Number(st.comment_count ?? 0),
      shareCount: Number(st.share_count ?? 0),
      createTime: Number(a?.create_time ?? 0),
      isAd: Boolean(a?.is_ad),
    };
  });
}

export function extractCaptions(raw: any): string[] {
  const list = (raw?.aweme_list ?? []) as any[];
  return list.map((a) => String(a?.desc ?? "")).filter(Boolean);
}

// ---- I/O fetchers (not unit-tested; covered by live smoke) ----
export async function fetchTikTokProfileRaw(handle: string): Promise<any> {
  return scGet(`/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`);
}
export async function fetchTikTokVideosRaw(handle: string): Promise<any> {
  return scGet(`/v3/tiktok/profile/videos?handle=${encodeURIComponent(handle)}`);
}
export async function searchTikTokUsersRaw(query: string, cursor?: number): Promise<any> {
  const c = cursor ? `&cursor=${cursor}` : "";
  return scGet(`/v1/tiktok/search/users?query=${encodeURIComponent(query)}${c}`);
}
