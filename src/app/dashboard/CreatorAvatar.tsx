"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCachedAvatarUrl, isPersistableAvatarUrl, setCachedAvatarUrl } from "@/lib/avatar-url-cache";
import { normalizeCreatorHandle } from "@/lib/creator-avatar";
import {
  creatorAvatarApiUrl,
  feedAvatarUrlForCreator,
  isStableAvatarStorageUrl,
} from "@/lib/feed-avatar-url";

function ProfileIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.52);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" fill="#B5B5B5" />
      <path d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#B5B5B5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function isStableAvatarUrl(url: string): boolean {
  return isStableAvatarStorageUrl(url);
}

function resolveDisplaySrc(username: string, src?: string | null): string {
  return feedAvatarUrlForCreator(username, src);
}

function resolveInitialSrc(displaySrc: string, username: string): string {
  const cached = username ? getCachedAvatarUrl(username) : null;
  if (cached && isStableAvatarStorageUrl(cached)) return cached;
  if (displaySrc) return displaySrc;
  if (cached) return cached;
  if (username) return creatorAvatarApiUrl(username);
  return "";
}

export function CreatorAvatar({
  src,
  username,
  handle,
  displayName,
  size = 32,
  alt = "",
  priority = false,
}: {
  src?: string | null;
  username?: string;
  handle?: string;
  displayName?: string;
  size?: number;
  alt?: string;
  priority?: boolean;
}) {
  const resolvedUsername = normalizeCreatorHandle(username ?? handle);

  const displaySrc = useMemo(
    () => resolveDisplaySrc(resolvedUsername, src),
    [src, resolvedUsername],
  );

  const targetSrc = useMemo(
    () => resolveInitialSrc(displaySrc, resolvedUsername),
    [displaySrc, resolvedUsername],
  );

  const [imgSrc, setImgSrc] = useState(targetSrc);
  const [showFallback, setShowFallback] = useState(!targetSrc);
  const failStepRef = useRef(0);

  useEffect(() => {
    failStepRef.current = 0;
    setImgSrc(targetSrc);
    setShowFallback(!targetSrc);
  }, [targetSrc, resolvedUsername]);

  const onError = useCallback(() => {
    const step = failStepRef.current;
    failStepRef.current += 1;

    if (step === 0 && resolvedUsername) {
      const api = creatorAvatarApiUrl(resolvedUsername);
      if (api && imgSrc !== api) {
        setImgSrc(api);
        setShowFallback(false);
        return;
      }
    }
    if (step === 1 && displaySrc && displaySrc !== imgSrc) {
      setImgSrc(displaySrc);
      setShowFallback(false);
      return;
    }
    setShowFallback(true);
  }, [displaySrc, imgSrc, resolvedUsername]);

  const onLoad = useCallback(() => {
    if (resolvedUsername && imgSrc && isPersistableAvatarUrl(imgSrc)) {
      setCachedAvatarUrl(resolvedUsername, imgSrc);
    }
    setShowFallback(false);
  }, [imgSrc, resolvedUsername]);

  if (showFallback || !imgSrc) {
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
      key={resolvedUsername}
      src={imgSrc}
      alt={alt || displayName || resolvedUsername || ""}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        background: "#F0F0F0",
      }}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
