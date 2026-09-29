// Brand marks for the platforms creators live on. Real logos, never letters.

export type PlatformName = "tiktok" | "instagram" | "youtube";

export function platformKey(raw: string | null | undefined): PlatformName {
  const v = (raw || "").toLowerCase();
  if (v.includes("insta")) return "instagram";
  if (v.includes("you")) return "youtube";
  return "tiktok";
}

export const PLATFORM_LABEL: Record<PlatformName, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export function platformProfileUrl(platform: string | null | undefined, username: string): string {
  const handle = username.replace(/^@/, "");
  const p = platformKey(platform);
  if (p === "instagram") return `https://www.instagram.com/${handle}/`;
  if (p === "youtube") return `https://www.youtube.com/@${handle}`;
  return `https://www.tiktok.com/@${handle}`;
}

export function PlatformLogo({ platform, size = 16 }: { platform: string | null | undefined; size?: number }) {
  const p = platformKey(platform);
  if (p === "youtube") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-label="YouTube" role="img" style={{ flexShrink: 0 }}>
        <rect x="1.5" y="5" width="21" height="14" rx="4.2" fill="#ff0033" />
        <path d="M10 9v6l5.2-3z" fill="#fff" />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p === "instagram" ? "/instagram-logo.svg" : "/tiktok-logo.svg"}
      alt={PLATFORM_LABEL[p]}
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0, borderRadius: size * 0.22 }}
    />
  );
}
