import { buildBlogRss } from "@/lib/blog";

export async function GET() {
  return new Response(buildBlogRss("en"), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
