import type { AppLang } from "@/lib/locale-preferences";

// Legal pages linked from every footer, in the visitor's language.
export type LegalLink = { key: "legal" | "terms" | "privacy" | "cookies"; href: string; label: string };

export function legalLinks(lang: AppLang): LegalLink[] {
  if (lang === "fr") {
    return [
      { key: "legal", href: "/fr/mentions-legales", label: "Mentions légales" },
      { key: "terms", href: "/fr/terms", label: "CGU / CGV" },
      { key: "privacy", href: "/fr/privacy", label: "Politique de confidentialité" },
      { key: "cookies", href: "/fr/cookies", label: "Cookies" },
    ];
  }
  return [
    { key: "legal", href: "/legal-notice", label: "Legal notice" },
    { key: "terms", href: "/terms", label: "Terms of Service" },
    { key: "privacy", href: "/privacy", label: "Privacy Policy" },
    { key: "cookies", href: "/cookies", label: "Cookies" },
  ];
}
