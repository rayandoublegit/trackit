export type StoredAffiliate = {
  creator: string;
  platform: string;
  ref: string;
  code: string;
  clicks: number;
  conversions: number;
  sales: number;
  commission: number;
  status: string;
};

function storageKey(userId: string) {
  return `trackit_affiliates_${userId}`;
}

function isStoredAffiliate(value: unknown): value is StoredAffiliate {
  if (typeof value !== "object" || value === null) return false;
  const row = value as StoredAffiliate;
  return (
    typeof row.creator === "string" &&
    typeof row.platform === "string" &&
    typeof row.ref === "string" &&
    typeof row.code === "string" &&
    typeof row.clicks === "number" &&
    typeof row.conversions === "number" &&
    typeof row.sales === "number" &&
    typeof row.commission === "number" &&
    typeof row.status === "string"
  );
}

export function loadAffiliates(userId: string): StoredAffiliate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAffiliate);
  } catch {
    return [];
  }
}

export function saveAffiliates(userId: string, affiliates: StoredAffiliate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(affiliates));
  } catch {
    /* storage unavailable */
  }
}

export function removeAffiliate(userId: string, ref: string): StoredAffiliate[] {
  const next = loadAffiliates(userId).filter((row) => row.ref !== ref);
  saveAffiliates(userId, next);
  return next;
}
