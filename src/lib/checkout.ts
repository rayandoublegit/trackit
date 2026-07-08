import { supabase } from "@/lib/supabase";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { Lang } from "@/lib/useLang";
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

export type PaidPlanTier = Exclude<PlanTier, "free">;

function checkoutCurrencyFromLang(lang: Lang): "usd" | "eur" {
  return lang === "fr" ? "eur" : "usd";
}

/** Stripe price ID for a dashboard plan tier (lang → EUR/USD). */
export function getPriceIdForPlanTier(tier: PaidPlanTier, lang: Lang, annual = false): string {
  const currency = checkoutCurrencyFromLang(lang);
  if (tier === "basic") return getGrowthPriceId(currency, annual);
  if (tier === "pro") return getProPriceId(currency, annual);
  return getScalePriceId(currency, annual);
}

/** Start Stripe checkout for a plan tier from an upgrade gate or modal. */
export async function checkoutPlanTier(tier: PaidPlanTier, lang: Lang, annual = false): Promise<void> {
  await handleUpgrade(getPriceIdForPlanTier(tier, lang, annual));
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
