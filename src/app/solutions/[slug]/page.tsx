import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { getAllSeoPageSlugs, getSeoPage } from "@/lib/seo-pages";
import { getBlogPost } from "@/lib/blog";
import {
  breadcrumbJsonLd,
  buildPageMetadata,
  faqJsonLd,
  webPageJsonLd,
} from "@/lib/site-seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllSeoPageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = getSeoPage(slug);
  if (!page) return {};

  return buildPageMetadata({
    title: page.title,
    description: page.description,
    path: `/solutions/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const page = getSeoPage(slug);
  if (!page) notFound();

  const path = `/solutions/${page.slug}`;
  const relatedPosts = page.relatedBlogSlugs
    .map((s) => getBlogPost(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: "/" },
            { name: "Solutions", path: "/solutions" },
            { name: page.headline, path },
          ]),
          webPageJsonLd({ title: page.title, description: page.description, path }),
          faqJsonLd(page.faqs),
        ]}
      />
      <BlogShell narrow>
        <Link href="/solutions" style={{ fontSize: 14, color: "#0047FF", textDecoration: "none" }}>
          ← Trackit solutions
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

          <h2>Frequently asked questions about Trackit</h2>
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
            <Link href="/auth" className="blog-btn blog-btn--primary">
              Get started
            </Link>
            <Link href="/pricing" className="blog-btn blog-btn--secondary">
              Pricing
            </Link>
          </div>
        </div>

        {relatedPosts.length > 0 ? (
          <aside className="blog-related">
            <h2 className="blog-related-title">Related Trackit articles</h2>
            <ul className="blog-related-list">
              {relatedPosts.map((post) => (
                <li key={post.slug}>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </BlogShell>
    </>
  );
}
