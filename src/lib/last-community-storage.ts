import { workspaceStorageKey } from "@/lib/workspaces";

function key(userId?: string) {
  return workspaceStorageKey(`trackit.last-community.${userId || "anon"}`);
}

export function rememberLastCommunityId(userId: string | undefined, communityId: string) {
  if (typeof window === "undefined" || !communityId) return;
  try {
    localStorage.setItem(key(userId), communityId);
  } catch {
    /* ignore */
  }
}

export function getLastCommunityId(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}
