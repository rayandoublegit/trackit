"use client";

import { useEffect, useState } from "react";
import { normalizeCreatorHandle, resolveCreatorAvatarUrl } from "@/lib/creator-avatar";
import { isTikTokCdnUrl, isUiAvatarsUrl, proxiedImageUrl } from "@/lib/tiktok-avatar";

function ProfileIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.52);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" fill="#B5B5B5" />
      <path d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#B5B5B5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

type AvatarSource = "api" | "src" | "none";

function cleanAvatarSrc(src?: string | null): string {
  const url = resolveCreatorAvatarUrl(src);
  if (!url || isUiAvatarsUrl(url)) return "";
  return url;
}

function isStableAvatarUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("supabase.co") || url.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/** Prefer the avatar API for expiring CDN URLs so each handle resolves to the right photo. */
function pickAvatarSource(cleanSrc: string, resolvedUsername: string): AvatarSource {
  if (!cleanSrc && !resolvedUsername) return "none";
  if (!resolvedUsername) return cleanSrc ? "src" : "none";
  if (!cleanSrc) return "api";
  if (isStableAvatarUrl(cleanSrc)) return "src";
  if (isTikTokCdnUrl(cleanSrc)) return "api";
  return "src";
}

export function CreatorAvatar({
  src,
  username,
  handle,
  displayName,
  size = 32,
  alt = "",
}: {
  src?: string | null;
  username?: string;
  handle?: string;
  displayName?: string;
  size?: number;
  alt?: string;
}) {
  const resolvedUsername = normalizeCreatorHandle(username ?? handle);
  const cleanSrc = cleanAvatarSrc(src);

  const [source, setSource] = useState<AvatarSource>(() => pickAvatarSource(cleanSrc, resolvedUsername));

  useEffect(() => {
    setSource(pickAvatarSource(cleanSrc, resolvedUsername));
  }, [resolvedUsername, cleanSrc]);

  const imgSrc =
    source === "api" && resolvedUsername
      ? `/api/creator-avatar?username=${encodeURIComponent(resolvedUsername)}`
      : source === "src" && cleanSrc
        ? proxiedImageUrl(cleanSrc)
        : "";

  const onError = () => {
    if (source === "src" && resolvedUsername) {
      setSource("api");
      return;
    }
    if (source === "api" && cleanSrc && isStableAvatarUrl(cleanSrc)) {
      setSource("src");
      return;
    }
    setSource("none");
  };

  if (!imgSrc || source === "none") {
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
        title={alt || displayName || undefined}
      >
        <ProfileIcon size={size} />
      </div>
    );
  }

  return (
    <img
      key={`${resolvedUsername}:${source}:${imgSrc}`}
      src={imgSrc}
      alt={alt || displayName || resolvedUsername || ""}
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
      onError={onError}
    />
  );
}
