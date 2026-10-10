"use client";

import { useEffect, useState } from "react";

/**
 * A video cover that never blocks the page: lazy, sized up front (the parent
 * keeps the aspect ratio), and `fallback` (a route that refetches the cover) is
 * only requested when `src` fails. Renders nothing when both fail, so the
 * parent's placeholder background shows.
 */
export function CoverImage({
  src,
  fallback,
  width,
  height,
  priority = false,
}: {
  src: string;
  fallback?: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  const [current, setCurrent] = useState(src || fallback || "");
  useEffect(() => setCurrent(src || fallback || ""), [src, fallback]);
  if (!current) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt=""
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setCurrent((prev) => (fallback && prev !== fallback ? fallback : ""))}
    />
  );
}
