export const pricingCheckIcon = (
  <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 12l3 3 5-6M11 15l3 3 6-9"
      stroke="#9A9A9A"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function PricingFeatureList({ features }: { features: string[] }) {
  return (
    <div className="pricing-features">
      {features.map((label) => (
        <div key={label} className="pricing-feature">
          {pricingCheckIcon}
          {label}
        </div>
      ))}
    </div>
  );
}
