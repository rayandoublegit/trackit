"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from 0 to `target` on mount, then from the shown value to each new target. */
export function useCountUp(target: number, durationMs = 1100, delayMs = 0): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frame = useRef<number | null>(null);
  const shown = useRef(value);
  shown.current = value;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    let start: number | null = null;
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (target - from) * eased);
        if (t < 1) frame.current = window.requestAnimationFrame(tick);
      };
      frame.current = window.requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, delayMs]);

  return value;
}

export function CountUp({
  value,
  format,
  delayMs,
}: {
  value: number;
  format: (n: number) => string;
  delayMs?: number;
}) {
  const current = useCountUp(value, 1100, delayMs);
  return <>{format(current)}</>;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SampleAvatar({ name, hue, size = 32 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      className="sp-avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 80% 72%), hsl(${(hue + 40) % 360} 70% 56%))`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Rotates through `items`, prepending one every `everyMs`, keeping `keep` visible.
 * Pauses while `hostRef` is not rendered (a hidden dashboard pane) or the tab is hidden.
 */
export function useLiveFeed<T>(
  items: T[],
  keep = 5,
  everyMs = 2600,
  hostRef?: RefObject<HTMLElement | null>,
): { item: T; key: number }[] {
  const [feed, setFeed] = useState(() =>
    items.slice(0, Math.min(keep, items.length)).map((item, i) => ({ item, key: i })),
  );
  const cursor = useRef(Math.min(keep, items.length));

  useEffect(() => {
    setFeed(items.slice(0, Math.min(keep, items.length)).map((item, i) => ({ item, key: i })));
    cursor.current = Math.min(keep, items.length);
    if (items.length <= 1 || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (hostRef?.current && hostRef.current.offsetParent === null) return;
      const next = items[cursor.current % items.length];
      const key = cursor.current;
      cursor.current += 1;
      setFeed((list) => [{ item: next, key }, ...list].slice(0, keep));
    }, everyMs);
    return () => window.clearInterval(id);
  }, [items, keep, everyMs, hostRef]);

  return feed;
}
