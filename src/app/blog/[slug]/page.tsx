import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { estimateWordCount, getAllBlogSlugs, getBlogPost, getRelatedPosts } from "@/lib/blog";
import { absoluteUrl, articleJsonLd, breadcrumbJsonLd, buildPageMetadata } from "@/lib/site-seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const metadata = buildPageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.keywords,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });

  if (post.alternateSlug) {
    metadata.alternates = {
      ...metadata.alternates,
      canonical: absoluteUrl(`/blog/${post.slug}`),
      languages: {
        en: absoluteUrl(`/blog/${post.locale === "en" ? post.slug : post.alternateSlug}`),
        fr: absoluteUrl(`/blog/${post.locale === "fr" ? post.slug : post.alternateSlug}`),
      },
    };
  }

  return metadata;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const path = `/blog/${post.slug}`;
  const related = getRelatedPosts(post);
  const alternate = post.alternateSlug ? getBlogPost(post.alternateSlug) : undefined;

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path },
          ]),
          articleJsonLd({
            title: post.title,
            description: post.description,
            path,
            publishedTime: post.publishedAt,
            modifiedTime: post.updatedAt,
            wordCount: estimateWordCount(post),
            locale: post.locale,
          }),
        ]}
      />
      <BlogShell narrow>
        <Link href={`/blog${post.locale === "fr" ? "?lang=fr" : ""}`} style={{ fontSize: 14, color: "#0047FF", textDecoration: "none" }}>
          ← Trackit blog
        </Link>

        <header style={{ margin: "24px 0 32px" }}>
          <div className="blog-card-category">{post.category}</div>
          <h1 className="blog-title">{post.title}</h1>
          <p className="blog-lead" style={{ marginBottom: 12 }}>{post.description}</p>
          <time className="blog-meta" dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString(post.locale === "fr" ? "fr-FR" : "en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {post.readMinutes} min
          </time>
          {alternate ? (
            <p style={{ marginTop: 12, fontSize: 14 }}>
              <Link href={`/blog/${alternate.slug}`} style={{ color: "#0047FF" }}>
                {post.locale === "en" ? "Lire en français →" : "Read in English →"}
              </Link>
            </p>
          ) : null}
        </header>

        <BlogArticleBody blocks={post.blocks} />

        <div className="blog-cta-bar">
          <p>Ready to run your creator program on Trackit?</p>
          <div className="blog-cta-actions">
            <Link href="/auth" className="blog-btn blog-btn--primary">
              Start free
            </Link>
            <Link href="/pricing" className="blog-btn blog-btn--secondary">
              View pricing
            </Link>
          </div>
        </div>

        {related.length > 0 ? (
          <aside className="blog-related">
            <h2 className="blog-related-title">Related Trackit guides</h2>
            <ul className="blog-related-list">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </BlogShell>
    </>
  );
}
