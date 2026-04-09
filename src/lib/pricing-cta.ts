import { getBuildPriceId, getScalePriceId } from "@/lib/checkout";

export type PlanTier = "free" | "spark" | "build" | "scale";

export type PricingCtaKind = "try-free" | "current" | "upgrade" | "downgrade";

export type PricingCtaResult = {
  kind: PricingCtaKind;
  label: string;
  /** Target Stripe tier when kind === "upgrade" */
  upgradeTarget?: "build" | "scale";
};

/**
 * Labels and actions for Spark / Build / Scale pricing cards from the landing page spec.
 */
export function getPricingCta(
  card: PlanTier,
  options: { loggedIn: boolean; plan: PlanTier | null }
): PricingCtaResult {
  const { loggedIn, plan } = options;
  if (!loggedIn || plan === null) {
    return { kind: "try-free", label: "Try free" };
  }
  if (plan === "free" || (plan as string) === "free") {
    if (card === "spark") return { kind: "upgrade", label: "Upgrade to Spark →", upgradeTarget: undefined };
    if (card === "build") return { kind: "upgrade", label: "Upgrade to Build →", upgradeTarget: "build" };
    return { kind: "upgrade", label: "Upgrade to Scale →", upgradeTarget: "scale" };
  }
  if (plan === "spark") {
    if (card === "spark") return { kind: "current", label: "Current plan" };
    if (card === "build") {
      return {
        kind: "upgrade",
        label: "Upgrade to Build →",
        upgradeTarget: "build",
      };
    }
    return {
      kind: "upgrade",
      label: "Upgrade to Scale →",
      upgradeTarget: "scale",
    };
  }
  if (plan === "build") {
    if (card === "spark") return { kind: "downgrade", label: "Downgrade" };
    if (card === "build") return { kind: "current", label: "Current plan" };
    return {
      kind: "upgrade",
      label: "Upgrade to Scale →",
      upgradeTarget: "scale",
    };
  }
  if (card === "spark") return { kind: "downgrade", label: "Downgrade" };
  if (card === "build") return { kind: "downgrade", label: "Downgrade" };
  return { kind: "current", label: "Current plan" };
}

export function getPriceIdForUpgradeTarget(
  target: "build" | "scale"
): string | undefined {
  return target === "build" ? getBuildPriceId() : getScalePriceId();
}
