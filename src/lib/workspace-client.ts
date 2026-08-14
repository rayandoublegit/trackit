// Client-side fetch helpers for the Creator Workspace (saved creators, folders,
// pipeline). Used by the detail drawer and the "Mes créateurs" view.
import type { FeedCreator } from "@/lib/discovery-feed";
import { cachedJsonFetch, invalidateDashboardCache } from "@/lib/dashboard-fetch-cache";

export type SavedRow = {
  creator_username: string;
  display_name: string;
  avatar_url: string;
  followers: number;
  engagement_rate: number;
  primary_niche: string;
  country_code: string | null;
  value_score: number;
  pipeline_status: string;
  notes: string;
  snapshot: Record<string, unknown> | null;
  platform?: string;
  saved_at?: string;
  updated_at?: string;
};

export type FolderRow = { id: string; name: string; color: string; position: number; created_at?: string };
export type FolderItem = { folder_id: string; creator_username: string; added_at?: string };

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listSaved(): Promise<SavedRow[]> {
  try {
    const data = await cachedJsonFetch<{ rows?: SavedRow[] }>(
      "/api/saved",
      { credentials: "include" },
      { preferCache: true, ttlMs: 30_000 },
    );
    return data.rows ?? [];
  } catch {
    return [];
  }
}

export async function saveCreator(
  creator: FeedCreator,
  status?: string
): Promise<{ ok?: boolean; error?: string; status?: number }> {
  const r = await fetch("/api/saved", json({ creator, status }));
  invalidateDashboardCache("/api/saved");
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { error: d.error || "error", status: r.status };
}

export async function setStage(username: string, status: string): Promise<void> {
  await fetch("/api/saved", { ...json({ username, status }), method: "PATCH" });
  invalidateDashboardCache("/api/saved");
}

export async function setNotes(username: string, notes: string): Promise<void> {
  await fetch("/api/saved", { ...json({ username, notes }), method: "PATCH" });
  invalidateDashboardCache("/api/saved");
}

export async function setCrm(username: string, crm: Record<string, unknown>): Promise<void> {
  await fetch("/api/saved", { ...json({ username, crm }), method: "PATCH" });
  invalidateDashboardCache("/api/saved");
}

export async function setCreatorAvatar(
  username: string,
  avatarUrl: string
): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch("/api/saved", {
    ...json({ username, avatarUrl }),
    method: "PATCH",
  });
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { error: d.error || "error" };
}

export async function unsave(username: string): Promise<{ ok?: boolean; error?: string; status?: number }> {
  const r = await fetch(`/api/saved?username=${encodeURIComponent(username)}`, { method: "DELETE" });
  invalidateDashboardCache("/api/saved");
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { error: d.error || "error", status: r.status };
}

export async function listFolders(): Promise<{ folders: FolderRow[]; items: FolderItem[] }> {
  try {
    const d = await cachedJsonFetch<{ folders?: FolderRow[]; items?: FolderItem[] }>(
      "/api/folders",
      { credentials: "include" },
      { preferCache: true, ttlMs: 30_000 },
    );
    return { folders: d.folders ?? [], items: d.items ?? [] };
  } catch {
    return { folders: [], items: [] };
  }
}

export async function createFolder(name: string, color?: string): Promise<FolderRow | null> {
  const r = await fetch("/api/folders", json({ name, color }));
  invalidateDashboardCache("/api/folders");
  return r.ok ? (await r.json()).folder : null;
}

export async function deleteFolder(id: string): Promise<void> {
  await fetch(`/api/folders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  invalidateDashboardCache("/api/folders");
}

export async function addToFolder(folderId: string, creatorUsername: string): Promise<void> {
  await fetch("/api/folders/items", json({ folderId, creatorUsername }));
  invalidateDashboardCache("/api/folders");
}

export async function removeFromFolder(folderId: string, username: string): Promise<void> {
  await fetch(`/api/folders/items?folderId=${encodeURIComponent(folderId)}&username=${encodeURIComponent(username)}`, { method: "DELETE" });
  invalidateDashboardCache("/api/folders");
}
