import type { MetadataRoute } from "next";
import { getAllBlogSlugs } from "@/lib/blog";
import { getAllSeoPageSlugs } from "@/lib/seo-pages";
import { absoluteUrl } from "@/lib/site-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.92 },
    { url: absoluteUrl("/pricing"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/affiliation"), lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: absoluteUrl("/blog"), lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: absoluteUrl("/solutions"), lastModified: now, changeFrequency: "monthly", priority: 0.88 },
    { url: absoluteUrl("/contact"), lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    { url: absoluteUrl("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = getAllBlogSlugs().map((slug) => ({
    url: absoluteUrl(`/blog/${slug}`),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.78,
  }));

  const solutionRoutes: MetadataRoute.Sitemap = getAllSeoPageSlugs().map((slug) => ({
    url: absoluteUrl(`/solutions/${slug}`),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.82,
  }));

  return [...staticRoutes, ...solutionRoutes, ...blogRoutes];
}
