// Helpers for TikTok video ids / share URLs.

/** Extract the numeric TikTok video id from a share URL or a raw id. */
export function extractVideoId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (/^\d{6,}$/.test(s)) return s; // already a bare id
  const m = s.match(/\/video\/(\d+)/) || s.match(/\/v\/(\d+)/);
  return m ? m[1] : null;
}

type VideoRef = { id?: string | null; shareUrl?: string | null; username?: string | null };

/** Public TikTok watch URL — opens the video on TikTok (no embed). */
export function tiktokVideoWatchUrl(ref?: string | VideoRef | null): string | null {
  if (!ref) return null;
  if (typeof ref === "string") {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    if (trimmed.includes("tiktok.com") && !trimmed.includes("/embed/")) return trimmed;
    const id = extractVideoId(trimmed);
    return id ? `https://www.tiktok.com/video/${id}` : null;
  }
  const share = ref.shareUrl?.trim() || "";
  if (share.includes("tiktok.com") && !share.includes("/embed/")) return share;
  const id = extractVideoId(ref.id) ?? extractVideoId(ref.shareUrl);
  if (!id) return null;
  const handle = ref.username?.trim().replace(/^@+/, "") || "";
  return handle
    ? `https://www.tiktok.com/@${handle}/video/${id}`
    : `https://www.tiktok.com/video/${id}`;
}

/** @deprecated Use tiktokVideoWatchUrl — embed playback removed. */
export function videoEmbedUrl(ref?: string | VideoRef | null): string | null {
  return tiktokVideoWatchUrl(ref);
}

/** @deprecated Use tiktokVideoWatchUrl — embed playback removed. */
export function videoEmbedPlayUrl(ref?: string | VideoRef | null): string | null {
  return tiktokVideoWatchUrl(ref);
}
