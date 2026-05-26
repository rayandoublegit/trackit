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
  return storedUrl;
}
