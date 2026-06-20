const STORAGE_PREFIX = "trackit_live_sales_dismissed_";

export function loadDismissedSaleIds(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function saveDismissedSaleIds(userId: string, ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable */
  }
}

export function dismissSaleFeedItems(userId: string, saleIds: string[]) {
  const next = loadDismissedSaleIds(userId);
  for (const id of saleIds) next.add(id);
  saveDismissedSaleIds(userId, next);
  return next;
}

const HISTORY_STORAGE_PREFIX = "trackit_commission_history_dismissed_";

export function loadDismissedCommissionHistoryIds(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${HISTORY_STORAGE_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function dismissCommissionHistoryItems(userId: string, saleIds: string[]) {
  const next = loadDismissedCommissionHistoryIds(userId);
  for (const id of saleIds) next.add(id);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${HISTORY_STORAGE_PREFIX}${userId}`, JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
  }
  return next;
}
