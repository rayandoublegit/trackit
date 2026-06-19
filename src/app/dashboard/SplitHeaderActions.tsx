"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type SplitMenuItem = {
  label: string;
  onClick: () => void;
  icon: ReactNode;
};

export function SplitHeaderActions({
  primaryLabel,
  onPrimaryClick,
  sectionLabel,
  menuItems,
  menuAriaLabel,
}: {
  primaryLabel: string;
  onPrimaryClick: () => void;
  sectionLabel?: string;
  menuItems: SplitMenuItem[];
  menuAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "stretch", flexShrink: 0 }}>
      <button
        type="button"
        className="hero-cta-shopify hero-cta-compact"
        onClick={onPrimaryClick}
        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, paddingRight: 18, paddingLeft: 18, fontSize: 14, letterSpacing: "-0.03em" }}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className="hero-cta-shopify hero-cta-compact"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={menuAriaLabel ?? "More actions"}
        style={{
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: "1px solid rgba(255,255,255,0.28)",
          paddingLeft: 11,
          paddingRight: 11,
          minWidth: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="split-header-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 248,
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 71, 255, 0.06)",
            padding: "8px",
            zIndex: 40,
          }}
        >
          {sectionLabel && <div className="split-header-menu-section">{sectionLabel}</div>}
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="split-header-menu-item"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              <span className="split-header-menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
