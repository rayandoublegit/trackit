"use client";

import type { ReactNode } from "react";
import { UpgradeGate } from "@/components/UpgradeGate";
import type { PlanTier } from "@/lib/plan-limits";
import { isFeatureAllowed, runGateUpgrade, type GateFeatureKey } from "@/lib/plan-marketing";
import type { Lang } from "@/lib/useLang";

/**
 * Page-level paywall for a dashboard view: the view when the plan includes the
 * feature (FEATURE_GATES, lib/plan-marketing), otherwise the upgrade page.
 * `enabled` false (creator accounts, which never pay) always shows the view.
 */
export function PlanGate({
  feature,
  plan,
  lang,
  isMobile,
  enabled = true,
  onViewPricing,
  children,
}: {
  feature: GateFeatureKey;
  plan: PlanTier;
  lang: Lang;
  isMobile?: boolean;
  enabled?: boolean;
  onViewPricing?: () => void;
  children: ReactNode;
}) {
  if (!enabled || isFeatureAllowed(feature, plan)) return <>{children}</>;
  return (
    <UpgradeGate
      featureKey={feature}
      lang={lang}
      isMobile={isMobile}
      onUpgrade={() => runGateUpgrade(feature, lang)}
      onViewPricing={onViewPricing}
    />
  );
}
