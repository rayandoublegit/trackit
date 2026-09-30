import { supabase } from "@/lib/supabase";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { Lang } from "@/lib/useLang";
import { getAppLang } from "@/lib/locale-preferences";
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

// Server errors are written in English; French visitors get a French message instead.
function checkoutErrorMessage(serverError: string | undefined, fallbackEn: string, fallbackFr: string, lang?: Lang): string {
  const current = lang ?? (typeof window !== "undefined" ? getAppLang() : "en");
  if (current === "fr") return fallbackFr;
  return serverError ?? fallbackEn;
}

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
export async function upgradeToPlanTier(
  tier: PaidPlanTier,
  lang: Lang,
  annual = false
): Promise<void> {
  const res = await fetch("/api/billing/change-plan", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, annual }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    updated?: boolean;
    noSubscription?: boolean;
    error?: string;
  };

  if (res.ok && payload.updated) {
    if (typeof window !== "undefined") {
      window.location.href = `${window.location.origin}/dashboard?view=billing&upgraded=true`;
    }
    return;
  }

  if (
    res.status === 401 ||
    (res.status === 404 && payload.noSubscription) ||
    payload.error === "Not configured"
  ) {
    await handleUpgrade(getPriceIdForPlanTier(tier, lang, annual) || "", {
      tier: tier === "basic" ? "growth" : tier,
      currency: checkoutCurrencyFromLang(lang),
      annual,
    });
    return;
  }

  throw new Error(
    checkoutErrorMessage(payload.error, "Could not change plan", "Impossible de changer de plan. Réessayez.", lang),
  );
}

export async function checkoutPlanTier(tier: PaidPlanTier, lang: Lang, annual = false): Promise<void> {
  await upgradeToPlanTier(tier, lang, annual);
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
  const resolved = resolvePlanFromCheckout(priceId, options?.tier === "growth" ? "basic" : options?.tier);
  if (resolved !== "free") {
    const whop = await fetch("/api/billing/whop-checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: resolved,
        annual: options?.annual ?? false,
        currency: options?.currency ?? "usd",
      }),
    });
    const whopPayload = (await whop.json().catch(() => ({}))) as { url?: string; error?: string; fallback?: boolean };
    if (whop.ok && whopPayload.url) {
      window.location.href = whopPayload.url;
      return;
    }
    if (!whopPayload.fallback && whop.status !== 401) {
      throw new Error(
        checkoutErrorMessage(whopPayload.error, "Could not start checkout", "Impossible de lancer le paiement. Réessayez."),
      );
    }
  }
  assertNonEmptyStripePriceId(priceId, envVarCandidates);
  const user = supabase
    ? (await supabase.auth.getUser()).data.user
    : null;
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard?view=billing`
      : undefined;
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      userId: user?.id,
      email: user?.email,
      cancelUrl: options?.cancelUrl ?? base,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      checkoutErrorMessage(payload.error, "Could not start checkout.", "Impossible de lancer le paiement. Réessayez."),
    );
  }
  if (payload.url) window.location.href = payload.url;
}

// Legacy aliases
export const getBuildPriceId = getProPriceId;
export const getSparkPriceId = getGrowthPriceId;
