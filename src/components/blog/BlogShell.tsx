import Link from "next/link";
import type { ReactNode } from "react";
import { SocialFooterLinks } from "@/components/SocialFooterLinks";
import { legalLinks } from "@/lib/legal-links";
import { localizeHref, type AppLang } from "@/lib/locale-preferences";

type BlogShellProps = {
  children: ReactNode;
  narrow?: boolean;
  /** Language of the page; internal links stay in it. Defaults to English. */
  lang?: AppLang;
  /** The same page in the other language, for the EN/FR switch. */
  alternateHref?: string;
};

const COPY = {
  en: {
    home: "/",
    navLabel: "Blog navigation",
    about: "About",
    blog: "Blog",
    solutions: "Solutions",
    pricing: "Pricing",
    start: "Get started",
    tagline: "Creator affiliate platform",
    legalLabel: "Legal",
    langLabel: "Language",
  },
  fr: {
    home: "/fr",
    navLabel: "Navigation du blog",
    about: "À propos",
    blog: "Blog",
    solutions: "Solutions",
    pricing: "Tarifs",
    start: "Commencer",
    tagline: "Plateforme d'affiliation créateurs",
    legalLabel: "Informations légales",
    langLabel: "Langue",
  },
} as const;

const footerRow = { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 16px" } as const;

export function BlogShell({ children, narrow, lang = "en", alternateHref }: BlogShellProps) {
  const t = COPY[lang];
  const href = (path: string) => localizeHref(path, lang);
  const enHref = lang === "en" ? undefined : (alternateHref ?? "/");
  const frHref = lang === "fr" ? undefined : (alternateHref ?? "/fr");

  return (
    <div className="blog-shell">
      <header className="blog-nav">
        <div className="blog-nav-inner">
          <Link href={t.home} className="blog-brand">
            <img src="/favicon.png" alt="" />
            <span className="blog-brand-name">Trackit</span>
          </Link>
          <nav className="blog-nav-links" aria-label={t.navLabel}>
            <Link href={href("/about")}>{t.about}</Link>
            <Link href={href("/blog")}>{t.blog}</Link>
            <Link href={href("/solutions")}>{t.solutions}</Link>
            <Link href={href("/pricing")}>{t.pricing}</Link>
            <Link href={href("/auth")}>{t.start}</Link>
          </nav>
        </div>
      </header>
      <main className={narrow ? "blog-main blog-main--article" : "blog-main"}>{children}</main>
      <footer className="blog-footer">
        <div className="blog-footer-socials">
          <SocialFooterLinks />
        </div>
        <nav aria-label={t.legalLabel} style={{ ...footerRow, marginBottom: 10 }}>
          {legalLinks(lang).map((link) => (
            <Link key={link.key} href={link.href} style={{ color: "#999" }}>
              {link.label}
            </Link>
          ))}
        </nav>
        © Trackit Inc. — {t.tagline} ·{" "}
        <Link href="/llms.txt" style={{ color: "#999" }}>
          llms.txt
        </Link>
        <nav aria-label={t.langLabel} style={{ ...footerRow, marginTop: 10 }}>
          {/* Plain links: a full load so the document language follows the address. */}
          {enHref ? (
            <a href={enHref} hrefLang="en" lang="en" style={{ color: "#999" }}>
              English
            </a>
          ) : (
            <span aria-current="true" style={{ color: "#444", fontWeight: 600 }}>
              English
            </span>
          )}
          {frHref ? (
            <a href={frHref} hrefLang="fr" lang="fr" style={{ color: "#999" }}>
              Français
            </a>
          ) : (
            <span aria-current="true" style={{ color: "#444", fontWeight: 600 }}>
              Français
            </span>
          )}
        </nav>
      </footer>
    </div>
  );
}
