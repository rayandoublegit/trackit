"use client";

import { useMemo, useState } from "react";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { StripePriceMatrix } from "@/lib/stripe-config";
import { useStripePrices } from "@/lib/use-stripe-prices";
import { getPlanCardDescription, planDisplayName as marketingPlanDisplayName, PLAN_PRICES, annualBilledSubtitle, annualFreeMonthsBadge, checkoutCurrencyFromLang, formatPricingAmount, getPlanAnnualMonthlyEquivalent, getPlanAnnualTotal } from "@/lib/plan-marketing";
import { getPlanPricingHighlights, type PricingHighlight } from "@/lib/plan-pricing-highlights";
import { PricingFeatureList } from "@/components/PricingFeatureList";
import { planCtaAction, planCtaLabel, freePlanBadgeLabel, freeStayAnywayCtaLabel, type PaidTier } from "@/lib/pricing-cta";
import type { OnboardingSavePayload } from "@/lib/onboarding-save";
import type { BillingInterval } from "@/lib/stripe-billing";
import { upgradeToPlanTier } from "@/lib/checkout";
import { useLang } from "@/lib/useLang";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const GROWTH_MONTHLY = PLAN_PRICES.growthMonthly;
const PRO_MONTHLY = PLAN_PRICES.proMonthly;
const SCALE_MONTHLY = PLAN_PRICES.scaleMonthly;

function priceIdForTier(
  prices: StripePriceMatrix,
  tier: PaidTier,
  currency: "usd" | "eur",
  annual: boolean
): string {
  const bucket = tier === "basic" ? prices.growth : tier === "pro" ? prices.pro : prices.scale;
  return annual ? bucket[currency].year : bucket[currency].month;
}

function PricingCard({
  lang,
  name,
  desc,
  monthlyPrice,
  annualMonthlyPrice,
  annualTotal,
  annual,
  onToggleAnnual,
  features,
  ctaClassName,
  onClick,
  ctaLabel,
  highlight,
  pill,
  disabled,
  ctaLoading,
}: {
  lang: "fr" | "en";
  name: string;
  desc: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualTotal: number;
  annual: boolean;
  onToggleAnnual: () => void;
  features: PricingHighlight[];
  ctaClassName?: string;
  onClick: () => void;
  ctaLabel: string;
  highlight?: boolean;
  pill?: string;
  disabled?: boolean;
  ctaLoading?: boolean;
}) {
  const displayPrice = annual ? annualMonthlyPrice : monthlyPrice;
  return (
    <div className={`pricing-wrap${highlight ? " pricing-wrap-hero" : ""}`}>
      <div className="pricing-toggle">
        <div className="pricing-toggle-left">
          <button
            type="button"
            className={`toggle-switch${annual ? " is-on" : ""}`}
            aria-label="Toggle billing"
            aria-pressed={annual}
            onClick={onToggleAnnual}
          >
            <span className="toggle-thumb" />
          </button>
          <span className="toggle-label">{lang === "fr" ? "Annuel" : "Annually"}</span>
        </div>
        {pill ? <div className="pricing-toggle-pill">{pill}</div> : null}
        {!pill && annual ? <div className="pricing-toggle-pill">{annualFreeMonthsBadge(lang)}</div> : null}
      </div>

      <div className={`pricing-card${highlight ? " pricing-card-hero" : ""}`}>
        {highlight ? <span className="pricing-badge-most-popular">{lang === "fr" ? "Le plus populaire" : "Most Popular"}</span> : null}
        <div className="pricing-card-top">
          <div className="pricing-logo"><img src={TRACKIT_LOGO_URL} alt="" /></div>
          <div className="pricing-name">{name}</div>
          <div className="pricing-desc">{desc}</div>
          <div>
            <div className="pricing-price">
              <span className="pricing-amount">{formatPricingAmount(displayPrice, lang)}</span>
              <span className="pricing-period">{lang === "fr" ? "/mois" : "/month"}</span>
            </div>
            {annual ? (
              <div style={{ fontSize: 13, color: "#7A7A7A", marginTop: 6, letterSpacing: "-0.02em" }}>
                {annualBilledSubtitle(annualTotal, lang)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="pricing-divider" />
        <PricingFeatureList features={features} />
        <button
          type="button"
          onClick={onClick}
          className={ctaClassName ?? "pricing-cta"}
          disabled={disabled || ctaLoading}
          style={disabled ? { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid transparent", boxShadow: "none", cursor: "default", transform: "none", transition: "none" } : undefined}
        >
          {ctaLoading ? (lang === "fr" ? "Paiement…" : "Paying…") : ctaLabel}
        </button>
      </div>
    </div>
  );
}

export type PricingPlansProps = {
  title?: string;
  subtitle?: string;
  tagline?: string;
  showCurrentPlanBadge?: boolean;
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
  const [growthAnnual, setGrowthAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [scaleAnnual, setScaleAnnual] = useState(false);
  const [payingTier, setPayingTier] = useState<PaidTier | null>(null);

  const currency = checkoutCurrencyFromLang(lang);
  const plan = normalizePlan(currentPlan);

  const growthFeatures = useMemo(() => getPlanPricingHighlights("basic", lang), [lang]);
  const proFeatures = useMemo(() => getPlanPricingHighlights("pro", lang), [lang]);
  const scaleFeatures = useMemo(() => getPlanPricingHighlights("scale", lang), [lang]);

  const startCheckout = async (tier: PaidTier, annual: boolean) => {
    if (onBeforeCheckout && !getOnboardingPayload) {
      const ok = await onBeforeCheckout();
      if (!ok) return;
    }

    const priceId = priceIdForTier(prices, tier, currency, annual);
    if (!priceId?.trim()) {
      alert(
        lang === "fr"
          ? "Paiement indisponible : les prix Stripe ne sont pas configurés."
          : "Checkout unavailable: Stripe prices are not configured."
      );
      return;
    }

    setPayingTier(tier);
    try {
    let resolvedUserId = userId;
    let resolvedEmail = userEmail;
    if (!resolvedUserId) {
      try {
        const { supabase } = await import("@/lib/supabase");
        if (supabase) {
          const { data: { user } } = await supabase.auth.getUser();
          resolvedUserId = user?.id;
          resolvedEmail = user?.email ?? undefined;
        }
      } catch {
        /* ignore */
      }
    }

    const onboarding = getOnboardingPayload ? await getOnboardingPayload() : undefined;
    if (getOnboardingPayload && !onboarding) return;

    if (!onboarding && resolvedUserId) {
      try {
        await upgradeToPlanTier(tier, lang, annual);
        return;
      } finally {
        setPayingTier(null);
      }
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        priceId,
        userId: resolvedUserId,
        email: resolvedEmail,
        cancelUrl: cancelUrl ?? `${origin}/pricing`,
        ...(onboarding ? { onboarding } : {}),
      }),
    });
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      alert(data.error || (lang === "fr" ? "Impossible de démarrer le paiement." : "Could not start checkout"));
      return;
    }
    window.location.href = data.url;
    } finally {
      setPayingTier(null);
    }
  };

  const growthAction = planCtaAction(plan, "basic", subscriptionInterval, growthAnnual);
  const proAction = planCtaAction(plan, "pro", subscriptionInterval, proAnnual);
  const scaleAction = planCtaAction(plan, "scale", subscriptionInterval, scaleAnnual);

  const defaultTitle = lang === "fr" ? "Choisis le plan qui te convient" : "Choose the plan that fits";
  const defaultSubtitle =
    lang === "fr"
      ? "Même pricing que sur le site, avec les vrais checkouts Stripe."
      : "Same pricing as the website, with the live Stripe checkouts.";
  const defaultTagline = lang === "fr" ? "Tarifs" : "Pricing";

  const starterName = marketingPlanDisplayName("basic", lang);
  const proName = marketingPlanDisplayName("pro", lang);
  const businessName = marketingPlanDisplayName("scale", lang);

  const growthCta =
    paidCtaLabel ??
    planCtaLabel(lang, growthAction, starterName, plan, "basic", subscriptionInterval, growthAnnual);
  const proCta =
    paidCtaLabel ??
    planCtaLabel(lang, proAction, proName, plan, "pro", subscriptionInterval, proAnnual);
  const scaleCta =
    paidCtaLabel ??
    planCtaLabel(lang, scaleAction, businessName, plan, "scale", subscriptionInterval, scaleAnnual);

  const planDisplayName = marketingPlanDisplayName(plan, lang);
  const freeLinkLabel = stayFreeLabel ?? freeStayAnywayCtaLabel(lang);

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src={TRACKIT_LOGO_URL} alt="Trackit" style={{ height: 72, width: "auto", margin: "0 auto 18px", display: "block" }} />
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

      <div className="pricing-grid">
        <PricingCard
          lang={lang}
          name={starterName}
          desc={getPlanCardDescription("basic", lang)}
          monthlyPrice={GROWTH_MONTHLY}
          annualMonthlyPrice={getPlanAnnualMonthlyEquivalent("basic")}
          annualTotal={getPlanAnnualTotal("basic")}
          annual={growthAnnual}
          onToggleAnnual={() => setGrowthAnnual((v) => !v)}
          features={growthFeatures}
          ctaLabel={growthCta}
          onClick={() => void startCheckout("basic", growthAnnual)}
          disabled={!paidCtaLabel && growthAction === "current"}
          ctaLoading={payingTier === "basic" || loadingPrices}
        />

        <PricingCard
          lang={lang}
          name={proName}
          desc={getPlanCardDescription("pro", lang)}
          monthlyPrice={PRO_MONTHLY}
          annualMonthlyPrice={getPlanAnnualMonthlyEquivalent("pro")}
          annualTotal={getPlanAnnualTotal("pro")}
          annual={proAnnual}
          onToggleAnnual={() => setProAnnual((v) => !v)}
          features={proFeatures}
          ctaLabel={proCta}
          onClick={() => void startCheckout("pro", proAnnual)}
          ctaClassName="pricing-cta pricing-cta-hero"
          highlight
          disabled={!paidCtaLabel && proAction === "current"}
          ctaLoading={payingTier === "pro" || loadingPrices}
        />

        <PricingCard
          lang={lang}
          name={businessName}
          desc={getPlanCardDescription("scale", lang)}
          monthlyPrice={SCALE_MONTHLY}
          annualMonthlyPrice={getPlanAnnualMonthlyEquivalent("scale")}
          annualTotal={getPlanAnnualTotal("scale")}
          annual={scaleAnnual}
          onToggleAnnual={() => setScaleAnnual((v) => !v)}
          features={scaleFeatures}
          ctaLabel={scaleCta}
          onClick={() => void startCheckout("scale", scaleAnnual)}
          ctaClassName="pricing-cta pricing-cta-dark"
          pill={lang === "fr" ? "Agences & multi-marques" : "Agencies & multi-brand"}
          disabled={!paidCtaLabel && scaleAction === "current"}
          ctaLoading={payingTier === "scale" || loadingPrices}
        />
      </div>

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
