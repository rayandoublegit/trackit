/** Pick a direct MP4/HLS URL from a TikTok aweme `video` object. */
export function extractTikTokPlayUrl(video: unknown): string {
  if (!video || typeof video !== "object") return "";
  const v = video as Record<string, unknown>;

  const fromList = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const list = (node as { url_list?: unknown }).url_list;
    if (!Array.isArray(list)) return "";
    for (const item of list) {
      const url = String(item ?? "").trim();
      if (url.startsWith("https://")) return url;
    }
    return "";
  };

  const playAddr = fromList(v.play_addr);
  if (playAddr) return playAddr;

  const downloadAddr = fromList(v.download_addr);
  if (downloadAddr) return downloadAddr;

  const bitRate = v.bit_rate;
  if (Array.isArray(bitRate)) {
    const sorted = [...bitRate].sort((a, b) => {
      const ba = Number((b as { bit_rate?: number })?.bit_rate ?? 0);
      const aa = Number((a as { bit_rate?: number })?.bit_rate ?? 0);
      return ba - aa;
    });
    for (const row of sorted) {
      const url = fromList((row as { play_addr?: unknown })?.play_addr);
      if (url) return url;
    }
  }

  return "";
}
