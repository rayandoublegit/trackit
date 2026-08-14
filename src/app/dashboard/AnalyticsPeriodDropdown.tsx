"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_PERIOD_OPTIONS,
  analyticsPeriodLabel,
  type AnalyticsDateRange,
} from "@/lib/analytics-periods";

export const HERO_PERIOD_OPTIONS: AnalyticsDateRange[] = ["today", "3d", "7d", "30d", "90d"];

export function AnalyticsPeriodDropdown({
  value,
  onChange,
  lang,
  options = ANALYTICS_PERIOD_OPTIONS,
  align = "left",
  variant = "default",
}: {
  value: AnalyticsDateRange;
  onChange: (value: AnalyticsDateRange) => void;
  lang: "en" | "fr";
  options?: AnalyticsDateRange[];
  align?: "left" | "right";
  /** `subtle` matches the hero chart period control (bordered, compact). */
  variant?: "default" | "subtle";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const subtle = variant === "subtle";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: subtle ? "var(--ws-surface)" : "var(--ws-pill)",
          border: subtle ? "1px solid var(--ws-border)" : "none",
          borderRadius: subtle ? 8 : 10,
          padding: subtle ? "5px 10px" : "8px 12px",
          fontSize: subtle ? 12 : 13,
          fontWeight: 500,
          color: subtle ? "var(--ws-text-muted)" : "var(--ws-text)",
          letterSpacing: "-0.01em",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {analyticsPeriodLabel(value, lang)}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--ws-text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: align === "left" ? 0 : undefined,
            right: align === "right" ? 0 : undefined,
            minWidth: 196,
            background: "var(--ws-surface)",
            border: "1px solid var(--ws-border)",
            borderRadius: 12,
            boxShadow: "var(--ws-shadow)",
            padding: 6,
            zIndex: 50,
          }}
        >
          {options.map((period) => {
            const active = period === value;
            return (
              <button
                key={period}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(period);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: active ? "var(--ws-hover)" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 13,
                  color: "var(--ws-text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                }}
              >
                {analyticsPeriodLabel(period, lang)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
