"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useLang, type Lang } from "@/lib/useLang";
import { TRACKIT_SELECTION_BLUE } from "@/lib/selection-card-styles";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade, upgradeToPlanTier } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getPlanCardDescription, planDisplayName, PLAN_PRICES, annualBilledSubtitle, annualFreeMonthsBadge, checkoutCurrencyFromLang, formatPricingAmount, getPlanAnnualMonthlyEquivalent } from "@/lib/plan-marketing";
import { getPlanPricingFeatureLines } from "@/lib/plan-pricing-highlights";
import type { BillingInterval } from "@/lib/stripe-billing";
import { STRIPE_BILLING_PORTAL_LOGIN_URL } from "@/lib/open-billing-portal";
import { BillingPaymentMethodSummary, PaymentMethodsBillingSection } from "./PayoutsView";
import { refreshPaymentMethods } from "./usePaymentMethods";

const GROWTH_MONTHLY = PLAN_PRICES.growthMonthly;
const PRO_MONTHLY = PLAN_PRICES.proMonthly;
const SCALE_MONTHLY = PLAN_PRICES.scaleMonthly;
const GROWTH_ANNUAL = PLAN_PRICES.growthAnnual;
const PRO_ANNUAL = PLAN_PRICES.proAnnual;
const SCALE_ANNUAL = PLAN_PRICES.scaleAnnual;

type PaidTier = "basic" | "pro" | "scale";

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  scale: 3,
};

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

function planCardButtonLabel(
  lang: Lang,
  action: "current" | "upgrade" | "downgrade",
  cardName: string,
  currentPlan: PlanTier,
  target: PaidTier,
  subscriptionInterval: BillingInterval | null,
  viewAnnual: boolean,
): string {
  if (action === "current") {
    return lang === "fr" ? "Plan actuel" : "Current plan";
  }

  const sameTier = PLAN_RANK[currentPlan] === PLAN_RANK[target];
  if (action === "upgrade" && sameTier && viewAnnual && subscriptionInterval === "month") {
    return lang === "fr" ? "Passer à l'annuel" : "Switch to annual";
  }

  if (action === "upgrade") {
    if (viewAnnual && PLAN_RANK[target] < PLAN_RANK[currentPlan]) {
      return lang === "fr" ? `Choisir ${cardName} annuel` : `Choose annual ${cardName}`;
    }
    return lang === "fr" ? "Passer à " + cardName : "Upgrade to " + cardName;
  }

  if (!viewAnnual && sameTier && subscriptionInterval === "year") {
    return lang === "fr" ? "Passer au mensuel" : "Switch to monthly";
  }

  return lang === "fr" ? "Rétrograder" : "Downgrade";
}

function currentPlanPrice(
  plan: PlanTier,
  interval: BillingInterval | null,
): { amount: number; period: "month" | "year"; billedAnnually?: number } | null {
  if (plan === "free") return null;
  const isAnnual = interval === "year";
  if (plan === "scale") {
    return isAnnual
      ? { amount: getPlanAnnualMonthlyEquivalent("scale"), period: "month", billedAnnually: SCALE_ANNUAL }
      : { amount: SCALE_MONTHLY, period: "month" };
  }
  if (plan === "pro") {
    return isAnnual
      ? { amount: getPlanAnnualMonthlyEquivalent("pro"), period: "month", billedAnnually: PRO_ANNUAL }
      : { amount: PRO_MONTHLY, period: "month" };
  }
  return isAnnual
    ? { amount: getPlanAnnualMonthlyEquivalent("basic"), period: "month", billedAnnually: GROWTH_ANNUAL }
    : { amount: GROWTH_MONTHLY, period: "month" };
}

function planFeatures(lang: Lang, tier: PaidTier): string[] {
  return getPlanPricingFeatureLines(tier, lang);
}

function StatusBadge({ lang, status }: { lang: Lang; status: "Paid" | "Failed" | "Pending" }) {
  const styles: Record<typeof status, { bg: string; color: string; label: string }> = {
    Paid: {
      bg: "rgba(46, 125, 50, 0.18)",
      color: "#4ADE80",
      label: lang === "fr" ? "Payée" : "Paid",
    },
    Failed: {
      bg: "rgba(198, 40, 40, 0.18)",
      color: "#F87171",
      label: lang === "fr" ? "Échouée" : "Failed",
    },
    Pending: {
      bg: "rgba(245, 127, 23, 0.18)",
      color: "#FBBF24",
      label: lang === "fr" ? "En attente" : "Pending",
    },
  };
  const s = styles[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        letterSpacing: "-0.01em",
      }}
    >
      {s.label}
    </span>
  );
}

function BillingCard({
  title,
  children,
  isMobile,
}: {
  title: string;
  children: ReactNode;
  isMobile?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--ws-surface)",
        border: "1px solid var(--ws-border)",
        borderRadius: 16,
        padding: isMobile ? 20 : 24,
        marginBottom: 20,
      }}
    >
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--ws-text)",
          letterSpacing: "-0.02em",
          margin: "0 0 16px",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

export function BillingView({ isMobile, plan: planProp }: { isMobile?: boolean; plan?: PlanTier }) {
  const lang = useLang();
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PaidTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(planProp ?? "free");
  const [subscriptionInterval, setSubscriptionInterval] = useState<BillingInterval | null>(null);
  const [planLoading, setPlanLoading] = useState(!planProp);
  const [invoices, setInvoices] = useState<
    {
      id: string;
      created: number;
      amount: number;
      currency: string;
      status: "Paid" | "Failed" | "Pending";
      pdfUrl: string | null;
    }[]
  >([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [nextBillingDate, setNextBillingDate] = useState<number | null>(null);

  const currency = checkoutCurrencyFromLang(lang);
  const pad = isMobile ? "24px 16px 48px" : "32px 40px 48px";

  useEffect(() => {
    if (planProp) setCurrentPlan(planProp);
  }, [planProp]);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      setPlanLoading(true);
      try {
        const res = await fetch("/api/billing/plan", { credentials: "include" });
        const data = (await res.json()) as {
          plan?: string;
          billingInterval?: BillingInterval | null;
          nextBillingDate?: number | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load plan");
        if (cancelled) return;
        setCurrentPlan(normalizePlan(data.plan));
        setSubscriptionInterval(data.billingInterval ?? null);
        if (data.nextBillingDate) setNextBillingDate(data.nextBillingDate);
        if (data.billingInterval === "year") setAnnual(true);
      } catch {
        if (cancelled) return;
        if (planProp) {
          setCurrentPlan(planProp);
        } else {
          const client = supabase;
          if (client) {
            const { data: { user } } = await client.auth.getUser();
            if (user && !cancelled) {
              const { data } = await client.from("profiles").select("plan").eq("id", user.id).maybeSingle();
              if (!cancelled) setCurrentPlan(normalizePlan(data?.plan));
            }
          }
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    };

    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, [planProp]);

  useEffect(() => {
    let cancelled = false;
    setInvoicesLoading(true);
    setInvoicesError(null);
    void fetch("/api/invoices", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as {
          invoices?: typeof invoices;
          nextBillingDate?: number | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load invoices");
        if (!cancelled) {
          setInvoices(data.invoices ?? []);
          if (data.nextBillingDate != null) {
            setNextBillingDate(data.nextBillingDate);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInvoicesError(err instanceof Error ? err.message : "Failed to load invoices");
          setInvoices([]);
        }
      })
      .finally(() => {
        if (!cancelled) setInvoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshBilling = () => {
      void fetch("/api/billing/plan", { credentials: "include" })
        .then(async (res) => {
          const data = (await res.json()) as {
            plan?: string;
            billingInterval?: BillingInterval | null;
            nextBillingDate?: number | null;
          };
          if (!res.ok) return;
          setCurrentPlan(normalizePlan(data.plan));
          setSubscriptionInterval(data.billingInterval ?? null);
          if (data.nextBillingDate != null) setNextBillingDate(data.nextBillingDate);
        })
        .catch(() => {});

      void fetch("/api/invoices", { credentials: "include" })
        .then(async (res) => {
          const data = (await res.json()) as {
            invoices?: typeof invoices;
            nextBillingDate?: number | null;
          };
          if (!res.ok) return;
          setInvoices(data.invoices ?? []);
          if (data.nextBillingDate != null) setNextBillingDate(data.nextBillingDate);
        })
        .catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBilling();
    };
    const onPlanUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ plan?: string }>).detail;
      if (detail?.plan) {
        setCurrentPlan(normalizePlan(detail.plan));
      }
      refreshBilling();
      void refreshPaymentMethods();
    };

    window.addEventListener("focus", refreshBilling);
    window.addEventListener("trackit-plan-updated", onPlanUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refreshBilling);
      window.removeEventListener("trackit-plan-updated", onPlanUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const formatInvoiceDate = (unixSeconds: number) =>
    new Date(unixSeconds * 1000).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      if (!supabase) {
        window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
        return;
      }
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = (await res.json()) as { url?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    } catch {
      window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    } finally {
      setPortalLoading(false);
    }
  };

  const startCheckout = async (target: PaidTier) => {
    setCheckoutLoading(target);
    try {
      const priceId =
        target === "basic"
          ? getGrowthPriceId(currency, annual)
          : target === "pro"
            ? getProPriceId(currency, annual)
            : getScalePriceId(currency, annual);
      if (!priceId?.trim()) {
        throw new Error(
          lang === "fr"
            ? "Clé Stripe manquante pour ce plan. Vérifiez la configuration."
            : "Missing Stripe price ID for this plan. Check configuration.",
        );
      }
      await upgradeToPlanTier(target, lang, annual);
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === "fr" ? "Impossible de démarrer le paiement" : "Could not start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const planCards = useMemo(
    (): {
      tier: PaidTier;
      name: string;
      description: string;
      monthly: number;
      annualTotal: number;
      popular?: boolean;
      pill?: string;
    }[] => [
      {
        tier: "basic",
        name: planDisplayName("basic", lang),
        description: getPlanCardDescription("basic", lang),
        monthly: GROWTH_MONTHLY,
        annualTotal: GROWTH_ANNUAL,
      },
      {
        tier: "pro",
        name: planDisplayName("pro", lang),
        description: getPlanCardDescription("pro", lang),
        monthly: PRO_MONTHLY,
        annualTotal: PRO_ANNUAL,
        popular: true,
      },
      {
        tier: "scale",
        name: planDisplayName("scale", lang),
        description: getPlanCardDescription("scale", lang),
        monthly: SCALE_MONTHLY,
        annualTotal: SCALE_ANNUAL,
        pill: lang === "fr" ? "Agences & multi-marques" : "Agencies & multi-brand",
      },
    ],
    [lang],
  );

  const isPaidPlan = currentPlan !== "free";
  const activePrice = currentPlanPrice(currentPlan, subscriptionInterval);

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)" }}>
      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 12 : 16,
          paddingLeft: isMobile ? 16 : 40,
          borderBottom: "1px solid var(--ws-border)",
        }}
      >
        <h1
          style={{
            fontSize: isMobile ? 26 : 34,
            fontWeight: 600,
            color: "var(--ws-text)",
            letterSpacing: "-0.04em",
            margin: 0,
            marginBottom: 6,
          }}
        >
          {lang === "fr" ? "Facturation" : "Billing"}
        </h1>
        <p style={{ fontSize: 15, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: 0 }}>
          {lang === "fr"
            ? "Gérez votre abonnement, votre carte et vos factures Stripe"
            : "Manage your subscription, payment method, and Stripe invoices"}
        </p>
      </div>

      <div style={{ padding: pad, maxWidth: 1120, margin: "0 auto" }}>
        <BillingCard title={lang === "fr" ? "Plan actuel" : "Current plan"} isMobile={isMobile}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ws-accent)",
                  background: "var(--ws-accent-soft)",
                  padding: "4px 10px",
                  borderRadius: 6,
                  marginBottom: 10,
                  letterSpacing: "-0.01em",
                }}
              >
                {planLoading ? "…" : planDisplayName(currentPlan, lang)}
              </span>
              <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                {planLoading ? (
                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ws-text-muted)" }}>
                    {lang === "fr" ? "Chargement…" : "Loading…"}
                  </span>
                ) : currentPlan === "free" ? (
                  lang === "fr" ? "Gratuit" : "Free"
                ) : activePrice ? (
                  <>
                    {formatPricingAmount(activePrice.amount, lang)}
                    <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ws-text-muted)" }}>
                      {lang === "fr" ? "/mois" : "/month"}
                    </span>
                    {activePrice.billedAnnually ? (
                      <div style={{ fontSize: 13, color: "var(--ws-text-muted)", marginTop: 6, letterSpacing: "-0.02em", fontWeight: 400 }}>
                        {annualBilledSubtitle(activePrice.billedAnnually, lang)}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
              {!planLoading && isPaidPlan && (
                <div style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", marginTop: 8 }}>
                  {lang === "fr" ? "Prochaine facturation :" : "Next billing:"}{" "}
                  {invoicesLoading
                    ? "…"
                    : nextBillingDate
                      ? formatInvoiceDate(nextBillingDate)
                      : "—"}
                </div>
              )}
              {!planLoading && isPaidPlan && (
                <div style={{ marginTop: 8 }}>
                  <BillingPaymentMethodSummary compact />
                </div>
              )}
            </div>
            {!planLoading && isPaidPlan && (
              <button
                type="button"
                onClick={() => void openBillingPortal()}
                disabled={portalLoading}
                className="hero-cta-raised-light"
                style={{ padding: "12px 20px", fontSize: 14, opacity: portalLoading ? 0.6 : 1 }}
              >
                {portalLoading
                  ? lang === "fr"
                    ? "Ouverture…"
                    : "Opening…"
                  : lang === "fr"
                    ? "Gérer via Stripe"
                    : "Manage in Stripe"}
              </button>
            )}
          </div>
        </BillingCard>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em", margin: 0 }}>
            {lang === "fr" ? "Choisir un plan" : "Choose a plan"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: annual ? "var(--ws-text-dim)" : "var(--ws-text)", fontWeight: annual ? 400 : 600 }}>
              {lang === "fr" ? "Mensuel" : "Monthly"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={annual}
              onClick={() => setAnnual((v) => !v)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                border: "none",
                background: annual ? "var(--ws-accent)" : "var(--ws-border)",
                position: "relative",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: annual ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--ws-surface)",
                  transition: "left 0.2s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                }}
              />
            </button>
            <span style={{ fontSize: 13, color: annual ? "var(--ws-text)" : "var(--ws-text-dim)", fontWeight: annual ? 600 : 400 }}>
              {lang === "fr" ? "Annuel" : "Annual"}
            </span>
            {annual && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ws-accent)",
                  background: "var(--ws-accent-soft)",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                {annualFreeMonthsBadge(lang)}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 32,
            alignItems: "stretch",
          }}
        >
          {planCards.map((card) => {
            const action = planLoading
              ? "upgrade"
              : planAction(currentPlan, card.tier, subscriptionInterval, annual);
            const price = annual ? getPlanAnnualMonthlyEquivalent(card.tier) : card.monthly;
            const period = lang === "fr" ? "/mois" : "/month";
            const isCurrent = action === "current";
            const buttonLabel = planCardButtonLabel(
              lang,
              action,
              card.name,
              currentPlan,
              card.tier,
              subscriptionInterval,
              annual,
            );

            return (
              <div
                key={card.tier}
                style={{
                  border: isCurrent ? `1px solid ${TRACKIT_SELECTION_BLUE}` : "1px solid var(--ws-border)",
                  borderRadius: 16,
                  padding: isMobile ? 22 : 24,
                  background: isCurrent ? TRACKIT_SELECTION_BLUE : "var(--ws-surface)",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isCurrent ? "none" : "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {card.popular && !isCurrent && (
                  <span
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--ws-accent)",
                      background: "var(--ws-accent-soft)",
                      padding: "4px 8px",
                      borderRadius: 999,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {lang === "fr" ? "Le plus populaire" : "Most Popular"}
                  </span>
                )}
                {card.pill && !isCurrent && !card.popular && (
                  <span
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--ws-text-muted)",
                      background: "var(--ws-hover)",
                      padding: "4px 8px",
                      borderRadius: 999,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {card.pill}
                  </span>
                )}
                {isCurrent && (
                  <span
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      color: TRACKIT_SELECTION_BLUE,
                      background: "var(--ws-surface)",
                      padding: "4px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {lang === "fr" ? "Actuel" : "Current"}
                  </span>
                )}

                <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "rgba(255,255,255,0.85)" : "var(--ws-text-muted)", letterSpacing: "-0.01em", marginBottom: 6 }}>
                  {card.name}
                </div>
                <p style={{ fontSize: 13, color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--ws-text-dim)", margin: "0 0 16px", lineHeight: 1.45, letterSpacing: "-0.01em", minHeight: 40 }}>
                  {card.description}
                </p>
                <div style={{ fontSize: 32, fontWeight: 600, color: isCurrent ? "#FFFFFF" : "var(--ws-text)", letterSpacing: "-0.04em", marginBottom: annual ? 6 : 20 }}>
                  {formatPricingAmount(price, lang)}
                  <span style={{ fontSize: 13, fontWeight: 400, color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--ws-text-dim)" }}>{period}</span>
                </div>
                {annual ? (
                  <div style={{ fontSize: 13, color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--ws-text-dim)", marginBottom: 20, letterSpacing: "-0.02em" }}>
                    {annualBilledSubtitle(card.annualTotal, lang)}
                  </div>
                ) : null}

                <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, flex: 1 }}>
                  {planFeatures(lang, card.tier).map((feature) => (
                    <li
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        fontSize: 13,
                        color: isCurrent ? "rgba(255,255,255,0.9)" : "var(--ws-text-muted)",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.45,
                        marginBottom: 8,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, marginTop: 2 }}>
                        <path d="M5 13l4 4L19 7" stroke={isCurrent ? "#FFFFFF" : "var(--ws-accent)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {action === "current" ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      width: "100%",
                      padding: "13px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.2)",
                      color: "var(--ws-surface)",
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      letterSpacing: "-0.02em",
                      cursor: "default",
                    }}
                  >
                    {lang === "fr" ? "Plan actuel" : "Current plan"}
                  </button>
                ) : action === "upgrade" ? (
                  <button
                    type="button"
                    onClick={() => void startCheckout(card.tier)}
                    disabled={checkoutLoading !== null || portalLoading}
                    className="hero-cta-shopify"
                    style={{ width: "100%", fontSize: 14, padding: "13px 16px", opacity: checkoutLoading && checkoutLoading !== card.tier ? 0.6 : 1 }}
                  >
                    {checkoutLoading === card.tier
                      ? lang === "fr"
                        ? "Chargement…"
                        : "Loading…"
                      : buttonLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openBillingPortal()}
                    disabled={portalLoading || checkoutLoading !== null}
                    className="hero-cta-raised-light"
                    style={{ width: "100%", fontSize: 14, padding: "13px 16px" }}
                  >
                    {portalLoading
                      ? lang === "fr"
                        ? "Chargement…"
                        : "Loading…"
                      : buttonLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <BillingCard title={lang === "fr" ? "Méthode de paiement" : "Payment method"} isMobile={isMobile}>
          <PaymentMethodsBillingSection />
        </BillingCard>

        <BillingCard title={lang === "fr" ? "Historique des factures" : "Invoice history"} isMobile={isMobile}>
          {invoicesLoading ? (
            <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0 }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
          ) : invoicesError ? (
            <p style={{ fontSize: 13, color: "#C62828", margin: 0 }}>{invoicesError}</p>
          ) : invoices.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0, lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Aucune facture pour le moment."
                : "No invoices yet."}
            </p>
          ) : (
            <div style={{ overflowX: isMobile ? "auto" : undefined }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 480 : undefined }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                    <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500 }}>{lang === "fr" ? "Date" : "Date"}</th>
                    <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500 }}>{lang === "fr" ? "Montant" : "Amount"}</th>
                    <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500 }}>{lang === "fr" ? "Statut" : "Status"}</th>
                    <th style={{ padding: "10px 8px" }} />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                      <td style={{ padding: "12px 8px", color: "var(--ws-text)" }}>{formatInvoiceDate(inv.created)}</td>
                      <td style={{ padding: "12px 8px", color: "var(--ws-text)" }}>
                        {new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
                          style: "currency",
                          currency: inv.currency,
                        }).format(inv.amount)}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <StatusBadge lang={lang} status={inv.status} />
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right" }}>
                        <button
                          type="button"
                          disabled={!inv.pdfUrl}
                          onClick={() => inv.pdfUrl && window.open(inv.pdfUrl, "_blank", "noopener,noreferrer")}
                          className="hero-cta-raised-light"
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            opacity: inv.pdfUrl ? 1 : 0.45,
                            cursor: inv.pdfUrl ? "pointer" : "not-allowed",
                          }}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BillingCard>
      </div>
    </div>
  );
}
