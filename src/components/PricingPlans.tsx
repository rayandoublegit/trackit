"use client";

import { useMemo, useState } from "react";
import { getGrowthPriceId, getProPriceId, getScalePriceId } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { BillingInterval } from "@/lib/stripe-billing";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const GROWTH_MONTHLY = 19;
const PRO_MONTHLY = 39;
const SCALE_MONTHLY = 99;
const GROWTH_ANNUAL = 190;
const PRO_ANNUAL = 390;
const SCALE_ANNUAL = 990;

type PaidTier = "basic" | "pro" | "scale";

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  scale: 3,
};

const pricingCheckIcon = (
  <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function planAction(
  current: PlanTier,
  target: PaidTier,
  subscriptionInterval: BillingInterval | null,
  viewAnnual: boolean,
): "current" | "upgrade" | "downgrade" {
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

function planButtonLabel(
  lang: "fr" | "en",
  action: "current" | "upgrade" | "downgrade",
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
    return lang === "fr" ? `Passer à ${cardName}` : `Upgrade to ${cardName}`;
  }
  if (!viewAnnual && sameTier && subscriptionInterval === "year") {
    return lang === "fr" ? "Passer au mensuel" : "Switch to monthly";
  }
  return lang === "fr" ? "Rétrograder" : "Downgrade";
}

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
          disabled={disabled}
          style={disabled ? { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid transparent", boxShadow: "none", cursor: "default", transform: "none", transition: "none" } : undefined}
        >
          {ctaLabel}
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

  const currency = lang === "fr" ? "eur" : "usd";
  const plan = normalizePlan(currentPlan);

  const growthFeatures = useMemo(() => (
    lang === "fr"
      ? [
          "20 découvertes / mois",
          "10 résultats par recherche",
          "3 campagnes actives",
          "15 créateurs gérés",
          "Outreach IA illimité",
          "Paiements manuels",
        ]
      : [
          "20 discoveries / month",
          "10 results per search",
          "3 active campaigns",
          "15 managed creators",
          "Unlimited AI outreach",
          "Manual payouts",
        ]
  ), [lang]);

  const proFeatures = useMemo(() => (
    lang === "fr"
      ? [
          "50 découvertes / mois",
          "25 résultats par recherche",
          "15 campagnes actives",
          "50 créateurs gérés",
          "Paiements auto + manuels",
          "Automatisations",
        ]
      : [
          "50 discoveries / month",
          "25 results per search",
          "15 active campaigns",
          "50 managed creators",
          "Auto + manual payouts",
          "Automation workflows",
        ]
  ), [lang]);

  const scaleFeatures = useMemo(() => (
    lang === "fr"
      ? [
          "Découvertes illimitées",
          "Résultats illimités",
          "Campagnes illimitées",
          "Créateurs illimités",
          "Multi-boutiques Shopify",
          "Support dédié",
        ]
      : [
          "Unlimited discoveries",
          "Unlimited results",
          "Unlimited campaigns",
          "Unlimited creators",
          "Multi-store Shopify",
          "Dedicated support",
        ]
  ), [lang]);

  const startCheckout = async (tier: PaidTier, annual: boolean) => {
    if (onBeforeCheckout) {
      const ok = await onBeforeCheckout();
      if (!ok) return;
    }

    const priceId = priceIdForTier(tier, currency, annual);
    if (!priceId) {
      alert("Pricing not configured. Please contact support.");
      return;
    }

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
  };

  const growthAction = planAction(plan, "basic", subscriptionInterval, growthAnnual);
  const proAction = planAction(plan, "pro", subscriptionInterval, proAnnual);
  const scaleAction = planAction(plan, "scale", subscriptionInterval, scaleAnnual);

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
  const defaultPaidCta = lang === "fr" ? "Commencer" : "Get Started";

  const growthCta =
    paidCtaLabel ??
    planButtonLabel(lang, growthAction, "Growth", plan, "basic", subscriptionInterval, growthAnnual);
  const proCta =
    paidCtaLabel ??
    planButtonLabel(lang, proAction, "Pro", plan, "pro", subscriptionInterval, proAnnual);
  const scaleCta =
    paidCtaLabel ??
    planButtonLabel(lang, scaleAction, "Scale", plan, "scale", subscriptionInterval, scaleAnnual);

  const freeLabel =
    freeCtaLabel ??
    (plan === "free" && showCurrentPlanBadge
      ? lang === "fr"
        ? "Plan actuel"
        : "Current plan"
      : defaultFreeCta);

  const planDisplayName =
    plan === "basic" ? "Growth" : plan === "pro" ? "Pro" : plan === "scale" ? "Scale" : "Free";

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
          desc={lang === "fr" ? "L'entrée idéale pour lancer votre programme créateurs." : "Your entry point — start fast without overcommitting."}
          price={growthAnnual ? GROWTH_ANNUAL : GROWTH_MONTHLY}
          annual={growthAnnual}
          onToggleAnnual={() => setGrowthAnnual((v) => !v)}
          features={growthFeatures}
          ctaLabel={growthCta}
          onClick={() => void startCheckout("basic", growthAnnual)}
          disabled={!paidCtaLabel && growthAction === "current"}
          annualPill={lang === "fr" ? "−20% annuel" : "Save 20% annual"}
        />

        <PricingCard
          lang={lang}
          name="Pro"
          desc={lang === "fr" ? "Le meilleur rapport qualité-prix. Le choix de la plupart des marques." : "Best value. The plan most brands choose."}
          price={proAnnual ? PRO_ANNUAL : PRO_MONTHLY}
          annual={proAnnual}
          onToggleAnnual={() => setProAnnual((v) => !v)}
          features={proFeatures}
          ctaLabel={proCta}
          onClick={() => void startCheckout("pro", proAnnual)}
          ctaClassName="pricing-cta pricing-cta-hero"
          highlight
          disabled={!paidCtaLabel && proAction === "current"}
        />

        <PricingCard
          lang={lang}
          name="Scale"
          desc={lang === "fr" ? "Tout Pro, plus la puissance multi-boutiques et l'automatisation." : "Everything in Pro, plus multi-store power and full automation."}
          price={scaleAnnual ? SCALE_ANNUAL : SCALE_MONTHLY}
          annual={scaleAnnual}
          onToggleAnnual={() => setScaleAnnual((v) => !v)}
          features={scaleFeatures}
          ctaLabel={scaleCta}
          onClick={() => void startCheckout("scale", scaleAnnual)}
          ctaClassName="pricing-cta pricing-cta-dark"
          pill={lang === "fr" ? "Pour les agences" : "For agencies"}
          disabled={!paidCtaLabel && scaleAction === "current"}
        />

        <div className="pricing-wrap pricing-wrap-full">
          <div className="pricing-card">
            <div className="pricing-card-top">
              <div className="pricing-logo"><img src={TRACKIT_LOGO_URL} alt="" /></div>
              <div className="pricing-name">Free</div>
              <div className="pricing-desc">{lang === "fr" ? "Commencez sans engagement." : "Get started with no commitment."}</div>
              <div className="pricing-price">
                <span className="pricing-amount">{formatCurrency(0, lang)}</span>
                <span className="pricing-period">{lang === "fr" ? "/mois" : "/month"}</span>
              </div>
            </div>
            <div className="pricing-divider" />
            <div className="pricing-features">
              {(lang === "fr"
                ? ["5 découvertes au total", "5 résultats par recherche", "Sauvegarde de créateurs", "Aucun engagement"]
                : ["5 discoveries total", "5 results per search", "Save creators", "No commitment"]).map((label) => (
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
