import Link from "next/link";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import type { AppLang } from "@/lib/locale-preferences";
import { getSocialLinks } from "@/lib/social-links";
import { breadcrumbJsonLd, buildPageMetadata, organizationJsonLd, webPageJsonLd } from "@/lib/site-seo";

// The About page in both languages: /about renders lang="en", /fr/about lang="fr".

const COPY = {
  en: {
    path: "/about",
    home: "/",
    metaTitle: "About Trackit — Creator affiliate platform for Shopify brands",
    metaDescription:
      "Trackit is the creator marketing platform built by e-commerce founders. Discover creators, track Shopify sales, and pay commissions — all in one dashboard.",
    keywords: ["About Trackit", "Trackit company", "Trackit platform", "thentrack.it"],
    crumb: "About",
    ldTitle: "About Trackit",
    ldDescription: "Trackit helps Shopify brands run creator affiliate programs.",
    eyebrow: "About Trackit",
    title: "Built by e-commerce founders, for e-commerce founders",
    lead: "Trackit is the creator affiliate platform at thentrack.it — one workspace to discover TikTok creators, send outreach, attribute Shopify sales, and pay commissions without spreadsheets.",
    whatTitle: "What is Trackit?",
    what: "Trackit replaces the patchwork of TikTok research, DMs, Google Sheets, and manual commission math that most Shopify brands use to run creator programs. Everything lives in a single dashboard designed for lean teams — not enterprise agencies.",
    whoTitle: "Who uses Trackit?",
    who: [
      "Shopify and DTC brand founders scaling creator marketing",
      "Growth teams running affiliate and UGC campaigns",
      "Brands who want Shopify-native sales attribution per creator",
    ],
    includesTitle: "What Trackit includes",
    includes: [
      "Creator discovery across TikTok (and more)",
      "AI-assisted outreach with full contact history",
      "Campaign management and tracked affiliate links",
      "Shopify order sync and commission tracking",
      "Creator dashboards and content uploads",
    ],
    connectTitle: "Connect with Trackit",
    explore: "Explore our",
    blog: "blog",
    solutions: "solutions",
    or: ", or",
    pricing: "pricing",
    questions: ". Questions?",
    contact: "Contact us",
    follow: "Follow Trackit",
    cta: "Start your creator program on Trackit",
    ctaButton: "Get started free",
  },
  fr: {
    path: "/fr/about",
    home: "/fr",
    metaTitle: "À propos de Trackit — Plateforme d'affiliation créateurs pour les marques Shopify",
    metaDescription:
      "Trackit est la plateforme de marketing d'influence créée par des fondateurs e-commerce. Trouvez des créateurs, suivez vos ventes Shopify et payez les commissions depuis un seul tableau de bord.",
    keywords: ["À propos de Trackit", "société Trackit", "plateforme Trackit", "thentrack.it"],
    crumb: "À propos",
    ldTitle: "À propos de Trackit",
    ldDescription: "Trackit aide les marques Shopify à gérer leurs programmes d'affiliation créateurs.",
    eyebrow: "À propos de Trackit",
    title: "Créé par des fondateurs e-commerce, pour des fondateurs e-commerce",
    lead: "Trackit est la plateforme d'affiliation créateurs de thentrack.it : un seul espace pour trouver des créateurs TikTok, les contacter, attribuer les ventes Shopify et payer les commissions, sans tableur.",
    whatTitle: "Qu'est-ce que Trackit ?",
    what: "Trackit remplace l'assemblage de recherches TikTok, de messages privés, de Google Sheets et de calculs de commissions à la main que la plupart des marques Shopify utilisent pour gérer leurs créateurs. Tout se trouve dans un seul tableau de bord, pensé pour les petites équipes — pas pour les grandes agences.",
    whoTitle: "Qui utilise Trackit ?",
    who: [
      "Les fondateurs de marques Shopify et DTC qui développent leur marketing créateurs",
      "Les équipes growth qui mènent des campagnes d'affiliation et d'UGC",
      "Les marques qui veulent une attribution des ventes par créateur, directement reliée à Shopify",
    ],
    includesTitle: "Ce que comprend Trackit",
    includes: [
      "La découverte de créateurs sur TikTok (et au-delà)",
      "Une prospection assistée par IA, avec l'historique complet des échanges",
      "La gestion de campagnes et des liens d'affiliation suivis",
      "La synchronisation des commandes Shopify et le suivi des commissions",
      "Des tableaux de bord pour les créateurs et le dépôt de leurs contenus",
    ],
    connectTitle: "Rester en contact avec Trackit",
    explore: "Parcourez notre",
    blog: "blog",
    solutions: "nos solutions",
    or: " ou",
    pricing: "nos tarifs",
    questions: ". Une question ?",
    contact: "Contactez-nous",
    follow: "Suivre Trackit",
    cta: "Lancez votre programme créateurs sur Trackit",
    ctaButton: "Commencer gratuitement",
  },
} as const;

const linkStyle = { color: "#0047FF" };

export function aboutMetadata(lang: AppLang) {
  const t = COPY[lang];
  return buildPageMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    path: t.path,
    keywords: [...t.keywords],
    ...(lang === "fr" ? { lang } : {}),
  });
}

export function AboutView({ lang }: { lang: AppLang }) {
  const t = COPY[lang];
  const fr = lang === "fr";
  const socials = getSocialLinks();
  const href = (path: string) => (fr ? `/fr${path}` : path);

  const webPage = webPageJsonLd({ title: t.ldTitle, description: t.ldDescription, path: t.path });

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: t.home },
            { name: t.crumb, path: t.path },
          ]),
          fr ? { ...organizationJsonLd(), description: t.metaDescription } : organizationJsonLd(),
          fr ? { ...webPage, inLanguage: "fr-FR" } : webPage,
        ]}
      />
      <BlogShell narrow lang={lang} alternateHref={fr ? "/about" : "/fr/about"}>
        <p className="blog-eyebrow">{t.eyebrow}</p>
        <h1 className="blog-title">{t.title}</h1>
        <p className="blog-lead">{t.lead}</p>

        <div className="blog-prose">
          <h2>{t.whatTitle}</h2>
          <p>{t.what}</p>

          <h2>{t.whoTitle}</h2>
          <ul>
            {t.who.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{t.includesTitle}</h2>
          <ul>
            {t.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{t.connectTitle}</h2>
          <p>
            {t.explore}{" "}
            <Link href={href("/blog")} style={linkStyle}>
              {t.blog}
            </Link>
            ,{" "}
            <Link href={href("/solutions")} style={linkStyle}>
              {t.solutions}
            </Link>
            {t.or}{" "}
            <Link href={href("/pricing")} style={linkStyle}>
              {t.pricing}
            </Link>
            {t.questions}{" "}
            <Link href={href("/contact")} style={linkStyle}>
              {t.contact}
            </Link>
            .
          </p>
          {socials.length > 0 ? (
            <>
              <h3>{t.follow}</h3>
              <ul>
                {socials.map((social) => (
                  <li key={social.id}>
                    <a href={social.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="blog-cta-bar">
          <p>{t.cta}</p>
          <div className="blog-cta-actions">
            <Link href={href("/auth")} className="blog-btn blog-btn--primary">
              {t.ctaButton}
            </Link>
          </div>
        </div>
      </BlogShell>
    </>
  );
}
