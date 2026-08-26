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

import { extractTikTokPlayUrl } from "@/lib/tiktok-play-url";

export interface RichVideo {
  id: string;
  cover: string; // animated WebP (dynamic_cover) preferred, renderable
  shareUrl: string;
  playUrl: string;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createTime: number; // unix seconds
  desc: string;
  isAd: boolean;
}

// Richer per-video data for the in-app detail view (thumbnails + embed + stats).
export function parseVideosRich(raw: any): RichVideo[] {
  const list = (raw?.aweme_list ?? []) as any[];
  return list.map((a) => {
    const st = a?.statistics ?? {};
    const v = a?.video ?? {};
    const cover =
      v.dynamic_cover?.url_list?.[0] ??
      v.ai_dynamic_cover?.url_list?.[0] ??
      v.origin_cover?.url_list?.[0] ??
      v.cover?.url_list?.[0] ??
      "";
    const shareUrl = a?.share_url ?? a?.share_info?.share_url ?? "";
    return {
      id: String(a?.aweme_id ?? ""),
      cover: String(cover),
      shareUrl: String(shareUrl),
      playUrl: extractTikTokPlayUrl(v),
      playCount: Number(st.play_count ?? 0),
      likeCount: Number(st.digg_count ?? 0),
      commentCount: Number(st.comment_count ?? 0),
      shareCount: Number(st.share_count ?? 0),
      createTime: Number(a?.create_time ?? 0),
      desc: String(a?.desc ?? ""),
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
  // Request a fuller page so medians aren't based on a single video when possible.
  return scGet(
    `/v3/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&amount=30`
  );
}
export async function searchTikTokUsersRaw(query: string, cursor?: number): Promise<any> {
  const c = cursor ? `&cursor=${cursor}` : "";
  return scGet(`/v1/tiktok/search/users?query=${encodeURIComponent(query)}${c}`);
}

function normalizeTikTokPostUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    // Keep path only for canonical www/m tiktok links; drop tracking query noise.
    if (/tiktok\.com$/i.test(u.hostname) || /\.tiktok\.com$/i.test(u.hostname)) {
      u.hash = "";
      // Short links (vm/vt) need the full URL as-is for redirect resolution by the API.
      if (/^(vm|vt)\.tiktok\.com$/i.test(u.hostname)) {
        return u.toString();
      }
      // Strip query for standard /@user/video/ID urls
      if (/\/video\/\d+/i.test(u.pathname) || /\/photo\/\d+/i.test(u.pathname)) {
        u.search = "";
      }
      return u.toString();
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

// Fetch a single TikTok video by its public URL (post performance).
export async function fetchTikTokVideoRaw(postUrl: string): Promise<any> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new Error("SCRAPECREATORS_API_KEY missing");
  const url = normalizeTikTokPostUrl(postUrl);
  if (!url) throw new Error("TikTok URL is empty");

  const endpoint = `https://api.scrapecreators.com/v2/tiktok/video?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, {
    headers: { "x-api-key": key, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail =
      (body && (body.error || body.message || body.detail)) ||
      text.slice(0, 180) ||
      res.statusText;
    throw new Error(`ScrapeCreators video ${res.status}: ${detail}`);
  }
  if (body && body.success === false) {
    throw new Error(String(body.error || body.message || "ScrapeCreators returned success=false"));
  }
  return body ?? {};
}

// Defensive parse across ScrapeCreators response shapes.
export function parseVideoStats(raw: any): {
  views: number | null; likes: number | null; comments: number | null;
  shares: number | null; postedAt: string | null;
} {
  const d = raw?.aweme_detail ?? raw?.data?.aweme_detail ?? raw?.data ?? raw?.video ?? raw ?? {};
  const st = d.statistics ?? d.stats ?? d.stat ?? {};
  const n = (v: unknown) => (typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : null);
  const created = n(d.create_time ?? d.createTime ?? d.created_at);
  const views = n(
    st.play_count ?? st.playCount ?? st.view_count ?? st.viewCount ?? st.views ?? d.play_count ?? d.views,
  );
  return {
    views,
    likes: n(st.digg_count ?? st.diggCount ?? st.like_count ?? st.likes ?? d.likes),
    comments: n(st.comment_count ?? st.commentCount ?? st.comments ?? d.comments),
    shares: n(st.share_count ?? st.shareCount ?? st.shares ?? d.shares),
    postedAt: created
      ? new Date(created > 1e12 ? created : created * 1000).toISOString()
      : null,
  };
}
