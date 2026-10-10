"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { handleUpgrade, upgradeToPlanTier } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import {
  annualBilledSubtitle,
  annualFreeMonthsBadge,
  checkoutCurrencyFromLang,
  formatPricingAmount,
  getPlanAnnualMonthlyEquivalent,
  getPlanAnnualTotal,
  planDisplayName,
  PLAN_PRICES,
} from "@/lib/plan-marketing";
import { formatBentoHighlightLine, getPlanPricingHighlights, type PricingHighlight } from "@/lib/plan-pricing-highlights";
import { openStripeBillingPortal } from "@/lib/open-billing-portal";
import { planCtaAction, planCtaLabel, type PaidTier } from "@/lib/pricing-cta";
import type { OnboardingSavePayload } from "@/lib/onboarding-save";
import type { StripePriceMatrix } from "@/lib/stripe-config";
import type { BillingInterval } from "@/lib/stripe-billing";
import { useLang } from "@/lib/useLang";
import { localizeHref } from "@/lib/locale-preferences";
import { apiErrorText } from "@/lib/api-error-text";

const disabledPricingCtaStyle: CSSProperties = {
  background: "#E8E8E8",
  color: "#8A8A8A",
  border: "none",
  boxShadow: "none",
  cursor: "default",
  transform: "none",
  transition: "none",
};

function priceIdForTier(
  prices: StripePriceMatrix,
  tier: PaidTier,
  currency: "usd" | "eur",
  annual: boolean,
): string {
  const bucket = tier === "basic" ? prices.growth : tier === "pro" ? prices.pro : prices.scale;
  return annual ? bucket[currency].year : bucket[currency].month;
}

function formatBentoFeatureLine(item: PricingHighlight, _lang: "en" | "fr"): string {
  return formatBentoHighlightLine(item);
}

function BentoFeatures({ features, lang }: { features: PricingHighlight[]; lang: "en" | "fr" }) {
  return (
    <ul className="pb-features">
      {features.map((item) => (
        <li key={item.id}>{formatBentoFeatureLine(item, lang)}</li>
      ))}
    </ul>
  );
}

export type PricingBentoProps = {
  prices: StripePriceMatrix;
  loadingPrices?: boolean;
  currentPlan?: PlanTier;
  subscriptionInterval?: BillingInterval | null;
  loadingPlan?: boolean;
  paidCtaLabel?: string;
  cancelUrl?: string;
  userId?: string;
  userEmail?: string;
  getOnboardingPayload?: () => Promise<OnboardingSavePayload | null> | OnboardingSavePayload | null;
  onBeforeCheckout?: () => Promise<boolean>;
  animate?: boolean;
  className?: string;
};

export function PricingBento({
  prices,
  loadingPrices = false,
  currentPlan = "free",
  subscriptionInterval = null,
  loadingPlan = false,
  paidCtaLabel,
  cancelUrl,
  userId,
  userEmail,
  getOnboardingPayload,
  onBeforeCheckout,
  animate = false,
  className,
}: PricingBentoProps) {
  const lang = useLang();
  const [basicAnnual, setBasicAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [scaleAnnual, setScaleAnnual] = useState(false);
  const [payingTier, setPayingTier] = useState<PaidTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const currency = checkoutCurrencyFromLang(lang);
  const plan = normalizePlan(currentPlan);

  const growthFeatures = useMemo(() => getPlanPricingHighlights("basic", lang), [lang]);
  const proFeatures = useMemo(() => getPlanPricingHighlights("pro", lang), [lang]);
  const scaleFeatures = useMemo(() => getPlanPricingHighlights("scale", lang), [lang]);

  const starterName = planDisplayName("basic", lang);
  const proName = planDisplayName("pro", lang);
  const businessName = planDisplayName("scale", lang);

  const growthAction = planCtaAction(plan, "basic", subscriptionInterval, basicAnnual);
  const proAction = planCtaAction(plan, "pro", subscriptionInterval, proAnnual);
  const scaleAction = planCtaAction(plan, "scale", subscriptionInterval, scaleAnnual);

  const growthCta =
    paidCtaLabel ??
    planCtaLabel(lang, growthAction, starterName, plan, "basic", subscriptionInterval, basicAnnual);
  const proCta =
    paidCtaLabel ??
    planCtaLabel(lang, proAction, proName, plan, "pro", subscriptionInterval, proAnnual);
  const scaleCta =
    paidCtaLabel ??
    planCtaLabel(lang, scaleAction, businessName, plan, "scale", subscriptionInterval, scaleAnnual);

  const startCheckout = async (tier: PaidTier, annual: boolean) => {
    const action = planCtaAction(plan, tier, subscriptionInterval, annual);
    if (action === "current") return;

    if (action === "downgrade") {
      setPortalLoading(true);
      try {
        await openStripeBillingPortal();
      } finally {
        setPortalLoading(false);
      }
      return;
    }

    if (onBeforeCheckout && !getOnboardingPayload) {
      const ok = await onBeforeCheckout();
      if (!ok) return;
    }

    const priceId = priceIdForTier(prices, tier, currency, annual);

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

      if (onboarding) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const whop = await fetch("/api/billing/whop-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tier,
            annual,
            currency,
            onboarding,
          }),
        });
        const whopData = (await whop.json().catch(() => ({}))) as { url?: string; error?: string; errorFr?: string; fallback?: boolean };
        if (whop.ok && whopData.url) {
          window.location.href = whopData.url;
          return;
        }
        if (!whopData.fallback) {
          alert(apiErrorText(whopData, lang, { en: "Could not start checkout", fr: "Impossible de démarrer le paiement." }));
          return;
        }
        const res = await fetch("/api/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            priceId,
            userId: resolvedUserId,
            email: resolvedEmail,
            cancelUrl: cancelUrl ?? `${origin}${localizeHref("/pricing", lang)}`,
            onboarding,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; errorFr?: string };
        if (!res.ok || !data.url) {
          alert(apiErrorText(data, lang, { en: "Could not start checkout", fr: "Impossible de démarrer le paiement." }));
          return;
        }
        window.location.href = data.url;
        return;
      }

      // First purchase always goes through Checkout. change-plan is only for an
      // existing Stripe subscription (cookie session + known billing interval).
      if (resolvedUserId && subscriptionInterval) {
        await upgradeToPlanTier(tier, lang, annual);
        return;
      }

      await handleUpgrade(priceId, {
        cancelUrl: cancelUrl ?? (typeof window !== "undefined" ? window.location.href : undefined),
        tier: tier === "basic" ? "growth" : tier,
        currency,
        annual,
      });
    } catch (err) {
      // checkout.ts throws already-localized messages; a failed fetch (TypeError) is English-only.
      alert(
        err instanceof Error && !(lang === "fr" && err instanceof TypeError)
          ? err.message
          : lang === "fr"
            ? "Impossible de démarrer le paiement"
            : "Could not start checkout",
      );
    } finally {
      setPayingTier(null);
    }
  };

  const renderCta = (
    tier: PaidTier,
    annual: boolean,
    action: ReturnType<typeof planCtaAction>,
    label: string,
    className: string,
  ) => {
    const isCurrent = !paidCtaLabel && action === "current";
    const isLoading = payingTier === tier || (portalLoading && action === "downgrade");
    const text = loadingPlan
      ? lang === "fr"
        ? "Chargement…"
        : "Loading…"
      : isLoading
        ? payingTier === tier
          ? lang === "fr"
            ? "Paiement…"
            : "Paying…"
          : lang === "fr"
            ? "Chargement…"
            : "Loading…"
        : loadingPrices
          ? lang === "fr"
            ? "Paiement…"
            : "Paying…"
          : label;

    return (
      <button
        type="button"
        onClick={() => void startCheckout(tier, annual)}
        className={className}
        disabled={isCurrent || isLoading || loadingPlan || loadingPrices}
        style={isCurrent ? disabledPricingCtaStyle : undefined}
      >
        {text}
        {!isCurrent && !isLoading && !loadingPlan && !loadingPrices ? <span aria-hidden> →</span> : null}
      </button>
    );
  };

  const fade = (delay: string) => (animate ? ` fade-up ${delay}` : "");

  return (
    <div className={`pricing-grid pricing-bento${className ? ` ${className}` : ""}`}>
      <article className={`pb-card${fade("fade-up-delay-3")}`}>
        <div className="pb-card__head">
          <div className="pb-card__title-row">
            <h3 className="pb-card__name">{starterName}</h3>
            <span className={`pb-badge pb-badge--soft${basicAnnual ? " is-on" : ""}`}>
              {basicAnnual ? annualFreeMonthsBadge(lang) : lang === "fr" ? "Annuel" : "Annually"}
            </span>
          </div>
          <button
            type="button"
            className={`pb-switch${basicAnnual ? " is-on" : ""}`}
            aria-label={lang === "fr" ? "Basculer en facturation annuelle" : "Toggle billing"}
            aria-pressed={basicAnnual}
            onClick={() => setBasicAnnual((on) => !on)}
          >
            <span />
          </button>
        </div>
        <p className="pb-card__headline">
          <span className="is-strong">{lang === "fr" ? "Trouvez vos créateurs." : "Find your creators."}</span>
          <span className="is-mute">{lang === "fr" ? "Recherche illimitée, e-mails inclus." : "Unlimited search, emails included."}</span>
        </p>
        <div className="pb-card__buy">
          <div className="pb-price">
            <span className="pb-price__amount">
              {formatPricingAmount(basicAnnual ? getPlanAnnualMonthlyEquivalent("basic") : PLAN_PRICES.growthMonthly, lang)}
            </span>
            <span className="pb-price__period">{lang === "fr" ? "/mois" : "/month"}</span>
          </div>
          {basicAnnual ? (
            <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("basic"), lang)}</div>
          ) : null}
          {renderCta("basic", basicAnnual, growthAction, growthCta, "pb-cta")}
        </div>
        <BentoFeatures features={growthFeatures} lang={lang} />
      </article>

      <article className={`pb-card pb-card--dark${fade("fade-up-delay-4")}`}>
        <div className="pb-card__head">
          <div className="pb-card__title-row">
            <h3 className="pb-card__name">{proName}</h3>
            <span className="pb-badge pb-badge--dark">{lang === "fr" ? "Le plus populaire" : "Most Popular"}</span>
          </div>
          <button
            type="button"
            className={`pb-switch${proAnnual ? " is-on" : ""}`}
            aria-label={lang === "fr" ? "Basculer en facturation annuelle" : "Toggle billing"}
            aria-pressed={proAnnual}
            onClick={() => setProAnnual((on) => !on)}
          >
            <span />
          </button>
        </div>
        <p className="pb-card__headline">
          <span className="is-strong">{lang === "fr" ? "Pour les marques qui" : "For brands ready to"}</span>
          <span className="is-mute">{lang === "fr" ? "gèrent leurs campagnes de A à Z." : "run campaigns end to end."}</span>
        </p>
        <div className="pb-card__buy">
          <div className="pb-price">
            <span className="pb-price__amount">
              {formatPricingAmount(proAnnual ? getPlanAnnualMonthlyEquivalent("pro") : PLAN_PRICES.proMonthly, lang)}
            </span>
            <span className="pb-price__period">{lang === "fr" ? "/mois" : "/month"}</span>
          </div>
          {proAnnual ? (
            <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("pro"), lang)}</div>
          ) : null}
          {renderCta("pro", proAnnual, proAction, proCta, "pb-cta pb-cta--light")}
        </div>
        <div className="pb-card__foot">
          <BentoFeatures features={proFeatures} lang={lang} />
        </div>
      </article>

      <article className={`pb-card pb-card--wide${fade("fade-up-delay-5")}`}>
        <div className="pb-card__head">
          <div className="pb-card__title-row">
            <h3 className="pb-card__name">{businessName}</h3>
            <span className="pb-badge pb-badge--green">{lang === "fr" ? "Pro + votre équipe" : "Pro + your team"}</span>
          </div>
          <button
            type="button"
            className={`pb-switch${scaleAnnual ? " is-on" : ""}`}
            aria-label={lang === "fr" ? "Basculer en facturation annuelle" : "Toggle billing"}
            aria-pressed={scaleAnnual}
            onClick={() => setScaleAnnual((on) => !on)}
          >
            <span />
          </button>
        </div>
        <div className="pb-card__wide-body">
          <p className="pb-card__headline">
            <span className="is-mute">{lang === "fr" ? "Tout Pro, pour" : "All of Pro, for"}</span>
            <span className="is-strong">{lang === "fr" ? "toute votre équipe." : "your whole team."}</span>
          </p>
          <div className="pb-card__buy">
            <div className="pb-price">
              <span className="pb-price__amount">
                {formatPricingAmount(scaleAnnual ? getPlanAnnualMonthlyEquivalent("scale") : PLAN_PRICES.scaleMonthly, lang)}
              </span>
              <span className="pb-price__period">{lang === "fr" ? "/mois" : "/month"}</span>
            </div>
            {scaleAnnual ? (
              <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("scale"), lang)}</div>
            ) : null}
            {renderCta("scale", scaleAnnual, scaleAction, scaleCta, "pb-cta")}
          </div>
        </div>
        <BentoFeatures features={scaleFeatures} lang={lang} />
      </article>
    </div>
  );
}

export function useBillingPlanState(initialPlan: PlanTier = "free") {
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(initialPlan);
  const [subscriptionInterval, setSubscriptionInterval] = useState<BillingInterval | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/plan", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) {
            setCurrentPlan("free");
            setSubscriptionInterval(null);
          }
          return;
        }
        const payload = (await res.json().catch(() => ({}))) as {
          plan?: string;
          billingInterval?: BillingInterval | null;
        };
        if (cancelled) return;
        setCurrentPlan(normalizePlan(payload.plan));
        setSubscriptionInterval(payload.billingInterval ?? null);
      } catch {
        if (!cancelled) {
          setCurrentPlan("free");
          setSubscriptionInterval(null);
        }
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { currentPlan, subscriptionInterval, loadingPlan };
}
