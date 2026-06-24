import type { ReactNode } from "react";

type TaglineIconVariant = "features" | "process" | "why" | "pricing";

const svgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
} as const;

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons: Record<TaglineIconVariant, ReactNode> = {
  features: (
    <img
      src="/images/trackit-mark.svg"
      alt=""
      className="tagline-icon-mark"
      width={16}
      height={15}
    />
  ),
  process: (
    <svg {...svgProps}>
      <rect x="1.5" y="10" width="2.75" height="4" rx="0.75" fill="currentColor" opacity="0.28" />
      <rect x="5.1" y="7.5" width="2.75" height="6.5" rx="0.75" fill="currentColor" opacity="0.5" />
      <rect x="8.7" y="5" width="2.75" height="9" rx="0.75" fill="currentColor" opacity="0.72" />
      <rect x="12.3" y="2.5" width="2.75" height="11.5" rx="0.75" fill="currentColor" />
      <path d="M2.9 10.2 6.5 7.7 10.1 5.2 13.7 2.7" {...stroke} strokeWidth={1} opacity={0.55} />
    </svg>
  ),
  why: (
    <svg {...svgProps}>
      <path
        d="M8 2.5c2.2 0 4 1.65 4 3.7 0 1.35-.7 2.4-1.75 3.05-.5.32-.85.88-.85 1.48V11.5"
        {...stroke}
      />
      <path d="M6.35 12.75h3.3" {...stroke} />
      <path d="M6.85 14.25h2.3" {...stroke} />
      <path
        d="M8 1.75v.85M10.85 2.55l-.55.55M12.1 5.25h-.85M10.85 7.95l.55.55M5.15 7.95l-.55.55M3.9 5.25h.85M5.15 2.55l.55.55"
        {...stroke}
        strokeWidth={0.9}
        opacity={0.85}
      />
    </svg>
  ),
  pricing: (
    <svg {...svgProps}>
      <path
        d="M4.5 3.5 8 2l4.5 2.5v5.5L8 13.5 3.5 11V3.5z"
        {...stroke}
      />
      <circle cx="6.25" cy="5.5" r="0.85" fill="currentColor" stroke="none" />
      <path
        d="M9.75 8.25c0 .75-.6 1.35-1.45 1.35S6.85 9 6.85 8.25s.6-1.35 1.45-1.35S9.75 7.5 9.75 8.25z"
        {...stroke}
      />
    </svg>
  ),
};

export function TaglineIcon({ variant }: { variant: TaglineIconVariant }) {
  return (
    <span className={`tagline-icon${variant === "features" ? " tagline-icon--trackit" : ""}`}>
      {icons[variant]}
    </span>
  );
}
