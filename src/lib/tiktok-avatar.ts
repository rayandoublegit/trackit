/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTikTokProfileRaw } from "@/lib/scrapecreators";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";

const AVATAR_BUCKET = "avatars";

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

/** Extract the best available avatar URL from TikTok profile/search payloads. */
export function pickTikTokAvatarUrl(profileRaw?: any, searchUser?: SearchUser | null): string | null {
  const user = profileRaw?.user ?? {};
  return (
    urlFromField(user.avatar_medium) ||
    urlFromField(user.avatar_larger) ||
    urlFromField(user.avatarMedium) ||
    urlFromField(user.avatarLarger) ||
    urlFromField(user.avatar_thumb) ||
    urlFromField(user.avatarThumb) ||
    searchUser?.avatar_medium?.url_list?.[0] ||
    searchUser?.avatar_168x168?.url_list?.[0] ||
    null
  );
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
    if (buf.length === 0) return null;
    const contentType = img.contentType;
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const objectPath = `tiktok_${username}.${ext}`;
    const { error } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, buf, { contentType, upsert: true });
    if (error) return null;
    const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

export async function fetchFreshAvatarUrl(username: string): Promise<string | null> {
  if (!process.env.SCRAPECREATORS_API_KEY) return null;
  try {
    const raw = await fetchTikTokProfileRaw(username);
    return pickTikTokAvatarUrl(raw);
  } catch {
    return null;
  }
}

/** Resolve a fetchable avatar URL for a creator (DB value → fresh TikTok profile). */
export async function resolveCreatorAvatarRemoteUrl(
  username: string,
  storedUrl?: string | null
): Promise<string | null> {
  const stored = storedUrl?.trim() || "";
  const storedIsStable =
    stored && !isUiAvatarsUrl(stored) && isAllowedImageHost(stored) && !isTikTokCdnUrl(stored);
  if (storedIsStable) return stored;

  const fresh = await fetchFreshAvatarUrl(username);
  if (fresh) return fresh;

  if (stored && !isUiAvatarsUrl(stored) && isAllowedImageHost(stored)) return stored;
  return null;
}
