import { supabase } from "@/lib/supabase";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";

function priceIds(...keys: (string | undefined)[]): string[] {
  return keys.filter((id): id is string => !!id && id.trim().length > 0);
}

const GROWTH_PRICE_IDS = () =>
  priceIds(
    process.env.STRIPE_GROWTH_PRICE_ID,
    process.env.STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_BASIC_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID
  );

const PRO_PRICE_IDS = () =>
  priceIds(
    process.env.STRIPE_PRO2_PRICE_ID,
    process.env.STRIPE_PRO2_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_PRO_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID
  );

const SCALE_PRICE_IDS = () =>
  priceIds(
    process.env.STRIPE_SCALE_PRICE_ID,
    process.env.STRIPE_SCALE_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID
  );

const ANNUAL_PRICE_IDS = () =>
  priceIds(
    process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID
  );

const MONTHLY_PRICE_IDS = () =>
  priceIds(
    process.env.STRIPE_GROWTH_PRICE_ID,
    process.env.STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_PRICE_ID,
    process.env.STRIPE_PRO2_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_PRICE_ID,
    process.env.STRIPE_SCALE_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID
  );

export function isAnnualPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return ANNUAL_PRICE_IDS().includes(priceId);
}

export function priceBillingInterval(
  priceId: string | null | undefined
): "month" | "year" | null {
  if (!priceId) return null;
  if (ANNUAL_PRICE_IDS().includes(priceId)) return "year";
  if (MONTHLY_PRICE_IDS().includes(priceId)) return "month";
  return null;
}

/** Resolve Stripe price / checkout metadata to a profiles.plan value. */
export function resolvePlanFromCheckout(
  priceId: string | null | undefined,
  metadataPlan?: string | null
): PlanTier {
  const meta = normalizePlan(metadataPlan);
  if (!priceId) return meta;

  if (SCALE_PRICE_IDS().includes(priceId)) return "scale";
  if (PRO_PRICE_IDS().includes(priceId)) return "pro";
  if (GROWTH_PRICE_IDS().includes(priceId)) return "basic";

  return meta;
}

export function checkoutPlanMetadata(plan: PlanTier): string {
  if (plan === "basic") return "growth";
  return plan;
}

// Growth ($19/mo)
export function getGrowthPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID!
      : process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID!;
  }
  return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID!;
}

// Pro ($39/mo)
export function getProPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID!
      : process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID!;
  }
  return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID!;
}

// Scale ($99/mo)
export function getScalePriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID!
      : process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID!;
  }
  return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID!;
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
  options?: { cancelUrl?: string }
): Promise<void> {
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
