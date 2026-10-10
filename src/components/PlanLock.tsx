"use client";

import { useEffect, useState } from "react";
import { UpgradeModal } from "@/app/dashboard/UpgradeModal";
import type { PlanTier } from "@/lib/plan-limits";
import { FEATURE_GATES, planDisplayName, type GateFeatureKey } from "@/lib/plan-marketing";
import { openPlanUpgrade, PLAN_UPGRADE_EVENT, type PlanUpgradeRequest } from "@/lib/plan-upgrade-events";
import type { Lang } from "@/lib/useLang";
import "./plan-lock.css";

// Small paywall pieces shared by the dashboard: the upgrade modal host, the
// locked email chip and the inline upsell. Colours come from the --ws-* tokens
// (light and dark).

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Mounted once in the brand dashboard: shows UpgradeModal for openPlanUpgrade() requests. */
export function PlanUpgradeHost({ lang, plan }: { lang: Lang; plan: PlanTier }) {
  const [request, setRequest] = useState<PlanUpgradeRequest | null>(null);
  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<PlanUpgradeRequest>).detail;
      if (detail?.feature && FEATURE_GATES[detail.feature]) setRequest(detail);
    };
    window.addEventListener(PLAN_UPGRADE_EVENT, onRequest);
    return () => window.removeEventListener(PLAN_UPGRADE_EVENT, onRequest);
  }, []);
  if (!request) return null;
  return (
    <UpgradeModal
      lang={lang}
      currentPlan={plan}
      featureKey={request.feature}
      description={request.description}
      onClose={() => setRequest(null)}
    />
  );
}

/**
 * Email hidden by the plan: a blurred placeholder and "Unlock emails".
 * `hasEmail` false: nothing to unlock, renders null.
 */
export function LockedEmailChip({ lang, hasEmail = true, compact = false }: { lang: Lang; hasEmail?: boolean; compact?: boolean }) {
  if (!hasEmail) return null;
  const fr = lang === "fr";
  return (
    <button
      type="button"
      className={`pl-email${compact ? " pl-email--compact" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openPlanUpgrade("creator-emails");
      }}
      title={fr ? "Débloquer les e-mails avec Growth" : "Unlock emails with Growth"}
    >
      <LockIcon />
      {!compact ? <span className="pl-email__blur" aria-hidden>contact@creator.com</span> : null}
      <span className="pl-email__cta">{fr ? "Débloquer les e-mails" : "Unlock emails"}</span>
    </button>
  );
}

/** Inline upsell line: "<title> — <Plan>" + short body + button. */
export function UpgradeNudge({
  lang,
  feature,
  title,
  body,
  cta,
}: {
  lang: Lang;
  feature: GateFeatureKey;
  title?: string;
  body?: string;
  cta?: string;
}) {
  const fr = lang === "fr";
  const gate = FEATURE_GATES[feature];
  const planName = planDisplayName(gate.requiredTier, lang);
  return (
    <div className="pl-nudge">
      <div className="pl-nudge__text">
        <strong>
          <LockIcon size={11} /> {title ?? `${gate.title[lang]} — ${planName}`}
        </strong>
        {body ? <span>{body}</span> : null}
      </div>
      <button type="button" className="pl-nudge__btn" onClick={() => openPlanUpgrade(feature)}>
        {cta ?? (fr ? `Passer à ${planName}` : `Upgrade to ${planName}`)}
      </button>
    </div>
  );
}
