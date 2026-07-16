import type { SupabaseClient } from "@supabase/supabase-js";

const CANDIDATE_FILES = ["avatar.jpg", "avatar.png", "avatar.webp", "avatar.jpeg", "avatar"];

function extractStoragePath(storedUrl: string, userId: string): string | null {
  const marker = "/avatars/";
  const idx = storedUrl.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(storedUrl.slice(idx + marker.length).split("?")[0]);
  }
  if (storedUrl.startsWith(`${userId}/`)) {
    return storedUrl.split("?")[0];
  }
  return null;
}

/** Stable public URL suitable for persisting to profiles.avatar_url (never a signed URL). */
export function toPersistableAvatarUrl(
  client: SupabaseClient,
  userId: string,
  url: string | null | undefined
): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const path = extractStoragePath(trimmed, userId);
  if (!path) {
    // Absolute non-storage URL — keep without query noise when possible
    try {
      const u = new URL(trimmed);
      if (u.searchParams.has("token") || u.pathname.includes("/storage/v1/object/sign/")) {
        return null;
      }
      u.search = "";
      return u.toString();
    } catch {
      return trimmed.split("?")[0] || trimmed;
    }
  }
  const { data } = client.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
}

export async function resolveAvatarUrl(
  client: SupabaseClient,
  userId: string,
  storedUrl: string | null
): Promise<string | null> {
  if (!storedUrl) return null;
  const extracted = extractStoragePath(storedUrl, userId);
  if (!extracted) return storedUrl;
  try {
    const { data, error } = await client.storage.from("avatars").createSignedUrl(extracted, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {}
  // Fall back to public URL (bucket is public) rather than an expired signed URL.
  const { data } = client.storage.from("avatars").getPublicUrl(extracted);
  return data.publicUrl || storedUrl;
}
