export const OUTREACH_HISTORY_UPDATED_EVENT = "trackit-outreach-history-updated";

export function dispatchOutreachHistoryUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUTREACH_HISTORY_UPDATED_EVENT));
}

export function followUpIn3Days() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}
