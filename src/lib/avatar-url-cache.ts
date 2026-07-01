/** In-memory + sessionStorage cache so avatars reappear instantly across views. */

import { creatorAvatarApiUrl } from "@/lib/feed-avatar-url";

const STORAGE_KEY = "trackit_avatar_cache_v1";
const MAX_ENTRIES = 600;

type Entry = { url: string; at: number };

const memory = new Map<string, Entry>();

/** URLs safe to cache for instant reuse (proxy, Supabase, or warmed creator-avatar API). */
export function isPersistableAvatarUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes("/api/creator-avatar")) return true;
  if (trimmed.includes("/api/img-proxy")) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (host.includes("supabase.co") || trimmed.includes("/storage/v1/object/public/")) return true;
  } catch {
    /* invalid url */
  }
  return false;
}

function readStorage(): Record<string, Entry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, Entry>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota — memory cache still works */
  }
}

function normalizeKey(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

export function getCachedAvatarUrl(username: string): string | null {
  const key = normalizeKey(username);
  if (!key) return null;

  const mem = memory.get(key);
  if (mem?.url && isPersistableAvatarUrl(mem.url)) return mem.url;
  if (mem?.url) memory.delete(key);

  const storedAll = readStorage();
  const stored = storedAll[key];
  if (stored?.url && isPersistableAvatarUrl(stored.url)) {
    memory.set(key, stored);
    return stored.url;
  }
  if (stored?.url) {
    delete storedAll[key];
    writeStorage(storedAll);
  }
  return null;
}

export function setCachedAvatarUrl(username: string, url: string): void {
  const key = normalizeKey(username);
  const trimmed = url.trim();
  if (!key || !trimmed || !isPersistableAvatarUrl(trimmed)) return;

  const entry: Entry = { url: trimmed, at: Date.now() };
  memory.set(key, entry);

  const stored = readStorage();
  stored[key] = entry;
  const keys = Object.keys(stored);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (stored[a]?.at ?? 0) - (stored[b]?.at ?? 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete stored[k]);
  }
  writeStorage(stored);
}

function normalizeHandle(username?: string | null): string {
  return (username ?? "").replace(/^@/, "").trim().toLowerCase();
}

/** Warm browser cache for avatar URLs; optionally bind username → URL for instant reuse. */
export function prefetchAvatarUrls(
  urls: string[],
  usernames?: Array<string | null | undefined>,
): void {
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]?.trim() || "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const handle = normalizeHandle(usernames?.[index]);
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      if (handle && isPersistableAvatarUrl(url)) setCachedAvatarUrl(handle, url);
    };
    img.src = url;
  }
}

export function prefetchCreatorAvatars(
  items: Array<{ username?: string | null; avatarUrl?: string | null }>,
  limit = 48,
): void {
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  for (const item of items.slice(0, limit)) {
    const handle = normalizeHandle(item.username);
    const raw = item.avatarUrl?.trim() || "";
    const url = raw || (handle ? creatorAvatarApiUrl(handle) : "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      if (handle && isPersistableAvatarUrl(url)) setCachedAvatarUrl(handle, url);
    };
    img.src = url;
  }
}

/** Prefetch avatars + video cover thumbnails for instant drawer previews. */
export function prefetchCreatorMedia(
  items: Array<{
    username?: string | null;
    avatarUrl?: string | null;
    topVideos?: Array<{ cover?: string | null }>;
    videoThumbnails?: Array<{ thumbnail?: string | null }>;
  }>,
  limit = 48,
): void {
  prefetchCreatorAvatars(items, limit);
  if (typeof window === "undefined") return;
  const seen = new Set<string>();
  for (const item of items.slice(0, limit)) {
    const urls = [
      ...(item.topVideos ?? []).map((v) => v.cover?.trim() || ""),
      ...(item.videoThumbnails ?? []).map((t) => t.thumbnail?.trim() || ""),
    ];
    for (const url of urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
    }
  }
}
