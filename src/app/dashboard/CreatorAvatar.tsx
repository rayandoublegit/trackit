import { resolveCreatorAvatarUrl } from "@/lib/creator-avatar";

function ProfileIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.52);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" fill="#B5B5B5" />
      <path d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#B5B5B5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#F0F0F0",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden={!alt}
        title={alt || undefined}
      >
        <ProfileIcon size={size} />
      </div>
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
