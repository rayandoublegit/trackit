"use client";

import {
  getGateModalProps,
  getLimitUpgradeModalProps,
  type GateFeatureKey,
  type LimitGateKind,
} from "@/lib/plan-marketing";
import type { PlanTier } from "@/lib/plan-limits";
import { PricingBento, useBillingPlanState } from "@/components/PricingBento";
import { useStripePrices } from "@/lib/use-stripe-prices";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

type UpgradeModalProps = {
  lang: "en" | "fr";
  onClose: () => void;
  message?: string;
  title?: string;
  description?: string;
  bullets?: string[];
  primaryLabel?: string;
  onPrimary?: () => void;
  planBadge?: string;
  showAllPlansLink?: boolean;
  featureKey?: GateFeatureKey;
  limitKind?: LimitGateKind;
  currentPlan?: PlanTier;
};

function parseUpgradeMessage(message: string) {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = (lines[0] ?? "").replace(/^🔒\s*/, "");
  const ctaLines = lines.filter((line) => line.includes("→"));
  const contentLines = lines.slice(1).filter((line) => !ctaLines.includes(line));
  const description = contentLines[0] ?? "";
  return { title, description };
}

export function UpgradeModal({
  lang,
  onClose,
  message,
  title: titleProp,
  description: descriptionProp,
  featureKey,
  limitKind,
  currentPlan: currentPlanProp,
}: UpgradeModalProps) {
  const parsed = message ? parseUpgradeMessage(message) : null;
  const fromLimit =
    limitKind && currentPlanProp ? getLimitUpgradeModalProps(limitKind, currentPlanProp, lang) : null;
  const fromGate = featureKey ? getGateModalProps(featureKey, lang) : null;
  const resolved = fromLimit ?? fromGate;
  const billed = useBillingPlanState(currentPlanProp ?? "free");
  const { prices, loading: loadingPrices } = useStripePrices();

  const title =
    titleProp ??
    parsed?.title ??
    resolved?.title ??
    (lang === "fr" ? "Passez à un plan payant" : "Upgrade your plan");
  const description =
    descriptionProp ??
    parsed?.description ??
    resolved?.description ??
    (lang === "fr"
      ? "Choisissez l'offre qui débloque cette fonctionnalité."
      : "Pick the plan that unlocks this feature.");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.48)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="um-pricing"
        style={{
          background: "#FFFFFF",
          borderRadius: 24,
          maxWidth: 1080,
          width: "100%",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === "fr" ? "Fermer" : "Close"}
          style={{
            position: "sticky",
            top: 16,
            float: "right",
            margin: "16px 16px 0 0",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid #E5E5E5",
            background: "#FFFFFF",
            color: "#7A7A7A",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div style={{ padding: "28px 28px 32px", clear: "both" }}>
          <img
            src={TRACKIT_LOGO_URL}
            alt="Trackit"
            style={{ height: 48, width: "auto", display: "block", marginBottom: 14 }}
          />
          <h3
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#111",
              margin: "0 0 8px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h3>
          {description ? (
            <p
              style={{
                fontSize: 14,
                color: "#6b6b73",
                lineHeight: 1.5,
                margin: "0 0 24px",
                letterSpacing: "-0.02em",
              }}
            >
              {description}
            </p>
          ) : (
            <div style={{ height: 16 }} />
          )}

          <PricingBento
            prices={prices}
            loadingPrices={loadingPrices}
            currentPlan={currentPlanProp ?? billed.currentPlan}
            subscriptionInterval={billed.subscriptionInterval}
            loadingPlan={currentPlanProp ? false : billed.loadingPlan}
            cancelUrl={typeof window !== "undefined" ? window.location.href : undefined}
          />

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#7A7A7A",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
                padding: 0,
              }}
            >
              {lang === "fr" ? "Pas maintenant" : "Not now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
