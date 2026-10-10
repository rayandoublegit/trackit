import type { MinoCatalogFilters } from "@/lib/mino-filters";

// Browser side of Mino's attachments: reads a photo (resized to keep the
// request small), keeps a tiny preview for the chat history, and hands
// attachments and catalog filters from one view to another in memory.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Request bodies above ~4.5 MB are refused by the host: keep the encoded image under this. */
const MAX_BASE64_CHARS = 4_200_000;
const MAX_SIDE = 1600;

export type MinoImageAttachment = {
  kind: "image";
  name: string;
  mediaType: string;
  /** Base64, no data: prefix. */
  data: string;
  /** For the chip in the prompt box (empty when the browser cannot draw the format, e.g. HEIC). */
  previewUrl: string;
  /** ~96px JPEG data URL stored with the chat. */
  thumb: string;
};

export type ImageError = "type" | "too_large" | "heic_too_large" | "read";

const ACCEPTED = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif";

export function isHeic(file: { type: string; name: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function imageTypeOk(file: { type: string; name: string }): boolean {
  return ACCEPTED.test(file.type) || isHeic(file);
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function drawScaled(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become JPEG on white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Reads a photo for Mino: checks type and size, resizes to 1600px JPEG when the browser can draw it. */
export async function prepareImage(file: File): Promise<MinoImageAttachment | { error: ImageError }> {
  if (!imageTypeOk(file)) return { error: "type" };
  if (file.size > IMAGE_MAX_BYTES) return { error: "too_large" };
  const name = file.name || "photo";
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null; // HEIC outside Safari: sent as is, converted on the server
  }
  try {
    if (bitmap) {
      const full = await drawScaled(bitmap, MAX_SIDE, 0.85);
      const thumb = await drawScaled(bitmap, 96, 0.7);
      bitmap.close();
      const data = full.replace(/^data:[^;]*;base64,/, "");
      if (data.length > MAX_BASE64_CHARS) return { error: "too_large" };
      return { kind: "image", name, mediaType: "image/jpeg", data, previewUrl: full, thumb };
    }
    if (!isHeic(file)) return { error: "read" };
    const data = await fileToBase64(file);
    if (data.length > MAX_BASE64_CHARS) return { error: "heic_too_large" };
    return { kind: "image", name, mediaType: "image/heic", data, previewUrl: "", thumb: "" };
  } catch {
    return { error: "read" };
  }
}

export function imageErrorText(error: ImageError, fr: boolean): string {
  switch (error) {
    case "type":
      return fr ? "Format non pris en charge. Utilisez une photo JPG, PNG, WebP ou HEIC." : "Unsupported format. Use a JPG, PNG, WebP or HEIC photo.";
    case "too_large":
      return fr ? "Photo trop lourde : 5 Mo maximum." : "Photo too large: 5 MB maximum.";
    case "heic_too_large":
      return fr
        ? "Cette photo HEIC est trop lourde pour être envoyée telle quelle. Exportez-la en JPG (ou réduisez-la) puis réessayez."
        : "This HEIC photo is too large to send as is. Export it as JPG (or make it smaller) and try again.";
    default:
      return fr ? "Impossible de lire cette photo." : "Couldn’t read this photo.";
  }
}

// ── Hand-offs between views (same tab, in memory first, session storage as backup) ──

type PendingAttachments = { image?: MinoImageAttachment | null; site?: string | null };
let pendingAttachments: PendingAttachments | null = null;

/** Attachments typed on Home, picked up by the chat view with the pending prompt. */
export function setPendingMinoAttachments(value: PendingAttachments | null) {
  pendingAttachments = value && (value.image || value.site) ? value : null;
}

export function takePendingMinoAttachments(): PendingAttachments | null {
  const value = pendingAttachments;
  pendingAttachments = null;
  return value;
}

export const MINO_CATALOG_FILTERS_EVENT = "trackit:mino-catalog-filters";
const CATALOG_KEY = "trackit.mino.catalogFilters";
let pendingFilters: MinoCatalogFilters | null = null;

/** "Open in Creators with these filters": Creators > Search applies them when it shows. */
export function setPendingCatalogFilters(filters: MinoCatalogFilters) {
  if (typeof window === "undefined") return;
  pendingFilters = filters;
  try {
    sessionStorage.setItem(CATALOG_KEY, JSON.stringify(filters));
  } catch {
    // storage blocked: the in-memory copy is enough within this tab
  }
  window.dispatchEvent(new Event(MINO_CATALOG_FILTERS_EVENT));
}

export function takePendingCatalogFilters(): MinoCatalogFilters | null {
  if (typeof window === "undefined") return null;
  let value = pendingFilters;
  pendingFilters = null;
  try {
    const stored = sessionStorage.getItem(CATALOG_KEY);
    sessionStorage.removeItem(CATALOG_KEY);
    if (!value && stored) value = JSON.parse(stored) as MinoCatalogFilters;
  } catch {
    // keep the in-memory value
  }
  return value && (value.platform === "tiktok" || value.platform === "instagram") ? value : null;
}
