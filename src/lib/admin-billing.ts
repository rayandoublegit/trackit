import { compAccess } from "@/lib/comp-plan";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";

export type BillingSource = "stripe" | "whop" | "comped" | "gifted" | "free";

export type BillingProfile = {
  plan: string | null;
  subscription_active: boolean | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
};

/** Who pays for this account, as the product enforces it today. */
export function billingOf(user: BillingProfile, now = Date.now()): { source: BillingSource; plan: PlanTier; until: string | null } {
  const access = compAccess(user.subscription_status, now);
  if (access.kind === "comp") return { source: "comped", plan: normalizePlan(user.plan), until: null };
  if (access.kind === "gift") {
    return access.active
      ? { source: "gifted", plan: normalizePlan(user.plan), until: access.until }
      : { source: "free", plan: "free", until: null };
  }
  const plan = normalizePlan(user.plan);
  if (plan === "free") return { source: "free", plan, until: null };
  if ((user.subscription_status ?? "").toLowerCase().startsWith("whop:")) return { source: "whop", plan, until: null };
  if (user.stripe_subscription_id || user.subscription_active) return { source: "stripe", plan, until: null };
  return { source: "free", plan: "free", until: null };
}

export const PLAN_LABELS: Record<PlanTier, string> = { free: "Gratuit", basic: "Growth", pro: "Pro", scale: "Scale" };

export const BILLING_LABELS: Record<BillingSource, string> = {
  stripe: "Stripe",
  whop: "Whop",
  comped: "Offert (permanent)",
  gifted: "Offert (temporaire)",
  free: "Gratuit",
};

export function isPaying(source: BillingSource): boolean {
  return source === "stripe" || source === "whop";
}

export function isOffered(source: BillingSource): boolean {
  return source === "comped" || source === "gifted";
}
