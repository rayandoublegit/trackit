import type { Lang } from "@/lib/useLang";

export function formatLastActiveFromDate(
  iso: string | null | undefined,
  lang: Lang
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs < 60_000) {
    return lang === "fr" ? "Actif maintenant" : "Active now";
  }
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) {
    return lang === "fr" ? `il y a ${mins} min` : `${mins} min ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return lang === "fr" ? `il y a ${hours} h` : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return lang === "fr" ? `il y a ${days} j` : `${days} days ago`;
  }
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
