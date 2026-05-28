import { supabase } from "@/lib/supabase";

// Growth ($19/mo)
export function getGrowthPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID!;
  return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID!;
}

// Pro ($39/mo)
export function getProPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID!;
  return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID!;
}

// Scale ($99/mo)
export function getScalePriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) return currency === "eur"
    ? process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID!
    : process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID!;
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

export async function handleUpgrade(priceId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId, userId: user?.id, email: user?.email }),
  });
  const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) throw new Error(payload.error ?? "Could not start checkout.");
  if (payload.url) window.location.href = payload.url;
}

// Legacy aliases
export const getBuildPriceId = getProPriceId;
export const getSparkPriceId = getGrowthPriceId;
