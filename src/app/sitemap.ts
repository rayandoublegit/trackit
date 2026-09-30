import type { MetadataRoute } from "next";
import { blogPostLanguages, blogPostPath, getBlogPosts } from "@/lib/blog";
import { getSeoPages, seoPageLanguages, solutionsBasePath } from "@/lib/seo-pages";
import { absoluteUrl } from "@/lib/site-seo";

type Entry = MetadataRoute.Sitemap[number];
type Pair = { en: string; fr: string };

function languages(pair: Pair): NonNullable<Entry["alternates"]> {
  return { languages: { en: absoluteUrl(pair.en), fr: absoluteUrl(pair.fr), "x-default": absoluteUrl(pair.en) } };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Each page in both languages; every entry lists its twin (hreflang).
  const staticPages: (Pair & Pick<Entry, "changeFrequency" | "priority">)[] = [
    { en: "/", fr: "/fr", changeFrequency: "weekly", priority: 1 },
    { en: "/about", fr: "/fr/about", changeFrequency: "monthly", priority: 0.92 },
    { en: "/pricing", fr: "/fr/pricing", changeFrequency: "monthly", priority: 0.9 },
    { en: "/affiliation", fr: "/fr/affiliation", changeFrequency: "monthly", priority: 0.85 },
    { en: "/blog", fr: "/fr/blog", changeFrequency: "weekly", priority: 0.85 },
    { en: "/solutions", fr: "/fr/solutions", changeFrequency: "monthly", priority: 0.88 },
    { en: "/contact", fr: "/fr/contact", changeFrequency: "yearly", priority: 0.6 },
    { en: "/terms", fr: "/fr/terms", changeFrequency: "yearly", priority: 0.4 },
    { en: "/privacy", fr: "/fr/privacy", changeFrequency: "yearly", priority: 0.4 },
    { en: "/legal-notice", fr: "/fr/mentions-legales", changeFrequency: "yearly", priority: 0.3 },
    { en: "/cookies", fr: "/fr/cookies", changeFrequency: "yearly", priority: 0.3 },
  ];

  const staticRoutes: MetadataRoute.Sitemap = staticPages.flatMap(({ en, fr, changeFrequency, priority }) => [
    { url: absoluteUrl(en), lastModified: now, changeFrequency, priority, alternates: languages({ en, fr }) },
    { url: absoluteUrl(fr), lastModified: now, changeFrequency, priority, alternates: languages({ en, fr }) },
  ]);

  const solutionRoutes: MetadataRoute.Sitemap = (["en", "fr"] as const).flatMap((lang) =>
    getSeoPages(lang).map((page) => {
      const pair = seoPageLanguages(page, lang);
      return {
        url: absoluteUrl(`${solutionsBasePath(lang)}/${page.slug}`),
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.82,
        ...(pair ? { alternates: languages(pair) } : {}),
      };
    }),
  );

  const blogRoutes: MetadataRoute.Sitemap = (["en", "fr"] as const).flatMap((lang) =>
    getBlogPosts(lang).map((post) => {
      const pair = blogPostLanguages(post);
      return {
        url: absoluteUrl(blogPostPath(post)),
        lastModified: new Date(post.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.78,
        ...(pair ? { alternates: languages(pair) } : {}),
      };
    }),
  );

  return [...staticRoutes, ...solutionRoutes, ...blogRoutes];
}
