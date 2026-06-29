export type CreatorScriptRef = {
  id: string;
  title: string;
};

export type CreatorCrm = {
  promoCode?: string;
  label?: string;
  phone?: string;
  address?: string;
  birthday?: string;
  lastEmail?: string;
  conversations?: string;
  commissionRate?: number | null;
  documents?: string[];
  scripts?: CreatorScriptRef[];
};

export function parseCommissionRate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const v = value.trim().replace(/%$/, "");
    if (!v) return undefined;
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Affiliate codes like EMMA15 → 15% commission when no CRM rate is set. */
export function commissionRateFromDiscountCode(code: string): number | undefined {
  const match = String(code || "").trim().toUpperCase().match(/(\d{1,2})$/);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  if (n > 0 && n <= 100) return n;
  return undefined;
}

export type CreatorListMetrics = {
  engagement: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
};

export function crmFromSnapshot(snapshot: Record<string, unknown> | null | undefined): CreatorCrm {
  if (!snapshot || typeof snapshot !== "object") return {};
  const crm = snapshot.crm;
  if (!crm || typeof crm !== "object") return {};
  const c = crm as Record<string, unknown>;
  return {
    promoCode:
      typeof c.promoCode === "string"
        ? c.promoCode
        : typeof c.rate === "string"
          ? c.rate
          : undefined,
    label: typeof c.label === "string" ? c.label : undefined,
    phone: typeof c.phone === "string" ? c.phone : undefined,
    address: typeof c.address === "string" ? c.address : undefined,
    birthday: typeof c.birthday === "string" ? c.birthday : undefined,
    lastEmail: typeof c.lastEmail === "string" ? c.lastEmail : undefined,
    conversations: typeof c.conversations === "string" ? c.conversations : undefined,
    commissionRate:
      parseCommissionRate(c.commissionRate) ?? parseCommissionRate(c.commission_rate),
    documents: Array.isArray(c.documents) ? c.documents.map(String) : undefined,
    scripts: Array.isArray(c.scripts)
      ? c.scripts
          .map((s) => {
            if (!s || typeof s !== "object") return null;
            const row = s as Record<string, unknown>;
            const id = typeof row.id === "string" ? row.id : "";
            const title = typeof row.title === "string" ? row.title : "";
            if (!id || !title) return null;
            return { id, title };
          })
          .filter((s): s is CreatorScriptRef => s !== null)
      : undefined,
  };
}

export function metricsFromRow(
  snapshot: Record<string, unknown> | null | undefined,
  engagementRate: number
): CreatorListMetrics {
  const s = snapshot ?? {};
  return {
    engagement: engagementRate,
    avgViews: Number(s.avgViews ?? s.avg_views ?? 0) || 0,
    avgLikes: Number(s.avgLikes ?? s.avg_likes ?? 0) || 0,
    avgComments: Number(s.avgComments ?? s.avg_comments ?? 0) || 0,
    avgShares: Number(s.avgShares ?? s.avg_shares ?? 0) || 0,
  };
}

export function emailFromRow(snapshot: Record<string, unknown> | null | undefined): string {
  if (snapshot && typeof snapshot.email === "string" && snapshot.email.trim()) {
    return snapshot.email.trim();
  }
  return "";
}
