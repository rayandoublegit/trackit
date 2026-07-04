import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

type BlogCardProps = {
  post: BlogPost;
};

export function BlogCard({ post }: BlogCardProps) {
  return (
    <article className="blog-card">
      <Link href={`/blog/${post.slug}`} className="blog-card-link">
        <div className="blog-card-category">{post.category}</div>
        <h2 className="blog-card-title">{post.title}</h2>
        <p className="blog-card-desc">{post.description}</p>
        <span className="blog-meta">
          {post.readMinutes} min ·{" "}
          {new Date(post.publishedAt).toLocaleDateString(post.locale === "fr" ? "fr-FR" : "en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </Link>
    </article>
  );
}
