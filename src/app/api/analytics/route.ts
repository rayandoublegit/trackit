import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  computeTrend,
  getPeriodBounds,
  isWithinPeriod,
  type AnalyticsDateRange,
} from "@/lib/analytics-periods";
import {
  attributeSaleToCampaign,
  buildCreatorCountsFromLinks,
  type CampaignSalesMeta,
  type SaleAttributionRow,
} from "@/lib/campaign-sales-attribution";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set<AnalyticsDateRange>(["today", "7d", "30d", "90d", "custom"]);

function parseRange(value: string | null): AnalyticsDateRange {
  if (value && VALID_RANGES.has(value as AnalyticsDateRange)) return value as AnalyticsDateRange;
  return "30d";
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type OutreachRow = {
  status?: string | null;
  created_at?: string | null;
  creator_username?: string | null;
  platform?: string | null;
  message?: string | null;
  follow_up_date?: string | null;
};

function outreachReplyScore(status: string): number {
  const s = status.toLowerCase();
  if (s === "converted") return 3;
  if (s === "replied") return 2;
  if (s === "opened") return 1;
  return 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const range = parseRange(searchParams.get("range"));
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { start, end, prevStart, prevEnd } = getPeriodBounds(range);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("shopify_store, shopify_access_token")
    .eq("id", userId)
    .maybeSingle();

  const shopifyConnected = !!(profile?.shopify_store && profile?.shopify_access_token);

  const { data: salesData } = await supabaseAdmin
    .from("sales")
    .select("order_amount, commission_amount, discount_code_used, created_at, campaign_id, creator_id")
    .eq("user_id", userId);

  const salesRows = (salesData || []) as SaleAttributionRow[];

  const sumSales = (from: Date, to: Date) => {
    const rows = salesRows.filter((s) => isWithinPeriod(s.created_at, from, to));
    return {
      revenue: rows.reduce((sum, s) => sum + (Number(s.order_amount) || 0), 0),
      commissions: rows.reduce((sum, s) => sum + (Number(s.commission_amount) || 0), 0),
      count: rows.length,
    };
  };

  const currentSales = sumSales(start, end);
  const previousSales = sumSales(prevStart, prevEnd);
  const totalRevenue = currentSales.revenue;
  const accruedCommissions = currentSales.commissions;

  const periodSales = salesRows.filter((s) => isWithinPeriod(s.created_at, start, end));

  const { data: payoutsData } = await supabaseAdmin
    .from("payouts")
    .select("amount, status, paid_at, created_at, creator_id")
    .eq("user_id", userId);

  const sumPaidPayouts = (from: Date, to: Date) => {
    const rows = (payoutsData || []).filter((p) => {
      if (String(p.status || "").toLowerCase() !== "paid") return false;
      const dateStr = p.paid_at || p.created_at;
      return isWithinPeriod(dateStr, from, to);
    });
    return rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  };

  const currentPaidCommissions = sumPaidPayouts(start, end);
  const previousPaidCommissions = sumPaidPayouts(prevStart, prevEnd);
  const totalCommissions = currentPaidCommissions;

  const paidByCreator = new Map<string, number>();
  for (const p of payoutsData || []) {
    if (String(p.status || "").toLowerCase() !== "paid") continue;
    const dateStr = p.paid_at || p.created_at;
    if (!isWithinPeriod(dateStr, start, end)) continue;
    const creatorId = String(p.creator_id || "");
    if (!creatorId) continue;
    paidByCreator.set(creatorId, (paidByCreator.get(creatorId) || 0) + (Number(p.amount) || 0));
  }

  const { data: outreachData } = await supabaseAdmin
    .from("outreach_history")
    .select("status, created_at, creator_username, platform, message, follow_up_date")
    .eq("user_id", userId);

  const outreachRows = (outreachData || []) as OutreachRow[];

  const outreachInPeriod = (from: Date, to: Date) => {
    const rows = outreachRows.filter((o) => isWithinPeriod(o.created_at, from, to));
    const sent = rows.length;
    const contactedCreators = new Set(
      rows
        .map((o) => String(o.creator_username || "").trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ).size;
    const replied = rows.filter((o) => o.status === "replied" || o.status === "converted").length;
    const convertedCount = rows.filter((o) => o.status === "converted").length;
    return {
      sent,
      contactedCreators,
      replied,
      converted: convertedCount,
      responseRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  };

  const currentOutreach = outreachInPeriod(start, end);
  const previousOutreach = outreachInPeriod(prevStart, prevEnd);
  const totalSent = currentOutreach.contactedCreators;
  const outreachMessagesSent = currentOutreach.sent;
  const responseRate = currentOutreach.responseRate;
  const converted = currentOutreach.converted;

  const periodOutreach = outreachRows.filter((o) => isWithinPeriod(o.created_at, start, end));

  const outreachByPlatform: Array<{
    platform: string;
    sent: number;
    replied: number;
    converted: number;
    bestMessage: string;
  }> = [];

  const platformOutreachMap = new Map<
    string,
    { sent: number; replied: number; converted: number; bestMessage: string; bestScore: number }
  >();

  for (const row of periodOutreach) {
    const platform = String(row.platform || "").trim() || "Other";
    const bucket = platformOutreachMap.get(platform) || {
      sent: 0,
      replied: 0,
      converted: 0,
      bestMessage: "",
      bestScore: -1,
    };
    bucket.sent += 1;
    const status = String(row.status || "sent");
    if (status === "replied" || status === "converted") bucket.replied += 1;
    if (status === "converted") bucket.converted += 1;
    const score = outreachReplyScore(status);
    const message = String(row.message || "").trim();
    if (message && score > bucket.bestScore) {
      bucket.bestScore = score;
      bucket.bestMessage = message.slice(0, 120);
    }
    platformOutreachMap.set(platform, bucket);
  }

  for (const [platform, bucket] of platformOutreachMap.entries()) {
    outreachByPlatform.push({
      platform,
      sent: bucket.sent,
      replied: bucket.replied,
      converted: bucket.converted,
      bestMessage: bucket.bestMessage,
    });
  }
  outreachByPlatform.sort((a, b) => b.sent - a.sent);

  const withFollowUpRows = periodOutreach.filter((o) => o.follow_up_date);
  const withoutFollowUpRows = periodOutreach.filter((o) => !o.follow_up_date);

  const followUpStats = (rows: OutreachRow[]) => {
    const sent = rows.length;
    const replied = rows.filter((o) => o.status === "replied" || o.status === "converted").length;
    return {
      sent,
      replied,
      replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  };

  const followUpImpact = {
    withFollowUp: followUpStats(withFollowUpRows),
    withoutFollowUp: followUpStats(withoutFollowUpRows),
  };

  const { data: allCreators } = await supabaseAdmin
    .from("creators")
    .select("id, full_name, handle, username, platform, total_sales, total_earned, balance")
    .eq("user_id", userId);

  const creatorInfoMap = new Map(
    (allCreators || []).map((c) => [
      String(c.id),
      c as { id: string; full_name?: string; handle?: string; username?: string; platform?: string },
    ]),
  );

  const creatorPerfMap = new Map<string, { revenue: number; commission: number; count: number }>();
  for (const sale of periodSales) {
    const creatorId = String(sale.creator_id || "");
    if (!creatorId) continue;
    const agg = creatorPerfMap.get(creatorId) || { revenue: 0, commission: 0, count: 0 };
    agg.revenue += Number(sale.order_amount) || 0;
    agg.commission += Number(sale.commission_amount) || 0;
    agg.count += 1;
    creatorPerfMap.set(creatorId, agg);
  }

  const creatorsPerformance = Array.from(creatorPerfMap.entries())
    .map(([id, agg]) => {
      const c = creatorInfoMap.get(id);
      const paid = paidByCreator.get(id) || 0;
      return {
        id,
        full_name: c?.full_name,
        handle: c?.handle,
        username: c?.username,
        platform: c?.platform || "—",
        periodRevenue: agg.revenue,
        periodCommission: agg.commission,
        salesCount: agg.count,
        commissionPaid: paid,
        roi: agg.commission > 0 ? agg.revenue / agg.commission : 0,
      };
    })
    .sort((a, b) => b.periodRevenue - a.periodRevenue);

  const revenueDayMap = new Map<string, number>();
  for (const sale of periodSales) {
    const day = new Date(String(sale.created_at)).toISOString().slice(0, 10);
    revenueDayMap.set(day, (revenueDayMap.get(day) || 0) + (Number(sale.order_amount) || 0));
  }
  const revenueTimeline = Array.from(revenueDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  const platformSalesMap = new Map<string, { revenue: number; commission: number; count: number }>();
  for (const sale of periodSales) {
    const creatorId = String(sale.creator_id || "");
    const platform = String(creatorInfoMap.get(creatorId)?.platform || "Other").trim() || "Other";
    const agg = platformSalesMap.get(platform) || { revenue: 0, commission: 0, count: 0 };
    agg.revenue += Number(sale.order_amount) || 0;
    agg.commission += Number(sale.commission_amount) || 0;
    agg.count += 1;
    platformSalesMap.set(platform, agg);
  }

  const platformBreakdown = Array.from(platformSalesMap.entries())
    .map(([platform, agg]) => ({
      platform,
      revenue: agg.revenue,
      commission: agg.commission,
      salesCount: agg.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const { data: campaignsRaw } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, platform, status, created_at, start_date")
    .eq("user_id", userId);

  const { data: ccLinks } = await supabaseAdmin
    .from("campaign_creators")
    .select("campaign_id, creator_id")
    .eq("user_id", userId);

  const creatorCounts = buildCreatorCountsFromLinks(
    (ccLinks || []).map((l) => ({
      campaign_id: String(l.campaign_id),
      creator_id: String(l.creator_id),
    })),
  );

  const campaignMeta: Record<string, CampaignSalesMeta> = {};
  for (const row of campaignsRaw || []) {
    campaignMeta[String(row.id)] = {
      status: String(row.status ?? ""),
      created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    };
  }

  const creatorCountByCampaign = new Map<string, number>();
  for (const link of ccLinks || []) {
    const cid = String(link.campaign_id);
    creatorCountByCampaign.set(cid, (creatorCountByCampaign.get(cid) || 0) + 1);
  }

  const campaignPeriodMap = new Map<string, { sales: number; commissions: number }>();
  for (const sale of periodSales) {
    const campaignId = attributeSaleToCampaign(sale, creatorCounts, campaignMeta);
    if (!campaignId) continue;
    const agg = campaignPeriodMap.get(campaignId) || { sales: 0, commissions: 0 };
    agg.sales += Number(sale.order_amount) || 0;
    agg.commissions += Number(sale.commission_amount) || 0;
    campaignPeriodMap.set(campaignId, agg);
  }

  const campaignsData = (campaignsRaw || []).map((c) => {
    const cid = String(c.id);
    const agg = campaignPeriodMap.get(cid) || { sales: 0, commissions: 0 };
    const creatorCount = creatorCountByCampaign.get(cid) || 0;
    const roi = agg.commissions > 0 ? agg.sales / agg.commissions : 0;
    return {
      ...c,
      creatorCount,
      totalSales: agg.sales,
      totalCommissions: agg.commissions,
      roi,
    };
  });

  const hasData =
    shopifyConnected ||
    totalRevenue > 0 ||
    totalCommissions > 0 ||
    totalSent > 0 ||
    outreachMessagesSent > 0 ||
    creatorsPerformance.length > 0 ||
    (campaignsData && campaignsData.length > 0) ||
    salesRows.length > 0 ||
    (payoutsData && payoutsData.some((p) => String(p.status || "").toLowerCase() === "paid"));

  return NextResponse.json({
    hasData,
    shopifyConnected,
    range,
    totalRevenue,
    totalCommissions,
    accruedCommissions,
    totalSent,
    outreachMessagesSent,
    responseRate,
    converted,
    creators: creatorsPerformance,
    creatorsPerformance,
    campaigns: campaignsData || [],
    salesCount: currentSales.count,
    revenueTimeline,
    platformBreakdown,
    outreachByPlatform,
    followUpImpact,
    trends: {
      revenue: computeTrend(currentSales.revenue, previousSales.revenue),
      commissions: computeTrend(currentPaidCommissions, previousPaidCommissions),
      outreachSent: computeTrend(currentOutreach.contactedCreators, previousOutreach.contactedCreators),
      responseRate: computeTrend(currentOutreach.responseRate, previousOutreach.responseRate),
    },
  });
}
