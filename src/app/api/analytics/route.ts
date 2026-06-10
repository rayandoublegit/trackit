import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  computeTrend,
  getPeriodBounds,
  isWithinPeriod,
  type AnalyticsDateRange,
} from "@/lib/analytics-periods";

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

  // Total revenue and commissions from sales
  const { data: salesData } = await supabaseAdmin
    .from("sales")
    .select("order_amount, commission_amount, discount_code_used, created_at")
    .eq("user_id", userId);

  const sumSales = (from: Date, to: Date) => {
    const rows = (salesData || []).filter((s) => isWithinPeriod(s.created_at, from, to));
    return {
      revenue: rows.reduce((sum, s) => sum + (s.order_amount || 0), 0),
      commissions: rows.reduce((sum, s) => sum + (s.commission_amount || 0), 0),
      count: rows.length,
    };
  };

  const currentSales = sumSales(start, end);
  const previousSales = sumSales(prevStart, prevEnd);
  const totalRevenue = currentSales.revenue;
  const totalCommissions = currentSales.commissions;

  // Outreach stats
  const { data: outreachData } = await supabaseAdmin
    .from("outreach_history")
    .select("status, created_at")
    .eq("user_id", userId);

  const outreachInPeriod = (from: Date, to: Date) => {
    const rows = (outreachData || []).filter((o) => isWithinPeriod(o.created_at, from, to));
    const sent = rows.length;
    const replied = rows.filter((o) => o.status === "replied" || o.status === "converted").length;
    const convertedCount = rows.filter((o) => o.status === "converted").length;
    return {
      sent,
      replied,
      converted: convertedCount,
      responseRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  };

  const currentOutreach = outreachInPeriod(start, end);
  const previousOutreach = outreachInPeriod(prevStart, prevEnd);
  const totalSent = currentOutreach.sent;
  const responseRate = currentOutreach.responseRate;
  const converted = currentOutreach.converted;

  // Top creators by sales
  const { data: creatorsData } = await supabaseAdmin
    .from("creators")
    .select("full_name, handle, username, platform, total_sales, total_earned, balance")
    .eq("user_id", userId)
    .order("total_sales", { ascending: false })
    .limit(5);

  // Campaigns
  const { data: campaignsData } = await supabaseAdmin
    .from("campaigns")
    .select("name, platform, status, created_at")
    .eq("user_id", userId);

  const hasData =
    shopifyConnected ||
    totalRevenue > 0 ||
    totalSent > 0 ||
    (creatorsData && creatorsData.length > 0) ||
    (campaignsData && campaignsData.length > 0) ||
    (salesData && salesData.length > 0);

  return NextResponse.json({
    hasData,
    shopifyConnected,
    range,
    totalRevenue,
    totalCommissions,
    totalSent,
    responseRate,
    converted,
    creators: creatorsData || [],
    campaigns: campaignsData || [],
    salesCount: currentSales.count,
    trends: {
      revenue: computeTrend(currentSales.revenue, previousSales.revenue),
      commissions: computeTrend(currentSales.commissions, previousSales.commissions),
      outreachSent: computeTrend(currentOutreach.sent, previousOutreach.sent),
      responseRate: computeTrend(currentOutreach.responseRate, previousOutreach.responseRate),
    },
  });
}
