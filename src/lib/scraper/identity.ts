// Who a creator is, independent of any scraping provider.
//
// Identity = (platform, lower(handle)). In the database the creator row is
// keyed by creators_index.username (unique on its own), so each platform gets
// a storage key: TikTok keeps the bare handle, Instagram is "ig_" + handle,
// YouTube "yt_" + handle. Snapshots, videos and queue jobs use the same
// (platform, key) pair. Rows added before the prefix existed ("instagram",
// "luna") are still read correctly: handleFromKey strips the prefix only when
// present. Nothing here, nor in ingest, ever keys on a provider's own user id.

import type { ScrapePlatform } from "./types";

const PREFIX: Record<ScrapePlatform, string> = { tiktok: "", instagram: "ig_", youtube: "yt_" };
const LABEL: Record<ScrapePlatform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

/** "TikTok", " tiktok ", null → "tiktok". Unknown values → null. */
export function normalizePlatform(value: unknown): ScrapePlatform | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v || v === "tiktok" || v === "tik tok") return "tiktok";
  if (v === "instagram" || v === "ig") return "instagram";
  if (v === "youtube" || v === "yt") return "youtube";
  return null;
}

/** Display label for a stored platform ("tiktok" → "TikTok"). */
export function platformLabel(value: unknown): string {
  return LABEL[normalizePlatform(value) ?? "tiktok"];
}

/** "@Luna.Beauty " → "luna.beauty". */
export function normalizeHandle(raw: string): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/** Storage key of a creator (creators_index.username and every child row). */
export function creatorKey(platform: ScrapePlatform, handle: string): string {
  // Always prefixed (an Instagram handle may itself start with "ig_").
  return `${PREFIX[platform]}${normalizeHandle(handle)}`;
}

/** The public handle behind a storage key ("ig_luna" on Instagram → "luna"). */
export function handleFromKey(platform: ScrapePlatform, key: string): string {
  const k = normalizeHandle(key);
  const prefix = PREFIX[platform];
  return prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
}

/** Every storage key a creator may already be stored under (new and pre-prefix rows). */
export function knownKeys(platform: ScrapePlatform, handle: string): string[] {
  const h = normalizeHandle(handle);
  return Array.from(new Set([creatorKey(platform, h), h]));
}
