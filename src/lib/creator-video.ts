// Helpers to play TikTok videos in-app via the official embed iframe.
// We never link out to TikTok; we render https://www.tiktok.com/embed/v2/{id}.

/** Extract the numeric TikTok video id from a share URL or a raw id. */
export function extractVideoId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (/^\d{6,}$/.test(s)) return s; // already a bare id
  const m = s.match(/\/video\/(\d+)/) || s.match(/\/v\/(\d+)/);
  return m ? m[1] : null;
}

type VideoRef = { id?: string | null; shareUrl?: string | null };

/** Build the in-app embed URL from an id, a share URL, or a {id, shareUrl}. */
export function videoEmbedUrl(ref?: string | VideoRef | null): string | null {
  if (!ref) return null;
  const id =
    typeof ref === "string"
      ? extractVideoId(ref)
      : extractVideoId(ref.id) ?? extractVideoId(ref.shareUrl);
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
}

/** Embed URL with autoplay for inline playback after user click. */
export function videoEmbedPlayUrl(ref?: string | VideoRef | null): string | null {
  if (!ref) return null;
  if (typeof ref === "string" && ref.includes("/embed/v2/")) {
    try {
      const url = new URL(ref);
      url.searchParams.set("autoplay", "1");
      return url.toString();
    } catch {
      return ref;
    }
  }
  const embed = videoEmbedUrl(ref);
  if (!embed) return null;
  const url = new URL(embed);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}
