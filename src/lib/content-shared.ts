export type ContentPostStatsFields = {
  post_url?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  posted_at?: string | null;
  stats_updated_at?: string | null;
};

export type ContentListItem = {
  id: string;
  title: string;
  notes: string | null;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  creator_row_id: string;
  creator_user_id: string;
  created_at: string;
  hook_id?: string | null;
  hookTitle?: string | null;
  creatorName?: string | null;
  creatorHandle?: string | null;
  campaignNames?: string[];
} & ContentPostStatsFields;

export const CONTENT_STATS_SELECT =
  "post_url, views, likes, comments, shares, posted_at, stats_updated_at";

/** Base columns for brand Contenu lists (includes optional hook link). */
export const CONTENT_LIST_SELECT =
  `id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at, hook_id, ${CONTENT_STATS_SELECT}`;

export function formatCompactStat(n: number | null | undefined, lang: "en" | "fr" = "fr"): string {
  if (n == null || !Number.isFinite(n)) return "0";
  const fmt = (value: number, suffix: string) => {
    const raw = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
    const num = lang === "fr" ? raw.replace(".", ",") : raw;
    return `${num}${suffix}`;
  };
  if (n >= 1_000_000) return fmt(n / 1_000_000, "M");
  if (n >= 1_000) return fmt(n / 1_000, "k");
  return String(Math.round(n));
}

export function calcEngagementRate(
  views: number | null | undefined,
  likes: number | null | undefined,
  comments: number | null | undefined,
  shares: number | null | undefined,
): number | null {
  if (!views || views <= 0) return null;
  const engagement = (likes ?? 0) + (comments ?? 0) + (shares ?? 0);
  return (engagement / views) * 100;
}

export function isImageContentFile(item: Pick<ContentListItem, "file_url" | "file_type" | "file_name">): boolean {
  if (item.file_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(item.file_url || item.file_name);
}

export function isVideoContentFile(item: Pick<ContentListItem, "file_url" | "file_type" | "file_name">): boolean {
  if (item.file_type?.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(item.file_url || item.file_name);
}

export function formatContentBytes(size: number | null | undefined): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export async function deleteBrandContent(brandId: string, contentId: string): Promise<boolean> {
  const res = await fetch(
    `/api/content?id=${encodeURIComponent(contentId)}&brandId=${encodeURIComponent(brandId)}`,
    { method: "DELETE" },
  );
  return res.ok;
}

export function safeContentFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}
