import type { AppLang } from "@/lib/locale-preferences";

/**
 * Message to show for a failed API call. API routes return English `error`
 * strings (sometimes with an `errorFr` twin): in French we show `errorFr` or
 * the French fallback, never the raw English text.
 */
export function apiErrorText(
  payload: unknown,
  lang: AppLang,
  fallback: { en: string; fr: string },
): string {
  const body = (payload && typeof payload === "object" ? payload : {}) as { error?: unknown; errorFr?: unknown };
  if (lang === "fr") {
    return typeof body.errorFr === "string" && body.errorFr.trim() ? body.errorFr : fallback.fr;
  }
  return typeof body.error === "string" && body.error.trim() ? body.error : fallback.en;
}
