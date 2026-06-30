import type { PlanTier } from "@/lib/plan-limits";
import type { BillingInterval } from "@/lib/stripe-billing";

export type PaidTier = "basic" | "pro" | "scale";
export type PlanCtaAction = "current" | "upgrade" | "downgrade";

export const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  scale: 3,
};

/** Same rules as dashboard BillingView / PricingPlans. */
export function planCtaAction(
  current: PlanTier,
  target: PaidTier,
  subscriptionInterval: BillingInterval | null,
  viewAnnual: boolean,
): PlanCtaAction {
  const viewInterval: BillingInterval = viewAnnual ? "year" : "month";
  const sameTier = PLAN_RANK[current] === PLAN_RANK[target];
  const tierDiff = PLAN_RANK[target] - PLAN_RANK[current];

  if (sameTier) {
    if (!subscriptionInterval || subscriptionInterval === viewInterval) return "current";
    if (viewAnnual && subscriptionInterval === "month") return "upgrade";
    if (!viewAnnual && subscriptionInterval === "year") return "downgrade";
    return "current";
  }

  if (viewAnnual) return "upgrade";
  if (tierDiff > 0) return "upgrade";
  return "downgrade";
}

export function planCtaLabel(
  lang: "fr" | "en",
  action: PlanCtaAction,
  cardName: string,
  currentPlan: PlanTier,
  target: PaidTier,
  subscriptionInterval: BillingInterval | null,
  viewAnnual: boolean,
): string {
  if (action === "current") return lang === "fr" ? "Plan actuel" : "Current plan";

  const sameTier = PLAN_RANK[currentPlan] === PLAN_RANK[target];
  if (action === "upgrade" && sameTier && viewAnnual && subscriptionInterval === "month") {
    return lang === "fr" ? "Passer à l'annuel" : "Switch to annual";
  }
  if (action === "upgrade") {
    if (viewAnnual && PLAN_RANK[target] < PLAN_RANK[currentPlan]) {
      return lang === "fr" ? `Choisir ${cardName} annuel` : `Choose annual ${cardName}`;
    }
    return lang === "fr" ? `Passer à ${cardName}` : `Upgrade to ${cardName}`;
  }
  if (!viewAnnual && sameTier && subscriptionInterval === "year") {
    return lang === "fr" ? "Passer au mensuel" : "Switch to monthly";
  }
  return lang === "fr" ? "Rétrograder" : "Downgrade";
}
