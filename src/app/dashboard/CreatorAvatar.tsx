"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCachedAvatarUrl, isPersistableAvatarUrl, setCachedAvatarUrl } from "@/lib/avatar-url-cache";
import { normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
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

function resolveTargetSrc(displaySrc: string, username: string, rawSrc?: string | null): string {
  const cached = username ? getCachedAvatarUrl(username) : null;
  if (cached && isStableAvatarStorageUrl(cached)) return cached;
  if (displaySrc) return displaySrc;
  if (cached) return cached;
  if (username) return creatorAvatarApiUrl(username, rawSrc);
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
    () => resolveTargetSrc(displaySrc, resolvedUsername, src),
    [displaySrc, resolvedUsername, src],
  );

  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const failStepRef = useRef(0);
  const activeSrc = overrideSrc ?? targetSrc;

  useLayoutEffect(() => {
    failStepRef.current = 0;
    setOverrideSrc(null);
  }, [resolvedUsername, displaySrc, targetSrc]);

  const onError = useCallback(() => {
    const step = failStepRef.current;
    failStepRef.current += 1;

    if (step === 0 && resolvedUsername) {
      const api = creatorAvatarApiUrl(resolvedUsername, src);
      if (api && activeSrc !== api) {
        setOverrideSrc(api);
        return;
      }
    }
    if (step === 1 && displaySrc && displaySrc !== activeSrc && !displaySrc.includes("/api/creator-avatar")) {
      setOverrideSrc(displaySrc);
      return;
    }
    setOverrideSrc("");
  }, [activeSrc, displaySrc, resolvedUsername, src]);

  const onLoad = useCallback(() => {
    if (resolvedUsername && activeSrc && isPersistableAvatarUrl(activeSrc)) {
      setCachedAvatarUrl(resolvedUsername, activeSrc);
    }
  }, [activeSrc, resolvedUsername]);

  if (!activeSrc) {
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
      key={`${resolvedUsername}:${activeSrc}`}
      src={activeSrc}
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

/** Pick the best avatar when merging feed + API rows (drawer refresh). */
export function mergeCreatorAvatarSrc(
  username: string,
  ...candidates: Array<string | null | undefined>
): string {
  const best = pickBestCreatorAvatar(...candidates);
  return feedAvatarUrlForCreator(username, best);
}
