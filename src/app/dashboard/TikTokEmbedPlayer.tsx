"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clientVideoUrl } from "@/lib/client-video-url";
import { extractVideoId } from "@/lib/creator-video";

type InAppVideoPlayerProps = {
  /** Proxied or raw CDN play URL (preferred). */
  streamUrl?: string | null;
  videoId?: string | null;
  shareUrl?: string | null;
  /** Used to resolve a stream via /api/creator/[username]/video/[videoId] when streamUrl is missing. */
  username?: string | null;
  poster?: string | null;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  style?: CSSProperties;
};

function resolveInitialSrc(streamUrl?: string | null): string | null {
  const trimmed = streamUrl?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/video-proxy")) return trimmed;
  return clientVideoUrl(trimmed) || null;
}

/** Native in-app player — streams via Trackit proxy, never opens TikTok or loads tiktok.com iframe. */
export function InAppVideoPlayer({
  streamUrl,
  videoId,
  shareUrl,
  username,
  poster,
  title = "Video",
  autoPlay = true,
  style,
}: InAppVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(() => resolveInitialSrc(streamUrl));
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(!resolveInitialSrc(streamUrl));

  useEffect(() => {
    let cancelled = false;
    const initial = resolveInitialSrc(streamUrl);
    if (initial) {
      setSrc(initial);
      setLoading(false);
      setError(false);
      return;
    }

    const id = extractVideoId(videoId) || extractVideoId(shareUrl);
    const handle = username?.trim().replace(/^@/, "") || "";
    if (!id || !handle) {
      setSrc(null);
      setLoading(false);
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/creator/${encodeURIComponent(handle)}/video/${encodeURIComponent(id)}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("unavailable");
        const data = (await res.json()) as { url?: string };
        const next = resolveInitialSrc(data.url) || data.url?.trim() || null;
        if (cancelled) return;
        if (!next) throw new Error("unavailable");
        setSrc(next);
        setError(false);
      } catch {
        if (!cancelled) {
          setSrc(null);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [streamUrl, videoId, shareUrl, username]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || !autoPlay) return;
    el.play().catch(() => {
      /* autoplay can be blocked — controls remain */
    });
  }, [src, autoPlay]);

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9A9A9A",
          fontSize: 12,
          ...style,
        }}
      >
        …
      </div>
    );
  }

  if (error || !src) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9A9A9A",
          fontSize: 12,
          textAlign: "center",
          padding: 12,
          ...style,
        }}
      >
        Video unavailable
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      key={src}
      src={src}
      poster={poster || undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      title={title}
      onError={() => setError(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "#000",
        display: "block",
        ...style,
      }}
    />
  );
}

/** @deprecated Prefer InAppVideoPlayer — kept as alias for existing imports. */
export function TikTokEmbedPlayer(props: {
  videoId?: string | null;
  shareUrl?: string | null;
  streamUrl?: string | null;
  username?: string | null;
  poster?: string | null;
  title?: string;
  autoplay?: boolean;
  style?: CSSProperties;
}) {
  return (
    <InAppVideoPlayer
      videoId={props.videoId}
      shareUrl={props.shareUrl}
      streamUrl={props.streamUrl}
      username={props.username}
      poster={props.poster}
      title={props.title}
      autoPlay={props.autoplay ?? true}
      style={props.style}
    />
  );
}

export function tiktokEmbedSrc(
  videoId?: string | null,
  shareUrl?: string | null,
  _autoplay = true
): string | null {
  // Legacy helper: signal that a video id/url exists (playback is native, not iframe).
  return extractVideoId(videoId) || extractVideoId(shareUrl) || (shareUrl?.trim() ? shareUrl.trim() : null);
}

export function TikTokEmbedModal({
  shareUrl,
  videoId,
  streamUrl,
  username,
  poster,
  title = "Video",
  onClose,
}: {
  shareUrl?: string | null;
  videoId?: string | null;
  streamUrl?: string | null;
  username?: string | null;
  poster?: string | null;
  title?: string;
  onClose: () => void;
}) {
  const canPlay =
    Boolean(resolveInitialSrc(streamUrl)) ||
    Boolean(extractVideoId(videoId) || extractVideoId(shareUrl));
  if (!canPlay && !streamUrl) return null;

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
        <InAppVideoPlayer
          videoId={videoId}
          shareUrl={shareUrl}
          streamUrl={streamUrl}
          username={username}
          poster={poster}
          title={title}
          autoPlay
        />
      </div>
    </div>
  );
}
