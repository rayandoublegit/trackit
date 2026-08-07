/** Max upload size for creator / brand content (videos up to ~1–2+ min). */
export const CREATOR_CONTENT_MAX_FILE_BYTES = 1024 * 1024 * 1024; // 1 GB

export const CREATOR_CONTENT_MAX_FILE_LABEL = "1 GB";

export function isCreatorContentFileTooLarge(size: number): boolean {
  return Number(size) > CREATOR_CONTENT_MAX_FILE_BYTES;
}

export function creatorContentFileTooLargeMessage(lang: "en" | "fr", fileName?: string): string {
  const name = fileName?.trim() ? ` « ${fileName.trim()} »` : "";
  return lang === "fr"
    ? `Fichier trop volumineux${name}. Maximum ${CREATOR_CONTENT_MAX_FILE_LABEL} (vidéos d’1–2 min+ acceptées).`
    : `File too large${name}. Maximum ${CREATOR_CONTENT_MAX_FILE_LABEL} (1–2+ min videos supported).`;
}

/** Map Storage API errors (often project global 50MB cap) into a clear message. */
export function creatorContentStorageErrorMessage(lang: "en" | "fr", raw: string): string {
  const msg = String(raw || "").toLowerCase();
  if (
    msg.includes("maximum allowed size") ||
    msg.includes("payload too large") ||
    msg.includes("entity too large") ||
    msg.includes("413") ||
    msg.includes("file size") ||
    msg.includes("exceeded")
  ) {
    return lang === "fr"
      ? `Vidéo trop lourde pour le stockage actuel. Maximum ${CREATOR_CONTENT_MAX_FILE_LABEL} — compressez la vidéo ou demandez à lever la limite Storage Supabase (Settings → Storage → Global file size limit).`
      : `Video exceeds the current storage cap. Max ${CREATOR_CONTENT_MAX_FILE_LABEL} — compress the video or raise Supabase Storage → Global file size limit.`;
  }
  return raw;
}
