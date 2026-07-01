import type { Lang } from "@/lib/useLang";

export function formatCreatorDeactivatedMessage(brandName: string, lang: Lang): string {
  const name = brandName.trim() || (lang === "fr" ? "La marque" : "The brand");
  if (lang === "fr") {
    return `${name} a désactivé votre dashboard créateur. Veuillez la contacter pour obtenir plus d'informations.`;
  }
  return `${name} has deactivated your creator dashboard. Please contact them for more information.`;
}
