"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useLang, type Lang } from "@/lib/useLang";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { planDisplayName, PLAN_PRICES, annualBilledSubtitle, formatPricingAmount, getPlanAnnualMonthlyEquivalent } from "@/lib/plan-marketing";
import type { BillingInterval } from "@/lib/stripe-billing";
import { PricingBento } from "@/components/PricingBento";
import { useStripePrices } from "@/lib/use-stripe-prices";
import { STRIPE_BILLING_PORTAL_LOGIN_URL } from "@/lib/open-billing-portal";
import { BillingPaymentMethodSummary, PaymentMethodsBillingSection } from "./PayoutsView";
import { refreshPaymentMethods } from "./usePaymentMethods";

const GROWTH_MONTHLY = PLAN_PRICES.growthMonthly;
const PRO_MONTHLY = PLAN_PRICES.proMonthly;
const SCALE_MONTHLY = PLAN_PRICES.scaleMonthly;
const GROWTH_ANNUAL = PLAN_PRICES.growthAnnual;
const PRO_ANNUAL = PLAN_PRICES.proAnnual;
const SCALE_ANNUAL = PLAN_PRICES.scaleAnnual;

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
  const [portalLoading, setPortalLoading] = useState(false);
  const { prices, loading: loadingPrices } = useStripePrices();
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

  const isPaidPlan = currentPlan !== "free";
  const activePrice = currentPlanPrice(currentPlan, subscriptionInterval);

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)" }}>
      <div
        style={{
          paddingTop: isMobile ? 16 : 40,
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

        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em", margin: "0 0 20px" }}>
          {lang === "fr" ? "Choisir un plan" : "Choose a plan"}
        </h2>
        <div style={{ marginBottom: 32 }}>
          <PricingBento
            prices={prices}
            loadingPrices={loadingPrices}
            currentPlan={currentPlan}
            subscriptionInterval={subscriptionInterval}
            loadingPlan={planLoading}
            cancelUrl={typeof window !== "undefined" ? `${window.location.origin}/dashboard?view=billing` : undefined}
          />
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
