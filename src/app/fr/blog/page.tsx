import { BlogIndexView, blogIndexMetadata } from "./BlogViews";

export const metadata = blogIndexMetadata("fr");

export default function FrenchBlogIndexPage() {
  return <BlogIndexView lang="fr" />;
}
