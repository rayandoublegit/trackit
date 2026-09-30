import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { blogPostPath, getBlogPost } from "@/lib/blog";
import type { AppLang } from "@/lib/locale-preferences";
import { getSeoPage, getSeoPages, seoPageLanguages, solutionsBasePath } from "@/lib/seo-pages";
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/site-seo";

// The solutions index and pages in both languages: /solutions and
// /solutions/[slug] render lang="en", /fr/solutions and /fr/solutions/[slug] lang="fr".

const COPY = {
  en: {
    home: "/",
    indexTitle: "Trackit solutions — Creator marketing for Shopify brands",
    indexDescription:
      "Explore Trackit solutions: creator affiliate platform, TikTok creator marketing, and Shopify sales tracking for e-commerce brands.",
    indexKeywords: ["Trackit solutions", "creator affiliate platform", "Shopify creator tracking"],
    listName: "Trackit Solutions",
    eyebrow: "Trackit solutions",
    title: "Everything you need to run creator programs",
    lead: "Trackit helps Shopify brands discover creators, track affiliate sales, and pay commissions — without spreadsheets or enterprise pricing.",
    crumb: "Solutions",
    back: "← Trackit solutions",
    faq: "Frequently asked questions about Trackit",
    start: "Get started",
    pricing: "Pricing",
    related: "Related Trackit articles",
  },
  fr: {
    home: "/fr",
    indexTitle: "Solutions Trackit — Marketing d'influence pour les marques Shopify",
    indexDescription:
      "Découvrez les solutions Trackit : plateforme d'affiliation créateurs, marketing d'influence sur TikTok et suivi des ventes Shopify pour les marques e-commerce.",
    indexKeywords: ["solutions Trackit", "plateforme d'affiliation créateurs", "suivi des ventes créateurs Shopify"],
    listName: "Solutions Trackit",
    eyebrow: "Solutions Trackit",
    title: "Tout ce qu'il faut pour mener vos programmes créateurs",
    lead: "Trackit aide les marques Shopify à trouver des créateurs, suivre les ventes d'affiliation et payer les commissions — sans tableur ni tarifs de grand compte.",
    crumb: "Solutions",
    back: "← Solutions Trackit",
    faq: "Questions fréquentes sur Trackit",
    start: "Commencer",
    pricing: "Tarifs",
    related: "Articles Trackit associés",
  },
} as const;

export function solutionsIndexMetadata(lang: AppLang): Metadata {
  const t = COPY[lang];
  return buildPageMetadata({
    title: t.indexTitle,
    description: t.indexDescription,
    path: solutionsBasePath(lang),
    keywords: [...t.indexKeywords],
    lang,
  });
}

export function SolutionsIndexView({ lang }: { lang: AppLang }) {
  const t = COPY[lang];
  const base = solutionsBasePath(lang);
  const pages = getSeoPages(lang);

  return (
    <>
      <SeoJsonLd
        data={itemListJsonLd({
          name: t.listName,
          paths: pages.map((page) => ({
            name: page.title,
            path: `${base}/${page.slug}`,
          })),
        })}
      />
      <BlogShell lang={lang} alternateHref={solutionsBasePath(lang === "fr" ? "en" : "fr")}>
        <p className="blog-eyebrow">{t.eyebrow}</p>
        <h1 className="blog-title">{t.title}</h1>
        <p className="blog-lead">{t.lead}</p>
        <div className="blog-grid">
          {pages.map((page) => (
            <article key={page.slug} className="blog-card">
              <Link href={`${base}/${page.slug}`} className="blog-card-link">
                <h2 className="blog-card-title">{page.headline}</h2>
                <p className="blog-card-desc">{page.subheadline}</p>
              </Link>
            </article>
          ))}
        </div>
      </BlogShell>
    </>
  );
}

export function solutionMetadata(slug: string, lang: AppLang): Metadata {
  const page = getSeoPage(slug, lang);
  if (!page) return {};

  const languages = seoPageLanguages(page, lang);
  const metadata = buildPageMetadata({
    title: page.title,
    description: page.description,
    path: `${solutionsBasePath(lang)}/${page.slug}`,
    keywords: page.keywords,
    lang,
    ...(languages ? { languages } : {}),
  });
  if (!languages && metadata.alternates) metadata.alternates = { canonical: metadata.alternates.canonical };
  return metadata;
}

/** A slug from the other language lands on the right version instead of a 404. */
function redirectForeignSlug(slug: string, lang: AppLang): never {
  const otherLang: AppLang = lang === "fr" ? "en" : "fr";
  const other = getSeoPage(slug, otherLang);
  if (other) {
    const twin = other.alternateSlug ? getSeoPage(other.alternateSlug, lang) : undefined;
    permanentRedirect(
      twin ? `${solutionsBasePath(lang)}/${twin.slug}` : `${solutionsBasePath(otherLang)}/${other.slug}`,
    );
  }
  notFound();
}

export function SolutionView({ slug, lang }: { slug: string; lang: AppLang }) {
  const t = COPY[lang];
  const page = getSeoPage(slug, lang);
  if (!page) redirectForeignSlug(slug, lang);

  const fr = lang === "fr";
  const base = solutionsBasePath(lang);
  const path = `${base}/${page.slug}`;
  const languages = seoPageLanguages(page, lang);
  const alternateHref = languages ? (fr ? languages.en : languages.fr) : solutionsBasePath(fr ? "en" : "fr");
  const href = (p: string) => (fr ? `/fr${p}` : p);
  const relatedPosts = page.relatedBlogSlugs
    .map((s) => getBlogPost(s, lang))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const webPage = webPageJsonLd({ title: page.title, description: page.description, path });

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: t.home },
            { name: t.crumb, path: base },
            { name: page.headline, path },
          ]),
          fr ? { ...webPage, inLanguage: "fr-FR" } : webPage,
          fr ? { ...faqJsonLd(page.faqs), inLanguage: "fr-FR" } : faqJsonLd(page.faqs),
        ]}
      />
      <BlogShell narrow lang={lang} alternateHref={alternateHref}>
        <Link href={base} style={{ fontSize: 14, color: "#0047FF", textDecoration: "none" }}>
          {t.back}
        </Link>

        <header style={{ margin: "24px 0 40px" }}>
          <p className="blog-eyebrow">Trackit</p>
          <h1 className="blog-title">{page.headline}</h1>
          <p className="blog-lead">{page.subheadline}</p>
        </header>

        <div className="blog-prose">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <h2>{t.faq}</h2>
          {page.faqs.map((faq) => (
            <div key={faq.question} style={{ marginBottom: 24 }}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="blog-cta-bar">
          <p>{page.ctaLabel}</p>
          <div className="blog-cta-actions">
            <Link href={href("/auth")} className="blog-btn blog-btn--primary">
              {t.start}
            </Link>
            <Link href={href("/pricing")} className="blog-btn blog-btn--secondary">
              {t.pricing}
            </Link>
          </div>
        </div>

        {relatedPosts.length > 0 ? (
          <aside className="blog-related">
            <h2 className="blog-related-title">{t.related}</h2>
            <ul className="blog-related-list">
              {relatedPosts.map((post) => (
                <li key={post.slug}>
                  <Link href={blogPostPath(post)}>{post.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </BlogShell>
    </>
  );
}
