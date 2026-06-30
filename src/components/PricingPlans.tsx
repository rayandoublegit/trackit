"use client";

import { useMemo, useState } from "react";
import { getGrowthPriceId, getProPriceId, getScalePriceId } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getPlanMarketingFeatures, getPlanCardDescription, planDisplayName as marketingPlanDisplayName, PLAN_PRICES } from "@/lib/plan-marketing";
import { planCtaAction, planCtaLabel, type PaidTier } from "@/lib/pricing-cta";
import type { BillingInterval } from "@/lib/stripe-billing";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const GROWTH_MONTHLY = PLAN_PRICES.growthMonthly;
const PRO_MONTHLY = PLAN_PRICES.proMonthly;
const SCALE_MONTHLY = PLAN_PRICES.scaleMonthly;
const GROWTH_ANNUAL = PLAN_PRICES.growthAnnual;
const PRO_ANNUAL = PLAN_PRICES.proAnnual;
const SCALE_ANNUAL = PLAN_PRICES.scaleAnnual;

const pricingCheckIcon = (
  <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function priceIdForTier(tier: PaidTier, currency: "usd" | "eur", annual: boolean): string {
  if (tier === "basic") return getGrowthPriceId(currency, annual);
  if (tier === "pro") return getProPriceId(currency, annual);
  return getScalePriceId(currency, annual);
}

function PricingCard({
  lang,
  name,
  desc,
  price,
  annual,
  onToggleAnnual,
  features,
  ctaClassName,
  onClick,
  ctaLabel,
  highlight,
  pill,
  disabled,
  annualPill,
  ctaLoading,
}: {
  lang: "fr" | "en";
  name: string;
  desc: string;
  price: number;
  annual: boolean;
  onToggleAnnual: () => void;
  features: string[];
  ctaClassName?: string;
  onClick: () => void;
  ctaLabel: string;
  highlight?: boolean;
  pill?: string;
  disabled?: boolean;
  annualPill?: string;
  ctaLoading?: boolean;
}) {
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
        {!pill && annualPill ? <div className="pricing-toggle-pill">{annualPill}</div> : null}
      </div>

      <div className={`pricing-card${highlight ? " pricing-card-hero" : ""}`}>
        {highlight ? <span className="pricing-badge-most-popular">{lang === "fr" ? "Le plus populaire" : "Most Popular"}</span> : null}
        <div className="pricing-card-top">
          <div className="pricing-logo"><img src={TRACKIT_LOGO_URL} alt="" /></div>
          <div className="pricing-name">{name}</div>
          <div className="pricing-desc">{desc}</div>
          <div className="pricing-price">
            <span className="pricing-amount">{formatCurrency(price, lang)}</span>
            <span className="pricing-period">{annual ? (lang === "fr" ? "par an" : "/year") : (lang === "fr" ? "/mois" : "/month")}</span>
          </div>
        </div>
        <div className="pricing-divider" />
        <div className="pricing-features">
          {features.map((label) => (
            <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
          ))}
        </div>
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
  freeCtaLabel?: string;
  freeCtaDisabled?: boolean;
  paidCtaLabel?: string;
  currentPlan?: PlanTier;
  subscriptionInterval?: BillingInterval | null;
  loadingPlan?: boolean;
  cancelUrl?: string;
  userId?: string;
  userEmail?: string;
  onStayFree: () => void;
  onBeforeCheckout?: () => Promise<boolean>;
};

export function PricingPlans({
  title,
  subtitle,
  tagline,
  showCurrentPlanBadge = true,
  freeCtaLabel,
  freeCtaDisabled = false,
  paidCtaLabel,
  currentPlan = "free",
  subscriptionInterval = null,
  loadingPlan = false,
  cancelUrl,
  userId,
  userEmail,
  onStayFree,
  onBeforeCheckout,
}: PricingPlansProps) {
  const lang = useLang();
  const [growthAnnual, setGrowthAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [scaleAnnual, setScaleAnnual] = useState(false);
  const [payingTier, setPayingTier] = useState<PaidTier | null>(null);

  const currency = lang === "fr" ? "eur" : "usd";
  const plan = normalizePlan(currentPlan);

  const growthFeatures = useMemo(() => getPlanMarketingFeatures("basic", lang, "pricing"), [lang]);
  const proFeatures = useMemo(() => getPlanMarketingFeatures("pro", lang, "pricing"), [lang]);
  const scaleFeatures = useMemo(() => getPlanMarketingFeatures("scale", lang, "pricing"), [lang]);
  const freeFeatures = useMemo(() => getPlanMarketingFeatures("free", lang, "pricing"), [lang]);

  const startCheckout = async (tier: PaidTier, annual: boolean) => {
    if (onBeforeCheckout) {
      const ok = await onBeforeCheckout();
      if (!ok) return;
    }

    const priceId = priceIdForTier(tier, currency, annual);
    if (!priceId?.trim()) {
      alert("Pricing not configured. Please contact support.");
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

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId,
        userId: resolvedUserId,
        email: resolvedEmail,
        cancelUrl: cancelUrl ?? `${origin}/pricing`,
      }),
    });
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    if (data.url) window.location.href = data.url;
    else alert(data.error || "Could not start checkout");
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
      ? "Même pricing que sur le site, avec les vrais checkouts Stripe. Tu peux rester en free ou passer au plan supérieur."
      : "Same pricing as the website, with the live Stripe checkouts. Stay free or upgrade anytime.";
  const defaultTagline = lang === "fr" ? "Tarifs" : "Pricing";
  const defaultFreeCta =
    plan === "free"
      ? lang === "fr"
        ? "Je préfère rester en free"
        : "I'd rather stay free"
      : lang === "fr"
        ? "Je préfère rester en free"
        : "I'd rather stay free";

  const growthCta =
    paidCtaLabel ??
    planCtaLabel(lang, growthAction, "Growth", plan, "basic", subscriptionInterval, growthAnnual);
  const proCta =
    paidCtaLabel ??
    planCtaLabel(lang, proAction, "Pro", plan, "pro", subscriptionInterval, proAnnual);
  const scaleCta =
    paidCtaLabel ??
    planCtaLabel(lang, scaleAction, "Scale", plan, "scale", subscriptionInterval, scaleAnnual);

  const freeLabel =
    freeCtaLabel ??
    (plan === "free" && showCurrentPlanBadge
      ? lang === "fr"
        ? "Plan actuel"
        : "Current plan"
      : defaultFreeCta);

  const planDisplayName = marketingPlanDisplayName(plan, lang);

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
        {showCurrentPlanBadge && !loadingPlan && (
          <div style={{ marginTop: 14, fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Plan actuel :" : "Current plan:"}{" "}
            <strong style={{ color: "#1A1A1A" }}>{planDisplayName}</strong>
          </div>
        )}
      </div>

      <div className="pricing-grid">
        <PricingCard
          lang={lang}
          name="Growth"
          desc={getPlanCardDescription("basic", lang)}
          price={growthAnnual ? GROWTH_ANNUAL : GROWTH_MONTHLY}
          annual={growthAnnual}
          onToggleAnnual={() => setGrowthAnnual((v) => !v)}
          features={growthFeatures}
          ctaLabel={growthCta}
          onClick={() => void startCheckout("basic", growthAnnual)}
          disabled={!paidCtaLabel && growthAction === "current"}
          ctaLoading={payingTier === "basic"}
          annualPill={lang === "fr" ? "−20% annuel" : "Save 20% annual"}
        />

        <PricingCard
          lang={lang}
          name="Pro"
          desc={getPlanCardDescription("pro", lang)}
          price={proAnnual ? PRO_ANNUAL : PRO_MONTHLY}
          annual={proAnnual}
          onToggleAnnual={() => setProAnnual((v) => !v)}
          features={proFeatures}
          ctaLabel={proCta}
          onClick={() => void startCheckout("pro", proAnnual)}
          ctaClassName="pricing-cta pricing-cta-hero"
          highlight
          disabled={!paidCtaLabel && proAction === "current"}
          ctaLoading={payingTier === "pro"}
        />

        <PricingCard
          lang={lang}
          name="Scale"
          desc={getPlanCardDescription("scale", lang)}
          price={scaleAnnual ? SCALE_ANNUAL : SCALE_MONTHLY}
          annual={scaleAnnual}
          onToggleAnnual={() => setScaleAnnual((v) => !v)}
          features={scaleFeatures}
          ctaLabel={scaleCta}
          onClick={() => void startCheckout("scale", scaleAnnual)}
          ctaClassName="pricing-cta pricing-cta-dark"
          pill={lang === "fr" ? "Pour les agences" : "For agencies"}
          disabled={!paidCtaLabel && scaleAction === "current"}
          ctaLoading={payingTier === "scale"}
        />

        <div className="pricing-wrap pricing-wrap-full">
          <div className="pricing-card">
            <div className="pricing-card-top">
              <div className="pricing-logo"><img src={TRACKIT_LOGO_URL} alt="" /></div>
              <div className="pricing-name">Free</div>
              <div className="pricing-desc">{getPlanCardDescription("free", lang)}</div>
              <div className="pricing-price">
                <span className="pricing-amount">{formatCurrency(0, lang)}</span>
                <span className="pricing-period">{lang === "fr" ? "/mois" : "/month"}</span>
              </div>
            </div>
            <div className="pricing-divider" />
            <div className="pricing-features">
              {freeFeatures.map((label) => (
                <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
              ))}
            </div>
            <button
              type="button"
              className="pricing-cta"
              onClick={onStayFree}
              disabled={freeCtaDisabled}
              style={
                freeCtaDisabled
                  ? { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid transparent", boxShadow: "none", transform: "none", transition: "none", cursor: "default", opacity: 0.6 }
                  : plan === "free" && showCurrentPlanBadge && !freeCtaLabel
                    ? { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid transparent", boxShadow: "none", transform: "none", transition: "none", cursor: "default" }
                    : undefined
              }
            >
              {freeLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
