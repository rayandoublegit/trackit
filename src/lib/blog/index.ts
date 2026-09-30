import type { AppLang } from "@/lib/locale-preferences";
import { absoluteUrl, SITE_NAME } from "@/lib/site-seo";
import { POSTS_EN } from "./posts-en";
import { POSTS_FR } from "./posts-fr";
import type { BlogPost } from "./types";

export type { BlogBlock, BlogPost } from "./types";

const byNewest = (a: BlogPost, b: BlogPost) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();

/** English posts, served under /blog. */
export const BLOG_POSTS: BlogPost[] = [...POSTS_EN].sort(byNewest);

/** French posts, served under /fr/blog. */
export const BLOG_POSTS_FR: BlogPost[] = [...POSTS_FR].sort(byNewest);

export function getBlogPosts(lang: AppLang = "en"): BlogPost[] {
  return lang === "fr" ? BLOG_POSTS_FR : BLOG_POSTS;
}

/** Blog index path for a language: /blog or /fr/blog. */
export function blogBasePath(lang: AppLang = "en"): string {
  return lang === "fr" ? "/fr/blog" : "/blog";
}

export function blogPostPath(post: BlogPost): string {
  return `${blogBasePath(post.locale)}/${post.slug}`;
}

/** For a French slug: the English post it maps to (null when it has none). */
export function englishSlugFor(slug: string): string | null | undefined {
  const fr = POSTS_FR.find((post) => post.slug === slug);
  if (!fr) return undefined;
  const alt = fr.alternateSlug && POSTS_EN.some((post) => post.slug === fr.alternateSlug) ? fr.alternateSlug : null;
  return alt;
}

/** For an English slug: the French post it maps to (null when it has none). */
export function frenchSlugFor(slug: string): string | null | undefined {
  const en = POSTS_EN.find((post) => post.slug === slug);
  if (!en) return undefined;
  const byEnglish = en.alternateSlug && POSTS_FR.some((post) => post.slug === en.alternateSlug) ? en.alternateSlug : null;
  return byEnglish ?? POSTS_FR.find((post) => post.alternateSlug === slug)?.slug ?? null;
}

/** Both language versions of a post, when it has a twin. */
export function blogPostLanguages(post: BlogPost): { en: string; fr: string } | null {
  if (post.locale === "fr") {
    const en = englishSlugFor(post.slug);
    return en ? { en: `/blog/${en}`, fr: `/fr/blog/${post.slug}` } : null;
  }
  const fr = frenchSlugFor(post.slug);
  return fr ? { en: `/blog/${post.slug}`, fr: `/fr/blog/${fr}` } : null;
}

export function getBlogPost(slug: string, lang: AppLang = "en"): BlogPost | undefined {
  return getBlogPosts(lang).find((post) => post.slug === slug);
}

export function getAllBlogSlugs(lang: AppLang = "en"): string[] {
  return getBlogPosts(lang).map((post) => post.slug);
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const posts = getBlogPosts(post.locale);
  const fromSlugs = post.relatedSlugs
    .map((slug) => getBlogPost(slug, post.locale))
    .filter((p): p is BlogPost => Boolean(p));

  if (fromSlugs.length >= limit) return fromSlugs.slice(0, limit);

  const sameCategory = posts.filter(
    (p) => p.slug !== post.slug && p.locale === post.locale && p.category === post.category,
  );
  const merged = [...fromSlugs];
  for (const p of sameCategory) {
    if (merged.length >= limit) break;
    if (!merged.some((m) => m.slug === p.slug)) merged.push(p);
  }
  return merged.slice(0, limit);
}

export function estimateWordCount(post: BlogPost): number {
  return post.blocks.reduce((count, block) => {
    if (block.type === "p" || block.type === "h2" || block.type === "h3") return count + block.text.split(/\s+/).length;
    if (block.type === "ul" || block.type === "ol") {
      return count + block.items.reduce((n, item) => n + item.split(/\s+/).length, 0);
    }
    return count;
  }, 0);
}

/** RSS 2.0 feed of the blog in one language (/blog/feed.xml, /fr/blog/feed.xml). */
export function buildBlogRss(lang: AppLang = "en"): string {
  const base = blogBasePath(lang);
  const items = getBlogPosts(lang).map(
    (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${absoluteUrl(blogPostPath(post))}</link>
      <guid isPermaLink="true">${absoluteUrl(blogPostPath(post))}</guid>
      <description><![CDATA[${post.description}]]></description>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    </item>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${lang === "fr" ? `Blog ${SITE_NAME}` : `${SITE_NAME} Blog`}</title>
    <link>${absoluteUrl(base)}</link>
    <description>${lang === "fr" ? "Guides de marketing d'influence et d'affiliation créateurs par Trackit" : "Creator marketing and affiliate guides from Trackit"}</description>
    <language>${lang}</language>
    <atom:link href="${absoluteUrl(`${base}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}
