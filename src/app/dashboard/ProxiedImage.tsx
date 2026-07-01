"use client";

import { useCallback, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { clientImageUrl, imgProxyUrl } from "@/lib/client-image-url";

type ProxiedImageProps = {
  src?: string | null;
  /** Changes when the logical image owner changes (username, video key, etc.). */
  identity: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  style?: CSSProperties;
  className?: string;
  onLoad?: () => void;
  onFailed?: () => void;
};

export function ProxiedImage({
  src,
  identity,
  alt = "",
  width,
  height,
  priority = false,
  style,
  className,
  onLoad,
  onFailed,
}: ProxiedImageProps) {
  const raw = src?.trim() || "";
  const primary = useMemo(() => clientImageUrl(raw), [raw]);
  const [override, setOverride] = useState<string | null>(null);

  useLayoutEffect(() => {
    setOverride(null);
  }, [identity, primary]);

  const activeSrc = override ?? primary;

  const onError = useCallback(() => {
    if (!raw) {
      onFailed?.();
      return;
    }
    if (!override && primary && !primary.includes("/api/img-proxy")) {
      setOverride(imgProxyUrl(raw));
      return;
    }
    if (!override && primary.includes("/api/img-proxy")) {
      onFailed?.();
      return;
    }
    onFailed?.();
  }, [override, primary, raw, onFailed]);

  if (!activeSrc) return null;

  return (
    <img
      key={`${identity}:${activeSrc}`}
      src={activeSrc}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
