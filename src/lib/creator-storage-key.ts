// A creator's storage key in creators_index: the handle for TikTok, "ig_" +
// handle for Instagram, "yt_" + handle for YouTube. The same public handle can
// exist on several platforms, so the creator page is opened by storage key.

const PREFIX: Record<string, string> = { instagram: "ig_", youtube: "yt_" };

function platformKey(raw: unknown): "tiktok" | "instagram" | "youtube" {
  const v = String(raw ?? "").toLowerCase();
  if (v.includes("insta")) return "instagram";
  if (v.includes("you")) return "youtube";
  return "tiktok";
}

/** "ig_handle" for an Instagram creator, the plain handle for TikTok. */
export function creatorStorageKey(username: string, platform: unknown): string {
  const handle = username.replace(/^@/, "").trim().toLowerCase();
  const prefix = PREFIX[platformKey(platform)] ?? "";
  if (!prefix || handle.startsWith(prefix)) return handle;
  return prefix + handle;
}

/**
 * Usernames to try, best first. A prefixed key is exact; a plain handle
 * prefers TikTok, then Instagram, then YouTube.
 */
export function storageKeyCandidates(raw: string): string[] {
  const key = raw.replace(/^@/, "").trim().toLowerCase();
  if (!key) return [];
  if (key.startsWith("ig_") || key.startsWith("yt_")) return [key];
  return [key, `ig_${key}`, `yt_${key}`];
}
