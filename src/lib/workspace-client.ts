// Client-side fetch helpers for the Creator Workspace (saved creators, folders,
// pipeline). Used by the detail drawer and the "Mes créateurs" view.
import type { FeedCreator } from "@/lib/discovery-feed";

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
  const r = await fetch("/api/saved", { cache: "no-store" });
  if (!r.ok) return [];
  return (await r.json()).rows ?? [];
}

export async function saveCreator(
  creator: FeedCreator,
  status?: string
): Promise<{ ok?: boolean; error?: string; status?: number }> {
  const r = await fetch("/api/saved", json({ creator, status }));
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { error: d.error || "error", status: r.status };
}

export async function setStage(username: string, status: string): Promise<void> {
  await fetch("/api/saved", { ...json({ username, status }), method: "PATCH" });
}

export async function setNotes(username: string, notes: string): Promise<void> {
  await fetch("/api/saved", { ...json({ username, notes }), method: "PATCH" });
}

export async function setCrm(username: string, crm: Record<string, unknown>): Promise<void> {
  await fetch("/api/saved", { ...json({ username, crm }), method: "PATCH" });
}

export async function unsave(username: string): Promise<{ ok?: boolean; error?: string; status?: number }> {
  const r = await fetch(`/api/saved?username=${encodeURIComponent(username)}`, { method: "DELETE" });
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { error: d.error || "error", status: r.status };
}

export async function listFolders(): Promise<{ folders: FolderRow[]; items: FolderItem[] }> {
  const r = await fetch("/api/folders", { cache: "no-store" });
  if (!r.ok) return { folders: [], items: [] };
  const d = await r.json();
  return { folders: d.folders ?? [], items: d.items ?? [] };
}

export async function createFolder(name: string, color?: string): Promise<FolderRow | null> {
  const r = await fetch("/api/folders", json({ name, color }));
  return r.ok ? (await r.json()).folder : null;
}

export async function deleteFolder(id: string): Promise<void> {
  await fetch(`/api/folders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function addToFolder(folderId: string, creatorUsername: string): Promise<void> {
  await fetch("/api/folders/items", json({ folderId, creatorUsername }));
}

export async function removeFromFolder(folderId: string, username: string): Promise<void> {
  await fetch(`/api/folders/items?folderId=${encodeURIComponent(folderId)}&username=${encodeURIComponent(username)}`, { method: "DELETE" });
}
