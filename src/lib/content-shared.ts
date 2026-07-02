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
  creatorName?: string | null;
  creatorHandle?: string | null;
  campaignNames?: string[];
};

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

export function safeContentFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}
