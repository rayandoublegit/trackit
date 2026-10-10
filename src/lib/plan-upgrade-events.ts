import type { GateFeatureKey } from "@/lib/plan-marketing";
import { readPaywall, type PaywallBody, type PaywallFeature } from "@/lib/plan-paywall";

// "Open the upgrade modal for this feature" from anywhere in the brand
// dashboard (a 402 from an API route, a locked chip, an upsell). The
// PlanUpgradeHost mounted once in the dashboard listens and shows UpgradeModal.

export const PLAN_UPGRADE_EVENT = "trackit:plan-upgrade";

export type PlanUpgradeRequest = {
  feature: GateFeatureKey;
  /** Overrides the modal's description (e.g. a quota line). */
  description?: string;
};

export function openPlanUpgrade(feature: GateFeatureKey, opts: { description?: string } = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PlanUpgradeRequest>(PLAN_UPGRADE_EVENT, { detail: { feature, ...opts } }));
}

/** API paywall feature → upgrade modal gate. */
export const PAYWALL_GATE: Record<PaywallFeature, GateFeatureKey> = {
  "live-lookup": "live-lookup",
  "mino-analysis": "mino-analysis",
  "creator-emails": "creator-emails",
  "gifting-links": "gifting-links",
  "ai-outreach": "ai-outreach",
  campaigns: "campaigns",
  invitations: "invitations",
};

/** Opens the upgrade modal when a response is one of our 402 paywalls. Returns the paywall, or null. */
export function handlePaywallResponse(status: number, body: unknown): PaywallBody | null {
  const wall = readPaywall(status, body);
  if (wall) openPlanUpgrade(PAYWALL_GATE[wall.feature]);
  return wall;
}
