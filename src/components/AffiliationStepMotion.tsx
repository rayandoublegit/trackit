"use client";

import { formatPricingAmount, PLAN_PRICES } from "@/lib/plan-marketing";
import { useLang } from "@/lib/useLang";

type StepVariant = "1" | "2" | "3";

export function AffiliationStepMotion({ step }: { step: StepVariant }) {
  const lang = useLang();
  const proPrice = formatPricingAmount(PLAN_PRICES.proMonthly, lang);
  const payoutSample = formatPricingAmount(3.8, lang);
  const currencySymbol = lang === "fr" ? "€" : "$";

  if (step === "1") {
    return (
      <div className="aff-step-motion aff-step-motion--share" aria-hidden>
        <div className="aff-step-motion__stage">
          <div className="aff-step-motion__link-card">
            <span className="aff-step-motion__link-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M10 13a4.5 4.5 0 0 0 3.2 1.35M14 7.5a4.5 4.5 0 1 1 0 7.9M10 17.65a4.5 4.5 0 1 1 0-7.9"
                  stroke="#0047FF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="aff-step-motion__link-url">trackit.app/ref/you</span>
            <span className="aff-step-motion__link-copy">Copy</span>
          </div>
          <span className="aff-step-motion__pulse aff-step-motion__pulse--1" />
          <span className="aff-step-motion__pulse aff-step-motion__pulse--2" />
          <span className="aff-step-motion__pulse aff-step-motion__pulse--3" />
        </div>
      </div>
    );
  }

  if (step === "2") {
    return (
      <div className="aff-step-motion aff-step-motion--signup" aria-hidden>
        <div className="aff-step-motion__stage">
          <div className="aff-step-motion__user aff-step-motion__user--a">
            <span />
            <span />
          </div>
          <div className="aff-step-motion__flow-line" />
          <div className="aff-step-motion__plan">
            <span className="aff-step-motion__plan-badge">Pro</span>
            <span className="aff-step-motion__plan-price">{proPrice}</span>
            <span className="aff-step-motion__plan-check">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aff-step-motion aff-step-motion--payout" aria-hidden>
      <div className="aff-step-motion__stage">
        <div className="aff-step-motion__wallet">
          <div className="aff-step-motion__coin-stack">
            <span className="aff-step-motion__coin aff-step-motion__coin--back" />
            <span className="aff-step-motion__coin aff-step-motion__coin--mid" />
            <span className="aff-step-motion__coin aff-step-motion__coin--front">{currencySymbol}</span>
          </div>
          <div className="aff-step-motion__payout-meta">
            <span className="aff-step-motion__payout-amount">+{payoutSample}</span>
            <span className="aff-step-motion__payout-label">20% · monthly</span>
          </div>
        </div>
        <span className="aff-step-motion__deposit aff-step-motion__deposit--1" />
        <span className="aff-step-motion__deposit aff-step-motion__deposit--2" />
      </div>
    </div>
  );
}
