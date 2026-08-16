"use client";

import { useStripePrices } from "@/lib/use-stripe-prices";
import { planDisplayName as marketingPlanDisplayName } from "@/lib/plan-marketing";
import { freePlanBadgeLabel, preferFreeCtaLabel } from "@/lib/pricing-cta";
import type { OnboardingSavePayload } from "@/lib/onboarding-save";
import type { BillingInterval } from "@/lib/stripe-billing";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { useLang } from "@/lib/useLang";
import { PricingBento } from "@/components/PricingBento";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export type PricingPlansProps = {
  title?: string;
  subtitle?: string;
  tagline?: string;
  showCurrentPlanBadge?: boolean;
  showLogo?: boolean;
  paidCtaLabel?: string;
  currentPlan?: PlanTier;
  subscriptionInterval?: BillingInterval | null;
  loadingPlan?: boolean;
  cancelUrl?: string;
  userId?: string;
  userEmail?: string;
  /** Optional non-card CTA under the grid (e.g. onboarding continue free). */
  onStayFree?: () => void;
  stayFreeLabel?: string;
  /** Same checkout as /pricing; onboarding data is saved server-side in create-checkout. */
  getOnboardingPayload?: () => Promise<OnboardingSavePayload | null> | OnboardingSavePayload | null;
  /** @deprecated Prefer getOnboardingPayload — kept for legacy callers. */
  onBeforeCheckout?: () => Promise<boolean>;
};

export function PricingPlans({
  title,
  subtitle,
  tagline,
  showCurrentPlanBadge = true,
  showLogo = true,
  paidCtaLabel,
  currentPlan = "free",
  subscriptionInterval = null,
  loadingPlan = false,
  cancelUrl,
  userId,
  userEmail,
  onStayFree,
  stayFreeLabel,
  getOnboardingPayload,
  onBeforeCheckout,
}: PricingPlansProps) {
  const lang = useLang();
  const { prices, loading: loadingPrices } = useStripePrices();
  const plan = normalizePlan(currentPlan);

  const defaultTitle = lang === "fr" ? "Choisis le plan qui te convient" : "Choose the plan that fits";
  const defaultSubtitle =
    lang === "fr"
      ? "Même pricing que sur le site, avec les vrais checkouts Stripe."
      : "Same pricing as the website, with the live Stripe checkouts.";
  const defaultTagline = lang === "fr" ? "Tarifs" : "Pricing";
  const planDisplayName = marketingPlanDisplayName(plan, lang);
  const freeLinkLabel = stayFreeLabel ?? preferFreeCtaLabel(lang);

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        {showLogo ? (
          <img src={TRACKIT_LOGO_URL} alt="Trackit" style={{ height: 72, width: "auto", margin: "0 auto 18px", display: "block" }} />
        ) : null}
        <div className="tagline" style={{ justifyContent: "center", marginBottom: 8 }}>
          {tagline ?? defaultTagline}
        </div>
        <h1 className="section-title" style={{ marginBottom: 10, letterSpacing: "-0.025em" }}>
          {title ?? defaultTitle}
        </h1>
        <p className="section-sub" style={{ maxWidth: 680, margin: "0 auto" }}>
          {subtitle ?? defaultSubtitle}
        </p>
        {!loadingPrices && !prices.growth.usd.month && (
          <p style={{ marginTop: 12, fontSize: 14, color: "#B45309", letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Les checkouts payants sont temporairement indisponibles."
              : "Paid checkout is temporarily unavailable."}
          </p>
        )}
        {showCurrentPlanBadge && !loadingPlan && (
          <div style={{ marginTop: 14, fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
            {plan === "free" ? (
              <strong style={{ color: "#1A1A1A" }}>{freePlanBadgeLabel(lang)}</strong>
            ) : (
              <>
                {lang === "fr" ? "Plan actuel :" : "Current plan:"}{" "}
                <strong style={{ color: "#1A1A1A" }}>{planDisplayName}</strong>
              </>
            )}
          </div>
        )}
      </div>

      <PricingBento
        prices={prices}
        loadingPrices={loadingPrices}
        currentPlan={currentPlan}
        subscriptionInterval={subscriptionInterval}
        loadingPlan={loadingPlan}
        paidCtaLabel={paidCtaLabel}
        cancelUrl={cancelUrl}
        userId={userId}
        userEmail={userEmail}
        getOnboardingPayload={getOnboardingPayload}
        onBeforeCheckout={onBeforeCheckout}
      />

      {onStayFree ? (
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <button
            type="button"
            onClick={onStayFree}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 14,
              fontFamily: "inherit",
              color: "#7A7A7A",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {freeLinkLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
