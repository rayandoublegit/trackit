import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import {
  blogBasePath,
  blogPostLanguages,
  blogPostPath,
  englishSlugFor,
  estimateWordCount,
  frenchSlugFor,
  getBlogPost,
  getBlogPosts,
  getRelatedPosts,
  type BlogPost,
} from "@/lib/blog";
import type { AppLang } from "@/lib/locale-preferences";
import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  buildPageMetadata,
  itemListJsonLd,
  SITE_NAME,
} from "@/lib/site-seo";

// The blog index and posts in both languages: /blog and /blog/[slug] render
// lang="en", /fr/blog and /fr/blog/[slug] lang="fr".

const COPY = {
  en: {
    home: "/",
    indexTitle: "Trackit blog — Creator marketing & affiliate guides",
    indexDescription:
      "Expert guides from Trackit on creator affiliate marketing, TikTok outreach, Shopify sales tracking, and scaling creator programs.",
    indexKeywords: ["Trackit blog", "creator marketing guides", "Trackit resources", "affiliate marketing tips"],
    listName: "Trackit Blog",
    eyebrow: "Trackit resources",
    title: "Creator marketing guides",
    lead: "In-depth articles on running creator affiliate programs with Trackit — discovery, outreach, Shopify tracking, and payouts.",
    crumb: "Blog",
    back: "← Trackit blog",
    dateLocale: "en-US",
    cta: "Ready to run your creator program on Trackit?",
    start: "Start free",
    pricing: "View pricing",
    related: "Related Trackit guides",
  },
  fr: {
    home: "/fr",
    indexTitle: "Blog Trackit — Guides de marketing d'influence et d'affiliation créateurs",
    indexDescription:
      "Les guides de Trackit sur l'affiliation créateurs, la prospection sur TikTok, le suivi des ventes Shopify et le développement de vos programmes créateurs.",
    indexKeywords: ["blog Trackit", "guides marketing d'influence", "ressources Trackit", "conseils affiliation créateurs"],
    listName: "Blog Trackit",
    eyebrow: "Ressources Trackit",
    title: "Guides de marketing créateurs",
    lead: "Des articles de fond pour mener vos programmes d'affiliation créateurs avec Trackit — découverte, prospection, suivi Shopify et paiements.",
    crumb: "Blog",
    back: "← Blog Trackit",
    dateLocale: "fr-FR",
    cta: "Prêt à lancer votre programme créateurs sur Trackit ?",
    start: "Commencer gratuitement",
    pricing: "Voir les tarifs",
    related: "Guides Trackit associés",
  },
} as const;

function formatDate(iso: string, lang: AppLang): string {
  return new Date(iso).toLocaleDateString(COPY[lang].dateLocale, { year: "numeric", month: "long", day: "numeric" });
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="blog-card">
      <Link href={blogPostPath(post)} className="blog-card-link">
        <div className="blog-card-category">{post.category}</div>
        <h2 className="blog-card-title">{post.title}</h2>
        <p className="blog-card-desc">{post.description}</p>
        <span className="blog-meta">
          {post.readMinutes} min · {formatDate(post.publishedAt, post.locale)}
        </span>
      </Link>
    </article>
  );
}

export function blogIndexMetadata(lang: AppLang): Metadata {
  const t = COPY[lang];
  return buildPageMetadata({
    title: t.indexTitle,
    description: t.indexDescription,
    path: blogBasePath(lang),
    keywords: [...t.indexKeywords],
    lang,
  });
}

export function BlogIndexView({ lang }: { lang: AppLang }) {
  const t = COPY[lang];
  const posts = getBlogPosts(lang);

  return (
    <>
      <SeoJsonLd
        data={itemListJsonLd({
          name: t.listName,
          paths: posts.map((post) => ({ name: post.title, path: blogPostPath(post) })),
        })}
      />
      <BlogShell lang={lang} alternateHref={blogBasePath(lang === "fr" ? "en" : "fr")}>
        <p className="blog-eyebrow">{t.eyebrow}</p>
        <h1 className="blog-title">{t.title}</h1>
        <p className="blog-lead">{t.lead}</p>

        <div className="blog-grid">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </BlogShell>
    </>
  );
}

export function blogPostMetadata(slug: string, lang: AppLang): Metadata {
  const post = getBlogPost(slug, lang);
  if (!post) return {};

  const path = blogPostPath(post);
  const languages = blogPostLanguages(post);
  const metadata = buildPageMetadata({
    title: post.title,
    description: post.description,
    path,
    keywords: post.keywords,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    lang,
    ...(languages ? { languages } : {}),
  });

  // Without a twin in the other language there is no alternate to announce.
  metadata.alternates = languages
    ? { ...metadata.alternates, canonical: absoluteUrl(path) }
    : { canonical: absoluteUrl(path) };
  return metadata;
}

/** A post slug from the other language lands on the right version instead of a 404. */
function redirectForeignSlug(slug: string, lang: AppLang): never {
  if (lang === "en") {
    // Former French URLs under /blog now live under /fr/blog.
    if (englishSlugFor(slug) !== undefined) permanentRedirect(`/fr/blog/${slug}`);
  } else {
    const french = frenchSlugFor(slug);
    if (french !== undefined) permanentRedirect(french ? `/fr/blog/${french}` : `/blog/${slug}`);
  }
  notFound();
}

export function BlogPostView({ slug, lang }: { slug: string; lang: AppLang }) {
  const t = COPY[lang];
  const post = getBlogPost(slug, lang);
  if (!post) redirectForeignSlug(slug, lang);

  const fr = lang === "fr";
  const base = blogBasePath(lang);
  const path = blogPostPath(post);
  const related = getRelatedPosts(post);
  const languages = blogPostLanguages(post);
  const alternateHref = languages ? (fr ? languages.en : languages.fr) : blogBasePath(fr ? "en" : "fr");
  const href = (p: string) => (fr ? `/fr${p}` : p);

  const article = articleJsonLd({
    title: post.title,
    description: post.description,
    path,
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    wordCount: estimateWordCount(post),
    locale: post.locale,
  });

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: t.home },
            { name: t.crumb, path: base },
            { name: post.title, path },
          ]),
          fr ? { ...article, isPartOf: { "@type": "Blog", name: `Blog ${SITE_NAME}`, url: absoluteUrl(base) } } : article,
        ]}
      />
      <BlogShell narrow lang={lang} alternateHref={alternateHref}>
        <Link href={base} style={{ fontSize: 14, color: "#0047FF", textDecoration: "none" }}>
          {t.back}
        </Link>

        <header style={{ margin: "24px 0 32px" }}>
          <div className="blog-card-category">{post.category}</div>
          <h1 className="blog-title">{post.title}</h1>
          <p className="blog-lead" style={{ marginBottom: 12 }}>{post.description}</p>
          <time className="blog-meta" dateTime={post.publishedAt}>
            {formatDate(post.publishedAt, lang)} · {post.readMinutes} min
          </time>
        </header>

        <BlogArticleBody blocks={post.blocks} />

        <div className="blog-cta-bar">
          <p>{t.cta}</p>
          <div className="blog-cta-actions">
            <Link href={href("/auth")} className="blog-btn blog-btn--primary">
              {t.start}
            </Link>
            <Link href={href("/pricing")} className="blog-btn blog-btn--secondary">
              {t.pricing}
            </Link>
          </div>
        </div>

        {related.length > 0 ? (
          <aside className="blog-related">
            <h2 className="blog-related-title">{t.related}</h2>
            <ul className="blog-related-list">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={blogPostPath(item)}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </BlogShell>
    </>
  );
}
