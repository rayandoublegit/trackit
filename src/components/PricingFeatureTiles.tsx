import type { PricingHighlight, PricingHighlightIcon } from "@/lib/plan-pricing-highlights";

function HighlightIcon({ icon }: { icon: PricingHighlightIcon }) {
  const stroke = "#FFFFFF";

  switch (icon) {
    case "discover":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke={stroke} strokeWidth="1.8" />
          <path d="M20 20l-4-4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h14" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "campaign":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 7h14v12H5z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "creators":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="8" r="3" stroke={stroke} strokeWidth="1.7" />
          <path d="M4 19c.8-2.8 2.8-4.5 5-4.5s4.2 1.7 5 4.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="17" cy="9" r="2.2" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case "portal":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="5" width="16" height="14" rx="2.5" stroke={stroke} strokeWidth="1.7" />
          <path d="M4 10h16M9 15h3" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "content":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 4h10l3 3v13H4V4h3z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M14 4v4h4M9 13h6M9 17h4" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "templates":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M8 4h12v16H8z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M4 8h4v12H4z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "payout":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth="1.8" />
          <path d="M12 8v8M9.5 10.5c0-.8.7-1.5 2.5-1.5s2.5.7 2.5 1.5-1.1 1.5-2.5 1.5-2.5.8-2.5 2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "analytics":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 18V9M10 18V5M15 18v-6M20 18v-9" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "shopify":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 8h15l-1.5 13H7.5L6 8z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 8c0-2 1.5-3 3-3s3 1 3 3" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "automation":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M13 3L5 14h6l-1 7 9-12h-6l0-6z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "support":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 14a8 8 0 1 1 16 0v2a2 2 0 0 1-2 2h-1.5l-2.5 3v-5H8a2 2 0 0 1-2-2v-2z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "link":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M10 13a4 4 0 0 0 5.7.1M14 7.5a4.5 4.5 0 1 1 0 6.4M10 17.6a4.5 4.5 0 1 1 0-6.4" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "stack":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 4l8 4.5v9L12 22l-8-4.5v-9L12 4z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 12l8-3.5M12 12v10M12 12L4 8.5" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case "infinity":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6.5 12c0-2.2 1.8-4 4-4 1.2 0 2.2.6 2.9 1.5.7-.9 1.7-1.5 2.9-1.5 2.2 0 4 1.8 4 4s-1.8 4-4 4c-1.2 0-2.2-.6-2.9-1.5-.7.9-1.7 1.5-2.9 1.5-2.2 0-4-1.8-4-4z"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export function PricingFeatureTiles({
  highlights,
  hero,
}: {
  highlights: PricingHighlight[];
  hero?: boolean;
}) {
  return (
    <div className={`pricing-highlights${hero ? " pricing-highlights--hero" : ""}`}>
      {highlights.map((item) => (
        <div key={item.id} className="pricing-highlight">
          <span className="pricing-highlight__icon" aria-hidden>
            <HighlightIcon icon={item.icon} />
          </span>
          <span className="pricing-highlight__text">
            <span className="pricing-highlight__label">{item.label}</span>
            <span className="pricing-highlight__value">{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
