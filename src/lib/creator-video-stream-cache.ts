"use client";

const streamCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export function creatorVideoStreamKey(username: string, videoId: string): string {
  return `${username.trim()}:${videoId.trim()}`;
}

export function getCachedCreatorVideoStream(username: string, videoId: string): string | null {
  return streamCache.get(creatorVideoStreamKey(username, videoId)) ?? null;
}

export function cacheCreatorVideoStreams(username: string, streams: Record<string, string>): void {
  const user = username.trim();
  for (const [videoId, url] of Object.entries(streams)) {
    if (!videoId || !url) continue;
    streamCache.set(creatorVideoStreamKey(user, videoId), url);
  }
}

export async function resolveCreatorVideoStream(
  username: string,
  videoId: string
): Promise<string | null> {
  const key = creatorVideoStreamKey(username, videoId);
  const cached = streamCache.get(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetch(
      `/api/creator/${encodeURIComponent(username.trim())}/video/${encodeURIComponent(videoId.trim())}`,
      { credentials: "include", cache: "force-cache" }
    )
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        return data.url?.trim() || null;
      })
      .catch(() => null);
    inflight.set(key, pending);
  }

  const url = await pending;
  inflight.delete(key);
  if (url) streamCache.set(key, url);
  return url;
}

export async function prefetchCreatorVideoStreams(
  username: string,
  videoIds: (string | null | undefined)[]
): Promise<void> {
  const user = username.trim();
  const missing = [...new Set(
    videoIds
      .map((id) => id?.trim() || "")
      .filter((id) => id && !streamCache.has(creatorVideoStreamKey(user, id)))
  )];
  if (!missing.length) return;

  const batchKey = `${user}::${missing.sort().join(",")}`;
  let batch = inflight.get(batchKey);
  if (!batch) {
    batch = fetch(`/api/creator/${encodeURIComponent(user)}/videos`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoIds: missing }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { streams?: Record<string, string> };
        if (data.streams) cacheCreatorVideoStreams(user, data.streams);
        return null;
      })
      .catch(() => null);
    inflight.set(batchKey, batch);
  }
  await batch;
  inflight.delete(batchKey);
}

/** Warm the browser cache for the first bytes of a proxied stream. */
export function warmCreatorVideoStream(url: string): void {
  if (!url || typeof document === "undefined") return;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  video.load();
}
