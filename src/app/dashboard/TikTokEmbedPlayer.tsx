"use client";

import type { CSSProperties } from "react";
import { videoEmbedPlayUrl, videoEmbedUrl } from "@/lib/creator-video";

type TikTokEmbedPlayerProps = {
  videoId?: string | null;
  shareUrl?: string | null;
  title?: string;
  autoplay?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function tiktokEmbedSrc(
  videoId?: string | null,
  shareUrl?: string | null,
  autoplay = true
): string | null {
  const ref = videoId || shareUrl ? { id: videoId ?? undefined, shareUrl: shareUrl ?? undefined } : null;
  if (!ref) return null;
  return autoplay ? videoEmbedPlayUrl(ref) : videoEmbedUrl(ref);
}

export function TikTokEmbedPlayer({
  videoId,
  shareUrl,
  title = "TikTok video",
  autoplay = true,
  style,
}: TikTokEmbedPlayerProps) {
  const src = tiktokEmbedSrc(videoId, shareUrl, autoplay);
  if (!src) return null;

  return (
    <iframe
      src={src}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
        ...style,
      }}
    />
  );
}

export function TikTokEmbedModal({
  shareUrl,
  videoId,
  title = "TikTok video",
  onClose,
}: {
  shareUrl?: string | null;
  videoId?: string | null;
  title?: string;
  onClose: () => void;
}) {
  const src = tiktokEmbedSrc(videoId, shareUrl, true);
  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(360px, 90vw)",
          aspectRatio: "9 / 16",
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
        }}
      >
        <TikTokEmbedPlayer videoId={videoId} shareUrl={shareUrl} title={title} />
      </div>
    </div>
  );
}
