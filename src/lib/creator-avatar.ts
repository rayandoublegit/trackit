import { isUiAvatarsUrl } from "@/lib/tiktok-avatar";

export function resolveCreatorAvatarUrl(avatar?: string | null): string {
  const v = avatar?.trim() || "";
  if (!v || isUiAvatarsUrl(v)) return "";
  return v;
}

export function normalizeCreatorHandle(handle?: string | null): string {
  return (handle ?? "").replace(/^@/, "").trim().toLowerCase();
}

export function pickBestCreatorAvatar(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const url = resolveCreatorAvatarUrl(candidate);
    if (url) return url;
  }
  return "";
}

export function avatarFromDiscoverySavedRow(row: {
  avatar_url?: string | null;
  snapshot?: unknown;
}): string {
  const snapshot =
    row.snapshot && typeof row.snapshot === "object"
      ? (row.snapshot as Record<string, unknown>)
      : null;
  const fromSnapshot = snapshot?.avatarUrl ?? snapshot?.avatar_url;
  return pickBestCreatorAvatar(
    row.avatar_url,
    typeof fromSnapshot === "string" ? fromSnapshot : null
  );
}

export function buildAvatarByHandleFromSavedRows(
  rows: Array<{ creator_username?: string | null; avatar_url?: string | null; snapshot?: unknown }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const handle = normalizeCreatorHandle(row.creator_username);
    if (!handle) continue;
    const url = avatarFromDiscoverySavedRow(row);
    if (url) map[handle] = url;
  }
  return map;
}

export function mergeCreatorAvatarUrl(
  handle: string | null | undefined,
  avatarUrl?: string | null,
  avatarByHandle?: Record<string, string>
): string {
  const saved = handle ? avatarByHandle?.[normalizeCreatorHandle(handle)] : undefined;
  return pickBestCreatorAvatar(avatarUrl, saved);
}

export function avatarUrlForCreatorHandle(
  handle: string,
  avatarByHandle: Record<string, string>
): string {
  const key = normalizeCreatorHandle(handle);
  return avatarByHandle[key] || "";
}

export function buildCreatorAvatarMap(
  creators: Array<{ handle?: string | null; username?: string | null; avatar_url?: string | null }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const creator of creators) {
    const url = resolveCreatorAvatarUrl(creator.avatar_url);
    if (!url) continue;
    const handle = normalizeCreatorHandle(creator.handle ?? creator.username);
    if (handle) map[handle] = url;
  }
  return map;
}
