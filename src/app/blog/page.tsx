import { BlogIndexView, blogIndexMetadata } from "@/app/fr/blog/BlogViews";

export const metadata = blogIndexMetadata("en");

export default function BlogIndexPage() {
  return <BlogIndexView lang="en" />;
}
