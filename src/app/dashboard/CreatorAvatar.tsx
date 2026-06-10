import { resolveCreatorAvatarUrl } from "@/lib/creator-avatar";

export function CreatorAvatar({
  src,
  size = 32,
  alt = "",
}: {
  src?: string | null;
  size?: number;
  alt?: string;
}) {
  const url = resolveCreatorAvatarUrl(src);
  if (!url) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        background: "#F0F0F0",
      }}
    />
  );
}
