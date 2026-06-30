"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type SplitMenuItem = {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  danger?: boolean;
};

export function SplitHeaderActions({
  primaryLabel,
  onPrimaryClick,
  sectionLabel,
  menuItems,
  menuAriaLabel,
  variant = "primary",
  size = "default",
  menuPlacement = "below",
  menuOffsetLeft,
}: {
  primaryLabel: string;
  onPrimaryClick: () => void;
  sectionLabel?: string;
  menuItems: SplitMenuItem[];
  menuAriaLabel?: string;
  variant?: "primary" | "white";
  size?: "default" | "compact" | "sm";
  menuPlacement?: "below" | "above";
  menuOffsetLeft?: number;
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

  const btnClass =
    variant === "white"
      ? "hero-cta-shopify-light"
      : "hero-cta-shopify";
  const sizeClass = size === "sm" ? "hero-cta-compact-sm" : size === "compact" ? "hero-cta-compact" : "";
  const dividerColor = variant === "white" ? "#E5E5E5" : "rgba(255,255,255,0.28)";
  const primaryPadding =
    size === "sm"
      ? { padding: "8px 12px", fontSize: 12 }
      : size === "compact"
        ? { padding: "9px 14px", fontSize: 13 }
        : { padding: "12px 18px", fontSize: 14 };
  const chevronPadding =
    size === "sm"
      ? { paddingLeft: 8, paddingRight: 8, minWidth: 32 }
      : size === "compact"
        ? { paddingLeft: 9, paddingRight: 9, minWidth: 36 }
        : { paddingLeft: 11, paddingRight: 11, minWidth: 40 };
  const chevronIconSize = size === "sm" ? 12 : size === "compact" ? 13 : 14;

  if (menuItems.length === 0) {
    return (
      <button
        type="button"
        className={`${btnClass} ${sizeClass}`.trim()}
        onClick={(e) => {
          e.stopPropagation();
          onPrimaryClick();
        }}
        style={{
          ...primaryPadding,
          letterSpacing: "-0.03em",
        }}
      >
        {primaryLabel}
      </button>
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "stretch", flexShrink: 0 }}>
      <button
        type="button"
        className={`${btnClass} ${sizeClass}`.trim()}
        onClick={(e) => {
          e.stopPropagation();
          onPrimaryClick();
        }}
        style={{
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          ...primaryPadding,
          letterSpacing: "-0.03em",
        }}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className={`${btnClass} ${sizeClass}`.trim()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={menuAriaLabel ?? "More actions"}
        style={{
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: `1px solid ${dividerColor}`,
          ...chevronPadding,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={chevronIconSize}
          height={chevronIconSize}
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
            ...(menuPlacement === "above"
              ? { bottom: "calc(100% + 10px)", top: "auto" }
              : { top: "calc(100% + 10px)" }),
            ...(menuOffsetLeft !== undefined ? { left: menuOffsetLeft, right: "auto" } : { right: 0 }),
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
              className={item.danger ? "split-header-menu-item split-header-menu-item-danger" : "split-header-menu-item"}
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
