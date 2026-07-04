/**
 * Official Trackit social profiles — used in JSON-LD sameAs, footer, and about page.
 * Set NEXT_PUBLIC_SOCIAL_YOUTUBE in Vercel when your channel URL is ready.
 */
export const SOCIAL_X = (process.env.NEXT_PUBLIC_SOCIAL_X || "https://x.com/rayanvsr").trim();
export const SOCIAL_YOUTUBE = (
  process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || "https://www.youtube.com/@thentrackit"
).trim();
export const SOCIAL_LINKEDIN = (process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || "").trim();
export const SOCIAL_TIKTOK = (process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || "").trim();

export type SocialLink = {
  id: "x" | "youtube" | "linkedin" | "tiktok";
  label: string;
  href: string;
};

export function getSocialLinks(): SocialLink[] {
  const links: SocialLink[] = [{ id: "x", label: "X (Twitter)", href: SOCIAL_X }];
  if (SOCIAL_YOUTUBE) links.push({ id: "youtube", label: "YouTube", href: SOCIAL_YOUTUBE });
  if (SOCIAL_TIKTOK) links.push({ id: "tiktok", label: "TikTok", href: SOCIAL_TIKTOK });
  if (SOCIAL_LINKEDIN) links.push({ id: "linkedin", label: "LinkedIn", href: SOCIAL_LINKEDIN });
  return links;
}

export function getSameAsUrls(): string[] {
  return getSocialLinks().map((link) => link.href);
}

export function getTwitterHandle(): string | undefined {
  try {
    const url = new URL(SOCIAL_X);
    const handle = url.pathname.replace(/^\//, "").split("/")[0];
    return handle ? `@${handle}` : undefined;
  } catch {
    return undefined;
  }
}
