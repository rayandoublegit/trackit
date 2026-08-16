"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { saveCampaign, getCampaigns, getSavedCreators, saveCreator, updateCampaignStatus, updateCampaign, deleteCampaign, getCampaignCreatorAttribution, syncCampaignCreators, attachCreatorSalesToCampaign, fetchCreatorBrandSalesSummary } from "@/lib/db";
import { clientBrandScope } from "@/lib/brand-workspace";
import { CreatorAvatar } from "./CreatorAvatar";
import { AnalyticsPeriodDropdown } from "./AnalyticsPeriodDropdown";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import { notifyCampaignCreated, notifyCreatorPaid, notifySaleRecorded } from "@/lib/notifications-storage";
import { primeNotificationSound } from "@/lib/notification-sound";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  canUseManualPayouts,
  FREE_MAX_CAMPAIGNS,
  getMaxActiveCampaigns,
  getMaxManagedCreators,
  hasReachedCampaignLimit,
  type PlanTier,
} from "@/lib/plan-limits";
import { isDemoPresetCampaign } from "@/lib/demo-preset-data";
import { listFolders, listSaved, type FolderRow, type FolderItem, type SavedRow } from "@/lib/workspace-client";
import { useAnalyticsAutoRefresh } from "@/lib/analytics-auto-refresh";
import { PAYOUTS_UPDATED_EVENT, SALES_UPDATED_EVENT, CAMPAIGNS_UPDATED_EVENT, dispatchCampaignsUpdated, dispatchPayoutsUpdated, dispatchSalesUpdated } from "@/lib/outreach-history-events";
import { computeTrend, dayKeyFromIso, fillTimelineDays, formatTrendLabel, isWithinPeriod, resolveAnalyticsDateBounds, analyticsPeriodLabel, ANALYTICS_PERIOD_OPTIONS, toDayKey, type AnalyticsDateRange, type PeriodTrend } from "@/lib/analytics-periods";
import {
  AnalyticsSectionHeader,
  HeroBarChartCard,
  SummaryMetricCard,
} from "./analytics-metric-cards";
import { AnalyticsSalesPanel } from "./AnalyticsSalesPanel";
import { AddSalePanel } from "./AddSalePanel";
import { formatCurrency, formatCurrencyWithCode, useDisplayCurrency, type DisplayCurrency } from "@/lib/useCurrency";
import { getDisplayCurrency } from "@/lib/locale-preferences";
import { rememberLastCampaignId } from "@/lib/last-campaign-storage";
import {
  compactNumberToInput,
  formatCompactCurrency,
  formatCompactNumber,
  getCompactNumberInputError,
  parseCompactNumber,
} from "@/lib/compact-number";
import { UpgradeModal } from "./UpgradeModal";
import { getLimitUpgradeModalProps, runGateUpgrade, runTierUpgrade } from "@/lib/plan-marketing";
import { SplitHeaderActions, type SplitMenuItem } from "./SplitHeaderActions";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { isDetailTab } from "@/lib/dashboard-navigation";
import { avatarFromDiscoverySavedRow, buildAvatarByHandleFromSavedRows } from "@/lib/creator-avatar";
import {
  computeCampaignSalesTotals,
  isSaleAttributedToCampaign,
  type CampaignCreatorLinkMap,
  type CampaignSalesMeta,
} from "@/lib/campaign-sales-attribution";
import {
  enrichCreatorsWithAvatars,
  enrichCreatorsWithSavedAvatarsClient,
} from "@/lib/enrich-creator-avatars";
import {
  COMMISSION_NOT_CONFIGURED_CODE,
  commissionNotConfiguredMessage,
  commissionRateFromDiscoverySnapshot,
  normalizeCreatorHandle,
} from "@/lib/managed-creator-commission";
import { parseCommissionRate } from "@/lib/creator-crm";
import {
  selectionAccentText,
  selectionCardStyle,
  selectionTextMuted,
  selectionTextPrimary,
  selectionTextSecondary,
} from "@/lib/selection-card-styles";

type CampaignStatus = "Active" | "Paused" | "Completed" | "Draft";
type CampaignFilter = "all" | "active" | "paused" | "completed";
type BoardTab = "active" | "drafts" | "finished";
type CampaignSort = "recent" | "name";
type DetailTab = "creators" | "analytics";
type CampaignDateRange = { start: string; end: string };

type CampaignAnalyticsExport = {
  campaignName: string;
  dateRange: CampaignDateRange;
  currency: DisplayCurrency;
  rows: CampaignCreatorRow[];
  totals: { sales: number; commission: number };
  pendingPayouts: number;
  roi: number | null;
};

type CampaignCreatorRow = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
  platform?: string;
  salesCount: number;
  salesAmount: number;
  commission: number;
  commissionPaid: number;
  roi: number | null;
  historicalSalesAttached?: boolean;
  brandSalesCount?: number;
  brandSalesRevenue?: number;
};

type Campaign = {
  id: string;
  name: string;
  creators: number;
  platform: string;
  sales: number;
  commission: number;
  status: CampaignStatus;
  start: string;
  end: string;
  startRaw?: string;
  endRaw?: string;
  description?: string;
  commissionType?: string;
  commissionRate?: number;
  autoPayout?: boolean;
  creatorIds?: string[];
  createdAt?: string;
};

type SavedCreatorOption = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
  platform?: string;
  commission_rate?: number;
  discount_code?: string;
};

type SaleRow = {
  order_amount?: number;
  commission_amount?: number;
  created_at?: string;
  campaign_id?: string | null;
  creator_id?: string;
};
type CreatorBalanceRow = { balance?: number };

type CampaignKpiStats = {
  activeCount: number;
  endingThisMonth: number;
  totalCreators: number;
  totalCampaigns: number;
  totalSales: number;
  totalCommissionOwed: number;
  pendingPayouts: number;
  salesTrend: PeriodTrend;
};

function normalizeCampaignStatus(status: string): CampaignStatus {
  const s = (status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "paused") return "Paused";
  if (s === "completed") return "Completed";
  return "Draft";
}

function formatCampaignDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseCampaignDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function isEndingThisMonth(dateStr: string | undefined, now = new Date()): boolean {
  const d = parseCampaignDate(dateStr);
  if (!d) return false;
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function mapDbCampaign(
  row: Record<string, unknown>,
  creatorIds?: string[],
  salesTotals?: { sales: number; commission: number },
): Campaign {
  const startRaw = row.start_date ? String(row.start_date) : undefined;
  const endRaw = row.end_date ? String(row.end_date) : undefined;
  const ids = creatorIds ?? (Array.isArray(row.creator_ids) ? row.creator_ids.map(String) : undefined);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    creators: ids?.length ?? Number(row.creators ?? 0),
    platform: String(row.platform ?? ""),
    sales: salesTotals?.sales ?? 0,
    commission: salesTotals?.commission ?? 0,
    status: normalizeCampaignStatus(String(row.status ?? "draft")),
    start: formatCampaignDate(startRaw),
    end: formatCampaignDate(endRaw),
    startRaw,
    endRaw,
    description: typeof row.description === "string" ? row.description : undefined,
    commissionType: String(row.commission_type ?? "percentage"),
    commissionRate: Number(row.commission_rate ?? 10),
    autoPayout: Boolean(row.auto_payout ?? false),
    creatorIds: ids,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

// Clamp a commission rate string to a sane 0-100 range. Returns a number.
function clampRate(raw: string, fallback = 10): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

// Normalize a date value to ISO (YYYY-MM-DD), or undefined if unparseable.
function normalizeDate(raw: string | undefined): string | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Guard against partial inputs the Date constructor over-accepts (e.g. a bare "22").
  if (!/[a-zA-Z]/.test(s) && !/\d{4}/.test(s)) return undefined;
  return parsed.toISOString().split("T")[0];
}

function toDateInputValue(raw: string | undefined): string {
  if (!raw || raw === "—") return "";
  const normalized = normalizeDate(raw.trim());
  return normalized ?? "";
}

function formatDateLabel(raw: string, lang: "en" | "fr"): string {
  if (!raw.trim()) return "";
  const iso = toDateInputValue(raw);
  if (!iso) return raw;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mapSavedCreator(row: Record<string, unknown>): SavedCreatorOption {
  return {
    id: String(row.id ?? ""),
    handle: String(row.handle ?? row.username ?? ""),
    full_name: typeof row.full_name === "string" ? row.full_name : undefined,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
    platform: typeof row.platform === "string" ? row.platform : undefined,
    commission_rate: Number(row.commission_rate ?? 10) || 10,
    discount_code: typeof row.discount_code === "string" ? row.discount_code : undefined,
  };
}

function campaignRowFingerprint(row: Record<string, unknown>): string {
  const name = String(row.name ?? "").trim().toLowerCase();
  const platform = String(row.platform ?? "").trim().toLowerCase();
  const minute = row.created_at ? String(row.created_at).slice(0, 16) : "";
  return `${name}|${platform}|${minute}`;
}

async function fetchScopedRows<T>(
  withWorkspace: () => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  withoutWorkspace: () => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
): Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }> {
  const first = await withWorkspace();
  const msg = (first.error?.message || "").toLowerCase();
  const missingWs =
    first.error?.code === "42703" ||
    (msg.includes("workspace_id") && msg.includes("does not exist"));
  if (missingWs) return withoutWorkspace();
  return first;
}

async function fetchCampaignBoardData(resolvedUserId: string): Promise<{
  campaigns: Campaign[];
  sales: SaleRow[];
  creators: CreatorBalanceRow[];
}> {
  const { ownerId, spaceId } = clientBrandScope(resolvedUserId);
  const [campaignData, salesResult, creatorsResult, attribution] = await Promise.all([
    getCampaigns(ownerId),
    fetchScopedRows(
      () =>
        supabase!
          .from("sales")
          .select("order_amount, commission_amount, created_at, campaign_id, creator_id")
          .eq("user_id", ownerId)
          .eq("workspace_id", spaceId),
      () =>
        supabase!
          .from("sales")
          .select("order_amount, commission_amount, created_at, campaign_id, creator_id")
          .eq("user_id", ownerId),
    ),
    fetchScopedRows(
      () =>
        supabase!
          .from("creators")
          .select("balance")
          .eq("user_id", ownerId)
          .eq("workspace_id", spaceId),
      () => supabase!.from("creators").select("balance").eq("user_id", ownerId),
    ),
    getCampaignCreatorAttribution(ownerId),
  ]);

  const { creatorCounts, linkMeta } = attribution;

  const campaignMeta: Record<string, CampaignSalesMeta> = {};
  for (const row of campaignData) {
    campaignMeta[String(row.id)] = {
      status: String(row.status ?? ""),
      created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    };
  }

  const salesRows = (salesResult.data || []) as SaleRow[];
  const salesTotals = computeCampaignSalesTotals(salesRows, creatorCounts, linkMeta);

  return {
    campaigns: dedupeCampaignRows(campaignData).map((row) =>
      mapDbCampaign(
        row as Record<string, unknown>,
        creatorCounts[String(row.id)] ?? [],
        salesTotals[String(row.id)],
      ),
    ),
    sales: salesRows,
    creators: (creatorsResult.data || []) as CreatorBalanceRow[],
  };
}

function dedupeCampaignRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  return rows.filter((row) => {
    const id = String(row.id ?? "");
    if (id) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
    }
    const fingerprint = campaignRowFingerprint(row);
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });
}

type CreatorCampaignStats = { salesCount: number; salesAmount: number; commission: number };

function computeCreatorStatsForCampaign(
  sales: SaleRow[],
  campaignId: string,
  _creatorIds: string[],
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
  dateBounds?: { start: Date; end: Date },
  linkMeta?: CampaignCreatorLinkMap,
): Record<string, CreatorCampaignStats> {
  const totals: Record<string, CreatorCampaignStats> = {};

  const add = (creatorId: string, orderAmount: number, commissionAmount: number) => {
    if (!totals[creatorId]) totals[creatorId] = { salesCount: 0, salesAmount: 0, commission: 0 };
    totals[creatorId].salesCount += 1;
    totals[creatorId].salesAmount += orderAmount;
    totals[creatorId].commission += commissionAmount;
  };

  for (const sale of sales) {
    if (!sale.creator_id) continue;
    if (!isSaleAttributedToCampaign(sale, campaignId, creatorCounts, linkMeta)) continue;
    if (dateBounds && !isWithinPeriod(sale.created_at, dateBounds.start, dateBounds.end)) continue;

    add(String(sale.creator_id), Number(sale.order_amount) || 0, Number(sale.commission_amount) || 0);
  }

  return totals;
}

function computeCampaignPeriodTotals(
  sales: SaleRow[],
  campaignId: string,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
  dateBounds?: { start: Date; end: Date },
  linkMeta?: CampaignCreatorLinkMap,
): { sales: number; commission: number } {
  let salesTotal = 0;
  let commissionTotal = 0;

  for (const sale of sales) {
    if (!isSaleAttributedToCampaign(sale, campaignId, creatorCounts, linkMeta)) continue;
    if (dateBounds && !isWithinPeriod(sale.created_at, dateBounds.start, dateBounds.end)) continue;
    salesTotal += Number(sale.order_amount) || 0;
    commissionTotal += Number(sale.commission_amount) || 0;
  }

  return { sales: salesTotal, commission: commissionTotal };
}

function computeCampaignScopedMetricTrend(
  sales: SaleRow[],
  campaignId: string,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
  metric: (sale: SaleRow) => number,
  now = new Date(),
  customBounds?: { start: Date; end: Date },
  linkMeta?: CampaignCreatorLinkMap,
): PeriodTrend {
  const belongsToCampaign = (sale: SaleRow) =>
    isSaleAttributedToCampaign(sale, campaignId, creatorCounts, linkMeta);

  const sumInPeriod = (start: Date, end: Date) =>
    sales
      .filter((sale) => belongsToCampaign(sale) && isWithinPeriod(sale.created_at, start, end))
      .reduce((sum, sale) => sum + metric(sale), 0);

  if (customBounds) {
    const durationMs = customBounds.end.getTime() - customBounds.start.getTime();
    const prevEnd = new Date(customBounds.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    prevStart.setHours(0, 0, 0, 0);
    prevEnd.setHours(23, 59, 59, 999);
    return computeTrend(sumInPeriod(customBounds.start, customBounds.end), sumInPeriod(prevStart, prevEnd));
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setDate(0);
  prevMonthEnd.setHours(23, 59, 59, 999);
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);

  return computeTrend(sumInPeriod(monthStart, monthEnd), sumInPeriod(prevMonthStart, prevMonthEnd));
}

function computeCampaignScopedSalesTrend(
  sales: SaleRow[],
  campaignId: string,
  _creatorIds: string[],
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
  now = new Date(),
  customBounds?: { start: Date; end: Date },
  linkMeta?: CampaignCreatorLinkMap,
): PeriodTrend {
  return computeCampaignScopedMetricTrend(
    sales,
    campaignId,
    creatorCounts,
    campaignMeta,
    (sale) => Number(sale.order_amount) || 0,
    now,
    customBounds,
    linkMeta,
  );
}

function previousBoundsFromCurrent(dateBounds: { start: Date; end: Date }): { start: Date; end: Date } {
  const durationMs = dateBounds.end.getTime() - dateBounds.start.getTime();
  const prevEnd = new Date(dateBounds.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  prevStart.setHours(0, 0, 0, 0);
  prevEnd.setHours(23, 59, 59, 999);
  return { start: prevStart, end: prevEnd };
}

function buildCampaignTimeline(
  sales: SaleRow[],
  campaignId: string,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
  dateBounds?: { start: Date; end: Date },
  linkMeta?: CampaignCreatorLinkMap,
): CampaignAnalyticsTimelinePoint[] {
  // Include previous period → current so bar charts can bridge both.
  const spanStart = dateBounds ? previousBoundsFromCurrent(dateBounds).start : undefined;
  const spanEnd = dateBounds?.end;

  const dayMap = new Map<string, { revenue: number; commission: number; salesCount: number }>();
  for (const sale of sales) {
    if (!isSaleAttributedToCampaign(sale, campaignId, creatorCounts, linkMeta)) continue;
    if (spanStart && spanEnd && !isWithinPeriod(sale.created_at, spanStart, spanEnd)) continue;
    if (!spanStart && dateBounds && !isWithinPeriod(sale.created_at, dateBounds.start, dateBounds.end)) continue;
    const day = dayKeyFromIso(String(sale.created_at));
    if (!day) continue;
    const agg = dayMap.get(day) || { revenue: 0, commission: 0, salesCount: 0 };
    agg.revenue += Number(sale.order_amount) || 0;
    agg.commission += Number(sale.commission_amount) || 0;
    agg.salesCount += 1;
    dayMap.set(day, agg);
  }
  const sparse = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({
      date,
      revenue: agg.revenue,
      commission: agg.commission,
      salesCount: agg.salesCount,
      net: Math.max(0, agg.revenue - agg.commission),
    }));

  if (!dateBounds || !spanStart || !spanEnd) return sparse;

  return fillTimelineDays(sparse, spanStart, spanEnd);
}

function sumCommissionByCreator(sales: SaleRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sale of sales) {
    if (!sale.creator_id) continue;
    const id = String(sale.creator_id);
    map.set(id, (map.get(id) || 0) + (Number(sale.commission_amount) || 0));
  }
  return map;
}

function sumPaidByCreator(
  payouts: Array<{ creator_id?: string | null; amount?: number | null; status?: string | null }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const payout of payouts) {
    if (String(payout.status || "").toLowerCase() !== "paid") continue;
    const id = String(payout.creator_id || "");
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + (Number(payout.amount) || 0));
  }
  return map;
}

function attributePaidToCampaignScope(
  commissionPaidAllTime: number,
  campaignCommission: number,
  totalCommissionAllCampaigns: number,
): number {
  if (commissionPaidAllTime <= 0 || campaignCommission <= 0 || totalCommissionAllCampaigns <= 0) return 0;
  return commissionPaidAllTime * (campaignCommission / totalCommissionAllCampaigns);
}

function computeCreatorBrandCost(campaignCommission: number, campaignCommissionPaid: number): number {
  if (campaignCommissionPaid > 0) return campaignCommissionPaid;
  return campaignCommission;
}

function computeCreatorCampaignRoi(revenue: number, brandCost: number): number | null {
  if (revenue <= 0 || brandCost <= 0) return null;
  return revenue / brandCost;
}

function formatCampaignRoi(roi: number | null | undefined): string {
  if (roi == null || roi <= 0) return "—";
  return `${roi.toFixed(1)}×`;
}

function CampaignRoiCell({ roi }: { roi: number | null | undefined; lang?: "en" | "fr" }) {
  if (roi == null || roi <= 0) return <span>—</span>;
  const profitable = roi >= 1;
  return (
    <span style={{ fontWeight: 500, color: profitable ? "#166534" : "#991B1B" }}>
      {formatCampaignRoi(roi)}
    </span>
  );
}

function resolveCampaignCreatorIds(
  campaign: Campaign,
  creatorCounts: Record<string, string[]>,
): string[] {
  const fromDb = (creatorCounts[campaign.id] ?? []).map(String);
  const fromCampaign = (campaign.creatorIds ?? []).map(String);
  return [...new Set([...fromDb, ...fromCampaign])];
}

type CampaignAnalyticsTimelinePoint = {
  date: string;
  revenue: number;
  commission: number;
  salesCount: number;
  net: number;
};

type CampaignAnalyticsSnapshot = {
  rows: CampaignCreatorRow[];
  monthRows: CampaignCreatorRow[];
  totals: { sales: number; commission: number };
  salesTrend: PeriodTrend;
  commissionTrend: PeriodTrend;
  netRevenueTrend: PeriodTrend;
  roiTrend: PeriodTrend;
  timeline: CampaignAnalyticsTimelinePoint[];
  creatorCount: number;
  pendingPayouts: number;
  pendingCreatorCount: number;
  activeCreators: number;
  roi: number | null;
};

type CampaignAnalyticsCacheKey = string;

const campaignAnalyticsCache = new Map<
  CampaignAnalyticsCacheKey,
  { at: number; snapshot: CampaignAnalyticsSnapshot }
>();
const CAMPAIGN_ANALYTICS_TTL_MS = 45_000;

function campaignAnalyticsCacheKey(
  userId: string,
  campaignId: string,
  dateBounds?: { start: Date; end: Date },
): CampaignAnalyticsCacheKey {
  const range = dateBounds
    ? `${dateBounds.start.toISOString()}_${dateBounds.end.toISOString()}`
    : "all";
  return `${userId}:${campaignId}:${range}`;
}

function peekCampaignAnalyticsSnapshot(
  userId: string,
  campaignId: string,
  dateBounds?: { start: Date; end: Date },
): CampaignAnalyticsSnapshot | null {
  const hit = campaignAnalyticsCache.get(campaignAnalyticsCacheKey(userId, campaignId, dateBounds));
  if (!hit) return null;
  if (Date.now() - hit.at > CAMPAIGN_ANALYTICS_TTL_MS * 4) return null;
  return hit.snapshot;
}

function seedCampaignAnalyticsSnapshot(
  userId: string,
  campaignId: string,
  dateBounds: { start: Date; end: Date } | undefined,
  snapshot: CampaignAnalyticsSnapshot,
) {
  campaignAnalyticsCache.set(campaignAnalyticsCacheKey(userId, campaignId, dateBounds), {
    at: Date.now(),
    snapshot,
  });
}

async function fetchCampaignAnalyticsSnapshot(
  campaign: Campaign,
  resolvedUserId: string,
  dateBounds?: { start: Date; end: Date },
): Promise<CampaignAnalyticsSnapshot> {
  const { ownerId, spaceId } = clientBrandScope(resolvedUserId);
  const creatorIdsHint = (campaign.creatorIds || []).filter(Boolean);

  const [attribution, campaignData, salesResult] = await Promise.all([
    getCampaignCreatorAttribution(ownerId),
    getCampaigns(ownerId),
    fetchScopedRows(
      () =>
        supabase!
          .from("sales")
          .select("order_amount, commission_amount, created_at, campaign_id, creator_id")
          .eq("user_id", ownerId)
          .eq("workspace_id", spaceId),
      () =>
        supabase!
          .from("sales")
          .select("order_amount, commission_amount, created_at, campaign_id, creator_id")
          .eq("user_id", ownerId),
    ),
  ]);

  const { creatorCounts, linkMeta } = attribution;
  const resolvedCreatorIds = resolveCampaignCreatorIds(campaign, creatorCounts);

  const campaignMeta: Record<string, CampaignSalesMeta> = {};
  for (const row of campaignData) {
    campaignMeta[String(row.id)] = {
      status: String(row.status ?? ""),
      created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    };
  }

  const salesRows = (salesResult.data || []) as SaleRow[];

  const stats = computeCreatorStatsForCampaign(
    salesRows,
    campaign.id,
    resolvedCreatorIds,
    creatorCounts,
    campaignMeta,
    dateBounds,
    linkMeta,
  );

  const displayCreatorIds = [
    ...new Set([
      ...resolvedCreatorIds,
      ...creatorIdsHint,
      ...Object.keys(stats),
    ]),
  ];

  type CreatorProfileRow = {
    id: string;
    handle: string;
    full_name?: string;
    avatar_url?: string;
    platform?: string;
    balance?: number | null;
  };

  const [payoutsData, creatorProfilesRaw, brandSalesSummary] = await Promise.all([
    displayCreatorIds.length > 0
      ? fetchScopedRows(
          () =>
            supabase!
              .from("payouts")
              .select("creator_id, amount, status")
              .eq("user_id", ownerId)
              .eq("workspace_id", spaceId)
              .in("creator_id", displayCreatorIds),
          () =>
            supabase!
              .from("payouts")
              .select("creator_id, amount, status")
              .eq("user_id", ownerId)
              .in("creator_id", displayCreatorIds),
        ).then((r) => (r.data || []) as Array<{ creator_id?: string | null; amount?: number | null; status?: string | null }>)
      : Promise.resolve(
          [] as Array<{ creator_id?: string | null; amount?: number | null; status?: string | null }>,
        ),
    displayCreatorIds.length > 0
      ? fetchScopedRows(
          () =>
            supabase!
              .from("creators")
              .select("id, handle, full_name, avatar_url, platform, balance")
              .eq("user_id", ownerId)
              .eq("workspace_id", spaceId)
              .in("id", displayCreatorIds),
          () =>
            supabase!
              .from("creators")
              .select("id, handle, full_name, avatar_url, platform, balance")
              .eq("user_id", ownerId)
              .in("id", displayCreatorIds),
        ).then((r) => (r.data || []) as CreatorProfileRow[])
      : Promise.resolve([] as CreatorProfileRow[]),
    displayCreatorIds.length > 0
      ? fetchCreatorBrandSalesSummary(resolvedUserId, displayCreatorIds).catch(
          () => ({} as Record<string, { count: number; revenue: number }>),
        )
      : Promise.resolve({} as Record<string, { count: number; revenue: number }>),
  ]);

  // Avatar enrich is cosmetic — do not await on the critical path.
  const creatorProfiles = creatorProfilesRaw;
  void enrichCreatorsWithSavedAvatarsClient(supabase!, ownerId, creatorProfilesRaw);

  const paidByCreator = sumPaidByCreator(payoutsData);
  const totalCommissionByCreator = sumCommissionByCreator(salesRows);

  const creatorMap = new Map(creatorProfiles.map((c) => [String(c.id), c]));

  const buildCreatorRow = (id: string, s: CreatorCampaignStats): CampaignCreatorRow => {
    const c = creatorMap.get(id);
    const commissionPaid = attributePaidToCampaignScope(
      paidByCreator.get(id) || 0,
      s.commission,
      totalCommissionByCreator.get(id) || 0,
    );
    const brandCost = computeCreatorBrandCost(s.commission, commissionPaid);
    const linkKey = `${campaign.id}:${id}`;
    const brandSales = brandSalesSummary[id];
    return {
      id,
      handle: c?.handle ?? "—",
      full_name: c?.full_name,
      avatar_url: c?.avatar_url ?? undefined,
      platform: c?.platform,
      salesCount: s.salesCount,
      salesAmount: s.salesAmount,
      commission: s.commission,
      commissionPaid,
      roi: computeCreatorCampaignRoi(s.salesAmount, brandCost),
      historicalSalesAttached: linkMeta[linkKey]?.historical_sales_attached ?? true,
      brandSalesCount: brandSales?.count ?? 0,
      brandSalesRevenue: brandSales?.revenue ?? 0,
    };
  };

  const rows: CampaignCreatorRow[] = displayCreatorIds.map((id) =>
    buildCreatorRow(id, stats[id] ?? { salesCount: 0, salesAmount: 0, commission: 0 }),
  );
  rows.sort((a, b) => b.salesAmount - a.salesAmount);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const topCreatorBounds = dateBounds ?? { start: monthStart, end: monthEnd };
  const topStats = computeCreatorStatsForCampaign(
    salesRows,
    campaign.id,
    resolvedCreatorIds,
    creatorCounts,
    campaignMeta,
    topCreatorBounds,
    linkMeta,
  );
  const topCreatorIds = [...new Set([...resolvedCreatorIds, ...Object.keys(topStats)])];
  const monthRows: CampaignCreatorRow[] = topCreatorIds
    .map((id) => {
      const row = buildCreatorRow(id, topStats[id] ?? { salesCount: 0, salesAmount: 0, commission: 0 });
      return {
        ...row,
        roi: computeCreatorCampaignRoi(row.salesAmount, row.commission),
      };
    })
    .filter((row) => row.salesAmount > 0)
    .sort((a, b) => b.salesAmount - a.salesAmount);

  const activeCreators = rows.filter((row) => row.salesAmount > 0).length;

  const totals = computeCampaignPeriodTotals(
    salesRows,
    campaign.id,
    creatorCounts,
    campaignMeta,
    dateBounds,
    linkMeta,
  );

  const pendingPayouts = creatorProfilesRaw.reduce(
    (sum, row) => sum + (Number(row.balance) || 0),
    0,
  );
  const pendingCreatorCount = creatorProfilesRaw.filter(
    (row) => (Number(row.balance) || 0) > 0,
  ).length;

  const salesTrend = computeCampaignScopedSalesTrend(
    salesRows,
    campaign.id,
    resolvedCreatorIds,
    creatorCounts,
    campaignMeta,
    new Date(),
    dateBounds,
    linkMeta,
  );
  const commissionTrend = computeCampaignScopedMetricTrend(
    salesRows,
    campaign.id,
    creatorCounts,
    campaignMeta,
    (sale) => Number(sale.commission_amount) || 0,
    new Date(),
    dateBounds,
    linkMeta,
  );
  const netRevenueTrend = computeCampaignScopedMetricTrend(
    salesRows,
    campaign.id,
    creatorCounts,
    campaignMeta,
    (sale) => Math.max(0, (Number(sale.order_amount) || 0) - (Number(sale.commission_amount) || 0)),
    new Date(),
    dateBounds,
    linkMeta,
  );
  const timeline = buildCampaignTimeline(
    salesRows,
    campaign.id,
    creatorCounts,
    campaignMeta,
    dateBounds,
    linkMeta,
  );

  const totalBrandCost = rows.reduce(
    (sum, row) => sum + computeCreatorBrandCost(row.commission, row.commissionPaid),
    0,
  );
  const roi = computeCreatorCampaignRoi(totals.sales, totalBrandCost);

  const prevTotals = (() => {
    if (!dateBounds) return { sales: 0, commission: 0 };
    const durationMs = dateBounds.end.getTime() - dateBounds.start.getTime();
    const prevEnd = new Date(dateBounds.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    prevStart.setHours(0, 0, 0, 0);
    prevEnd.setHours(23, 59, 59, 999);
    return computeCampaignPeriodTotals(salesRows, campaign.id, creatorCounts, campaignMeta, {
      start: prevStart,
      end: prevEnd,
    }, linkMeta);
  })();
  const prevBrandCost = prevTotals.commission;
  const prevRoi = computeCreatorCampaignRoi(prevTotals.sales, prevBrandCost);
  const roiTrend = computeTrend(roi ?? 0, prevRoi ?? 0);

  const snapshot: CampaignAnalyticsSnapshot = {
    rows,
    monthRows,
    totals,
    salesTrend,
    commissionTrend,
    netRevenueTrend,
    roiTrend,
    timeline,
    creatorCount: resolvedCreatorIds.length,
    pendingPayouts,
    pendingCreatorCount,
    activeCreators,
    roi,
  };
  seedCampaignAnalyticsSnapshot(resolvedUserId, campaign.id, dateBounds, snapshot);
  return snapshot;
}

type PayableCreator = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
  balance: number;
  campaignCommission: number;
  paypal_link?: string;
  revolut_link?: string;
  iban?: string;
};

type CampaignPayoutRow = {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  avatar_url?: string;
  amount: number;
  status: string;
  dueDate: string;
  kind: "pending" | "history";
  payableCreator?: PayableCreator;
};

function formatPayoutStatusLabel(status: string, lang: "en" | "fr"): string {
  const s = (status || "").toLowerCase();
  if (s === "paid") return lang === "fr" ? "Payé" : "Paid";
  if (s === "pending") return lang === "fr" ? "En attente" : "Pending";
  if (s === "failed") return lang === "fr" ? "Échoué" : "Failed";
  return status;
}

function computeCampaignKpis(
  campaigns: Campaign[],
  sales: SaleRow[],
  creators: CreatorBalanceRow[],
  now = new Date(),
): CampaignKpiStats {
  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const activeCount = activeCampaigns.length;
  const endingThisMonth = activeCampaigns.filter((c) => isEndingThisMonth(c.endRaw ?? c.end, now)).length;
  const totalCreators = creators.length;
  const totalCampaigns = campaigns.length;
  const totalSales = sales.reduce((sum, row) => sum + (Number(row.order_amount) || 0), 0);
  const totalCommissionOwed = creators.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  const pendingPayouts = creators.filter((row) => (Number(row.balance) || 0) > 0).length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setDate(0);
  prevMonthEnd.setHours(23, 59, 59, 999);
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);

  const sumSalesInPeriod = (start: Date, end: Date) =>
    sales
      .filter((row) => isWithinPeriod(row.created_at, start, end))
      .reduce((sum, row) => sum + (Number(row.order_amount) || 0), 0);

  const salesTrend = computeTrend(sumSalesInPeriod(monthStart, monthEnd), sumSalesInPeriod(prevMonthStart, prevMonthEnd));

  return {
    activeCount,
    endingThisMonth,
    totalCreators,
    totalCampaigns,
    totalSales,
    totalCommissionOwed,
    pendingPayouts,
    salesTrend,
  };
}

function formatEndingSub(count: number, lang: "en" | "fr"): string {
  if (count === 0) return lang === "fr" ? "Aucune ne se termine ce mois" : "None ending this month";
  if (count === 1) return lang === "fr" ? "1 se termine ce mois" : "1 ending this month";
  return lang === "fr" ? `${count} se terminent ce mois` : `${count} ending this month`;
}

function formatCreatorsSub(campaignCount: number, lang: "en" | "fr"): string {
  if (campaignCount === 0) return lang === "fr" ? "Aucune campagne" : "No campaigns yet";
  if (campaignCount === 1) return lang === "fr" ? "sur 1 campagne" : "across 1 campaign";
  return lang === "fr" ? `sur ${campaignCount} campagnes` : `across ${campaignCount} campaigns`;
}

function formatSalesTrendSub(trend: PeriodTrend, lang: "en" | "fr"): { text: string; color: string } {
  if (trend.current === 0 && trend.previous === 0) {
    return { text: lang === "fr" ? "Aucune vente sur la période" : "No sales in period", color: "var(--ws-text-muted)" };
  }
  const label = formatTrendLabel(trend.changePct, lang);
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  const color = trend.direction === "up" ? "#2E7D32" : trend.direction === "down" ? "#E53935" : "var(--ws-text-muted)";
  return {
    text: lang === "fr" ? `vs période précédente ${label} ${arrow}` : `vs previous period ${label} ${arrow}`,
    color,
  };
}

function formatPendingPayoutsSub(count: number, lang: "en" | "fr"): string {
  if (count === 0) return lang === "fr" ? "Aucun paiement en attente" : "No pending payouts";
  if (count === 1) return lang === "fr" ? "1 paiement en attente" : "1 pending payout";
  return lang === "fr" ? `${count} paiements en attente` : `${count} pending payouts`;
}

function EmptyTableRow({ lang, colSpan }: { lang: "en" | "fr"; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
        {lang === "fr" ? "Aucune donnée pour le moment." : "No data yet."}
      </td>
    </tr>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "var(--ws-accent)", color: "#FFFFFF", border: "none", borderRadius: 10,
  padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};
const btnSecondary: React.CSSProperties = {
  background: "var(--ws-surface)", color: "var(--ws-text)", border: "1px solid var(--ws-border)", borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--ws-border)", fontSize: 14, fontFamily: "inherit", color: "var(--ws-text)",
  letterSpacing: "-0.02em", background: "var(--ws-input)",
};
const dateInputStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 40,
  cursor: "pointer",
};

function campaignStatusLabel(status: string, lang: "en" | "fr"): string {
  const labels: Record<string, { en: string; fr: string }> = {
    Active: { en: "Active", fr: "Actif" },
    Paused: { en: "Paused", fr: "En pause" },
    Completed: { en: "Completed", fr: "Terminé" },
    Draft: { en: "Draft", fr: "Brouillon" },
  };
  return labels[status]?.[lang] ?? labels[status]?.en ?? status;
}

function toDateBounds(range: CampaignDateRange): { start: Date; end: Date } {
  const normalized = normalizeCampaignDateRange(range);
  const start = new Date(`${normalized.start}T00:00:00`);
  const end = new Date(`${normalized.end}T23:59:59.999`);
  return { start, end };
}

function normalizeCampaignDateRange(range: CampaignDateRange): CampaignDateRange {
  const today = new Date().toISOString().slice(0, 10);
  let start = range.start || today;
  let end = range.end || today;
  if (start > end) {
    start = end;
  }
  return { start, end };
}

function defaultCampaignDateRange(campaign: Campaign): CampaignDateRange {
  const today = new Date().toISOString().slice(0, 10);
  const created = campaign.createdAt?.slice(0, 10);
  const campaignStart = toDateInputValue(campaign.startRaw ?? campaign.start);
  let start = created || campaignStart || today;
  if (campaignStart && campaignStart < start) start = campaignStart;
  if (start > today) start = created || today;
  return normalizeCampaignDateRange({ start, end: today });
}

function formatShortCampaignDate(isoDate: string, lang: "en" | "fr"): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCampaignDateRangeLabel(range: CampaignDateRange, lang: "en" | "fr"): string {
  const today = new Date().toISOString().slice(0, 10);
  const endLabel = range.end === today
    ? lang === "fr"
      ? "Aujourd'hui"
      : "Today"
    : formatShortCampaignDate(range.end, lang);
  return `${formatShortCampaignDate(range.start, lang)} - ${endLabel}`;
}

function useClickOutside(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, onClose, ref]);
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function campaignExportFilename(campaignName: string, extension: "csv" | "xlsx") {
  const slug = campaignName.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "campaign";
  const date = new Date().toISOString().split("T")[0];
  return `trackit-campaign-${slug}-${date}.${extension}`;
}

function downloadExportFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function exportCampaignAnalyticsCsv(data: CampaignAnalyticsExport) {
  const rows: (string | number)[][] = [
    ["Campaign", data.campaignName],
    ["Date range", `${data.dateRange.start} - ${data.dateRange.end}`],
    ["Currency", data.currency],
    ["Metric", "Value"],
    ["Total sales", data.totals.sales],
    ["Total commission", data.totals.commission],
    ["Pending payouts", data.pendingPayouts],
    ["ROI", formatCampaignRoi(data.roi)],
    [],
    ["Creator", "Handle", "Platform", "Sales count", "Revenue", "Commission", "Commission paid", "ROI"],
    ...data.rows.map((row) => [
      row.full_name || row.handle || "",
      row.handle || "",
      row.platform || "",
      row.salesCount,
      row.salesAmount,
      row.commission,
      row.commissionPaid,
      formatCampaignRoi(row.roi),
    ]),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
  downloadExportFile(
    campaignExportFilename(data.campaignName, "csv"),
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
}

async function exportCampaignAnalyticsExcel(data: CampaignAnalyticsExport) {
  const XLSX = await import("xlsx");
  const summary = [
    ["Campaign", data.campaignName],
    ["Date range", `${data.dateRange.start} - ${data.dateRange.end}`],
    ["Currency", data.currency],
    ["Total sales", data.totals.sales],
    ["Total commission", data.totals.commission],
    ["Pending payouts", data.pendingPayouts],
    ["ROI", formatCampaignRoi(data.roi)],
  ];
  const creators = [
    ["Creator", "Handle", "Platform", "Sales count", "Revenue", "Commission", "Commission paid", "ROI"],
    ...data.rows.map((row) => [
      row.full_name || row.handle || "",
      row.handle || "",
      row.platform || "",
      row.salesCount,
      row.salesAmount,
      row.commission,
      row.commissionPaid,
      formatCampaignRoi(row.roi),
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(creators), "Creators");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadExportFile(
    campaignExportFilename(data.campaignName, "xlsx"),
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
}

export function CampaignsView({
  plan,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  userId,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  userId?: string;
  shopifyStore?: string | null;
}) {
  const lang = useLang();
  const { navState, navigate, goBack } = useDashboardNavigation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [creators, setCreators] = useState<CreatorBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardTab, setBoardTab] = useState<BoardTab>("active");
  const [sortOrder, setSortOrder] = useState<CampaignSort>("recent");
  const [search, setSearch] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const creatingCampaignRef = useRef(false);

  const campaignNav = navState.view === "campaigns" ? navState.campaign : undefined;
  const modalOpen = campaignNav?.type === "new";
  const addCreatorsId = campaignNav?.type === "addCreators" ? campaignNav.id : null;
  const editId = campaignNav?.type === "edit" ? campaignNav.id : null;
  const detailId = campaignNav?.type === "detail" ? campaignNav.id : null;
  const detailInitialTab =
    campaignNav?.type === "detail" && isDetailTab(campaignNav.tab) ? campaignNav.tab : "analytics";
  const activeCampaignCount = campaigns.filter(
    (c) =>
      (c.status === "Active" || c.status === "Paused") &&
      !isDemoPresetCampaign({ name: c.name, description: c.description }),
  ).length;

  const tryOpenNewCampaign = () => {
    if (hasReachedCampaignLimit(plan, activeCampaignCount)) {
      setUpgradeModalOpen(true);
      return;
    }
    navigate({ view: "campaigns", campaign: { type: "new" } });
  };

  const canOpenNewCampaign = !hasReachedCampaignLimit(plan, activeCampaignCount);

  const refreshCampaignBoard = useCallback(async () => {
    if (!supabase) return;
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      resolvedUserId = user?.id;
    }
    if (!resolvedUserId) return;

    const board = await fetchCampaignBoardData(resolvedUserId);
    setCampaigns(board.campaigns);
    setSales(board.sales);
    setCreators(board.creators);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      if (!supabase) {
        if (!cancelled) setLoading(false);
        return;
      }

      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        resolvedUserId = user.id;
      }

      try {
        const board = await fetchCampaignBoardData(resolvedUserId);
        if (cancelled) return;
        setCampaigns(board.campaigns);
        setSales(board.sales);
        setCreators(board.creators);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onBoardRefresh = () => void refreshCampaignBoard();
    window.addEventListener(SALES_UPDATED_EVENT, onBoardRefresh);
    window.addEventListener(CAMPAIGNS_UPDATED_EVENT, onBoardRefresh);
    return () => {
      window.removeEventListener(SALES_UPDATED_EVENT, onBoardRefresh);
      window.removeEventListener(CAMPAIGNS_UPDATED_EVENT, onBoardRefresh);
    };
  }, [refreshCampaignBoard]);

  const handleManualSaleAdded = useCallback(async (saleDate?: string) => {
    await refreshCampaignBoard();
    dispatchSalesUpdated();
    dispatchPayoutsUpdated();
    if (saleDate) {
      sessionStorage.setItem("trackit_last_sale_date", saleDate.slice(0, 10));
    }
  }, [refreshCampaignBoard]);

  const kpiStats = useMemo(
    () => computeCampaignKpis(campaigns, sales, creators),
    [campaigns, sales, creators],
  );

  type CampaignFormData = {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout?: boolean;
    creatorIds?: string[];
    creatorCommissions?: { creatorId: string; commission_rate: number }[];
    attachCreatorSales?: boolean;
    creatorSalesAttachments?: Array<{ creatorId: string; attach: boolean }>;
  };

  const buildCreatorSyncOptions = (campaignData: Pick<CampaignFormData, "attachCreatorSales" | "creatorSalesAttachments">) => {
    const creatorAttachments: Record<string, boolean> = {};
    for (const entry of campaignData.creatorSalesAttachments ?? []) {
      creatorAttachments[entry.creatorId] = entry.attach;
    }
    return {
      attachHistoricalSales: Boolean(campaignData.attachCreatorSales),
      creatorAttachments: Object.keys(creatorAttachments).length ? creatorAttachments : undefined,
    };
  };

  const persistCampaignCreators = async (
    resolvedUserId: string,
    campaignId: string,
    campaignData: CampaignFormData,
  ) => {
    const creatorIds = campaignData.creatorIds ?? [];
    await syncCampaignCreators(resolvedUserId, campaignId, creatorIds, buildCreatorSyncOptions(campaignData));
    for (const entry of campaignData.creatorCommissions ?? []) {
      await supabase!
        .from("creators")
        .update({ commission_rate: entry.commission_rate })
        .eq("id", entry.creatorId)
        .eq("user_id", resolvedUserId);
    }
    return creatorIds;
  };

  const handleSaveDraft = async (campaignData: CampaignFormData, draftId?: string): Promise<string | null> => {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const dbPayload = {
      name: campaignData.name.trim() || (lang === "fr" ? "Campagne sans titre" : "Untitled Campaign"),
      description: campaignData.description,
      platform: campaignData.platform || "All",
      start_date: campaignData.startDate,
      end_date: campaignData.endDate,
      commission_type: campaignData.commissionType || "percentage",
      commission_rate: campaignData.commissionRate || 10,
      auto_payout: campaignData.autoPayout || false,
      status: "draft",
    };

    let savedId = draftId ?? null;
    if (draftId) {
      const updated = await updateCampaign(draftId, dbPayload);
      if (!updated) return null;
      savedId = draftId;
      const creatorIds = await persistCampaignCreators(user.id, savedId, campaignData);
      const mapped = mapDbCampaign(updated as Record<string, unknown>, creatorIds);
      mapped.status = "Draft";
      setCampaigns((prev) =>
        prev.map((c) => (c.id === savedId ? { ...mapped, sales: c.sales, commission: c.commission } : c)),
      );
    } else {
      const saved = await saveCampaign(user.id, dbPayload);
      if (!saved) return null;
      savedId = String(saved.id);
      const creatorIds = await persistCampaignCreators(user.id, savedId, campaignData);
      const mapped = mapDbCampaign(saved as Record<string, unknown>, creatorIds);
      mapped.status = "Draft";
      setCampaigns((prev) => (prev.some((c) => c.id === savedId) ? prev : [mapped, ...prev]));
    }

    dispatchCampaignsUpdated();
    return savedId;
  };

  const handleLaunchDraft = async (draftId: string, campaignData: CampaignFormData) => {
    if (creatingCampaignRef.current) return;
    creatingCampaignRef.current = true;

    try {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const launchingDemo = isDemoPresetCampaign({
        name: campaignData.name.trim(),
        description: campaignData.description,
      });
      if (!launchingDemo && hasReachedCampaignLimit(plan, activeCampaignCount)) {
        setUpgradeModalOpen(true);
        return;
      }

      const dbPayload = {
        name: campaignData.name.trim() || (lang === "fr" ? "Campagne sans titre" : "Untitled Campaign"),
        description: campaignData.description,
        platform: campaignData.platform || "All",
        start_date: campaignData.startDate,
        end_date: campaignData.endDate,
        commission_type: campaignData.commissionType || "percentage",
        commission_rate: campaignData.commissionRate || 10,
        auto_payout: campaignData.autoPayout || false,
        status: "active",
      };

      const updated = await updateCampaign(draftId, dbPayload);
      if (!updated) {
        alert(lang === "fr" ? "Impossible de lancer la campagne." : "Could not launch the campaign.");
        return;
      }

      const creatorIds = await persistCampaignCreators(user.id, draftId, campaignData);
      const mapped = mapDbCampaign(updated as Record<string, unknown>, creatorIds);
      mapped.status = "Active";

      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === draftId
            ? { ...mapped, sales: c.sales, commission: c.commission }
            : c,
        ),
      );
      notifyCampaignCreated(lang, mapped.name, user.id);
      dispatchCampaignsUpdated();
      navigate({ view: "campaigns", campaign: { type: "detail", id: draftId, tab: "creators" } }, { replace: true });
    } finally {
      creatingCampaignRef.current = false;
    }
  };

  const handleCreateCampaign = async (campaignData: CampaignFormData) => {
    if (creatingCampaignRef.current) return;
    creatingCampaignRef.current = true;

    try {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const saved = await saveCampaign(user.id, {
        name: campaignData.name,
        description: campaignData.description,
        platform: campaignData.platform,
        start_date: campaignData.startDate,
        end_date: campaignData.endDate,
        commission_type: campaignData.commissionType || "percentage",
        commission_rate: campaignData.commissionRate || 10,
        auto_payout: campaignData.autoPayout || false,
        status: "active",
      });
      if (!saved) {
        setUpgradeModalOpen(true);
        return;
      }
      const creatorIds = campaignData.creatorIds ?? [];
      await syncCampaignCreators(user.id, String(saved.id), creatorIds, buildCreatorSyncOptions(campaignData));
      for (const entry of campaignData.creatorCommissions ?? []) {
        await supabase
          .from("creators")
          .update({ commission_rate: entry.commission_rate })
          .eq("id", entry.creatorId)
          .eq("user_id", user.id);
      }
      const mapped = mapDbCampaign(saved as Record<string, unknown>, creatorIds);
      setCampaigns((prev) => (prev.some((c) => c.id === mapped.id) ? prev : [mapped, ...prev]));
      notifyCampaignCreated(lang, campaignData.name || (lang === "fr" ? "Nouvelle campagne" : "New campaign"), user.id);
      dispatchCampaignsUpdated();
      navigate({ view: "campaigns" }, { replace: true });
    } finally {
      creatingCampaignRef.current = false;
    }
  };

  const handleAddCreatorsToCampaign = async (
    campaignId: string,
    campaignData: {
      creatorIds: string[];
      creatorCommissions: { creatorId: string; commission_rate: number }[];
      creatorSalesAttachments?: Array<{ creatorId: string; attach: boolean }>;
    },
  ) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { creatorCounts } = await getCampaignCreatorAttribution(user.id);
    const existingIds = (creatorCounts[campaignId] ?? []).map(String);
    const incomingIds = campaignData.creatorIds.map(String);
    const finalIds = [...new Set([...existingIds, ...incomingIds])];
    const creatorAttachments: Record<string, boolean> = {};
    for (const entry of campaignData.creatorSalesAttachments ?? []) {
      creatorAttachments[entry.creatorId] = entry.attach;
    }
    for (const creatorId of incomingIds) {
      if (!existingIds.includes(creatorId) && !(creatorId in creatorAttachments)) {
        creatorAttachments[creatorId] = false;
      }
    }
    const ok = await syncCampaignCreators(user.id, campaignId, finalIds, {
      creatorAttachments: Object.keys(creatorAttachments).length ? creatorAttachments : undefined,
    });
    if (!ok) {
      alert(lang === "fr" ? "Impossible d'ajouter les créateurs." : "Could not add creators.");
      return;
    }

    for (const entry of campaignData.creatorCommissions) {
      await supabase
        .from("creators")
        .update({ commission_rate: entry.commission_rate })
        .eq("id", entry.creatorId)
        .eq("user_id", user.id);
    }

    setCampaigns((list) =>
      list.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              creatorIds: finalIds,
              creators: finalIds.length,
            }
          : c,
      ),
    );
    dispatchCampaignsUpdated();
    navigate({ view: "campaigns", campaign: { type: "detail", id: campaignId, tab: "creators" } }, { replace: true });
  };

  const handleStatusChange = async (campaignId: string, status: CampaignStatus) => {
    const ok = await updateCampaignStatus(campaignId, status.toLowerCase());
    if (!ok) {
      alert(lang === "fr" ? "Impossible de mettre à jour le statut de la campagne." : "Could not update the campaign status.");
      return;
    }
    setCampaigns((list) => list.map((c) => (c.id === campaignId ? { ...c, status } : c)));
    dispatchCampaignsUpdated();
  };

  const handleUpdateCampaign = async (campaignId: string, campaignData: CampaignFormData) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updated = await updateCampaign(campaignId, {
      name: campaignData.name,
      description: campaignData.description,
      platform: campaignData.platform,
      start_date: campaignData.startDate,
      end_date: campaignData.endDate,
      commission_type: campaignData.commissionType,
      commission_rate: campaignData.commissionRate,
      auto_payout: campaignData.autoPayout ?? false,
    });
    if (!updated) return;

    await syncCampaignCreators(user.id, campaignId, campaignData.creatorIds ?? [], buildCreatorSyncOptions(campaignData));
    for (const entry of campaignData.creatorCommissions ?? []) {
      await supabase
        .from("creators")
        .update({ commission_rate: entry.commission_rate })
        .eq("id", entry.creatorId)
        .eq("user_id", user.id);
    }
    setCampaigns((list) =>
      list.map((c) =>
        c.id === campaignId
          ? {
              ...mapDbCampaign(updated as Record<string, unknown>, campaignData.creatorIds),
              sales: c.sales,
              commission: c.commission,
            }
          : c,
      ),
    );
    dispatchCampaignsUpdated();
    navigate({ view: "campaigns", campaign: { type: "detail", id: campaignId } }, { replace: true });
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    const label = campaign?.name ?? campaignId;
    const confirmed = window.confirm(
      lang === "fr"
        ? `Supprimer la campagne « ${label} » ?\n\nCette action est définitive.`
        : `Delete campaign "${label}"?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    const ok = await deleteCampaign(campaignId);
    if (!ok) {
      alert(lang === "fr" ? "Impossible de supprimer la campagne." : "Could not delete the campaign.");
      return;
    }

    setCampaigns((list) => list.filter((c) => c.id !== campaignId));
    if (detailId === campaignId) navigate({ view: "campaigns" }, { replace: true });
    if (editId === campaignId) navigate({ view: "campaigns" }, { replace: true });
    dispatchCampaignsUpdated();
  };

  const handleDeleteAllCampaigns = async () => {
    const toDelete = campaigns.filter((c) => c.status === "Completed");
    if (toDelete.length === 0) return;

    const confirmed = window.confirm(
      lang === "fr"
        ? `Supprimer les ${toDelete.length} campagne${toDelete.length > 1 ? "s" : ""} terminée${toDelete.length > 1 ? "s" : ""} ?\n\nCette action est définitive.`
        : `Delete all ${toDelete.length} completed campaign${toDelete.length > 1 ? "s" : ""}?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    const results = await Promise.all(toDelete.map((c) => deleteCampaign(c.id)));
    const failed = results.filter((ok) => !ok).length;
    const deletedIds = new Set(
      toDelete.filter((_, index) => results[index]).map((c) => c.id),
    );

    if (deletedIds.size === 0) {
      alert(lang === "fr" ? "Impossible de supprimer les campagnes." : "Could not delete campaigns.");
      return;
    }

    setCampaigns((list) => list.filter((c) => !deletedIds.has(c.id)));
    if (detailId && deletedIds.has(detailId)) navigate({ view: "campaigns" }, { replace: true });
    if (editId && deletedIds.has(editId)) navigate({ view: "campaigns" }, { replace: true });
    dispatchCampaignsUpdated();

    if (failed > 0) {
      alert(
        lang === "fr"
          ? `${failed} campagne${failed > 1 ? "s" : ""} n'ont pas pu être supprimée${failed > 1 ? "s" : ""}.`
          : `${failed} campaign${failed > 1 ? "s" : ""} could not be deleted.`,
      );
    }
  };

  const openCampaign = (id: string, tab: DetailTab = "analytics") => {
    const campaign = campaigns.find((c) => c.id === id);
    if (campaign?.status === "Draft") {
      openEditCampaign(id);
      return;
    }
    rememberLastCampaignId(userId, id);
    navigate({ view: "campaigns", campaign: { type: "detail", id, tab } });
  };

  const openEditCampaign = (id: string) => {
    navigate({ view: "campaigns", campaign: { type: "edit", id } });
  };

  const selected = campaigns.find((c) => c.id === detailId) ?? null;
  const addCreatorsCampaign = addCreatorsId ? campaigns.find((c) => c.id === addCreatorsId) ?? null : null;
  const editCampaign = editId ? campaigns.find((c) => c.id === editId) ?? null : null;

  useEffect(() => {
    if (!loading && detailId && !selected) {
      navigate({ view: "campaigns" }, { replace: true });
    }
  }, [loading, detailId, selected, navigate]);

  useEffect(() => {
    if (!loading && addCreatorsId && !addCreatorsCampaign) {
      navigate({ view: "campaigns" }, { replace: true });
    }
  }, [loading, addCreatorsId, addCreatorsCampaign, navigate]);

  useEffect(() => {
    if (!loading && editId && !editCampaign) {
      navigate({ view: "campaigns" }, { replace: true });
    }
  }, [loading, editId, editCampaign, navigate]);

  useEffect(() => {
    if (!modalOpen || canOpenNewCampaign) return;
    navigate({ view: "campaigns" }, { replace: true });
    setUpgradeModalOpen(true);
  }, [modalOpen, canOpenNewCampaign, navigate]);

  if (modalOpen && canOpenNewCampaign) {
    return (
      <NewCampaignOnboarding
        lang={lang}
        userId={userId}
        plan={plan}
        isMobile={isMobile}
        onClose={goBack}
        onCreate={handleCreateCampaign}
        onSaveDraft={handleSaveDraft}
        onLaunchDraft={handleLaunchDraft}
      />
    );
  }

  if (addCreatorsId) {
    const addCreatorsCampaignResolved = campaigns.find((c) => c.id === addCreatorsId) ?? null;
    if (!addCreatorsCampaignResolved) {
      return (
        <>
          <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
          <CampaignsLoadingState isMobile={isMobile} lang={lang} />
        </>
      );
    }
    return (
      <NewCampaignOnboarding
        mode="addCreators"
        existingCampaign={addCreatorsCampaignResolved}
        lang={lang}
        userId={userId}
        plan={plan}
        isMobile={isMobile}
        onClose={() =>
          navigate({ view: "campaigns", campaign: { type: "detail", id: addCreatorsId } }, { replace: true })
        }
        onCreate={handleCreateCampaign}
        onAddCreators={(data) => handleAddCreatorsToCampaign(addCreatorsId, data)}
      />
    );
  }

  if (editId) {
    if (loading) {
      return (
        <>
          <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
          <CampaignsLoadingState isMobile={isMobile} lang={lang} />
        </>
      );
    }
    const editCampaignResolved = campaigns.find((c) => c.id === editId) ?? null;
    if (!editCampaignResolved) {
      return (
        <>
          <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
          <CampaignsLoadingState isMobile={isMobile} lang={lang} />
        </>
      );
    }
    return (
      <NewCampaignOnboarding
        mode="edit"
        existingCampaign={editCampaignResolved}
        lang={lang}
        userId={userId}
        plan={plan}
        isMobile={isMobile}
        onClose={() =>
          navigate(
            { view: "campaigns", ...(editCampaignResolved.status === "Draft" ? {} : { campaign: { type: "detail", id: editId } }) },
            { replace: true },
          )
        }
        onCreate={handleCreateCampaign}
        onUpdate={(data) => handleUpdateCampaign(editId, data)}
        onSaveDraft={handleSaveDraft}
        onLaunchDraft={handleLaunchDraft}
      />
    );
  }

  if (selected) {
    return (
      <>
        <CampaignDetail
          isMobile={isMobile}
          lang={lang}
          userId={userId}
          plan={plan}
          campaign={selected}
          initialTab={detailInitialTab}
          onBack={goBack}
          onTabChange={(tab) =>
            navigate({ view: "campaigns", campaign: { type: "detail", id: selected.id, tab } }, { replace: true })
          }
          onUpdate={(c) => setCampaigns((list) => list.map((x) => (x.id === c.id ? c : x)))}
          onStatusChange={handleStatusChange}
          onEdit={openEditCampaign}
          onDelete={(id) => void handleDeleteCampaign(id)}
          onAddCreators={() =>
            navigate({ view: "campaigns", campaign: { type: "addCreators", id: selected.id } })
          }
          onManualSaleAdded={handleManualSaleAdded}
          onUpgrade={onUpgrade}
        />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
        <CampaignsLoadingState isMobile={isMobile} lang={lang} />
      </>
    );
  }

  return (
    <>
      <CampaignsBoard
        lang={lang}
        isMobile={isMobile}
        campaigns={campaigns}
        kpiStats={kpiStats}
        plan={plan}
        billableActiveCampaigns={activeCampaignCount}
        boardTab={boardTab}
        setBoardTab={setBoardTab}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        search={search}
        setSearch={setSearch}
        onOpenCampaign={openCampaign}
        onDeleteAll={() => void handleDeleteAllCampaigns()}
      />
      {upgradeModalOpen && (
        <CampaignUpgradeModal plan={plan} lang={lang} onClose={() => setUpgradeModalOpen(false)} onUpgrade={onUpgrade} onUpgradePro={onUpgradePro} onUpgradeScale={onUpgradeScale} />
      )}
    </>
  );
}

function CampaignUpgradeModal({
  plan,
  lang,
  onClose,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  plan: PlanTier;
  lang: "en" | "fr";
  onClose: () => void;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const modal = getLimitUpgradeModalProps("campaigns", plan, lang);
  if (!modal) return null;

  const handlePrimary = () => {
    if (!modal) return;
    onClose();
    runTierUpgrade(modal.requiredTier, lang);
  };

  return (
    <UpgradeModal
      lang={lang}
      onClose={onClose}
      limitKind="campaigns"
      currentPlan={plan}
      onPrimary={handlePrimary}
      showAllPlansLink={false}
    />
  );
}

function CampaignsLoadingState({ lang, isMobile }: { lang: "en" | "fr"; isMobile?: boolean }) {
  return (
    <div style={{ padding: isMobile ? "16px 16px 16px" : "24px 40px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            style={{
              background: "var(--ws-surface)",
              border: "1px solid var(--ws-border)",
              borderRadius: 16,
              padding: 20,
              minHeight: 108,
            }}
          >
            <div style={{ width: "55%", height: 10, borderRadius: 999, background: "var(--ws-hover)", marginBottom: 14 }} />
            <div style={{ width: "40%", height: 24, borderRadius: 8, background: "var(--ws-active)", marginBottom: 10 }} />
            <div style={{ width: "70%", height: 10, borderRadius: 999, background: "var(--ws-bg)" }} />
          </div>
        ))}
      </div>
      <div
        style={{
          background: "var(--ws-surface)",
          border: "1px solid var(--ws-border)",
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--ws-text-dim)",
          fontSize: 14,
        }}
      >
        {lang === "fr" ? "Chargement des campagnes…" : "Loading campaigns…"}
      </div>
    </div>
  );
}

function formatStartedLabel(startRaw: string | undefined, startLabel: string, lang: "en" | "fr"): string {
  const iso = toDateInputValue(startRaw || startLabel || "");
  if (!iso) return lang === "fr" ? "Non démarrée" : "Not started";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return startLabel || (lang === "fr" ? "Non démarrée" : "Not started");
  const date = d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return lang === "fr" ? `Démarrée le ${date}` : `Started ${date}`;
}

function platformsForCampaign(platform: string): string[] {
  const p = platform.toLowerCase();
  if (p.includes("all") || !p.trim()) return ["tiktok", "instagram"];
  const list: string[] = [];
  if (p.includes("tiktok")) list.push("tiktok");
  if (p.includes("instagram")) list.push("instagram");
  if (p.includes("youtube")) list.push("youtube");
  return list.length > 0 ? list : ["tiktok"];
}

function CampaignMetric({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ws-text-muted)" }}>
      {icon}
      <span style={{ color: "var(--ws-text)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function CampaignsBoard({
  lang,
  isMobile,
  campaigns,
  kpiStats,
  plan,
  billableActiveCampaigns,
  boardTab,
  setBoardTab,
  sortOrder,
  setSortOrder,
  search,
  setSearch,
  onOpenCampaign,
  onDeleteAll,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  campaigns: Campaign[];
  kpiStats: CampaignKpiStats;
  plan: PlanTier;
  billableActiveCampaigns: number;
  boardTab: BoardTab;
  setBoardTab: (t: BoardTab) => void;
  sortOrder: CampaignSort;
  setSortOrder: (s: CampaignSort) => void;
  search: string;
  setSearch: (s: string) => void;
  onOpenCampaign: (id: string) => void;
  onDeleteAll: () => void;
}) {
  const pad = isMobile ? "16px 16px 24px" : "40px 40px 48px";

  const tabCounts = useMemo(
    () => ({
      active: campaigns.filter((c) => c.status === "Active" || c.status === "Paused").length,
      drafts: campaigns.filter((c) => c.status === "Draft").length,
      finished: campaigns.filter((c) => c.status === "Completed").length,
    }),
    [campaigns],
  );

  const creatorsInCampaigns = useMemo(() => {
    const ids = new Set<string>();
    for (const c of campaigns) {
      for (const id of c.creatorIds ?? []) ids.add(id);
    }
    return ids.size;
  }, [campaigns]);

  const creatorPool = getMaxManagedCreators(plan) ?? Math.max(kpiStats.totalCreators, creatorsInCampaigns);
  const creatorPct = creatorPool > 0 ? Math.round((creatorsInCampaigns / creatorPool) * 100) : 0;

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (boardTab === "active") list = list.filter((c) => c.status === "Active" || c.status === "Paused");
    if (boardTab === "drafts") list = list.filter((c) => c.status === "Draft");
    if (boardTab === "finished") list = list.filter((c) => c.status === "Completed");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sortOrder === "name") return a.name.localeCompare(b.name);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return list;
  }, [campaigns, boardTab, search, sortOrder]);

  const boardTabs: { id: BoardTab; label: string; count: number }[] = [
    { id: "active", label: lang === "fr" ? "Actives" : "Active", count: tabCounts.active },
    { id: "drafts", label: lang === "fr" ? "Brouillons" : "Drafts", count: tabCounts.drafts },
    { id: "finished", label: lang === "fr" ? "Terminées" : "Finished", count: tabCounts.finished },
  ];

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-surface)" }}>
      <div style={{ padding: pad }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "var(--ws-text)", margin: 0, marginBottom: 6, letterSpacing: "-0.03em", maxWidth: 520 }}>
            {lang === "fr" ? "Campagnes" : "Campaigns"}
          </h1>
          <p style={{ fontSize: 14, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: 0, maxWidth: 520, lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Gérez vos campagnes et suivez les performances et commissions de vos créateurs."
              : "Manage your campaigns and track creator performance and commissions."}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            borderBottom: "1px solid var(--ws-border)",
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 28, overflowX: "auto", minWidth: 0 }}>
            {boardTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBoardTab(tab.id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0 0 12px",
                  marginBottom: -1,
                  fontSize: 14,
                  fontFamily: "inherit",
                  fontWeight: boardTab === tab.id ? 600 : 400,
                  color: boardTab === tab.id ? "var(--ws-text)" : "var(--ws-text-dim)",
                  cursor: "pointer",
                  borderBottom: boardTab === tab.id ? "2px solid var(--ws-btn)" : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 24 }}>
          <div
            style={{
              flex: isMobile ? "1 1 100%" : "1 1 280px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid var(--ws-border)",
              borderRadius: 10,
              padding: "10px 14px",
              background: "var(--ws-surface)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="var(--ws-text-dim)" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="var(--ws-text-dim)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "fr" ? "Rechercher une campagne par titre" : "Search campaigns by title"}
              style={{ border: "none", outline: "none", flex: 1, fontSize: 14, fontFamily: "inherit", color: "var(--ws-text)", background: "transparent" }}
            />
          </div>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as CampaignSort)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--ws-border)",
              fontSize: 14,
              fontFamily: "inherit",
              color: "var(--ws-text)",
              background: "var(--ws-surface)",
              cursor: "pointer",
            }}
          >
            <option value="recent">{lang === "fr" ? "Récemment créées" : "Recently created"}</option>
            <option value="name">{lang === "fr" ? "Nom (A-Z)" : "Name (A-Z)"}</option>
          </select>
          {boardTab === "finished" && tabCounts.finished > 0 && (
            <button
              type="button"
              onClick={onDeleteAll}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #FECACA",
                fontSize: 14,
                fontFamily: "inherit",
                fontWeight: 500,
                color: "#DC2626",
                background: "var(--ws-surface)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {lang === "fr" ? "Supprimer toutes les campagnes" : "Delete all campaigns"}
            </button>
          )}
          <div style={{ marginLeft: isMobile ? 0 : "auto", fontSize: 13, color: "var(--ws-text-muted)", width: isMobile ? "100%" : "auto" }}>
            {plan === "free" ? (
              lang === "fr"
                ? `Campagnes réelles : ${billableActiveCampaigns}/${FREE_MAX_CAMPAIGNS} (démo Trackit hors quota)`
                : `Real campaigns: ${billableActiveCampaigns}/${FREE_MAX_CAMPAIGNS} (Trackit demo excluded)`
            ) : lang === "fr"
              ? `${creatorsInCampaigns} sur ${creatorPool} créateurs (${creatorPct} %) ajoutés aux campagnes`
              : `${creatorsInCampaigns} of ${creatorPool} creators (${creatorPct}%) added to campaigns`}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 14, border: "1px solid var(--ws-border)", borderRadius: 12 }}>
            {boardTab === "drafts"
              ? lang === "fr"
                ? "Aucun brouillon. Commencez une campagne et quittez pour la retrouver ici."
                : "No drafts yet. Start a campaign and leave to resume it here."
              : lang === "fr"
                ? "Aucune campagne dans cet onglet."
                : "No campaigns in this tab."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((campaign) => {
              const platforms = platformsForCampaign(campaign.platform);
              const totalCreators = campaign.creators ?? campaign.creatorIds?.length ?? 0;
              const salesRevenue = Number(campaign.sales ?? 0) || 0;
              const commissionOwed = Number(campaign.commission ?? 0) || 0;
              const creatorsLabel =
                lang === "fr"
                  ? `${totalCreators} créateur${totalCreators > 1 ? "s" : ""}`
                  : `${totalCreators} creator${totalCreators === 1 ? "" : "s"}`;

              return (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => onOpenCampaign(campaign.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid var(--ws-border)",
                    borderRadius: 12,
                    background: "var(--ws-surface)",
                    padding: "18px 20px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--ws-border-strong)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--ws-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{campaign.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {campaign.status === "Draft" && (
                        <span title={lang === "fr" ? "Brouillon" : "Draft"} style={{ color: "var(--ws-text-dim)", display: "flex" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" stroke="currentColor" strokeWidth="1.8" />
                            <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </span>
                      )}
                      {platforms.map((p) => (
                        <PlatformBrandIcon key={p} platform={p} size={18} />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontSize: 13, color: "var(--ws-text-muted)" }}>
                    <span>{formatStartedLabel(campaign.startRaw, campaign.start, lang)}</span>
                    <CampaignMetric
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle cx="12" cy="12" r="9" stroke="var(--ws-text-dim)" strokeWidth="1.8" />
                          <path d="M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2" stroke="var(--ws-text-dim)" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      }
                      value={formatCurrency(salesRevenue, lang)}
                    />
                    <CampaignMetric
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle cx="9" cy="8" r="3.2" stroke="var(--ws-text-dim)" strokeWidth="1.8" />
                          <path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" stroke="var(--ws-text-dim)" strokeWidth="1.8" strokeLinecap="round" />
                          <circle cx="17" cy="9" r="2.4" stroke="var(--ws-text-dim)" strokeWidth="1.8" />
                          <path d="M15.2 19c.4-1.7 1.5-2.9 3.3-3.3" stroke="var(--ws-text-dim)" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      }
                      value={creatorsLabel}
                    />
                    <CampaignMetric
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M4 7h16v12H4V7z" stroke="var(--ws-text-dim)" strokeWidth="1.8" strokeLinejoin="round" />
                          <path d="M8 7V5.8A2.8 2.8 0 0110.8 3h2.4A2.8 2.8 0 0116 5.8V7" stroke="var(--ws-text-dim)" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M4 12h16" stroke="var(--ws-text-dim)" strokeWidth="1.8" />
                        </svg>
                      }
                      value={formatCurrency(commissionOwed, lang)}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignsHeader({ lang, onNew, showFilters, showNewButton = true, isMobile }: { lang: "en" | "fr"; onNew: () => void; showFilters?: boolean; showNewButton?: boolean; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid var(--ws-border)", background: "var(--ws-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Campagnes" : "Campaigns"}</h1>
        {showNewButton && (
          <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={onNew}>{lang === "fr" ? "+ Nouvelle campagne" : "+ New Campaign"}</button>
        )}
      </div>
    </div>
  );
}

function CampaignRowActions({
  lang,
  campaign,
  onView,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const menuItems: SplitMenuItem[] = [
    {
      label: lang === "fr" ? "Modifier" : "Edit",
      onClick: () => onEdit(campaign.id),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  if (campaign.status === "Active") {
    menuItems.push({
      label: lang === "fr" ? "Pause" : "Pause",
      onClick: () => void onStatusChange(campaign.id, "Paused"),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      ),
    });
  }

  if (campaign.status === "Paused") {
    menuItems.push({
      label: lang === "fr" ? "Reprendre" : "Resume",
      onClick: () => void onStatusChange(campaign.id, "Active"),
      icon: resumeMenuIcon,
    });
  }

  if (campaign.status === "Completed") {
    menuItems.push({
      label: lang === "fr" ? "Reprendre" : "Resume",
      onClick: () => void onStatusChange(campaign.id, "Active"),
      icon: resumeMenuIcon,
    });
  }

  if (campaign.status !== "Completed") {
    menuItems.push({
      label: lang === "fr" ? "Terminer" : "Finish",
      onClick: () => void onStatusChange(campaign.id, "Completed"),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    });
  }

  menuItems.push({
    label: lang === "fr" ? "Supprimer" : "Delete",
    onClick: () => void onDelete(campaign.id),
    danger: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  });

  return (
    <SplitHeaderActions
      variant="white"
      size="sm"
      primaryLabel={lang === "fr" ? "Voir →" : "View →"}
      onPrimaryClick={() => onView(campaign.id)}
      menuAriaLabel={lang === "fr" ? "Actions de campagne" : "Campaign actions"}
      menuItems={menuItems}
    />
  );
}

const editMenuIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const finishMenuIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const resumeMenuIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
  </svg>
);

function CampaignDetailActions({
  lang,
  campaign,
  onEdit,
  onStatusChange,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  onEdit: (id: string) => void;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
}) {
  const editItem: SplitMenuItem = {
    label: lang === "fr" ? "Modifier" : "Edit",
    onClick: () => onEdit(campaign.id),
    icon: editMenuIcon,
  };

  const finishItem: SplitMenuItem = {
    label: lang === "fr" ? "Terminée" : "Finish",
    onClick: () => void onStatusChange(campaign.id, "Completed"),
    icon: finishMenuIcon,
  };

  const pauseItem: SplitMenuItem = {
    label: lang === "fr" ? "Pause" : "Pause",
    onClick: () => void onStatusChange(campaign.id, "Paused"),
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
      </svg>
    ),
  };

  const resumeItem: SplitMenuItem = {
    label: lang === "fr" ? "Reprendre" : "Resume",
    onClick: () => void onStatusChange(campaign.id, "Active"),
    icon: resumeMenuIcon,
  };

  const menuAria = lang === "fr" ? "Actions de campagne" : "Campaign actions";

  if (campaign.status === "Active") {
    return (
      <SplitHeaderActions
        variant="white"
        size="sm"
        primaryLabel={lang === "fr" ? "Pause" : "Pause"}
        onPrimaryClick={() => void onStatusChange(campaign.id, "Paused")}
        menuAriaLabel={menuAria}
        menuItems={[editItem, finishItem]}
      />
    );
  }

  if (campaign.status === "Paused") {
    return (
      <SplitHeaderActions
        variant="white"
        size="sm"
        primaryLabel={lang === "fr" ? "Reprendre" : "Resume"}
        onPrimaryClick={() => void onStatusChange(campaign.id, "Active")}
        menuAriaLabel={menuAria}
        menuItems={[editItem, finishItem]}
      />
    );
  }

  if (campaign.status === "Completed") {
    return (
      <SplitHeaderActions
        variant="white"
        size="sm"
        primaryLabel={lang === "fr" ? "Modifier" : "Edit"}
        onPrimaryClick={() => onEdit(campaign.id)}
        menuAriaLabel={menuAria}
        menuItems={[resumeItem]}
      />
    );
  }

  return (
    <SplitHeaderActions
      variant="white"
      size="sm"
      primaryLabel={lang === "fr" ? "Modifier" : "Edit"}
      onPrimaryClick={() => onEdit(campaign.id)}
      menuAriaLabel={menuAria}
      menuItems={[pauseItem, finishItem]}
    />
  );
}

function CampaignsList({ lang, campaigns, kpiStats, filter, setFilter, search, setSearch, onView, onDelete, onStatusChange, onEdit, isMobile }: {
  lang: "en" | "fr";
  campaigns: Campaign[];
  kpiStats: CampaignKpiStats;
  filter: CampaignFilter; setFilter: (f: CampaignFilter) => void;
  search: string; setSearch: (s: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
  onEdit: (id: string) => void;
  isMobile?: boolean;
}) {
  const filtered = useMemo(() => {
    let list = campaigns ?? [];
    if (filter !== "all") list = list.filter((c) => c.status.toLowerCase() === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [campaigns, filter, search]);

  if (!campaigns || campaigns.length === 0) return <div>No campaigns yet.</div>;

  const salesTrendSub = formatSalesTrendSub(kpiStats.salesTrend, lang);

  return (
    <div style={{ padding: isMobile ? "16px 16px 16px" : "24px 40px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <FilterPills lang={lang} filter={filter} setFilter={setFilter} />
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: "var(--ws-surface-2)", border: "1px solid var(--ws-border)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="var(--ws-text-dim)" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="var(--ws-text-dim)" strokeWidth="2" strokeLinecap="round"/></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", flex: 1, color: "var(--ws-text)" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <Kpi title={lang === "fr" ? "Campagnes actives" : "Active Campaigns"} value={String(kpiStats.activeCount)} sub={formatEndingSub(kpiStats.endingThisMonth, lang)} />
        <Kpi title={lang === "fr" ? "Créateurs total" : "Total Creators"} value={String(kpiStats.totalCreators)} sub={formatCreatorsSub(kpiStats.totalCampaigns, lang)} />
        <Kpi title={lang === "fr" ? "Ventes totales générées" : "Total Sales Driven"} value={formatCurrency(kpiStats.totalSales, lang)} sub={salesTrendSub.text} subColor={salesTrendSub.color} />
        <Kpi title={lang === "fr" ? "Commissions dues" : "Total Commissions Owed"} value={formatCurrency(kpiStats.totalCommissionOwed, lang)} sub={formatPendingPayoutsSub(kpiStats.pendingPayouts, lang)} />
      </div>

      <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16 }}>
        <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 700 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left", background: "var(--ws-surface-2)" }}>
                {[
                  lang === "fr" ? "Nom de la campagne" : "Campaign Name",
                  lang === "fr" ? "Créateurs" : "Creators",
                  lang === "fr" ? "Plateforme" : "Platform",
                  lang === "fr" ? "Ventes" : "Sales",
                  lang === "fr" ? "Commission" : "Commission",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Date de début" : "Start Date",
                  lang === "fr" ? "Date de fin" : "End Date",
                  lang === "fr" ? "Action" : "Action",
                ].map((h) => (
                  <th key={h} style={{ padding: "12px 14px", color: "var(--ws-text-dim)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isPaused = c.status === "Paused";
                return (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: "1px solid var(--ws-border)",
                    background: isPaused ? "var(--ws-hover)" : "var(--ws-surface)",
                  }}
                >
                  <td style={{ padding: "14px", fontWeight: 500, color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text)" }}>{c.name}</td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text)" }}>{(c.creators ?? 0)} {lang === "fr" ? "créateurs" : "creators"}</td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text-muted)" }}>{c.platform}</td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text)" }}>{formatCurrency(c.sales ?? 0, lang)}</td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text)" }}>{formatCurrency(c.commission ?? 0, lang)}</td>
                  <td style={{ padding: "14px" }}><CampaignBadge lang={lang} status={c.status} /></td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text-muted)" }}>{c.start}</td>
                  <td style={{ padding: "14px", color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text-muted)" }}>{c.end}</td>
                  <td style={{ padding: "14px" }}>
                    <CampaignRowActions
                      lang={lang}
                      campaign={c}
                      onView={onView}
                      onEdit={onEdit}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--ws-border)", fontSize: 13, color: "var(--ws-text-muted)" }}>
          <span>{lang === "fr" ? "Affichage" : "Showing"} {filtered.length} {lang === "fr" ? "sur" : "of"} {campaigns.length} {lang === "fr" ? "campagnes" : "campaigns"}</span>
        </div>
      </div>
    </div>
  );
}


function FilterPills({ lang, filter, setFilter }: { lang: "en" | "fr"; filter: CampaignFilter; setFilter: (f: CampaignFilter) => void }) {
  const pills: { id: CampaignFilter; label: string }[] = [
    { id: "all", label: lang === "fr" ? "Tout" : "All" },
    { id: "active", label: lang === "fr" ? "Actif" : "Active" },
    { id: "paused", label: lang === "fr" ? "En pause" : "Paused" },
    { id: "completed", label: lang === "fr" ? "Terminé" : "Completed" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setFilter(p.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: filter === p.id ? "1px solid var(--ws-btn)" : "1px solid var(--ws-border)",
            background: filter === p.id ? "var(--ws-btn)" : "var(--ws-surface)",
            color: filter === p.id ? "var(--ws-btn-text)" : "var(--ws-text-muted)",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: filter === p.id ? 500 : 400,
            cursor: "pointer",
            letterSpacing: "-0.02em",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ title, value, sub, subColor }: { title: string; value: string; sub: string; subColor?: string }) {
  return (
    <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor ?? "var(--ws-text-muted)", letterSpacing: "-0.01em" }}>{sub}</div>
    </div>
  );
}

function CompactKpi({
  lang,
  title,
  sub,
  subColor,
  value,
  showAsCurrency,
  onCommit,
}: {
  lang: "en" | "fr";
  title: string;
  sub: string;
  subColor?: string;
  value: number;
  showAsCurrency?: boolean;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(() => compactNumberToInput(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(compactNumberToInput(value));
      setError(null);
    }
  }, [value, focused]);

  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    const inputError = getCompactNumberInputError(trimmed, lang);
    if (inputError) {
      setError(inputError);
      setDraft(compactNumberToInput(value));
      return;
    }

    const parsed = parseCompactNumber(trimmed);
    if (!Number.isFinite(parsed)) {
      setError(
        lang === "fr"
          ? "Format invalide. Exemples : 12K, 11M, 500."
          : "Invalid format. Examples: 12K, 11M, 500.",
      );
      setDraft(compactNumberToInput(value));
      return;
    }

    setError(null);
    onCommit(parsed);
    setDraft(compactNumberToInput(parsed));
  };

  const displayValue = showAsCurrency ? formatCompactCurrency(value, getDisplayCurrency(lang)) : formatCompactNumber(value);

  return (
    <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      {focused ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(getCompactNumberInputError(e.target.value, lang));
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 28,
            fontWeight: 600,
            color: error ? "#DC2626" : "var(--ws-text)",
            letterSpacing: "-0.04em",
            marginBottom: error ? 4 : 6,
            border: "none",
            outline: "none",
            padding: 0,
            background: "transparent",
            fontFamily: "inherit",
          }}
          aria-invalid={Boolean(error)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(compactNumberToInput(value));
            setError(null);
            setFocused(true);
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: 28,
            fontWeight: 600,
            color: "var(--ws-text)",
            letterSpacing: "-0.04em",
            marginBottom: 6,
            border: "none",
            outline: "none",
            padding: 0,
            background: "transparent",
            fontFamily: "inherit",
            cursor: "text",
          }}
        >
          {displayValue}
        </button>
      )}
      {error && (
        <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 6, lineHeight: 1.4, letterSpacing: "-0.01em" }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: 12, color: subColor ?? "var(--ws-text-muted)", letterSpacing: "-0.01em" }}>{sub}</div>
    </div>
  );
}

function getCampaignStatusTheme(status: CampaignStatus): { color: string; background: string; boxShadow: string } {
  switch (status) {
    case "Active":
      return {
        color: "#0369A1",
        background: "rgba(3, 105, 161, 0.1)",
        boxShadow: "0 6px 18px rgba(3, 105, 161, 0.14), inset 0 -3px 0 rgba(3, 105, 161, 0.12)",
      };
    case "Paused":
      return {
        color: "#C2410C",
        background: "rgba(194, 65, 12, 0.1)",
        boxShadow: "0 6px 18px rgba(194, 65, 12, 0.14), inset 0 -3px 0 rgba(194, 65, 12, 0.12)",
      };
    case "Completed":
      return {
        color: "#15803D",
        background: "rgba(21, 128, 61, 0.1)",
        boxShadow: "0 6px 18px rgba(21, 128, 61, 0.14), inset 0 -3px 0 rgba(21, 128, 61, 0.12)",
      };
    case "Draft":
    default:
      return {
        color: "var(--ws-text-muted)",
        background: "rgba(82, 82, 91, 0.1)",
        boxShadow: "0 6px 18px rgba(82, 82, 91, 0.12), inset 0 -3px 0 rgba(82, 82, 91, 0.1)",
      };
  }
}

function CampaignStatusIcon({ status, size = 16 }: { status: CampaignStatus; size?: number }) {
  const stroke = 1.75;
  if (status === "Active") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={stroke} strokeDasharray="3.5 3.5" />
      </svg>
    );
  }
  if (status === "Paused") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 5.5 19.5 19.5H4.5L12 5.5z"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path d="M12 10v4" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  if (status === "Completed") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={stroke} />
        <path d="M8.5 12.2 10.8 14.5 15.8 9.5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={stroke} />
      <path d="M12 8v4.2l2.6 1.6" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CampaignStatusPill({
  lang,
  status,
}: {
  lang: "en" | "fr";
  status: CampaignStatus;
}) {
  const theme = getCampaignStatusTheme(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        borderRadius: 14,
        background: theme.background,
        color: theme.color,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "inherit",
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        boxShadow: theme.boxShadow,
      }}
    >
      <CampaignStatusIcon status={status} size={16} />
      {campaignStatusLabel(status, lang)}
    </span>
  );
}

function CampaignBadge({ lang, status }: { lang: "en" | "fr"; status: CampaignStatus }) {
  return <CampaignStatusPill lang={lang} status={status} />;
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      {title && <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", margin: "0 0 18px 0" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--ws-text-dim)", letterSpacing: "-0.01em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left", background: "var(--ws-surface-2)" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "12px 14px", color: "var(--ws-text-dim)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function BtnSm({ children, onClick, variant }: { children: React.ReactNode; onClick?: () => void; variant?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btnSecondary,
        padding: "6px 10px",
        fontSize: 12,
        ...(variant === "danger" ? { color: "#DC2626", borderColor: "#FECACA" } : {}),
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{ position: "relative", width: 40, height: 22, background: on ? "var(--ws-accent)" : "var(--ws-border)", borderRadius: 999, border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "var(--ws-surface)", borderRadius: "50%", transition: "left 0.2s" }} />
      </button>
      {label && <span style={{ fontSize: 13, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{label}</span>}
    </div>
  );
}

function CampaignDetailToolbar({
  lang,
  campaign,
  isMobile,
  onBack,
  onStatusChange,
  onAddCreators,
  onAddSale,
  onExport,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  isMobile?: boolean;
  onBack: () => void;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
  onAddCreators: () => void;
  onAddSale: () => void;
  onExport: (format: "csv" | "xlsx") => void | Promise<void>;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useClickOutside(statusRef, statusOpen, () => setStatusOpen(false));
  useClickOutside(moreRef, moreOpen, () => setMoreOpen(false));

  const isPaused = campaign.status === "Paused";
  const statusOptions: CampaignStatus[] = ["Active", "Paused", "Completed", "Draft"];

  const dropdownPanel: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: 180,
    background: "var(--ws-surface)",
    border: "1px solid var(--ws-border)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
    zIndex: 30,
    padding: 6,
  };

  const menuItemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    color: "var(--ws-text)",
    cursor: "pointer",
  };

  const toolbarControl: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    padding: "6px 4px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "var(--ws-text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, minWidth: 0, flex: 1 }}>
        <span
          role="link"
          tabIndex={0}
          onClick={onBack}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onBack();
            }
          }}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ws-text-muted)",
            cursor: "pointer",
            letterSpacing: "-0.02em",
          }}
        >
          {lang === "fr" ? "← Retour aux campagnes" : "← Back to campaigns"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
        <h1
          style={{
            fontSize: isMobile ? 24 : 28,
            fontWeight: 600,
            color: isPaused ? "var(--ws-text-dim)" : "var(--ws-text)",
            margin: 0,
            letterSpacing: "-0.03em",
          }}
        >
          {campaign.name}
        </h1>

        <div ref={statusRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setStatusOpen((open) => !open)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              fontFamily: "inherit",
            }}
          >
            <CampaignStatusPill lang={lang} status={campaign.status} />
          </button>
          {statusOpen && (
            <div style={{ ...dropdownPanel, right: "auto", left: 0, minWidth: 196, padding: 8 }}>
              {statusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  style={{
                    display: "flex",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: campaign.status === status ? "rgba(0, 0, 0, 0.04)" : "transparent",
                    padding: "6px 8px",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setStatusOpen(false);
                    if (status !== campaign.status) void onStatusChange(campaign.id, status);
                  }}
                >
                  <CampaignStatusPill lang={lang} status={status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ws-text-dim)", fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{lang === "fr" ? "Contenu à jour" : "Content is up to date"}</span>
        </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexWrap: "wrap" }}>
        <div ref={moreRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label={lang === "fr" ? "Plus d'actions" : "More actions"}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            style={{ ...toolbarControl, padding: "6px 8px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {moreOpen && (
            <div style={{ ...dropdownPanel, minWidth: 220 }}>
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setMoreOpen(false);
                  onAddSale();
                }}
              >
                {lang === "fr" ? "Ajouter une vente" : "Add a sale"}
              </button>
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setMoreOpen(false);
                  onAddCreators();
                }}
              >
                {lang === "fr" ? "Ajouter des créateurs" : "Add creators"}
              </button>
              <div style={{ height: 1, background: "var(--ws-border)", margin: "4px 0" }} />
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setMoreOpen(false);
                  void onExport("csv");
                }}
              >
                {lang === "fr" ? "Exporter CSV" : "Export CSV"}
              </button>
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setMoreOpen(false);
                  void onExport("xlsx");
                }}
              >
                {lang === "fr" ? "Exporter Excel" : "Export Excel"}
              </button>
              {campaign.status !== "Completed" && (
                <>
                  <div style={{ height: 1, background: "var(--ws-border)", margin: "4px 0" }} />
                  <button
                    type="button"
                    style={menuItemStyle}
                    onClick={() => {
                      setMoreOpen(false);
                      void onStatusChange(campaign.id, "Completed");
                    }}
                  >
                    {lang === "fr" ? "Terminer la campagne" : "Finish campaign"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignDetail({ lang, campaign, userId, plan, initialTab = "analytics", onBack, onTabChange, onUpdate: _onUpdate, onStatusChange, onEdit, onDelete: _onDelete, onAddCreators, onManualSaleAdded, onUpgrade, isMobile }: { lang: "en" | "fr"; campaign: Campaign; userId?: string; plan: PlanTier; initialTab?: DetailTab; onBack: () => void; onTabChange?: (tab: DetailTab) => void; onUpdate: (c: Campaign) => void; onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>; onEdit: (id: string) => void; onDelete: (id: string) => void | Promise<void>; onAddCreators: () => void; onManualSaleAdded?: (saleDate?: string) => void | Promise<void>; onUpgrade?: () => void; isMobile?: boolean }) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const displayCurrency = useDisplayCurrency();
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsDateRange>("30d");
  const [customDateRange, setCustomDateRange] = useState<CampaignDateRange>(() => defaultCampaignDateRange(campaign));
  const [analytics, setAnalytics] = useState<CampaignAnalyticsSnapshot | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const campaignAllStart = useMemo(() => defaultCampaignDateRange(campaign).start, [campaign]);
  const analyticsDateBounds = useMemo(
    () =>
      resolveAnalyticsDateBounds(analyticsPeriod, {
        allStart: campaignAllStart,
        customRange: customDateRange,
      }),
    [analyticsPeriod, campaignAllStart, customDateRange],
  );
  const exportDateRange = useMemo<CampaignDateRange>(() => {
    if (analyticsPeriod === "custom") return customDateRange;
    if (analyticsDateBounds) {
      return {
        start: analyticsDateBounds.start.toISOString().slice(0, 10),
        end: analyticsDateBounds.end.toISOString().slice(0, 10),
      };
    }
    return customDateRange;
  }, [analyticsPeriod, analyticsDateBounds, customDateRange]);

  useEffect(() => {
    setTab(initialTab);
  }, [campaign.id, initialTab]);

  useEffect(() => {
    setCustomDateRange(defaultCampaignDateRange(campaign));
    setAnalyticsPeriod("30d");
  }, [campaign.id, campaign.startRaw, campaign.start, campaign.createdAt]);

  useEffect(() => {
    const lastSaleDate = sessionStorage.getItem("trackit_last_sale_date");
    if (!lastSaleDate) return;
    sessionStorage.removeItem("trackit_last_sale_date");
    setAnalyticsPeriod("custom");
    setCustomDateRange((prev) =>
      normalizeCampaignDateRange({
        start: lastSaleDate < prev.start ? lastSaleDate : prev.start,
        end: lastSaleDate > prev.end ? lastSaleDate : prev.end,
      }),
    );
  }, [campaign.id]);

  const refreshCampaignAnalytics = useCallback(async () => {
    if (!supabase) {
      setAnalytics(null);
      return;
    }

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAnalytics(null);
        return;
      }
      resolvedUserId = user.id;
    }

    try {
      const snapshot = await fetchCampaignAnalyticsSnapshot(campaign, resolvedUserId, analyticsDateBounds);
      setAnalytics(snapshot);
    } catch {
      const flatTrend: PeriodTrend = { current: 0, previous: 0, changePct: 0, direction: "flat" };
      setAnalytics({
        rows: [],
        monthRows: [],
        totals: { sales: campaign.sales ?? 0, commission: campaign.commission ?? 0 },
        salesTrend: flatTrend,
        commissionTrend: flatTrend,
        netRevenueTrend: flatTrend,
        roiTrend: flatTrend,
        timeline: [],
        creatorCount: campaign.creators ?? campaign.creatorIds?.length ?? 0,
        pendingPayouts: 0,
        pendingCreatorCount: 0,
        activeCreators: 0,
        roi: null,
      });
    }
  }, [campaign, userId, analyticsDateBounds]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cached =
        userId
          ? peekCampaignAnalyticsSnapshot(userId, campaign.id, analyticsDateBounds)
          : null;
      if (cached) {
        setAnalytics(cached);
        setAnalyticsLoading(false);
      } else {
        setAnalyticsLoading(true);
      }
      await refreshCampaignAnalytics();
      if (!cancelled) setAnalyticsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshCampaignAnalytics, userId, campaign.id, analyticsDateBounds]);

  useAnalyticsAutoRefresh(refreshCampaignAnalytics);

  const detailTabs: { id: DetailTab; label: string }[] = [
    { id: "creators", label: lang === "fr" ? "Créateurs" : "Creators" },
    { id: "analytics", label: lang === "fr" ? "Analytiques" : "Analytics" },
  ];

  const headerPad = isMobile ? "16px 16px 0" : "40px 40px 0";
  const creatorCount = analytics?.creatorCount ?? campaign.creators ?? campaign.creatorIds?.length ?? 0;
  const totals = analytics?.totals ?? { sales: campaign.sales ?? 0, commission: campaign.commission ?? 0 };
  const avgPerCreator = creatorCount > 0 ? totals.sales / creatorCount : 0;
  const netRevenue = Math.max(0, totals.sales - totals.commission);
  const roi = analytics?.roi ?? computeCreatorCampaignRoi(
    totals.sales,
    (analytics?.rows ?? []).reduce(
      (sum, row) => sum + computeCreatorBrandCost(row.commission, row.commissionPaid),
      0,
    ),
  );
  const pendingPayouts = analytics?.pendingPayouts ?? 0;
  const pendingCreatorCount = analytics?.pendingCreatorCount ?? 0;
  const activeCreators = analytics?.activeCreators ?? 0;
  const salesTrend = analytics?.salesTrend ?? { current: 0, previous: 0, changePct: 0, direction: "flat" as const };
  const commissionTrend = analytics?.commissionTrend ?? { current: 0, previous: 0, changePct: 0, direction: "flat" as const };
  const netRevenueTrend = analytics?.netRevenueTrend ?? { current: 0, previous: 0, changePct: 0, direction: "flat" as const };
  const roiTrend = analytics?.roiTrend ?? { current: 0, previous: 0, changePct: 0, direction: "flat" as const };
  const timeline = analytics?.timeline ?? [];
  const currentStartKey = analyticsDateBounds ? toDayKey(analyticsDateBounds.start) : "";
  const revenueSeries = timeline
    .filter((p) => !currentStartKey || p.date >= currentStartKey)
    .map((p) => ({ date: p.date, value: p.revenue }));
  const netSeries = timeline
    .filter((p) => !currentStartKey || p.date >= currentStartKey)
    .map((p) => ({ date: p.date, value: p.net }));
  const salesCountSeries = timeline
    .filter((p) => !currentStartKey || p.date >= currentStartKey)
    .map((p) => ({ date: p.date, value: p.salesCount }));
  const periodSalesCount = salesCountSeries.reduce((sum, p) => sum + p.value, 0);
  const roiSparklineSeries = timeline
    .filter((p) => !currentStartKey || p.date >= currentStartKey)
    .map((p) => ({ date: p.date, value: p.commission > 0 ? p.revenue / p.commission : 0 }));
  const money = (v: number) => formatCurrencyWithCode(v, displayCurrency);

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!supabase) return;

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      resolvedUserId = user?.id;
    }
    if (!resolvedUserId) {
      alert(lang === "fr" ? "Session expirée." : "Session expired.");
      return;
    }

    try {
      const snapshot = await fetchCampaignAnalyticsSnapshot(campaign, resolvedUserId, analyticsDateBounds);
      const data: CampaignAnalyticsExport = {
        campaignName: campaign.name,
        dateRange: exportDateRange,
        currency: displayCurrency,
        rows: snapshot.rows,
        totals: snapshot.totals,
        pendingPayouts: snapshot.pendingPayouts,
        roi: snapshot.roi,
      };
      if (format === "csv") {
        exportCampaignAnalyticsCsv(data);
      } else {
        await exportCampaignAnalyticsExcel(data);
      }
    } catch (error) {
      console.error("Campaign analytics export failed:", error);
      alert(lang === "fr" ? "Impossible d'exporter les analytiques." : "Could not export analytics.");
    }
  };

  return (
  <>
    <div style={{ padding: headerPad, borderBottom: "1px solid var(--ws-border)", background: "var(--ws-bg)" }}>
      <CampaignDetailToolbar
        lang={lang}
        campaign={campaign}
        isMobile={isMobile}
        onBack={onBack}
        onStatusChange={onStatusChange}
        onAddCreators={onAddCreators}
        onAddSale={() => setAddSaleOpen(true)}
        onExport={handleExport}
      />
      <div style={{ display: "flex", gap: 28, overflowX: "auto", marginTop: 28 }}>
        {detailTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              onTabChange?.(t.id);
            }}
            style={{
              background: "none",
              border: "none",
              padding: "0 0 12px",
              marginBottom: -1,
              fontSize: 14,
              fontFamily: "inherit",
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? "var(--ws-text)" : "var(--ws-text-dim)",
              cursor: "pointer",
              borderBottom: tab === t.id ? "2px solid var(--ws-btn)" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
    <div style={{ padding: isMobile ? 16 : "32px 40px 40px", background: "var(--ws-bg)" }}>
      {tab === "creators" && (
        <CreatorsTab
          lang={lang}
          campaign={campaign}
          rows={analytics?.rows ?? []}
          loading={analyticsLoading}
          currency={displayCurrency}
          userId={userId}
          onAddCreator={onAddCreators}
        />
      )}
      {tab === "analytics" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <SummaryMetricCard
              title={lang === "fr" ? "Revenus" : "Revenue"}
              info={
                lang === "fr"
                  ? "Somme des commandes attribuées à cette campagne sur la période."
                  : "Sum of orders attributed to this campaign in the selected period."
              }
              value={money(totals.sales)}
              trend={salesTrend}
              sparklineSeries={revenueSeries}
              lang={lang}
            />
            <SummaryMetricCard
              title={lang === "fr" ? "Revenus nets" : "Net revenue"}
              info={
                lang === "fr"
                  ? "Revenus de la campagne moins les commissions dues aux créateurs."
                  : "Campaign revenue minus commissions owed to creators."
              }
              value={money(netRevenue)}
              trend={netRevenueTrend}
              sparklineSeries={netSeries}
              lang={lang}
            />
            <SummaryMetricCard
              title={lang === "fr" ? "Rentabilité (ROI)" : "Profitability (ROI)"}
              info={
                lang === "fr"
                  ? "Revenus divisés par le coût créateur. Au-dessus de 1×, la campagne est rentable."
                  : "Revenue divided by creator cost. Above 1×, the campaign is profitable."
              }
              value={formatCampaignRoi(roi)}
              trend={roiTrend}
              sparklineSeries={roiSparklineSeries}
              lang={lang}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: "stretch",
              gap: isMobile ? 20 : 20,
              marginBottom: 28,
              minWidth: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <HeroBarChartCard
                title={lang === "fr" ? "Volume de ventes" : "Sales volume"}
                info={
                  lang === "fr"
                    ? "Volume cumulé de ventes, de la période précédente à la période actuelle — un bâton tous les 7 jours."
                    : "Cumulative sales volume from the previous period through the current one — one bar every 7 days."
                }
                value={String(periodSalesCount)}
                trend={salesTrend}
                series={salesCountSeries}
                formatPoint={(v) =>
                  lang === "fr"
                    ? `${Math.round(v)} vente${Math.round(v) === 1 ? "" : "s"}`
                    : `${Math.round(v)} sale${Math.round(v) === 1 ? "" : "s"}`
                }
                lang={lang}
                period={analyticsPeriod === "all" ? "90d" : analyticsPeriod}
                onPeriodChange={(next) => {
                  if (next === "today" || next === "3d" || next === "7d" || next === "30d" || next === "90d") {
                    setAnalyticsPeriod(next);
                  }
                }}
              />
            </div>

            <AnalyticsSalesPanel
              userId={userId}
              lang={lang}
              isMobile={isMobile}
              campaignId={campaign.id}
              campaignCreatorIds={
                analytics?.rows?.map((row) => String(row.id)) ??
                campaign.creatorIds?.map(String) ??
                []
              }
              syncRange={
                analyticsPeriod === "today" ||
                analyticsPeriod === "3d" ||
                analyticsPeriod === "7d" ||
                analyticsPeriod === "30d" ||
                analyticsPeriod === "90d"
                  ? analyticsPeriod
                  : undefined
              }
              onSalesChange={refreshCampaignAnalytics}
            />
          </div>

          <AnalyticsSectionHeader
            title={lang === "fr" ? "Performances créateurs" : "Creator performance"}
            info={
              lang === "fr"
                ? "Classement des créateurs et détail des performances."
                : "Creator rankings and performance details."
            }
            lang={lang}
          />
          <AnalyticsTab
            lang={lang}
            campaign={campaign}
            isMobile={isMobile}
            currency={displayCurrency}
            rows={analytics?.rows ?? []}
            monthRows={analytics?.monthRows ?? []}
            loading={analyticsLoading}
            periodLabel={analyticsPeriodLabel(analyticsPeriod, lang)}
          />
        </>
      )}
    </div>
    <AddSalePanel
      open={addSaleOpen}
      onClose={() => setAddSaleOpen(false)}
      lang={lang}
      userId={userId}
      campaign={{
        id: campaign.id,
        name: campaign.name,
        creatorIds: campaign.creatorIds,
        commissionRate: campaign.commissionRate,
      }}
      onSuccess={onManualSaleAdded}
    />
  </>
  );
}

function CreatorsTab({
  lang,
  campaign,
  rows,
  loading,
  currency,
  userId,
  onAddCreator,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  rows: CampaignCreatorRow[];
  loading: boolean;
  currency: DisplayCurrency;
  userId?: string;
  onAddCreator: () => void;
}) {
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const handleAttachSales = async (row: CampaignCreatorRow) => {
    if (!userId || attachingId) return;
    const count = row.brandSalesCount ?? 0;
    const revenue = row.brandSalesRevenue ?? 0;
    if (count <= 0) return;
    const ok = window.confirm(
      lang === "fr"
        ? `Rattacher ${count} vente${count > 1 ? "s" : ""} (${formatCurrency(revenue, lang)}) de ce créateur à cette campagne ?`
        : `Attach ${count} sale${count > 1 ? "s" : ""} (${formatCurrency(revenue, lang)}) from this creator to this campaign?`,
    );
    if (!ok) return;
    setAttachingId(row.id);
    try {
      const success = await attachCreatorSalesToCampaign(userId, campaign.id, row.id);
      if (success) {
        dispatchCampaignsUpdated();
        dispatchSalesUpdated();
      }
    } finally {
      setAttachingId(null);
    }
  };

  const headers = [
    lang === "fr" ? "Créateur" : "Creator",
    lang === "fr" ? "Pseudo" : "Handle",
    lang === "fr" ? "Plateforme" : "Platform",
    lang === "fr" ? "Ventes" : "Sales",
    lang === "fr" ? "Revenus" : "Revenue",
    lang === "fr" ? "Commission" : "Commission",
  ];

  return (
    <Card title={lang === "fr" ? "Créateurs de la campagne" : "Campaign creators"}>
      <Table headers={headers}>
        {loading ? (
          <tr>
            <td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
              {lang === "fr" ? "Chargement…" : "Loading…"}
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <EmptyTableRow lang={lang} colSpan={headers.length} />
        ) : (
          rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
            <td style={{ padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <CreatorAvatar
                    src={row.avatar_url}
                    username={row.handle}
                    displayName={row.full_name}
                    size={32}
                    alt={row.full_name || row.handle}
                  />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 500, color: "var(--ws-text)" }}>{row.full_name || row.handle || "—"}</span>
                    {!row.historicalSalesAttached && (row.brandSalesCount ?? 0) > 0 ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "rgba(217, 119, 6, 0.12)",
                          border: "1px solid rgba(217, 119, 6, 0.35)",
                          maxWidth: 360,
                        }}
                      >
                        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9A3412", lineHeight: 1.45 }}>
                          {lang === "fr"
                            ? "Les ventes de ce créateur ne sont pas rattachées à cette campagne."
                            : "This creator's sales are not attached to this campaign."}
                        </p>
                        <button
                          type="button"
                          disabled={attachingId === row.id}
                          onClick={() => void handleAttachSales(row)}
                          style={{
                            border: "none",
                            background: "var(--ws-text)",
                            color: "var(--ws-surface)",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: attachingId === row.id ? "wait" : "pointer",
                            fontFamily: "inherit",
                            opacity: attachingId === row.id ? 0.7 : 1,
                          }}
                        >
                          {lang === "fr"
                            ? `Rattacher les ventes (${row.brandSalesCount})`
                            : `Attach sales (${row.brandSalesCount})`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
            </td>
              <td style={{ padding: "14px", color: "var(--ws-text-muted)" }}>{row.handle ? `@${row.handle.replace(/^@/, "")}` : "—"}</td>
              <td style={{ padding: "14px", color: "var(--ws-text-muted)" }}>{row.platform || "—"}</td>
              <td style={{ padding: "14px", color: "var(--ws-text)", fontWeight: 500 }}>{row.salesCount}</td>
              <td style={{ padding: "14px", color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.salesAmount, currency)}</td>
              <td style={{ padding: "14px", color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.commission, currency)}</td>
          </tr>
          ))
        )}
      </Table>
      <div style={{ marginTop: 16 }}>
        <BtnSm onClick={onAddCreator}>{lang === "fr" ? "+ Ajouter un créateur" : "+ Add creator"}</BtnSm>
      </div>
    </Card>
  );
}

function CampaignCreatorRankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: "#D4AF37", 2: "#9E9E9E", 3: "#CD7F32" };
  return <span style={{ fontWeight: 600, color: colors[rank] ?? "var(--ws-text-dim)" }}>#{rank}</span>;
}

function CampaignCreatorStatusBadge({ lang, active }: { lang: "en" | "fr"; active: boolean }) {
  const label = active ? (lang === "fr" ? "Actif" : "Active") : lang === "fr" ? "Inactif" : "Inactive";
  const bg = active ? "rgba(34, 197, 94, 0.12)" : "var(--ws-bg)";
  const color = active ? "#2E7D32" : "var(--ws-text-dim)";
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, background: bg, color }}>
      {label}
    </span>
  );
}

function AnalyticsTab({
  lang,
  campaign,
  isMobile,
  currency,
  rows,
  monthRows,
  loading,
  periodLabel,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  isMobile?: boolean;
  currency: DisplayCurrency;
  rows: CampaignCreatorRow[];
  monthRows: CampaignCreatorRow[];
  loading: boolean;
  periodLabel: string;
}) {
  const headers = [
    lang === "fr" ? "Créateur" : "Creator",
    lang === "fr" ? "Ventes" : "Sales",
    lang === "fr" ? "Revenus" : "Revenue",
    lang === "fr" ? "Commission" : "Commission",
    "ROI",
  ];

  const monthHeaders = [
    lang === "fr" ? "Rang" : "Rank",
    lang === "fr" ? "Créateur" : "Creator",
    lang === "fr" ? "Plateforme" : "Platform",
    lang === "fr" ? "Ventes générées" : "Sales driven",
    lang === "fr" ? "Commission" : "Commission",
    "ROI",
    lang === "fr" ? "Statut" : "Status",
  ];

  const emptyMessage =
    rows.length === 0
      ? lang === "fr"
        ? "Ajoutez des créateurs à cette campagne pour voir les analytiques."
        : "Add creators to this campaign to see analytics."
      : lang === "fr"
        ? "Aucune vente attribuée à cette campagne pour le moment."
        : "No sales attributed to this campaign yet.";

  const monthEmptyMessage =
    lang === "fr"
      ? `Aucune vente sur la période (${periodLabel.toLowerCase()}).`
      : `No sales in period (${periodLabel.toLowerCase()}).`;

  const topCreatorsTitle =
    lang === "fr" ? `Meilleurs créateurs — ${periodLabel}` : `Top creators — ${periodLabel}`;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
      <Card title={topCreatorsTitle}>
        <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 640 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                {monthHeaders.map((header) => (
                  <th key={header} style={{ padding: "12px 14px", color: "var(--ws-text-dim)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={monthHeaders.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                    {lang === "fr" ? "Chargement…" : "Loading…"}
                  </td>
                </tr>
              ) : monthRows.length === 0 ? (
                <tr>
                  <td colSpan={monthHeaders.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                    {monthEmptyMessage}
                  </td>
                </tr>
              ) : (
                monthRows.map((row, index) => {
                  const displayName = row.full_name || row.handle || "—";
                  const handle = row.handle ? row.handle.replace(/^@/, "") : "";
                  return (
          <tr key={row.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
            <td style={{ padding: "14px" }}>
                        <CampaignCreatorRankBadge rank={index + 1} />
            </td>
                      <td style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <CreatorAvatar
                            src={row.avatar_url}
                            username={row.handle}
                            displayName={row.full_name}
                            size={36}
                            alt={displayName}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, color: "var(--ws-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName}
                            </div>
                            {handle && handle !== row.full_name ? (
                              <div style={{ fontSize: 12, color: "var(--ws-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                @{handle}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px", color: "var(--ws-text-muted)" }}>{row.platform || "—"}</td>
                      <td style={{ padding: "14px" }}>
                        <div style={{ fontWeight: 500, color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.salesAmount, currency)}</div>
                        {row.salesCount > 0 ? (
                          <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginTop: 2 }}>
                            {row.salesCount}{" "}
                            {lang === "fr" ? (row.salesCount > 1 ? "ventes" : "vente") : row.salesCount > 1 ? "sales" : "sale"}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: "14px", color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.commission, currency)}</td>
                      <td style={{ padding: "14px" }}><CampaignRoiCell roi={row.roi} lang={lang} /></td>
                      <td style={{ padding: "14px" }}>
                        <CampaignCreatorStatusBadge lang={lang} active={row.salesAmount > 0} />
                      </td>
          </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      <Card title={lang === "fr" ? "Performance par créateur" : "Performance by creator"}>
        <Table headers={headers}>
          {loading ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                {lang === "fr" ? "Chargement…" : "Loading…"}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                  <td style={{ padding: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CreatorAvatar
                    src={row.avatar_url}
                    username={row.handle}
                    displayName={row.full_name}
                    size={32}
                    alt={row.full_name || row.handle}
                  />
                      <div>
                        <span style={{ fontWeight: 500, color: "var(--ws-text)" }}>{row.full_name || row.handle || "—"}</span>
                        {row.handle && row.handle !== row.full_name ? (
                          <div style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>@{row.handle.replace(/^@/, "")}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px", color: "var(--ws-text)", fontWeight: 500 }}>{row.salesCount}</td>
                  <td style={{ padding: "14px", color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.salesAmount, currency)}</td>
                  <td style={{ padding: "14px", color: "var(--ws-text)" }}>{formatCurrencyWithCode(row.commission, currency)}</td>
                  <td style={{ padding: "14px" }}><CampaignRoiCell roi={row.roi} lang={lang} /></td>
                </tr>
            ))
          )}
      </Table>
    </Card>
    </>
  );
}

function PayoutsTab({
  lang,
  campaign,
  userId,
  plan,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  userId?: string;
  plan: PlanTier;
}) {
  const [rows, setRows] = useState<CampaignPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorCount, setCreatorCount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [confirmPay, setConfirmPay] = useState<{ creatorId: string; name: string; amount: number; method: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      if (!supabase) {
        if (!cancelled) setLoading(false);
        return;
      }

      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        resolvedUserId = user.id;
      }

      try {
        const { creatorCounts, linkMeta } = await getCampaignCreatorAttribution(resolvedUserId);
        const creatorIds = [
          ...new Set(
            (campaign.creatorIds?.length ? campaign.creatorIds : creatorCounts[campaign.id] ?? []).map(String),
          ),
        ];

        if (!cancelled) setCreatorCount(creatorIds.length);

        if (creatorIds.length === 0) {
          if (!cancelled) {
            setRows([]);
            setPendingTotal(0);
            setLoading(false);
          }
          return;
        }

        const [creatorResult, salesResult, payoutResult, campaignData] = await Promise.all([
          supabase
            .from("creators")
            .select("id, handle, full_name, avatar_url, balance, paypal_link, revolut_link, iban")
            .eq("user_id", resolvedUserId)
            .in("id", creatorIds),
          supabase
            .from("sales")
            .select("order_amount, commission_amount, campaign_id, creator_id")
            .eq("user_id", resolvedUserId),
          supabase
            .from("payouts")
            .select("id, creator_id, amount, status, paid_at, created_at")
            .eq("user_id", resolvedUserId)
            .in("creator_id", creatorIds)
            .order("created_at", { ascending: false }),
          getCampaigns(resolvedUserId),
        ]);

        if (cancelled) return;

        const enrichedCreators = await enrichCreatorsWithSavedAvatarsClient(
          supabase,
          resolvedUserId,
          (creatorResult.data || []) as Array<{
            id: string;
            handle: string;
            full_name?: string;
            avatar_url?: string;
            balance?: number;
            paypal_link?: string;
            revolut_link?: string;
            iban?: string;
          }>,
        );

        const campaignMeta: Record<string, CampaignSalesMeta> = {};
        for (const row of campaignData) {
          campaignMeta[String(row.id)] = {
            status: String(row.status ?? ""),
            created_at: typeof row.created_at === "string" ? row.created_at : undefined,
          };
        }

        const stats = computeCreatorStatsForCampaign(
          (salesResult.data || []) as SaleRow[],
          campaign.id,
          creatorIds,
          creatorCounts,
          campaignMeta,
          undefined,
          linkMeta,
        );

        const creatorMap = new Map(
          enrichedCreators.map((c) => [
            String(c.id),
            c as {
              id: string;
              handle: string;
              full_name?: string;
              avatar_url?: string | null;
              balance?: number;
              paypal_link?: string;
              revolut_link?: string;
              iban?: string;
            },
          ]),
        );

        const payableCreators: PayableCreator[] = creatorIds.map((id) => {
          const c = creatorMap.get(id);
          return {
            id,
            handle: c?.handle ?? "—",
            full_name: c?.full_name,
            avatar_url: c?.avatar_url ?? undefined,
            balance: Number(c?.balance) || 0,
            campaignCommission: stats[id]?.commission ?? 0,
            paypal_link: c?.paypal_link,
            revolut_link: c?.revolut_link,
            iban: c?.iban,
          };
        });

        const payouts = payoutResult.data || [];
        const payoutCreatorIds = [...new Set(payouts.map((p) => String(p.creator_id)).filter(Boolean))];

        let payoutCreatorMap: Record<string, { handle?: string; full_name?: string; avatar_url?: string }> = {};
        if (payoutCreatorIds.length > 0) {
          const missingIds = payoutCreatorIds.filter((id) => !creatorMap.has(id));
          if (missingIds.length > 0) {
            const { data: extraCreators } = await supabase
              .from("creators")
              .select("id, handle, full_name, avatar_url")
              .in("id", missingIds);
            payoutCreatorMap = Object.fromEntries((extraCreators || []).map((c) => [String(c.id), c]));
          }
        }

        const nextRows: CampaignPayoutRow[] = [];
        let pendingSum = 0;

        const pendingCreators = payableCreators
          .filter((c) => c.balance > 0)
          .sort((a, b) => b.balance - a.balance);

        for (const creator of pendingCreators) {
          pendingSum += creator.balance;
          nextRows.push({
            id: `pending-${creator.id}`,
            creatorId: creator.id,
            creatorName: creator.full_name || creator.handle || "—",
            creatorHandle: creator.handle,
            avatar_url: creator.avatar_url,
            amount: creator.balance,
            status: "pending",
            dueDate: lang === "fr" ? "En attente" : "Due now",
            kind: "pending",
            payableCreator: creator,
          });
        }

        for (const p of payouts) {
          const creatorId = String(p.creator_id);
          const fromCampaign = creatorMap.get(creatorId) ?? payoutCreatorMap[creatorId];
          const dueRaw = p.paid_at || p.created_at;
          const dueDate = dueRaw
            ? new Date(String(dueRaw)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
            : "—";
          nextRows.push({
            id: String(p.id),
            creatorId,
            creatorName: fromCampaign?.full_name || fromCampaign?.handle || "—",
            creatorHandle: fromCampaign?.handle || "",
            avatar_url: fromCampaign?.avatar_url ?? undefined,
            amount: Number(p.amount) || 0,
            status: String(p.status ?? "paid"),
            dueDate,
            kind: "history",
          });
        }

        if (!cancelled) {
          setRows(nextRows);
          setPendingTotal(pendingSum);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setPendingTotal(0);
          setLoading(false);
        }
      }
    };

    void load();

    const onRefresh = () => void load();
    window.addEventListener(PAYOUTS_UPDATED_EVENT, onRefresh);
    window.addEventListener(SALES_UPDATED_EVENT, onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(PAYOUTS_UPDATED_EVENT, onRefresh);
      window.removeEventListener(SALES_UPDATED_EVENT, onRefresh);
    };
  }, [campaign.id, campaign.creatorIds, userId, lang]);

  const handlePayCreator = (creator: PayableCreator) => {
    if (!canUseManualPayouts(plan)) {
      alert(lang === "fr" ? "Les paiements créateurs manuels sont disponibles à partir du plan Starter." : "Manual creator payouts are available on the Starter plan and above.");
      return;
    }
    const amount = creator.balance;
    if (amount <= 0) {
      alert(lang === "fr" ? "Solde insuffisant" : "No balance to pay");
      return;
    }
    if (creator.paypal_link) {
      const clean = String(creator.paypal_link).replace("https://paypal.me/", "").replace("paypal.me/", "");
      window.open(`https://paypal.me/${clean}/${amount}`, "_blank");
    } else if (creator.revolut_link) {
      const clean = String(creator.revolut_link).replace("https://revolut.me/", "").replace("revolut.me/", "");
      window.open(`https://revolut.me/${clean}`, "_blank");
    } else if (creator.iban) {
      navigator.clipboard.writeText(String(creator.iban));
      alert(
        lang === "fr"
          ? `IBAN copié ✓\nMontant à virer : ${formatCurrency(amount, lang)}`
          : `IBAN copied ✓\nAmount to transfer: ${formatCurrency(amount, lang)}`,
      );
    } else {
      alert(
        lang === "fr"
          ? `${creator.full_name || creator.handle} n'a pas encore ajouté ses coordonnées de paiement.`
          : `${creator.full_name || creator.handle} hasn't added their payment details yet.`,
      );
      return;
    }

    const method = creator.paypal_link ? "paypal" : creator.revolut_link ? "revolut" : "iban";
    setTimeout(() => {
      setConfirmPay({
        creatorId: creator.id,
        name: creator.full_name || creator.handle || "creator",
        amount,
        method,
      });
    }, 800);
  };

  const confirmManualPayout = async () => {
    if (!confirmPay) return;
    const { creatorId, amount, method, name } = confirmPay;
    setConfirmPay(null);
    setPayingId(creatorId);

    let resolvedUserId = userId;
    if (!resolvedUserId && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      resolvedUserId = user?.id;
    }
    if (!resolvedUserId) {
      setPayingId(null);
      return;
    }

    try {
      const res = await fetch("/api/payouts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resolvedUserId, creatorId, amount, method }),
      });
      const data = await res.json();
      if (data.ok) {
        notifyCreatorPaid(lang, name, amount, resolvedUserId);
        setRows((prev) => {
          const withoutPending = prev.filter((row) => row.creatorId !== creatorId || row.kind !== "pending");
          const paidRow = prev.find((row) => row.creatorId === creatorId && row.kind === "pending");
          const historyRow: CampaignPayoutRow = {
            id: `paid-${creatorId}-${Date.now()}`,
            creatorId,
            creatorName: paidRow?.creatorName ?? "—",
            creatorHandle: paidRow?.creatorHandle ?? "",
            avatar_url: paidRow?.avatar_url,
            amount,
            status: "paid",
            dueDate: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
            kind: "history",
          };
          return [historyRow, ...withoutPending];
        });
        setPendingTotal((sum) => Math.max(0, sum - amount));
        dispatchPayoutsUpdated();
      } else {
        alert((lang === "fr" ? "Erreur : " : "Error: ") + (data.error || "unknown"));
      }
    } finally {
      setPayingId(null);
    }
  };

  const headers = [
    lang === "fr" ? "Créateur" : "Creator",
    lang === "fr" ? "Montant" : "Amount",
    lang === "fr" ? "Statut" : "Status",
    lang === "fr" ? "Date" : "Date",
    lang === "fr" ? "Action" : "Action",
  ];

  const emptyMessage =
    creatorCount === 0
      ? lang === "fr"
        ? "Ajoutez des créateurs à cette campagne pour suivre les paiements."
        : "Add creators to this campaign to track payouts."
      : lang === "fr"
        ? "Aucun paiement en attente. Les commissions apparaîtront ici après les ventes."
        : "No pending payouts. Commissions will appear here after sales.";

  return (
    <>
      <Card title={lang === "fr" ? "Paiements créateurs" : "Creator payouts"}>
        {!loading && creatorCount > 0 && (
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--ws-text-muted)" }}>
              {lang === "fr" ? "En attente" : "Pending"}:{" "}
              <strong style={{ color: "var(--ws-text)" }}>{formatCurrency(pendingTotal, lang)}</strong>
            </div>
            <div style={{ fontSize: 13, color: "var(--ws-text-muted)" }}>
              {lang === "fr" ? "Commission campagne" : "Campaign commission"}:{" "}
              <strong style={{ color: "var(--ws-text)" }}>{formatCurrency(campaign.commission ?? 0, lang)}</strong>
            </div>
          </div>
        )}
        <Table headers={headers}>
          {loading ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                {lang === "fr" ? "Chargement…" : "Loading…"}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
          <tr key={row.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
            <td style={{ padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CreatorAvatar
                      src={row.avatar_url}
                      username={row.creatorHandle}
                      displayName={row.creatorName}
                      size={32}
                      alt={row.creatorName}
                    />
                    <div>
                      <span style={{ fontWeight: 500, color: "var(--ws-text)" }}>{row.creatorName}</span>
                      {row.creatorHandle && row.creatorHandle !== row.creatorName ? (
                        <div style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>{row.creatorHandle}</div>
                      ) : null}
                    </div>
                  </div>
            </td>
                <td style={{ padding: "14px", color: "var(--ws-text)", fontWeight: 500 }}>{formatCurrency(row.amount, lang)}</td>
            <td style={{ padding: "14px" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: row.kind === "pending" ? "#D97706" : row.status.toLowerCase() === "paid" ? "#1FB567" : "var(--ws-text-muted)",
                    }}
                  >
                    {formatPayoutStatusLabel(row.status, lang)}
                  </span>
                </td>
                <td style={{ padding: "14px", color: "var(--ws-text-muted)" }}>{row.dueDate}</td>
                <td style={{ padding: "14px" }}>
                  {row.kind === "pending" && row.payableCreator ? (
                    <BtnSm onClick={() => handlePayCreator(row.payableCreator!)}>
                      {payingId === row.creatorId
                        ? lang === "fr" ? "…" : "…"
                        : lang === "fr" ? "Payer" : "Pay"}
                    </BtnSm>
                  ) : (
                    <span style={{ color: "var(--ws-text-dim)", fontSize: 12 }}>—</span>
                  )}
            </td>
          </tr>
            ))
          )}
      </Table>
    </Card>

      {confirmPay && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setConfirmPay(null)}
        >
          <div
            style={{ background: "var(--ws-surface)", borderRadius: 20, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 8px" }}>
              {lang === "fr" ? "Confirmer le paiement ?" : "Confirm payment?"}
            </h3>
            <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
              {lang === "fr" ? "Virement de" : "Transfer of"}{" "}
              <strong style={{ color: "var(--ws-text)" }}>{formatCurrency(confirmPay.amount, lang)}</strong>{" "}
              {lang === "fr" ? "à" : "to"}{" "}
              <strong style={{ color: "var(--ws-text)" }}>{confirmPay.name}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: "0 0 24px", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "En confirmant, le paiement est enregistré et le solde du créateur est remis à zéro."
                : "By confirming, the payment is recorded and the creator's balance is reset."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirmPay(null)} style={{ ...btnSecondary, flex: 1 }}>
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button type="button" onClick={() => { primeNotificationSound(); void confirmManualPayout(); }} style={{ ...btnPrimary, flex: 1 }}>
                {lang === "fr" ? "Confirmer" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsTab({
  lang,
  campaign,
  onUpdate,
  onDelete,
  onEdit,
  onStatusChange,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  onUpdate: (c: Campaign) => void;
  onDelete: () => void;
  onEdit: (id: string) => void;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
}) {
  const [autoPayout, setAutoPayout] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <CampaignDetailActions lang={lang} campaign={campaign} onEdit={onEdit} onStatusChange={onStatusChange} />
      </div>
      <Card title={lang === "fr" ? "Détails de la campagne" : "Campaign details"}>
        <Field label={lang === "fr" ? "Nom de la campagne" : "Campaign name"}>
          <input type="text" defaultValue={campaign.name} style={inputStyle} onBlur={(e) => onUpdate({ ...campaign, name: e.target.value })} />
        </Field>
        <Field label="Platform">
          <input type="text" defaultValue={campaign.platform} style={inputStyle} onBlur={(e) => onUpdate({ ...campaign, platform: e.target.value })} />
        </Field>
        <Field label={lang === "fr" ? "Description" : "Description"}>
          <textarea defaultValue={campaign.description ?? ""} rows={3} style={{ ...inputStyle, resize: "vertical" }} onBlur={(e) => onUpdate({ ...campaign, description: e.target.value })} />
        </Field>
      </Card>
      <Card title="Commission & tracking">
        <Field label="Default commission rate">
          <input type="text" defaultValue="8%" style={inputStyle} readOnly />
        </Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Toggle on={autoPayout} onChange={setAutoPayout} label="Auto-pay commissions on the 1st and 15th" />
          <Toggle on={trackClicks} onChange={setTrackClicks} label="Track link clicks and UTM parameters" />
        </div>
      </Card>
      <Card title="Danger zone">
        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: "0 0 16px" }}>Mark this campaign as completed or delete it permanently.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BtnSm onClick={() => onUpdate({ ...campaign, status: "Completed" })}>Mark completed</BtnSm>
          <BtnSm variant="danger" onClick={onDelete}>{lang === "fr" ? "Supprimer la campagne" : "Delete campaign"}</BtnSm>
        </div>
      </Card>
    </>
  );
}

type AddedCampaignCreator = {
  key: string;
  creatorId?: string;
  handle: string;
  displayName?: string;
  avatar_url?: string;
  platform?: string;
  commissionType: "percent" | "flat";
  commissionRate: string;
  discountCode?: string;
  historicalSalesAttached?: boolean;
  brandSalesCount?: number;
  brandSalesRevenue?: number;
};

function formatCreatorCommissionLabel(entry: AddedCampaignCreator, lang: "en" | "fr") {
  if (entry.commissionType === "flat") {
    return `${formatCurrency(Number(entry.commissionRate) || 0, lang)} ${lang === "fr" ? "fixe" : "flat"}`;
  }
  return `${clampRate(entry.commissionRate)}%`;
}

function InfoHint({ title }: { title: string }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--ws-border)", color: "var(--ws-text-dim)", fontSize: 10, fontWeight: 700, cursor: "help", flexShrink: 0 }}>
      i
    </span>
  );
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function parseHandlesFromText(text: string): string[] {
  const tokens = text.split(/[\n,;\t]+/).map((t) => normalizeHandle(t)).filter(Boolean);
  return [...new Set(tokens)];
}

function parseHandlesFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const handles: string[] = [];
  for (const line of lines) {
    const first = line.split(/[,;\t]/)[0]?.trim() ?? "";
    if (!first || /^username$/i.test(first) || /^handle$/i.test(first)) continue;
    handles.push(normalizeHandle(first));
  }
  return [...new Set(handles.filter(Boolean))];
}

function buildCampaignDescription(
  hashtags: string,
  flags: {
    flagMissingTags: boolean;
    flagMissingDisclosure: boolean;
    trackAllCreatorContent: boolean;
    attachCreatorSales: boolean;
  },
): string {
  return JSON.stringify({ version: 1, hashtags, ...flags });
}

function parseCampaignDescription(description?: string): {
  hashtags: string;
  flagMissingTags: boolean;
  flagMissingDisclosure: boolean;
  trackAllCreatorContent: boolean;
  attachCreatorSales: boolean;
} {
  const defaults = {
    hashtags: "",
    flagMissingTags: false,
    flagMissingDisclosure: false,
    trackAllCreatorContent: true,
    attachCreatorSales: false,
  };
  if (!description?.trim()) return defaults;
  try {
    const parsed = JSON.parse(description) as Partial<typeof defaults & { version?: number }>;
    if (parsed && typeof parsed === "object" && "hashtags" in parsed) {
      return {
        hashtags: typeof parsed.hashtags === "string" ? parsed.hashtags : "",
        flagMissingTags: Boolean(parsed.flagMissingTags),
        flagMissingDisclosure: Boolean(parsed.flagMissingDisclosure),
        trackAllCreatorContent: parsed.trackAllCreatorContent !== false,
        attachCreatorSales: Boolean(parsed.attachCreatorSales),
      };
    }
  } catch {
    return { ...defaults, hashtags: description };
  }
  return defaults;
}

function creatorEntryFromSaved(creator: SavedCreatorOption): AddedCampaignCreator {
  const handleKey = normalizeHandle(creator.handle);
  return {
    key: creator.id || `findit-${handleKey}`,
    creatorId: creator.id || undefined,
    handle: creator.handle,
    displayName: creator.full_name,
    avatar_url: creator.avatar_url,
    platform: creator.platform,
    commissionType: "percent",
    commissionRate: String(creator.commission_rate ?? 10),
    discountCode: creator.discount_code,
  };
}

function creatorEntryFromDbRow(row: {
  id: string;
  handle: string;
  full_name?: string | null;
  avatar_url?: string | null;
  platform?: string | null;
  commission_rate?: number | null;
  discount_code?: string | null;
}): AddedCampaignCreator {
  return {
    key: String(row.id),
    creatorId: String(row.id),
    handle: row.handle,
    displayName: row.full_name ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    platform: row.platform ?? undefined,
    commissionType: "percent",
    commissionRate: String(row.commission_rate ?? 10),
    discountCode: row.discount_code ?? undefined,
  };
}

function avatarFromSavedRow(row: SavedRow): string | undefined {
  const url = avatarFromDiscoverySavedRow({
    avatar_url: row.avatar_url,
    snapshot: row.snapshot,
  });
  return url || undefined;
}

function mergeFindItCreators(savedRows: SavedRow[], dbCreators: SavedCreatorOption[]): SavedCreatorOption[] {
  const dbByHandle = new Map(dbCreators.map((c) => [normalizeHandle(c.handle), c]));
  const merged = new Map<string, SavedCreatorOption>();

  for (const row of savedRows) {
    const handle = row.creator_username;
    const key = normalizeHandle(handle);
    const db = dbByHandle.get(key);
    const avatar = avatarFromSavedRow(row) || db?.avatar_url;
    merged.set(key, {
      id: db?.id ?? "",
      handle,
      full_name: row.display_name || db?.full_name,
      avatar_url: avatar,
      platform: row.platform || db?.platform,
      commission_rate: db?.commission_rate ?? 10,
      discount_code: db?.discount_code,
    });
  }

  return Array.from(merged.values());
}

async function ensureCreatorIdForFindItRow(row: SavedRow): Promise<string | null> {
  const created = await saveCreator("", {
    username: row.creator_username,
    display_name: row.display_name,
    avatar_url: avatarFromSavedRow(row) || row.avatar_url,
    platform: row.platform ?? "tiktok",
    followers_count: row.followers,
    engagement_rate: row.engagement_rate,
    avg_views: 0,
    bio: "",
    niche: row.primary_niche ?? "",
  });
  return created?.id ? String(created.id) : null;
}

const onboardingFieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid var(--ws-border)",
  fontSize: 15,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  letterSpacing: "-0.02em",
  background: "var(--ws-input)",
  outline: "none",
};

const onboardingTextarea: React.CSSProperties = {
  ...onboardingFieldInput,
  minHeight: 160,
  resize: "vertical",
  lineHeight: 1.5,
};

const onboardingPrimaryBtn: React.CSSProperties = {
  ...btnPrimary,
  padding: "12px 20px",
  fontSize: 15,
  borderRadius: 10,
};

const onboardingSecondaryBtn: React.CSSProperties = {
  ...btnSecondary,
  padding: "12px 20px",
  fontSize: 15,
  borderRadius: 10,
};


function NewCampaignOnboarding({
  lang,
  userId,
  plan,
  isMobile,
  mode = "create",
  existingCampaign,
  onClose,
  onCreate,
  onAddCreators,
  onUpdate,
  onSaveDraft,
  onLaunchDraft,
}: {
  lang: "en" | "fr";
  userId?: string;
  plan: PlanTier;
  isMobile?: boolean;
  mode?: "create" | "addCreators" | "edit";
  existingCampaign?: Campaign;
  onClose: () => void;
  onCreate: (campaignData: {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout: boolean;
    creatorIds: string[];
    creatorCommissions: { creatorId: string; commission_rate: number }[];
  }) => void | Promise<void>;
  onAddCreators?: (data: {
    creatorIds: string[];
    creatorCommissions: { creatorId: string; commission_rate: number }[];
    creatorSalesAttachments?: Array<{ creatorId: string; attach: boolean }>;
  }) => void | Promise<void>;
  onUpdate?: (campaignData: {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout: boolean;
    creatorIds: string[];
    creatorCommissions: { creatorId: string; commission_rate: number }[];
  }) => void | Promise<void>;
  onSaveDraft?: (campaignData: {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout: boolean;
    creatorIds: string[];
    creatorCommissions: { creatorId: string; commission_rate: number }[];
  }, draftId?: string) => Promise<string | null>;
  onLaunchDraft?: (draftId: string, campaignData: {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout: boolean;
    creatorIds: string[];
    creatorCommissions: { creatorId: string; commission_rate: number }[];
  }) => void | Promise<void>;
}) {
  const isAddCreatorsMode = mode === "addCreators";
  const isEditMode = mode === "edit";
  const isDraftMode = isEditMode && existingCampaign?.status === "Draft";
  const isCreateMode = mode === "create";
  const [step, setStep] = useState<0 | 1>(() => {
    if (isAddCreatorsMode) return 1;
    if (mode === "edit" && existingCampaign?.status === "Draft" && (existingCampaign.creatorIds?.length ?? 0) > 0) {
      return 1;
    }
    return 0;
  });
  const [launching, setLaunching] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(
    isDraftMode ? existingCampaign?.id : undefined,
  );
  const draftIdRef = useRef<string | undefined>(draftId);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  const [name, setName] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [flagMissingTags, setFlagMissingTags] = useState(false);
  const [flagMissingDisclosure, setFlagMissingDisclosure] = useState(false);
  const [trackAllCreatorContent, setTrackAllCreatorContent] = useState(true);
  const [attachCreatorSales, setAttachCreatorSales] = useState(false);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [addedCreators, setAddedCreators] = useState<AddedCampaignCreator[]>([]);
  const [savedCreators, setSavedCreators] = useState<SavedCreatorOption[]>([]);
  const [findItRows, setFindItRows] = useState<SavedRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [listsOpen, setListsOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [manualSearchNotFound, setManualSearchNotFound] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const listsRef = useRef<HTMLDivElement>(null);
  const initialCampaignCreatorIdsRef = useRef<Set<string>>(new Set());
  const hasPreloadedCampaignCreatorsRef = useRef(false);
  const hasPrefilledCampaignRef = useRef(false);

  const addedCreatorIdsKey = useMemo(
    () => addedCreators.map((entry) => entry.creatorId || normalizeHandle(entry.handle)).join("|"),
    [addedCreators],
  );

  useEffect(() => {
    if (addedCreators.length === 0) return;
    let cancelled = false;

    void (async () => {
      let resolvedUserId = userId;
      if (!resolvedUserId && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      }
      if (!resolvedUserId) return;

      const ids = [
        ...new Set(addedCreators.map((entry) => entry.creatorId).filter(Boolean) as string[]),
      ];
      if (ids.length === 0) return;

      const summary = await fetchCreatorBrandSalesSummary(resolvedUserId, ids);
      if (cancelled) return;

      setAddedCreators((list) =>
        list.map((entry) => {
          if (!entry.creatorId) return entry;
          const stats = summary[entry.creatorId];
          if (!stats) return entry;
          return {
            ...entry,
            brandSalesCount: stats.count,
            brandSalesRevenue: stats.revenue,
          };
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [addedCreatorIdsKey, userId]);

  const confirmAttachCreatorSales = (entry: AddedCampaignCreator): boolean => {
    const count = entry.brandSalesCount ?? 0;
    const revenue = entry.brandSalesRevenue ?? 0;
    if (count <= 0) return false;
    return window.confirm(
      lang === "fr"
        ? `Rattacher ${count} vente${count > 1 ? "s" : ""} (${formatCurrency(revenue, lang)}) de ce créateur à cette campagne ?`
        : `Attach ${count} sale${count > 1 ? "s" : ""} (${formatCurrency(revenue, lang)}) from this creator to this campaign?`,
    );
  };

  const markCreatorSalesAttached = (key: string) => {
    const entry = addedCreators.find((item) => item.key === key);
    if (!entry || !confirmAttachCreatorSales(entry)) return;
    setAddedCreators((list) =>
      list.map((item) => (item.key === key ? { ...item, historicalSalesAttached: true } : item)),
    );
  };

  const maxCreators = getMaxManagedCreators(plan);
  const remainingSlots =
    maxCreators != null ? Math.max(0, maxCreators - addedCreators.length) : null;

  const creatorStepSubtitle = useMemo(() => {
    if (loadingCreators) {
      return lang === "fr" ? "Chargement de vos créateurs…" : "Loading your creators…";
    }
    if (findItRows.length === 0) {
      return lang === "fr"
        ? "Aucun créateur sauvegardé. Ajoutez-en depuis Find it avant de lancer une campagne."
        : "No saved creators yet. Add some from Find it before launching a campaign.";
    }
    if (maxCreators == null) {
      return lang === "fr"
        ? "Sélectionnez des créateurs parmi ceux sauvegardés dans Find it."
        : "Select creators from those you saved in Find it.";
    }
    const selected = addedCreators.length;
    const remaining = remainingSlots ?? 0;
    return lang === "fr"
      ? `${selected} sélectionné${selected > 1 ? "s" : ""} · jusqu'à ${maxCreators} par campagne${remaining > 0 ? ` (${remaining} restant${remaining > 1 ? "s" : ""})` : ""}`
      : `${selected} selected · up to ${maxCreators} per campaign${remaining > 0 ? ` (${remaining} remaining)` : ""}`;
  }, [loadingCreators, findItRows.length, maxCreators, addedCreators.length, remainingSlots, lang, isAddCreatorsMode, existingCampaign?.creatorIds?.length]);

  useEffect(() => {
    if ((!isAddCreatorsMode && !isEditMode) || !existingCampaign) return;
    initialCampaignCreatorIdsRef.current = new Set((existingCampaign.creatorIds ?? []).map(String));
  }, [isAddCreatorsMode, isEditMode, existingCampaign]);

  useEffect(() => {
    if (!isEditMode || !existingCampaign || hasPrefilledCampaignRef.current) return;
    const parsed = parseCampaignDescription(existingCampaign.description);
    setName(existingCampaign.name);
    setHashtags(parsed.hashtags);
    setFlagMissingTags(parsed.flagMissingTags);
    setFlagMissingDisclosure(parsed.flagMissingDisclosure);
    setTrackAllCreatorContent(parsed.trackAllCreatorContent);
    setAttachCreatorSales(parsed.attachCreatorSales);
    const startValue = toDateInputValue(existingCampaign.startRaw ?? existingCampaign.start);
    if (startValue) setStart(startValue);
    hasPrefilledCampaignRef.current = true;
  }, [isEditMode, existingCampaign]);

  useEffect(() => {
    if ((!isAddCreatorsMode && !isEditMode) || !existingCampaign || loadingCreators || hasPreloadedCampaignCreatorsRef.current) return;

    const creatorIds = (existingCampaign.creatorIds ?? []).map(String);
    if (creatorIds.length === 0) {
      hasPreloadedCampaignCreatorsRef.current = true;
      return;
    }

    let cancelled = false;

    const loadExistingCampaignCreators = async () => {
      if (!supabase) return;

      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      }
      if (!resolvedUserId) return;

      const { data } = await supabase
        .from("creators")
        .select("id, handle, full_name, avatar_url, platform, commission_rate, discount_code")
        .eq("user_id", resolvedUserId)
        .in("id", creatorIds);

      if (cancelled) return;

      const byId = new Map(
        (data || []).map((row) => {
          const creator = row as {
            id: string;
            handle: string;
            full_name?: string | null;
            avatar_url?: string | null;
            platform?: string | null;
            commission_rate?: number | null;
            discount_code?: string | null;
          };
          return [String(creator.id), creatorEntryFromDbRow(creator)] as const;
        }),
      );
      const ordered = creatorIds
        .map((id) => byId.get(id))
        .filter((entry): entry is AddedCampaignCreator => Boolean(entry));

      setAddedCreators(ordered);
      hasPreloadedCampaignCreatorsRef.current = true;
    };

    void loadExistingCampaignCreators();
    return () => {
      cancelled = true;
    };
  }, [isAddCreatorsMode, isEditMode, existingCampaign?.id, existingCampaign?.creatorIds, loadingCreators, userId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCreators(true);
      if (!supabase) {
        if (!cancelled) setLoadingCreators(false);
        return;
      }
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      }
      if (!resolvedUserId) {
        if (!cancelled) setLoadingCreators(false);
        return;
      }
      const [data, savedRows, folderData] = await Promise.all([
        getSavedCreators(resolvedUserId),
        listSaved(),
        listFolders(),
      ]);
      if (!cancelled) {
        const dbCreators = data.map((row) => mapSavedCreator(row as Record<string, unknown>));
        setSavedCreators(dbCreators);
        setFindItRows(savedRows);
        setFolders(folderData.folders);
        setFolderItems(folderData.items);
        setLoadingCreators(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!listsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (listsRef.current && !listsRef.current.contains(e.target as Node)) setListsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listsOpen]);

  const findItCreators = useMemo(
    () => mergeFindItCreators(findItRows, savedCreators),
    [findItRows, savedCreators],
  );

  const findItRowByHandle = useMemo(() => {
    const map = new Map<string, SavedRow>();
    for (const row of findItRows) map.set(normalizeHandle(row.creator_username), row);
    return map;
  }, [findItRows]);

  const savedByHandle = useMemo(() => {
    const map = new Map<string, SavedCreatorOption>();
    for (const c of findItCreators) map.set(normalizeHandle(c.handle), c);
    return map;
  }, [findItCreators]);

  const listOptions = useMemo(() => {
    const allUsernames = findItRows.map((row) => normalizeHandle(row.creator_username));
    const opts: { id: string; label: string; usernames: string[] }[] = [
      {
        id: "__all__",
        label: lang === "fr" ? "Tous les créateurs" : "All creators",
        usernames: allUsernames,
      },
      ...folders.map((f) => ({
        id: f.id,
        label: f.name,
        usernames: folderItems
          .filter((item) => item.folder_id === f.id)
          .map((item) => normalizeHandle(item.creator_username)),
      })),
    ];
    return opts.filter((o) => o.id === "__all__" || o.usernames.length > 0);
  }, [folders, folderItems, findItRows, lang]);

  const addHandles = (handles: string[], source: "manual" | "csv" = "manual") => {
    if (handles.length === 0) {
      if (source === "manual") setManualSearchNotFound(false);
      return { added: 0, missing: 0 };
    }

    let added = 0;
    let missing = 0;

    setAddedCreators((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((e) => e.creatorId || normalizeHandle(e.handle)));
      for (const handle of handles) {
        if (maxCreators != null && next.length >= maxCreators) break;
        const creator = savedByHandle.get(handle);
        if (!creator) {
          missing += 1;
          continue;
        }
        const dedupeKey = creator.id || handle;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        next.push(creatorEntryFromSaved(creator));
        added += 1;
      }
      return next;
    });

    if (source === "manual") {
      setManualSearchNotFound(missing > 0);
      if (added > 0 && missing === 0) setUsernameDraft("");
    }

    return { added, missing };
  };

  const toggleList = (listId: string) => {
    setSelectedListIds((prev) => {
      const next = prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId];
      const usernames = new Set<string>();
      for (const id of next) {
        const list = listOptions.find((o) => o.id === id);
        list?.usernames.forEach((u) => usernames.add(u));
      }

      if (isAddCreatorsMode) {
        setAddedCreators((prevCreators) => {
          const merged = new Map<string, AddedCampaignCreator>();
          for (const entry of prevCreators) {
            merged.set(entry.creatorId || normalizeHandle(entry.handle), entry);
          }
          for (const username of usernames) {
            const creator = savedByHandle.get(username);
            if (!creator) continue;
            const dedupeKey = creator.id || username;
            if (!merged.has(dedupeKey)) {
              merged.set(dedupeKey, creatorEntryFromSaved(creator));
            }
          }
          const nextCreators = Array.from(merged.values());
          return nextCreators.slice(0, maxCreators ?? nextCreators.length);
        });
        setManualSearchNotFound(false);
        return next;
      }

      const nextCreators: AddedCampaignCreator[] = [];
      for (const u of usernames) {
        const creator = savedByHandle.get(u);
        if (creator) {
          const dedupeKey = creator.id || u;
          if (!nextCreators.some((e) => (e.creatorId || normalizeHandle(e.handle)) === dedupeKey)) {
            nextCreators.push(creatorEntryFromSaved(creator));
          }
        }
      }
      setAddedCreators(nextCreators.slice(0, maxCreators ?? nextCreators.length));
      setManualSearchNotFound(false);
      return next;
    });
  };

  const applyUsernames = () => {
    const handles = parseHandlesFromText(usernameDraft);
    addHandles(handles, "manual");
  };

  const onCsvSelected = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = addHandles(parseHandlesFromCsv(text), "csv");
    if (result.missing > 0 && result.added === 0) {
      setManualSearchNotFound(true);
    } else if (result.added > 0) {
      setManualSearchNotFound(false);
    }
    if (csvRef.current) csvRef.current.value = "";
  };

  const removeCreator = (key: string) => {
    setAddedCreators((list) => list.filter((entry) => entry.key !== key));
  };

  const canLaunch =
    addedCreators.length > 0 &&
    addedCreators.every(
      (entry) => entry.creatorId || findItRowByHandle.has(normalizeHandle(entry.handle)),
    );

  const hasDraftContent = () =>
    name.trim().length > 0 ||
    hashtags.trim().length > 0 ||
    addedCreators.length > 0 ||
    step > 0;

  const resolveCreatorPayload = async () => {
    const creatorIds: string[] = [];
    const creatorCommissions: { creatorId: string; commission_rate: number }[] = [];

    for (const entry of addedCreators) {
      let creatorId = entry.creatorId;
      if (!creatorId) {
        const row = findItRowByHandle.get(normalizeHandle(entry.handle));
        if (!row) continue;
        creatorId = (await ensureCreatorIdForFindItRow(row)) ?? undefined;
      }
      if (!creatorId) continue;
      creatorIds.push(creatorId);
      creatorCommissions.push({
        creatorId,
        commission_rate: clampRate(entry.commissionRate),
      });
    }

    return { creatorIds, creatorCommissions };
  };

  const buildCampaignPayload = async () => {
    const { creatorIds, creatorCommissions } = await resolveCreatorPayload();
    const primaryRate = creatorCommissions.length > 0 ? creatorCommissions[0].commission_rate : 10;
    const creatorSalesAttachments = (() => {
      if (!isAddCreatorsMode && attachCreatorSales && creatorIds.length > 0) {
        return creatorIds.map((id) => ({ creatorId: id, attach: true }));
      }
      if (isAddCreatorsMode && existingCampaign) {
        const existingIds = new Set((existingCampaign.creatorIds ?? []).map(String));
        const newlyAdded = addedCreators.filter(
          (entry) => entry.creatorId && !existingIds.has(entry.creatorId),
        );
        if (newlyAdded.length === 0) return undefined;
        return newlyAdded.map((entry) => ({
          creatorId: entry.creatorId as string,
          attach: Boolean(entry.historicalSalesAttached),
        }));
      }
      if (!isAddCreatorsMode && !attachCreatorSales) {
        return addedCreators
          .filter((entry) => entry.creatorId)
          .map((entry) => ({
            creatorId: entry.creatorId as string,
            attach: Boolean(entry.historicalSalesAttached),
          }));
      }
      return undefined;
    })();
    return {
      name: name.trim() || (lang === "fr" ? "Campagne sans titre" : "Untitled Campaign"),
      description: buildCampaignDescription(hashtags, {
        flagMissingTags,
        flagMissingDisclosure,
        trackAllCreatorContent,
        attachCreatorSales,
      }),
      platform: isEditMode && existingCampaign?.platform ? existingCampaign.platform : "All",
      startDate: normalizeDate(start),
      endDate: isEditMode ? existingCampaign?.endRaw ?? normalizeDate(existingCampaign?.end) : undefined,
      commissionType: isEditMode && existingCampaign?.commissionType ? existingCampaign.commissionType : "percentage",
      commissionRate: isEditMode && existingCampaign?.commissionRate != null ? existingCampaign.commissionRate : primaryRate,
      autoPayout: isEditMode ? Boolean(existingCampaign?.autoPayout) : false,
      creatorIds,
      creatorCommissions,
      attachCreatorSales: isAddCreatorsMode ? undefined : attachCreatorSales,
      creatorSalesAttachments,
    };
  };

  const persistDraft = async () => {
    if (isAddCreatorsMode || !onSaveDraft || !hasDraftContent()) return draftIdRef.current ?? null;
    setSavingDraft(true);
    try {
      const payload = await buildCampaignPayload();
      const savedId = await onSaveDraft(payload, draftIdRef.current ?? existingCampaign?.id);
      if (savedId) {
        draftIdRef.current = savedId;
        setDraftId(savedId);
      }
      return savedId;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClose = async () => {
    if ((isCreateMode || isDraftMode) && onSaveDraft && hasDraftContent()) {
      await persistDraft();
    }
    onClose();
  };

  const launch = async () => {
    if (launching || !canLaunch) return;
    setLaunching(true);
    try {
      const payload = await buildCampaignPayload();
      if (payload.creatorIds.length === 0) return;

      if (isAddCreatorsMode && onAddCreators) {
        await onAddCreators({
          creatorIds: payload.creatorIds,
          creatorCommissions: payload.creatorCommissions,
          creatorSalesAttachments: payload.creatorSalesAttachments,
        });
        return;
      }

      // Prefer updating an existing draft (auto-saved on step change / close)
      // instead of inserting a second campaign with the same name.
      const existingDraftId =
        draftIdRef.current ?? draftId ?? (isDraftMode ? existingCampaign?.id : undefined);
      if (existingDraftId && onLaunchDraft) {
        await onLaunchDraft(existingDraftId, payload);
        return;
      }

      if (isEditMode && onUpdate) {
        await onUpdate(payload);
        return;
      }

      await onCreate(payload);
    } finally {
      setLaunching(false);
    }
  };

  const continueToCreators = async () => {
    setStep(1);
    if (isCreateMode || isDraftMode) {
      await persistDraft();
    }
  };

  const exitLabel =
    isCreateMode || isDraftMode
      ? lang === "fr"
        ? "Enregistrer et quitter"
        : "Save and exit"
      : lang === "fr"
        ? "Annuler"
        : "Cancel";

  const pagePad = isMobile ? "16px 16px 40px" : "48px 64px 64px";
  const contentMax = 720;

  const listsLabel =
    selectedListIds.length === 0
      ? lang === "fr"
        ? "Sélectionner une ou plusieurs listes"
        : "Select one or multiple lists"
      : selectedListIds
          .map((id) => listOptions.find((o) => o.id === id)?.label)
          .filter(Boolean)
          .join(", ");

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)", padding: pagePad }}>
      <div style={{ maxWidth: contentMax, margin: "0 auto" }}>
        {step === 0 ? (
          <>
            <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 36px", letterSpacing: "-0.03em" }}>
              {isDraftMode
                ? lang === "fr"
                  ? "Reprendre le brouillon"
                  : "Resume draft"
                : isEditMode
                ? lang === "fr"
                  ? "Modifier la campagne"
                  : "Edit campaign"
                : lang === "fr"
                  ? "Créer une campagne"
                  : "Create campaign"}
            </h1>

            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  border: "1px solid var(--ws-accent)",
                  borderRadius: 10,
                  padding: "4px 14px",
                  background: "var(--ws-input)",
                  boxShadow: "0 0 0 1px var(--ws-accent-soft)",
                }}
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={lang === "fr" ? "Nommez votre campagne" : "Name your campaign"}
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    fontSize: 15,
                    fontFamily: "inherit",
                    padding: "12px 0",
                    background: "transparent",
                    color: "var(--ws-text)",
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
                </div>
                    </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
                  {lang === "fr"
                    ? "Définir des hashtags, mentions ou mots-clés pour suivre le contenu"
                    : "Set hashtags, mentions, or keywords to track content"}
                </span>
                <InfoHint
                  title={
                    lang === "fr"
                      ? "Le contenu contenant ces hashtags ou mentions sera attribué à cette campagne."
                      : "Content containing these hashtags or mentions will be attributed to this campaign."
                  }
                />
              </div>
              <textarea
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder={lang === "fr" ? "#hashtags, @mentions, mots-clés" : "#hashtags, @mentions, keywords"}
                style={onboardingTextarea}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
              {[
                {
                  checked: flagMissingTags,
                  onChange: setFlagMissingTags,
                  label:
                    lang === "fr"
                      ? "Signaler les publications sans hashtags, mentions ou mots-clés requis"
                      : "Flag posts missing required hashtags, mentions, or keywords",
                  hint:
                    lang === "fr"
                      ? "Les créateurs seront alertés si leur contenu ne contient pas les éléments requis."
                      : "Creators will be flagged when their content is missing required tracking elements.",
                },
                {
                  checked: flagMissingDisclosure,
                  onChange: setFlagMissingDisclosure,
                  label: lang === "fr" ? "Signaler les publications sans mention publicitaire" : "Flag posts missing ad disclosure",
                  hint:
                    lang === "fr"
                      ? "Détecte les publications sans divulgation publicitaire (#ad, #sponsored, etc.)."
                      : "Detects posts without ad disclosure (#ad, #sponsored, etc.).",
                },
                {
                  checked: trackAllCreatorContent,
                  onChange: setTrackAllCreatorContent,
                  label:
                    lang === "fr"
                      ? "Suivre tout le contenu des créateurs sélectionnés dans un onglet séparé"
                      : "Track all content from selected creators in a separate tab",
                  hint:
                    lang === "fr"
                      ? "Toutes les publications des créateurs de la campagne seront suivies, pas seulement celles avec vos mots-clés."
                      : "All posts from campaign creators will be tracked, not only those matching your keywords.",
                },
                ...(!isAddCreatorsMode
                  ? [
                      {
                        checked: attachCreatorSales,
                        onChange: setAttachCreatorSales,
                        label:
                          lang === "fr"
                            ? "Rattacher les ventes passées des créateurs à cette campagne"
                            : "Attach creators' past sales to this campaign",
                        hint:
                          lang === "fr"
                            ? "Inclut les ventes déjà générées par les créateurs sélectionnés. Désactivé, les analytiques démarrent à zéro."
                            : "Includes sales already driven by selected creators. When off, campaign analytics start from zero.",
                      },
                    ]
                  : []),
              ].map((row) => (
                <label key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => row.onChange(e.target.checked)}
                    style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--ws-accent)" }}
                  />
                  <span style={{ flex: 1, fontSize: 14, color: "var(--ws-text)", lineHeight: 1.45 }}>
                    {row.label}{" "}
                    <InfoHint title={row.hint} />
                  </span>
                </label>
                  ))}
                </div>

            <div style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
                  {lang === "fr" ? "Commencer à collecter le contenu le" : "Start collecting content on"}
                </span>
                <InfoHint
                  title={
                    lang === "fr"
                      ? "Seul le contenu publié à partir de cette date sera suivi."
                      : "Only content published from this date onward will be tracked."
                  }
                />
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid var(--ws-border)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: "var(--ws-input)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="var(--ws-text-muted)" strokeWidth="1.8" />
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="var(--ws-text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "var(--ws-text)",
                    background: "transparent",
                    colorScheme: "inherit",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" style={onboardingPrimaryBtn} disabled={!name.trim() || savingDraft} onClick={() => void continueToCreators()}>
                {isDraftMode
                  ? lang === "fr"
                    ? "Continuer le brouillon"
                    : "Continue draft"
                  : isEditMode
                  ? lang === "fr"
                    ? "Continuer vers les créateurs"
                    : "Continue to creators"
                  : lang === "fr"
                    ? "Sélectionner des créateurs pour démarrer"
                    : "Select creators to start campaign"}
              </button>
              <button type="button" style={onboardingSecondaryBtn} onClick={() => void handleClose()} disabled={savingDraft}>
                {exitLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
              {isAddCreatorsMode
                ? lang === "fr"
                  ? "Ajouter des créateurs"
                  : "Add creators"
                : isEditMode
                  ? lang === "fr"
                    ? "Mettre à jour les créateurs"
                    : "Update creators"
                  : lang === "fr"
                    ? "Sélectionner des créateurs"
                    : "Select creators"}
            </h1>
            {isAddCreatorsMode && existingCampaign ? (
              <p style={{ fontSize: 15, color: "var(--ws-text)", margin: "0 0 28px", lineHeight: 1.5 }}>
                {(existingCampaign.creatorIds?.length ?? 0) > 0
                  ? lang === "fr"
                    ? `${existingCampaign.creatorIds?.length} créateur${(existingCampaign.creatorIds?.length ?? 0) > 1 ? "s" : ""} déjà dans « ${existingCampaign.name} ». Ajoutez-en d'autres ou mettez la liste à jour.`
                    : `${existingCampaign.creatorIds?.length} creator${(existingCampaign.creatorIds?.length ?? 0) > 1 ? "s" : ""} already in "${existingCampaign.name}". Add more or update the list.`
                  : lang === "fr"
                    ? `Ajoutez des créateurs à la campagne « ${existingCampaign.name} ».`
                    : `Add creators to "${existingCampaign.name}".`}
              </p>
            ) : (
              <p style={{ fontSize: 15, color: "var(--ws-text)", margin: "0 0 28px" }}>{creatorStepSubtitle}</p>
            )}

            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
              <div ref={listsRef} style={{ position: "relative", flex: 1, minWidth: 220 }}>
                <button
                  type="button"
                  onClick={() => setListsOpen((v) => !v)}
                  style={{
                    ...onboardingFieldInput,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    color: selectedListIds.length ? "var(--ws-text)" : "var(--ws-text-dim)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listsLabel}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                    <path d="M8 10l4 4 4-4" stroke="var(--ws-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {listsOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      background: "var(--ws-surface)",
                      border: "1px solid var(--ws-border)",
                      borderRadius: 10,
                      boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
                      zIndex: 20,
                      maxHeight: 280,
                      overflowY: "auto",
                      padding: 6,
                    }}
                  >
                    {loadingCreators ? (
                      <div style={{ padding: 12, fontSize: 13, color: "var(--ws-text-dim)" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
                    ) : listOptions.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 13, color: "var(--ws-text-dim)" }}>
                        {lang === "fr" ? "Aucune liste. Ajoutez des créateurs dans Gérer." : "No lists yet. Add creators in Manage."}
              </div>
                    ) : (
                      listOptions.map((list) => (
                        <label
                          key={list.id}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedListIds.includes(list.id)}
                            onChange={() => toggleList(list.id)}
                            style={{ width: 16, height: 16, accentColor: "var(--ws-accent)" }}
                          />
                          <span style={{ flex: 1, fontSize: 14, color: "var(--ws-text)" }}>{list.label}</span>
                          <span style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>{list.usernames.length}</span>
                        </label>
                      ))
                    )}
            </div>
          )}
              </div>
              <button type="button" style={{ ...onboardingSecondaryBtn, flexShrink: 0 }} onClick={() => csvRef.current?.click()}>
                {lang === "fr" ? "Importer CSV" : "Import CSV"}
              </button>
              <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={(e) => void onCsvSelected(e.target.files?.[0])} />
        </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", marginBottom: 10 }}>
                {lang === "fr" ? "Saisir ou coller des @pseudos" : "Write or copy-paste @usernames"}
              </div>
              <textarea
                value={usernameDraft}
                onChange={(e) => {
                  setUsernameDraft(e.target.value);
                  if (manualSearchNotFound) setManualSearchNotFound(false);
                }}
                onBlur={applyUsernames}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    applyUsernames();
                  }
                }}
                placeholder={lang === "fr" ? "Ajouter @pseudo" : "Add @username"}
                style={{ ...onboardingTextarea, minHeight: 140 }}
              />
              {manualSearchNotFound && (
                <p style={{ fontSize: 14, color: "var(--ws-text)", margin: "10px 0 0" }}>
                  {lang === "fr"
                    ? "Nous n'avons pas trouvé de créateurs correspondant à cette recherche"
                    : "We couldn't find any creators matching this search"}
                </p>
              )}
              <p style={{ fontSize: 13, color: "var(--ws-text)", margin: "8px 0 0" }}>
                {lang === "fr"
                  ? "Seuls les créateurs sauvegardés dans Find it peuvent être ajoutés."
                  : "Only creators saved in Find it can be added."}
              </p>
            </div>

            {addedCreators.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 12 }}>
                  {isAddCreatorsMode
                    ? lang === "fr"
                      ? `${addedCreators.length} créateur${addedCreators.length > 1 ? "s" : ""} dans la sélection`
                      : `${addedCreators.length} creator${addedCreators.length > 1 ? "s" : ""} selected`
                    : lang === "fr"
                      ? `${addedCreators.length} créateur(s) sélectionné(s)`
                      : `${addedCreators.length} creator(s) selected`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {addedCreators.map((entry) => {
                    const isExistingInCampaign = Boolean(
                      entry.creatorId && initialCampaignCreatorIdsRef.current.has(entry.creatorId),
                    );
                    return (
                    <div
                      key={entry.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        border: "1px solid var(--ws-border)",
                        borderRadius: 10,
                        background: "var(--ws-surface-2)",
                      }}
                    >
                      <CreatorAvatar
                        src={entry.avatar_url}
                        username={entry.handle.replace(/^@/, "")}
                        displayName={entry.displayName}
                        size={36}
                        alt={entry.displayName || entry.handle}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>{entry.displayName || entry.handle}</div>
                          {isAddCreatorsMode && isExistingInCampaign ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#FFFFFF",
                                background: "var(--ws-accent)",
                                padding: "4px 10px",
                                borderRadius: 999,
                                letterSpacing: "-0.01em",
                                lineHeight: 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {lang === "fr" ? "Dans la campagne" : "In campaign"}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--ws-text)" }}>@{entry.handle.replace(/^@/, "")}</div>
                        {isAddCreatorsMode &&
                        !isExistingInCampaign &&
                        !entry.historicalSalesAttached &&
                        (entry.brandSalesCount ?? 0) > 0 ? (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "10px 12px",
                              borderRadius: 8,
                              background: "rgba(217, 119, 6, 0.12)",
                              border: "1px solid rgba(217, 119, 6, 0.35)",
                            }}
                          >
                            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#EAB308", lineHeight: 1.45 }}>
                              {lang === "fr"
                                ? "Les ventes de ce créateur ne sont pas rattachées à cette campagne."
                                : "This creator's sales are not attached to this campaign."}
                            </p>
                            <button
                              type="button"
                              onClick={() => markCreatorSalesAttached(entry.key)}
                              style={{
                                border: "none",
                                background: "var(--ws-btn)",
                                color: "var(--ws-btn-text)",
                                borderRadius: 8,
                                padding: "6px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              {lang === "fr"
                                ? `Rattacher les ventes (${entry.brandSalesCount})`
                                : `Attach sales (${entry.brandSalesCount})`}
                            </button>
                          </div>
                        ) : null}
                        {entry.historicalSalesAttached && (entry.brandSalesCount ?? 0) > 0 ? (
                          <div style={{ marginTop: 6, fontSize: 12, color: "#4ADE80", fontWeight: 500 }}>
                            {lang === "fr"
                              ? `${entry.brandSalesCount} vente(s) rattachée(s)`
                              : `${entry.brandSalesCount} sale(s) attached`}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCreator(entry.key)}
                        style={{ border: "none", background: "transparent", color: "var(--ws-text-dim)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
                      >
                        {lang === "fr" ? "Retirer" : "Remove"}
          </button>
                    </div>
                  );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" style={onboardingPrimaryBtn} disabled={launching || !canLaunch} onClick={() => void launch()}>
                {launching
                  ? isAddCreatorsMode
                    ? lang === "fr"
                      ? "Ajout…"
                      : "Adding…"
                    : isDraftMode
                      ? lang === "fr"
                        ? "Lancement…"
                        : "Launching…"
                    : isEditMode
                      ? lang === "fr"
                        ? "Enregistrement…"
                        : "Saving…"
                      : lang === "fr"
                        ? "Création…"
                        : "Creating…"
                  : isAddCreatorsMode
                    ? lang === "fr"
                      ? "Enregistrer les créateurs"
                      : "Save creators"
                    : isDraftMode
                      ? lang === "fr"
                        ? "Lancer la campagne"
                        : "Launch campaign"
                    : isEditMode
                      ? lang === "fr"
                        ? "Enregistrer les modifications"
                        : "Save changes"
                      : lang === "fr"
                        ? "Démarrer la campagne"
                        : "Start campaign"}
            </button>
              {!isAddCreatorsMode && (
                <button type="button" style={onboardingSecondaryBtn} onClick={() => setStep(0)}>
                  {lang === "fr" ? "Retour" : "Back"}
                </button>
              )}
              <button type="button" style={onboardingSecondaryBtn} onClick={() => void handleClose()} disabled={savingDraft || launching}>
                {exitLabel}
              </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
