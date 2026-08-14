import { workspaceStorageKey } from "@/lib/workspaces";

function key(userId?: string) {
  return workspaceStorageKey(`trackit.last-campaign.${userId || "anon"}`);
}

export function rememberLastCampaignId(userId: string | undefined, campaignId: string) {
  if (typeof window === "undefined" || !campaignId) return;
  try {
    localStorage.setItem(key(userId), campaignId);
  } catch {
    /* ignore */
  }
}

export function getLastCampaignId(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}
