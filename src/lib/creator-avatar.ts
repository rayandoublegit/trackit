export function resolveCreatorAvatarUrl(avatar?: string | null): string {
  return avatar?.trim() || "";
}

export function normalizeCreatorHandle(handle?: string | null): string {
  return (handle ?? "").replace(/^@/, "").trim().toLowerCase();
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
