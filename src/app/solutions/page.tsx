import Link from "next/link";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { SEO_PAGES } from "@/lib/seo-pages";
import { buildPageMetadata, itemListJsonLd } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Trackit solutions — Creator marketing for Shopify brands",
  description:
    "Explore Trackit solutions: creator affiliate platform, TikTok creator marketing, and Shopify sales tracking for e-commerce brands.",
  path: "/solutions",
  keywords: ["Trackit solutions", "creator affiliate platform", "Shopify creator tracking"],
});

export default function SolutionsIndexPage() {
  return (
    <>
      <SeoJsonLd
        data={itemListJsonLd({
          name: "Trackit Solutions",
          paths: SEO_PAGES.map((page) => ({
            name: page.title,
            path: `/solutions/${page.slug}`,
          })),
        })}
      />
      <BlogShell>
        <p className="blog-eyebrow">Trackit solutions</p>
        <h1 className="blog-title">Everything you need to run creator programs</h1>
        <p className="blog-lead">
          Trackit helps Shopify brands discover creators, track affiliate sales, and pay commissions — without spreadsheets or enterprise pricing.
        </p>
        <div className="blog-grid">
          {SEO_PAGES.map((page) => (
            <article key={page.slug} className="blog-card">
              <Link href={`/solutions/${page.slug}`} className="blog-card-link">
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
