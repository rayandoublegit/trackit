import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientVideoUrl } from "@/lib/client-video-url";
import { fetchTikTokVideosRaw, parseVideosRich } from "@/lib/scrapecreators";
import { extractVideoId } from "@/lib/creator-video";

function playUrlFromRow(row: { id?: string; playUrl?: string }): string | null {
  const proxied = clientVideoUrl(row.playUrl);
  return proxied || null;
}

function collectTopVideoRows(raw: unknown): { id: string; playUrl?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; playUrl?: string }[] = [];
  for (const row of raw) {
    const v = row as { id?: string; playUrl?: string };
    const id = String(v.id ?? "").trim();
    if (!id) continue;
    out.push(v.playUrl ? { id, playUrl: v.playUrl } : { id });
  }
  return out;
}

function collectThumbnailVideoIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const row of raw) {
    const t = row as { url?: string | null };
    const id = extractVideoId(t.url);
    if (id) ids.push(id);
  }
  return ids;
}

/** Resolve proxied stream URLs for many TikTok video ids (DB first, one live fetch max). */
export async function resolveCreatorVideoStreams(
  admin: SupabaseClient,
  username: string,
  videoIds: string[]
): Promise<Record<string, string>> {
  const wanted = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  if (!wanted.length) return {};

  const { data: row } = await admin
    .from("creators_index")
    .select("top_videos, video_thumbnails")
    .eq("username", username.trim())
    .maybeSingle();

  const out: Record<string, string> = {};
  const pending = new Set(wanted);

  for (const v of collectTopVideoRows(row?.top_videos)) {
    if (!pending.has(v.id)) continue;
    const url = playUrlFromRow(v);
    if (url) {
      out[v.id] = url;
      pending.delete(v.id);
    }
  }

  if (pending.size === 0) return out;

  if (!process.env.SCRAPECREATORS_API_KEY) return out;

  try {
    const rich = parseVideosRich(await fetchTikTokVideosRaw(username.trim()));
    for (const id of pending) {
      const match = rich.find((v) => v.id === id);
      const url = playUrlFromRow({ id, playUrl: match?.playUrl });
      if (url) out[id] = url;
    }
  } catch {
    /* best-effort */
  }

  return out;
}

export function getSupabaseAdminForVideos(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

export function allVideoIdsFromCreatorRow(row: {
  top_videos?: unknown;
  video_thumbnails?: unknown;
} | null): string[] {
  const ids = new Set<string>();
  for (const v of collectTopVideoRows(row?.top_videos)) ids.add(v.id);
  for (const id of collectThumbnailVideoIds(row?.video_thumbnails)) ids.add(id);
  return [...ids];
}
