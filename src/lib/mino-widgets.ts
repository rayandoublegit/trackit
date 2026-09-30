import type { DashboardView } from "@/lib/dashboard-view-storage";
import type { MinoRevenueAsk } from "@/lib/mino-revenue-parse";

// What Mino builds under a reply instead of plain text. Stored with the chat
// (localStorage), so every widget carries its own data snapshot.

export type MinoCreatorRef = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  platform: string;
};

export type MinoRevenueSnapshot = {
  ask: MinoRevenueAsk;
  fetchedAt: number;
  /** ok: numbers to show; empty: nothing sold in the period; unknown_creator: the handle is not one of the brand's creators. */
  status: "ok" | "empty" | "unknown_creator";
  shopifyConnected: boolean;
  hasCampaigns: boolean;
  creatorCount: number;
  revenue: number;
  orders: number;
  commissionsEarned: number;
  /** Commissions paid out in the period (brand-wide only). */
  commissionsPaid: number | null;
  /** Outstanding balance right now (brand-wide, or of the focused creator). */
  owed: number | null;
  previousRevenue: number;
  daily: { date: string; revenue: number; orders: number }[];
  top: (MinoCreatorRef & { revenue: number; orders: number })[];
  /** Null when the creators list could not be read. */
  joined: (MinoCreatorRef & { joinedAt: string })[] | null;
  creator?: MinoCreatorRef;
  /** Real creator names to try when the handle was not found. */
  suggestions?: string[];
};

export type MinoActionKind = "navigate" | "pay" | "campaign" | "task" | "meeting";

export type MinoActionCard = {
  kind: MinoActionKind;
  title: string;
  detail?: string;
  view?: DashboardView;
  payoutCreatorId?: string;
  /** When the card was created: fresh cards open their page on their own. */
  at: number;
  /** False for confirmations that should not leave the chat (a meeting added). */
  autoOpen?: boolean;
};

export type MinoWidget =
  | { kind: "revenue"; snapshot: MinoRevenueSnapshot }
  | { kind: "action"; action: MinoActionCard }
  | { kind: "error"; retryText: string };

type AnalyticsCreatorRow = {
  id: string;
  full_name?: string;
  handle?: string;
  avatar_url?: string;
  platform?: string;
  periodRevenue?: number;
  periodCommission?: number;
  salesCount?: number;
  balance?: number;
};

type AnalyticsTimelineDay = { date: string; revenue: number; commission: number; salesCount: number };

type AnalyticsResponse = {
  error?: string;
  shopifyConnected?: boolean;
  totalRevenue?: number;
  totalCommissions?: number;
  accruedCommissions?: number;
  salesCount?: number;
  creatorsPerformance?: AnalyticsCreatorRow[];
  campaigns?: unknown[];
  revenueTimeline?: AnalyticsTimelineDay[];
  trends?: { revenue?: { previous?: number } };
  creatorFocus?: {
    id: string;
    revenue: number;
    commission: number;
    salesCount: number;
    previousRevenue: number;
    revenueTimeline: AnalyticsTimelineDay[];
  };
};

type BrandCreatorRow = {
  id?: string;
  full_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  platform?: string | null;
  balance?: number | string | null;
  created_at?: string | null;
};

const clean = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** The brand creator a handle or name points to, exact first, then partial. */
export function findBrandCreator<T extends { full_name?: string | null; handle?: string | null }>(
  rows: T[],
  query: string,
): T | null {
  const q = clean(query);
  if (!q) return null;
  return (
    rows.find((r) => clean(r.handle) === q || clean(r.full_name) === q) ||
    rows.find((r) => {
      const h = clean(r.handle);
      const n = clean(r.full_name);
      return (h.length > 2 && (h.includes(q) || q.includes(h))) || (n.length > 2 && (n.includes(q) || q.includes(n)));
    }) ||
    null
  );
}

function ref(row: { id?: string; full_name?: string | null; handle?: string | null; avatar_url?: string | null; platform?: string | null }): MinoCreatorRef {
  const handle = String(row.handle || "").replace(/^@/, "").trim();
  return {
    id: String(row.id || ""),
    name: String(row.full_name || "").trim() || handle,
    handle,
    avatarUrl: String(row.avatar_url || ""),
    platform: String(row.platform || "TikTok"),
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !data) throw new Error(`${url} → ${res.status}`);
  return data;
}

/**
 * Reads the brand's real numbers for a revenue ask from /api/analytics (sales,
 * commissions, daily series, top creators) and /api/creators (who joined, what
 * is owed). Throws when analytics cannot be read: the chat shows a retry.
 */
export async function loadRevenueSnapshot(userId: string, ask: MinoRevenueAsk): Promise<MinoRevenueSnapshot> {
  const tzOffset = new Date().getTimezoneOffset();
  const creatorsPromise = getJson<BrandCreatorRow[]>("/api/creators").then(
    (rows) => (Array.isArray(rows) ? rows : null),
    () => null,
  );

  let focus: BrandCreatorRow | null = null;
  const brandCreators = await (ask.creator ? creatorsPromise : Promise.resolve(null));
  if (ask.creator) {
    if (!brandCreators) throw new Error("creators unavailable");
    focus = findBrandCreator(brandCreators, ask.creator);
  }

  const base = {
    ask,
    fetchedAt: Date.now(),
    commissionsPaid: null,
    owed: null,
    previousRevenue: 0,
    daily: [],
    top: [],
    joined: null,
  };

  if (ask.creator && !focus) {
    const list = brandCreators ?? [];
    return {
      ...base,
      status: "unknown_creator",
      shopifyConnected: false,
      hasCampaigns: false,
      creatorCount: list.length,
      revenue: 0,
      orders: 0,
      commissionsEarned: 0,
      suggestions: list
        .map((c) => String(c.handle || c.full_name || "").replace(/^@/, "").trim())
        .filter(Boolean)
        .slice(0, 5),
    };
  }

  const params = new URLSearchParams({ userId, range: ask.range, tzOffset: String(tzOffset) });
  if (focus?.id) params.set("creator", String(focus.id));
  const [analytics, creators] = await Promise.all([
    getJson<AnalyticsResponse>(`/api/analytics?${params.toString()}`),
    brandCreators ? Promise.resolve(brandCreators) : creatorsPromise,
  ]);

  const timeline = (focus ? analytics.creatorFocus?.revenueTimeline : analytics.revenueTimeline) ?? [];
  const daily = timeline.slice(-ask.days).map((d) => ({ date: d.date, revenue: Number(d.revenue) || 0, orders: Number(d.salesCount) || 0 }));
  const perf = analytics.creatorsPerformance ?? [];
  const byId = new Map((creators ?? []).map((c) => [String(c.id), c]));

  const top = perf
    .filter((c) => (Number(c.periodRevenue) || 0) > 0)
    .slice(0, 5)
    .map((c) => ({
      ...ref({ ...byId.get(String(c.id)), ...c }),
      revenue: Number(c.periodRevenue) || 0,
      orders: Number(c.salesCount) || 0,
    }));

  const periodStart = daily[0]?.date ?? "";
  const joined =
    creators === null
      ? null
      : creators
          .filter((c) => c.created_at && periodStart && String(c.created_at).slice(0, 10) >= periodStart)
          .slice(0, 6)
          .map((c) => ({ ...ref(c), joinedAt: String(c.created_at) }));

  const owed = focus
    ? Number(focus.balance) || 0
    : creators
      ? creators.reduce((sum, c) => sum + (Number(c.balance) || 0), 0)
      : null;

  const revenue = focus ? analytics.creatorFocus?.revenue ?? 0 : Number(analytics.totalRevenue) || 0;
  const orders = focus ? analytics.creatorFocus?.salesCount ?? 0 : Number(analytics.salesCount) || 0;

  return {
    ...base,
    status: revenue > 0 || orders > 0 ? "ok" : "empty",
    shopifyConnected: Boolean(analytics.shopifyConnected),
    hasCampaigns: (analytics.campaigns?.length ?? 0) > 0,
    creatorCount: creators?.length ?? perf.length,
    revenue,
    orders,
    commissionsEarned: focus ? analytics.creatorFocus?.commission ?? 0 : Number(analytics.accruedCommissions) || 0,
    commissionsPaid: focus ? null : Number(analytics.totalCommissions) || 0,
    owed,
    previousRevenue: focus
      ? analytics.creatorFocus?.previousRevenue ?? 0
      : Number(analytics.trends?.revenue?.previous) || 0,
    daily,
    top: focus ? [] : top,
    joined: focus ? [] : joined,
    ...(focus ? { creator: ref(focus) } : {}),
  };
}
