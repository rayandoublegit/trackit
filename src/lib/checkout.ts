import { supabase } from "@/lib/supabase";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import {
  annualPriceIds,
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
  growthPriceIds,
  monthlyPriceIds,
  proPriceIds,
  scalePriceIds,
  assertNonEmptyStripePriceId,
  stripePriceEnvCandidates,
} from "@/lib/stripe-config";

export {
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
} from "@/lib/stripe-config";

export function isAnnualPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return annualPriceIds().includes(priceId);
}

export function priceBillingInterval(
  priceId: string | null | undefined
): "month" | "year" | null {
  if (!priceId) return null;
  if (annualPriceIds().includes(priceId)) return "year";
  if (monthlyPriceIds().includes(priceId)) return "month";
  return null;
}

/** Resolve Stripe price / checkout metadata to a profiles.plan value. */
export function resolvePlanFromCheckout(
  priceId: string | null | undefined,
  metadataPlan?: string | null
): PlanTier {
  const meta = normalizePlan(metadataPlan);
  if (!priceId) return meta;

  if (scalePriceIds().includes(priceId)) return "scale";
  if (proPriceIds().includes(priceId)) return "pro";
  if (growthPriceIds().includes(priceId)) return "basic";

  return meta;
}

export function checkoutPlanMetadata(plan: PlanTier): string {
  if (plan === "basic") return "growth";
  return plan;
}

export function getPriceIdForUpgrade(
  plan: string,
  currency: "usd" | "eur" = "usd",
  annual = false
): string | undefined {
  if (plan === "free") return getGrowthPriceId(currency, annual);
  if (plan === "growth") return getProPriceId(currency, annual);
  if (plan === "pro") return getScalePriceId(currency, annual);
  return undefined;
}

export async function handleUpgrade(
  priceId: string,
  options?: { cancelUrl?: string; tier?: "growth" | "pro" | "scale"; currency?: "usd" | "eur"; annual?: boolean }
): Promise<void> {
  const envVarCandidates =
    options?.tier != null
      ? stripePriceEnvCandidates(options.tier, options.currency ?? "usd", options.annual ?? false)
      : [
          ...stripePriceEnvCandidates("growth", "usd", false),
          ...stripePriceEnvCandidates("pro", "usd", false),
          ...stripePriceEnvCandidates("scale", "usd", false),
        ];
  assertNonEmptyStripePriceId(priceId, envVarCandidates);
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard?view=billing`
      : undefined;
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      userId: user?.id,
      email: user?.email,
      cancelUrl: options?.cancelUrl ?? base,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) throw new Error(payload.error ?? "Could not start checkout.");
  if (payload.url) window.location.href = payload.url;
}

// Legacy aliases
export const getBuildPriceId = getProPriceId;
export const getSparkPriceId = getGrowthPriceId;
