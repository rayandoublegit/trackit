import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  // Total revenue and commissions from sales
  const { data: salesData } = await supabaseAdmin
    .from("sales")
    .select("order_amount, commission_amount, discount_code_used, created_at")
    .eq("user_id", userId);

  const totalRevenue = salesData?.reduce((sum, s) => sum + (s.order_amount || 0), 0) || 0;
  const totalCommissions = salesData?.reduce((sum, s) => sum + (s.commission_amount || 0), 0) || 0;

  // Outreach stats
  const { data: outreachData } = await supabaseAdmin
    .from("outreach_history")
    .select("status")
    .eq("user_id", userId);

  const totalSent = outreachData?.length || 0;
  const replied = outreachData?.filter(o => o.status === "replied" || o.status === "converted").length || 0;
  const converted = outreachData?.filter(o => o.status === "converted").length || 0;
  const responseRate = totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0;

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

  const hasData = totalRevenue > 0 || totalSent > 0 || (creatorsData && creatorsData.length > 0);

  return NextResponse.json({
    hasData,
    totalRevenue,
    totalCommissions,
    totalSent,
    responseRate,
    converted,
    creators: creatorsData || [],
    campaigns: campaignsData || [],
    salesCount: salesData?.length || 0,
  });
}
