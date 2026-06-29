"use client";

import {
  formatUpgradePrimaryLabel,
  getGateModalProps,
  getLimitUpgradeModalProps,
  type GateFeatureKey,
  type LimitGateKind,
} from "@/lib/plan-marketing";
import type { PlanTier } from "@/lib/plan-limits";

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

function parseUpgradeMessage(message: string, lang: "en" | "fr") {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = (lines[0] ?? "").replace(/^🔒\s*/, "");
  const ctaLines = lines.filter((line) => line.includes("→"));
  const rawCta = ctaLines[ctaLines.length - 1] ?? "";
  const [primaryPart, ...ctaTail] = rawCta.split("→").map((part) => part.trim()).filter(Boolean);
  const primaryLabel =
    primaryPart ||
    (lang === "fr" ? "Voir les plans" : "View plans");
  const contentLines = lines.slice(1).filter((line) => !ctaLines.includes(line));
  const description = contentLines[0] ?? "";
  const bullets = [...contentLines.slice(1), ...ctaTail];
  const planMatch = `${title} ${primaryLabel}`.match(/\b(Growth|Pro|Scale)\b/i);
  const planBadge = planMatch?.[1];

  return { title, description, bullets, primaryLabel, planBadge };
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#0047FF" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 118 0v3" stroke="#0047FF" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l5 5L19 7" stroke="#0047FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UpgradeModal({
  lang,
  onClose,
  message,
  title: titleProp,
  description: descriptionProp,
  bullets: bulletsProp,
  primaryLabel: primaryLabelProp,
  onPrimary,
  planBadge: planBadgeProp,
  showAllPlansLink = true,
  featureKey,
  limitKind,
  currentPlan,
}: UpgradeModalProps) {
  const parsed = message ? parseUpgradeMessage(message, lang) : null;
  const fromLimit =
    limitKind && currentPlan ? getLimitUpgradeModalProps(limitKind, currentPlan, lang) : null;
  const fromGate = featureKey ? getGateModalProps(featureKey, lang) : null;
  const resolved = fromLimit ?? fromGate;

  const title =
    titleProp ??
    parsed?.title ??
    resolved?.title ??
    (lang === "fr" ? "Fonctionnalité premium" : "Premium feature");
  const description = descriptionProp ?? parsed?.description ?? resolved?.description ?? "";
  const bullets = bulletsProp ?? parsed?.bullets ?? resolved?.bullets ?? [];
  const planBadge = planBadgeProp ?? parsed?.planBadge ?? resolved?.planBadge;
  const primaryLabel =
    primaryLabelProp ??
    parsed?.primaryLabel ??
    (resolved ? formatUpgradePrimaryLabel(resolved.requiredTier, lang) : lang === "fr" ? "Voir les plans" : "View plans");

  const handlePrimary = () => {
    if (onPrimary) {
      onPrimary();
      return;
    }
    window.location.href = "/#pricing";
  };

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
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          maxWidth: 440,
          width: "100%",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          border: "1px solid #EFEFEF",
          textAlign: "left",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            padding: "22px 24px 18px",
            background: "linear-gradient(180deg, #EEF4FF 0%, #FFFFFF 100%)",
            borderBottom: "1px solid #E8EEF9",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === "fr" ? "Fermer" : "Close"}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
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
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 36 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "rgba(0,71,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <LockIcon />
            </div>
            <div style={{ minWidth: 0 }}>
              {planBadge && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#0047FF",
                    background: "#FFFFFF",
                    border: "1px solid #D4E2FF",
                    borderRadius: 999,
                    padding: "3px 8px",
                    marginBottom: 8,
                  }}
                >
                  {planBadge}
                </span>
              )}
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#1A1A1A",
                  margin: 0,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h3>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          {description && (
            <p
              style={{
                fontSize: 14,
                color: "#5A5A5A",
                lineHeight: 1.55,
                margin: "0 0 16px",
                letterSpacing: "-0.01em",
              }}
            >
              {description}
            </p>
          )}

          {bullets.length > 0 && (
            <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {bullets.map((bullet) => (
                <li key={bullet} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#EEF4FF",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <CheckIcon />
                  </span>
                  <span style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={handlePrimary}
            style={{
              width: "100%",
              background: "#0047FF",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 12,
              padding: "13px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
            }}
          >
            {primaryLabel} →
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 14 }}>
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
            {showAllPlansLink && (
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/#pricing";
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#0047FF",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                  padding: 0,
                }}
              >
                {lang === "fr" ? "Comparer les plans" : "Compare plans"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
