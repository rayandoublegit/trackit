import type { PricingHighlight } from "@/lib/plan-pricing-highlights";
import { formatPricingHighlightLine } from "@/lib/plan-pricing-highlights";
import { PricingFeatureIcon } from "@/components/pricing-feature-icons";

export function PricingFeatureList({ features }: { features: PricingHighlight[] }) {
  return (
    <div className="pricing-features">
      {features.map((item) => (
        <div key={item.id} className="pricing-feature">
          <PricingFeatureIcon id={item.id} />
          {formatPricingHighlightLine(item)}
        </div>
      ))}
    </div>
  );
}
