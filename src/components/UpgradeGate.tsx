"use client";

import type { CSSProperties } from "react";
import {
  FEATURE_GATES,
  getPlanMarketingFeatures,
  planDisplayName,
  PLAN_PRICES,
  type GateFeatureKey,
} from "@/lib/plan-marketing";
import type { Lang } from "@/lib/useLang";
import { formatPricingAmount } from "@/lib/plan-marketing";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const btnPrimary: CSSProperties = {
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 999,
  padding: "12px 28px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

export function UpgradeGate({
  featureKey,
  onUpgrade,
  isMobile,
  lang,
  onViewPricing,
}: {
  featureKey: GateFeatureKey;
  onUpgrade: () => void;
  isMobile?: boolean;
  lang: Lang;
  onViewPricing?: () => void;
}) {
  const gate = FEATURE_GATES[featureKey];
  const requiredName = planDisplayName(gate.requiredTier, lang);
  const title = gate.title[lang];
  const description = gate.description[lang];
  const highlights = getPlanMarketingFeatures(gate.requiredTier, lang, "compact").slice(0, 5);

  const monthlyPrice =
    gate.requiredTier === "scale"
      ? PLAN_PRICES.scaleMonthly
      : gate.requiredTier === "pro"
        ? PLAN_PRICES.proMonthly
        : PLAN_PRICES.growthMonthly;

  const subtitle =
    lang === "fr"
      ? `${title} est disponible à partir du plan ${requiredName}.`
      : `${title} is available on the ${requiredName} plan and above.`;

  const body =
    lang === "fr"
      ? `${description} Passez à ${requiredName} pour débloquer cette fonctionnalité.`
      : `${description} Upgrade to ${requiredName} to unlock this feature.`;

  const ctaLabel = lang === "fr" ? `Passer à ${requiredName}` : `Upgrade to ${requiredName}`;
  const pricingLabel = lang === "fr" ? "Voir tous les plans" : "View all plans";

  return (
    <>
      <div style={{ padding: isMobile ? "56px 16px 0" : "40px 40px 0", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>
          {title}
        </h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: "6px 0 0" }}>{subtitle}</p>
      </div>
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            padding: isMobile ? "32px 24px" : "56px 48px",
            textAlign: "center",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <img
            src={TRACKIT_LOGO_URL}
            alt="Trackit"
            style={{ height: isMobile ? 56 : 64, width: "auto", margin: "0 auto 16px", display: "block" }}
          />
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "#0047FF",
              background: "rgba(0, 71, 255, 0.08)",
              padding: "5px 12px",
              borderRadius: 999,
              marginBottom: 14,
            }}
          >
            {requiredName} · {formatPricingAmount(monthlyPrice, lang)}
            {lang === "fr" ? "/mois" : "/mo"}
          </div>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#1A1A1A",
              letterSpacing: "-0.03em",
              margin: "0 0 8px",
            }}
          >
            {lang === "fr" ? `Débloquez ${title}` : `Unlock ${title}`}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#7A7A7A",
              letterSpacing: "-0.02em",
              margin: "0 0 20px",
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
          <ul
            style={{
              listStyle: "none",
              margin: "0 0 24px",
              padding: 0,
              textAlign: "left",
              display: "inline-block",
            }}
          >
            {highlights.map((item) => (
              <li
                key={item}
                style={{
                  fontSize: 13,
                  color: "#1A1A1A",
                  letterSpacing: "-0.02em",
                  marginBottom: 8,
                  paddingLeft: 22,
                  position: "relative",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 2, color: "#9A9A9A" }} aria-hidden>
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: 10,
              justifyContent: "center",
            }}
          >
            <button type="button" style={btnPrimary} onClick={() => void onUpgrade()}>
              {ctaLabel}
            </button>
            {onViewPricing ? (
              <button
                type="button"
                onClick={onViewPricing}
                style={{
                  ...btnPrimary,
                  background: "#FFFFFF",
                  color: "#1A1A1A",
                  border: "1px solid #E5E5E5",
                }}
              >
                {pricingLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
