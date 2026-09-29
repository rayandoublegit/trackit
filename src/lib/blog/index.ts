import { POSTS_EN } from "./posts-en";
import { POSTS_FR } from "./posts-fr";
import type { BlogPost } from "./types";

export type { BlogBlock, BlogPost } from "./types";

// The site is English only: French posts are no longer listed or rendered.
// Their URLs redirect to the English version (see englishSlugFor).
export const BLOG_POSTS: BlogPost[] = [...POSTS_EN].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

/** For a retired French slug: the English post it maps to, if any. */
export function englishSlugFor(slug: string): string | null | undefined {
  const fr = POSTS_FR.find((post) => post.slug === slug);
  if (!fr) return undefined;
  const alt = fr.alternateSlug && POSTS_EN.some((post) => post.slug === fr.alternateSlug) ? fr.alternateSlug : null;
  return alt;
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getAllBlogSlugs(): string[] {
  return BLOG_POSTS.map((post) => post.slug);
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const fromSlugs = post.relatedSlugs
    .map((slug) => getBlogPost(slug))
    .filter((p): p is BlogPost => Boolean(p));

  if (fromSlugs.length >= limit) return fromSlugs.slice(0, limit);

  const sameCategory = BLOG_POSTS.filter(
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
