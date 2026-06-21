export const OUTREACH_HISTORY_UPDATED_EVENT = "trackit-outreach-history-updated";

export function dispatchOutreachHistoryUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUTREACH_HISTORY_UPDATED_EVENT));
}

export const PAYOUTS_UPDATED_EVENT = "trackit-payouts-updated";

export function dispatchPayoutsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYOUTS_UPDATED_EVENT));
}

export const SALES_UPDATED_EVENT = "trackit-sales-updated";

export function dispatchSalesUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SALES_UPDATED_EVENT));
}

export const CAMPAIGNS_UPDATED_EVENT = "trackit-campaigns-updated";

export function dispatchCampaignsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CAMPAIGNS_UPDATED_EVENT));
}

export function followUpIn3Days() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}
