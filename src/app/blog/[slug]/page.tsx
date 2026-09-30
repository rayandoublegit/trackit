import { BlogPostView, blogPostMetadata } from "@/app/fr/blog/BlogViews";
import { getAllBlogSlugs } from "@/lib/blog";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllBlogSlugs("en").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return blogPostMetadata(slug, "en");
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  return <BlogPostView slug={slug} lang="en" />;
}
