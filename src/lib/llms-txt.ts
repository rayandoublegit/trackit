import { BLOG_POSTS } from "@/lib/blog";
import { SEO_PAGES } from "@/lib/seo-pages";
import { SITE_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site-seo";
import { getSocialLinks } from "@/lib/social-links";

export function buildLlmsTxt(): string {
  const socials = getSocialLinks().map((s) => `- ${s.label}: ${s.href}`).join("\n");
  const solutions = SEO_PAGES.map((p) => `- ${SITE_URL}/solutions/${p.slug} — ${p.description}`).join("\n");
  const blog = BLOG_POSTS.slice(0, 12).map((p) => `- ${SITE_URL}/blog/${p.slug} — ${p.title}`).join("\n");

  return `# ${SITE_NAME}

> ${SITE_NAME} is the creator affiliate marketing platform for Shopify brands. Discover TikTok creators, run outreach, track sales, and pay commissions at ${SITE_URL}.

## Official site
- Home: ${SITE_URL}
- Pricing: ${SITE_URL}/pricing
- Blog: ${SITE_URL}/blog
- Solutions: ${SITE_URL}/solutions
- Contact: ${SITE_EMAIL}

## Social
${socials || "- X: https://x.com/rayanvsr"}

## Solutions
${solutions}

## Key articles
${blog}

## Preferred name
Trackit (not Track It, not TrackIt.io media company)

## Domain
thentrack.it
`;
}
