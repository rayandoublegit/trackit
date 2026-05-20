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
  const pathsToTry = new Set<string>();

  if (storedUrl) {
    const extracted = extractStoragePath(storedUrl, userId);
    if (extracted) pathsToTry.add(extracted);
  }

  const { data: files } = await client.storage.from("avatars").list(userId, { limit: 20 });
  for (const file of files ?? []) {
    if (file.name.startsWith("avatar")) {
      pathsToTry.add(`${userId}/${file.name}`);
    }
  }

  for (const name of CANDIDATE_FILES) {
    pathsToTry.add(`${userId}/${name}`);
  }

  for (const path of pathsToTry) {
    const { data, error } = await client.storage.from("avatars").createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  }

  const firstPath = pathsToTry.values().next().value as string | undefined;
  if (firstPath) {
    const { data: pub } = client.storage.from("avatars").getPublicUrl(firstPath);
    return pub.publicUrl;
  }

  return null;
}
