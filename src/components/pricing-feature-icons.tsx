import type { ReactNode } from "react";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  "aria-hidden": true as const,
};

const STROKE = "#2E2E2E";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg {...ICON_PROPS} className="pricing-feature-icon">
      {children}
    </svg>
  );
}

function ShopifyIcon() {
  return (
    <img
      src="/shopify-logo.svg"
      alt=""
      width={20}
      height={20}
      className="pricing-feature-icon pricing-feature-icon-shopify"
      aria-hidden
    />
  );
}

const icons: Record<string, ReactNode> = {
  discoveries: (
    <Icon>
      <circle cx="11" cy="11" r="6.5" stroke={STROKE} strokeWidth="1.6" />
      <path d="M16.5 16.5L21 21" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.5 11h5M11 8.5v5" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="6.5" stroke={STROKE} strokeWidth="1.6" />
      <path d="M16.5 16.5L21 21" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  ),
  creators: (
    <Icon>
      <circle cx="9" cy="9" r="3" stroke={STROKE} strokeWidth="1.6" />
      <path d="M3.5 19c.8-2.8 2.8-4.5 5.5-4.5s4.7 1.7 5.5 4.5" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17.5" cy="8.5" r="2.2" stroke={STROKE} strokeWidth="1.4" />
      <path d="M15 15.5c1.6.4 2.8 1.5 3.3 3.5" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
    </Icon>
  ),
  save: (
    <Icon>
      <path d="M6 4h10l3 3v13H6V4z" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 4v5h6V4" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
  campaigns: (
    <Icon>
      <path d="M5 7h11v10H5z" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 10l4-1.5v7L16 14" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
  templates: (
    <Icon>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke={STROKE} strokeWidth="1.6" />
      <path d="M7 10h10M7 13.5h6.5" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  ),
  commissions: (
    <Icon>
      <path d="M5 17V9.5l4-2 4 2V17" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 7.5V5l4-2 4 2v9.5" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
  payout: (
    <Icon>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" stroke={STROKE} strokeWidth="1.6" />
      <path d="M3.5 10.5h17" stroke={STROKE} strokeWidth="1.6" />
      <path d="M7.5 15h3" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  ),
  affiliate: (
    <Icon>
      <path d="M10 14a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke={STROKE} strokeWidth="1.6" />
      <path d="M14.2 9.8l5.3-5.3M14.2 14.2l5.3 5.3" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  ),
  "creator-dashboard": (
    <Icon>
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke={STROKE} strokeWidth="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke={STROKE} strokeWidth="1.6" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" stroke={STROKE} strokeWidth="1.6" />
    </Icon>
  ),
  "creator-content": (
    <Icon>
      <rect x="4" y="5" width="16" height="12" rx="2" stroke={STROKE} strokeWidth="1.6" />
      <path d="M9 14l2.5-2.5L14 14l3-3" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9.5" r="1.2" fill={STROKE} />
    </Icon>
  ),
  shopify: <ShopifyIcon />,
  automation: (
    <Icon>
      <path d="M12 3v3M12 18v3M4.2 5.2l2.1 2.1M17.7 16.7l2.1 2.1M3 12h3M18 12h3" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" stroke={STROKE} strokeWidth="1.6" />
    </Icon>
  ),
  "includes-starter": (
    <Icon>
      <path d="M12 4l7 4-7 4-7-4 7-4z" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 13l7 4 7-4" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
  "includes-pro": (
    <Icon>
      <path d="M12 4l7 4-7 4-7-4 7-4z" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 13l7 4 7-4M5 17l7 4 7-4" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
  support: (
    <Icon>
      <path d="M5 10a7 7 0 0 1 14 0v3.5a2 2 0 0 1-2 2h-1.2l-1.8 2.5-1.8-2.5H7a2 2 0 0 1-2-2V10z" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  ),
};

const fallback = (
  <Icon>
    <path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

export function PricingFeatureIcon({ id }: { id: string }) {
  return icons[id] ?? fallback;
}
