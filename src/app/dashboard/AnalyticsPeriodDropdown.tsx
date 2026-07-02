"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_PERIOD_OPTIONS,
  analyticsPeriodLabel,
  type AnalyticsDateRange,
} from "@/lib/analytics-periods";

export function AnalyticsPeriodDropdown({
  value,
  onChange,
  lang,
  options = ANALYTICS_PERIOD_OPTIONS,
  align = "left",
}: {
  value: AnalyticsDateRange;
  onChange: (value: AnalyticsDateRange) => void;
  lang: "en" | "fr";
  options?: AnalyticsDateRange[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#F5F5F5",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 500,
          color: "#1A1A1A",
          letterSpacing: "-0.02em",
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
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#6B7280" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
            padding: 6,
            zIndex: 40,
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
                  background: active ? "#F5F5F5" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 13,
                  color: "#1A1A1A",
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
