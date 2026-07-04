import Link from "next/link";
import { BlogCard } from "@/components/blog/BlogCard";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { BLOG_POSTS, getPostsByLocale } from "@/lib/blog";
import { buildPageMetadata, itemListJsonLd } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit blog — Creator marketing & affiliate guides",
  description:
    "Expert guides from Trackit on creator affiliate marketing, TikTok outreach, Shopify sales tracking, and scaling creator programs.",
  path: "/blog",
  keywords: ["Trackit blog", "creator marketing guides", "Trackit resources", "affiliate marketing tips"],
});

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function BlogIndexPage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const locale = lang === "fr" ? "fr" : "en";
  const posts = getPostsByLocale(locale);

  return (
    <>
      <SeoJsonLd
        data={itemListJsonLd({
          name: "Trackit Blog",
          paths: BLOG_POSTS.map((post) => ({ name: post.title, path: `/blog/${post.slug}` })),
        })}
      />
      <BlogShell>
        <p className="blog-eyebrow">Trackit resources</p>
        <h1 className="blog-title">Creator marketing guides</h1>
        <p className="blog-lead">
          In-depth articles on running creator affiliate programs with Trackit — discovery, outreach, Shopify tracking, and payouts.
        </p>

        <div className="blog-locale-tabs" role="tablist" aria-label="Blog language">
          <Link
            href="/blog"
            className={`blog-locale-tab${locale === "en" ? " blog-locale-tab--active" : ""}`}
          >
            English
          </Link>
          <Link
            href="/blog?lang=fr"
            className={`blog-locale-tab${locale === "fr" ? " blog-locale-tab--active" : ""}`}
          >
            Français
          </Link>
        </div>

        <div className="blog-grid">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </BlogShell>
    </>
  );
}
