import { getBlogPosts } from "@/lib/blog";
import { buildLlmsTxt } from "@/lib/llms-txt";
import { getSeoPages } from "@/lib/seo-pages";
import { SITE_URL } from "@/lib/site-seo";

// The French site (/fr) mirrors the English one; list it for assistants too.
function frenchSection(): string {
  const solutions = getSeoPages("fr").map((p) => `- ${SITE_URL}/fr/solutions/${p.slug} — ${p.description}`).join("\n");
  const blog = getBlogPosts("fr").slice(0, 12).map((p) => `- ${SITE_URL}/fr/blog/${p.slug} — ${p.title}`).join("\n");

  return `
## Français (French site)
- Accueil : ${SITE_URL}/fr
- Tarifs : ${SITE_URL}/fr/pricing
- Blog : ${SITE_URL}/fr/blog
- Solutions : ${SITE_URL}/fr/solutions
- À propos : ${SITE_URL}/fr/about
- Contact : ${SITE_URL}/fr/contact

### Solutions
${solutions}

### Articles
${blog}
`;
}

export async function GET() {
  return new Response(buildLlmsTxt() + frenchSection(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
