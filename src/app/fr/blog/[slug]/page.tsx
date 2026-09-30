import { BlogPostView, blogPostMetadata } from "../BlogViews";
import { getAllBlogSlugs } from "@/lib/blog";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllBlogSlugs("fr").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return blogPostMetadata(slug, "fr");
}

export default async function FrenchBlogPostPage({ params }: Props) {
  const { slug } = await params;
  return <BlogPostView slug={slug} lang="fr" />;
}
