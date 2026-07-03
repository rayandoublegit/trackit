/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTikTokProfileRaw } from "@/lib/scrapecreators";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";

/** Prefer the public bucket created for permanent avatars, fall back to legacy. */
const AVATAR_BUCKETS = ["creator-avatars", "avatars"] as const;

type SearchUser = {
  avatar_medium?: { url_list?: string[] };
  avatar_168x168?: { url_list?: string[] };
};

function urlFromField(field: unknown): string | null {
  if (!field) return null;
  if (typeof field === "string" && field.startsWith("http")) return field;
  const list = (field as { url_list?: string[] })?.url_list;
  return list?.[0] ?? null;
}

function collectAvatarCandidates(node: unknown, out: string[], depth = 0): void {
  if (!node || depth > 4) return;
  if (typeof node === "string") {
    if (node.startsWith("http") && /avatar|profile|tiktokcdn|ttwstatic|ibyteimg/i.test(node)) {
      out.push(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 8)) collectAvatarCandidates(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (/avatar/i.test(key)) {
        const direct = urlFromField(obj[key]);
        if (direct) out.push(direct);
      }
      collectAvatarCandidates(obj[key], out, depth + 1);
    }
  }
}

/** Extract the best available avatar URL from TikTok profile/search payloads. */
export function pickTikTokAvatarUrl(profileRaw?: any, searchUser?: SearchUser | null): string | null {
  const user =
    profileRaw?.user ??
    profileRaw?.userInfo ??
    profileRaw?.user_info ??
    profileRaw?.data?.user ??
    profileRaw?.data?.userInfo ??
    {};

  const preferred =
    urlFromField(user.avatar_medium) ||
    urlFromField(user.avatar_larger) ||
    urlFromField(user.avatarMedium) ||
    urlFromField(user.avatarLarger) ||
    urlFromField(user.avatar_thumb) ||
    urlFromField(user.avatarThumb) ||
    urlFromField(user.avatar_url) ||
    (typeof user.avatar === "string" ? user.avatar : null) ||
    searchUser?.avatar_medium?.url_list?.[0] ||
    searchUser?.avatar_168x168?.url_list?.[0] ||
    null;

  if (preferred) return preferred;

  const dug: string[] = [];
  collectAvatarCandidates(profileRaw, dug);
  return dug[0] ?? null;
}

export function isUiAvatarsUrl(url?: string | null): boolean {
  return Boolean(url?.includes("ui-avatars.com"));
}

export function isTikTokCdnUrl(url?: string | null): boolean {
  return Boolean(url && /tiktokcdn|ttwstatic|ibyteimg/i.test(url));
}

/** Client-side: route TikTok CDN URLs through our image proxy. */
export function proxiedImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.includes("/api/img-proxy") || url.includes("/api/creator-avatar")) return url;
  if (isTikTokCdnUrl(url)) return `/api/img-proxy?url=${encodeURIComponent(url)}`;
  return url;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

/** Upload avatar bytes to Supabase Storage and return the public URL. */
export async function storeAvatarBuffer(
  admin: SupabaseClient,
  buf: Buffer,
  contentType: string,
  username: string
): Promise<string | null> {
  if (!buf.length) return null;
  const safeUser = username.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const ext = extensionForContentType(contentType);
  const objectPath = `${safeUser}.${ext}`;

  for (const bucket of AVATAR_BUCKETS) {
    try {
      const { error } = await admin.storage.from(bucket).upload(objectPath, buf, {
        contentType,
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) continue;
      const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
      if (data?.publicUrl) return data.publicUrl;
    } catch {
      /* try next bucket */
    }
  }
  return null;
}

export async function storeTikTokAvatar(
  admin: SupabaseClient,
  remoteUrl: string,
  username: string
): Promise<string | null> {
  if (!remoteUrl || isUiAvatarsUrl(remoteUrl)) return null;
  const img = await fetchRemoteImage(remoteUrl);
  if (!img) return null;
  try {
    const buf = Buffer.from(await new Response(img.body).arrayBuffer());
    return storeAvatarBuffer(admin, buf, img.contentType, username);
  } catch {
    return null;
  }
}

function decodeTikTokJsonUrl(raw: string): string {
  return raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&");
}

/**
 * Scrape the public TikTok profile page (no API credits) and extract a fresh avatar URL.
 * Works when ScrapeCreators is out of credits (HTTP 402).
 */
export async function fetchFreshAvatarUrlFromWeb(username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /"avatarLarger"\s*:\s*"([^"]+)"/,
      /"avatarMedium"\s*:\s*"([^"]+)"/,
      /"avatarThumb"\s*:\s*"([^"]+)"/,
      /property="og:image"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:image"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (!match?.[1]) continue;
      const url = decodeTikTokJsonUrl(match[1]);
      if (url.startsWith("http") && !isUiAvatarsUrl(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

/** Scrape the live TikTok profile and return a fresh avatar CDN URL. */
export async function fetchFreshAvatarUrl(username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;

  // Prefer ScrapeCreators when credits are available.
  if (process.env.SCRAPECREATORS_API_KEY) {
    try {
      const raw = await fetchTikTokProfileRaw(handle);
      const fromApi = pickTikTokAvatarUrl(raw);
      if (fromApi) return fromApi;
    } catch {
      /* fall through to public web scrape */
    }
  }

  return fetchFreshAvatarUrlFromWeb(handle);
}

/**
 * Full pipeline: open TikTok profile → download avatar → store in Supabase →
 * update creators_index / creators. Returns the permanent public URL.
 */
export async function refreshAndPersistCreatorAvatar(
  admin: SupabaseClient,
  username: string,
  hintUrl?: string | null
): Promise<{ permanentUrl: string; bytes: Buffer; contentType: string } | null> {
  const handle = username.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return null;

  // Prefer a live profile avatar (fresh signed CDN) over a possibly-expired stored URL.
  const candidates: string[] = [];
  const fresh = await fetchFreshAvatarUrl(handle);
  if (fresh) candidates.push(fresh);

  const hint = hintUrl?.trim() || "";
  if (hint && !isUiAvatarsUrl(hint) && isAllowedImageHost(hint) && !candidates.includes(hint)) {
    candidates.push(hint);
  }

  for (const remoteUrl of candidates) {
    const img = await fetchRemoteImage(remoteUrl);
    if (!img) continue;
    try {
      const buf = Buffer.from(await new Response(img.body).arrayBuffer());
      if (!buf.length) continue;

      const permanent = await storeAvatarBuffer(admin, buf, img.contentType, handle);
      if (!permanent) {
        // Storage failed — still return bytes so the UI can show the photo once.
        return { permanentUrl: remoteUrl, bytes: buf, contentType: img.contentType };
      }

      const indexUpdate = await admin
        .from("creators_index")
        .update({ avatar_url: permanent, avatar_refresh_failed_at: null })
        .eq("username", handle);
      // Column may not exist until migration is applied — still save avatar_url.
      if (indexUpdate.error) {
        await admin.from("creators_index").update({ avatar_url: permanent }).eq("username", handle);
      }
      await admin.from("creators").update({ avatar_url: permanent }).ilike("handle", handle);

      return { permanentUrl: permanent, bytes: buf, contentType: img.contentType };
    } catch {
      /* try next candidate */
    }
  }

  return null;
}

/** Resolve a fetchable avatar URL for a creator (stored → fresh TikTok profile). */
export async function resolveCreatorAvatarRemoteUrl(
  username: string,
  storedUrl?: string | null
): Promise<string | null> {
  const stored = storedUrl?.trim() || "";
  if (stored && !isUiAvatarsUrl(stored) && isAllowedImageHost(stored)) {
    return stored;
  }

  const fresh = await fetchFreshAvatarUrl(username);
  if (fresh) return fresh;

  return null;
}
