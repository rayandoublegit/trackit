import { NextResponse, type NextRequest } from "next/server";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { countBy, dailySeries, sumSeries } from "@/lib/admin-aggregate";
import { fetchRows, isoDaysAgo } from "@/lib/admin-data";
import { devActivity } from "@/lib/admin-dev-fixtures";
import type { ActivityData } from "@/lib/admin-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devActivity());
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const now = new Date();
  const since30 = isoDaysAgo(30, now);
  const warnings: string[] = [];

  const [campaigns, sales, payouts, outreach, missions, content] = await Promise.all([
    fetchRows<{ status: string | null; created_at: string | null }>(db, "campaigns", "status, created_at"),
    fetchRows<{ user_id: string; order_amount: number | string | null; commission_amount: number | string | null; created_at: string | null }>(
      db,
      "sales",
      "user_id, order_amount, commission_amount, created_at",
      { since: { column: "created_at", iso: since30 } },
    ),
    fetchRows<{ status: string | null; amount: number | string | null }>(db, "payouts", "status, amount"),
    fetchRows<{ created_at: string | null }>(db, "outreach_history", "created_at", { since: { column: "created_at", iso: since30 } }),
    fetchRows<{ status: string | null }>(db, "gift_missions", "status"),
    fetchRows<{ created_at: string | null }>(db, "creator_content", "created_at", { since: { column: "created_at", iso: since30 } }),
  ]);

  const note = (name: string, r: { error: string | null; missing: boolean }) => {
    if (r.missing) warnings.push(`${name}: table missing`);
    else if (r.error) warnings.push(`${name}: ${r.error}`);
  };
  note("campaigns", campaigns);
  note("sales", sales);
  note("payouts", payouts);
  note("outreach_history", outreach);
  note("gift_missions", missions);
  note("creator_content", content);

  let topBrands: ActivityData["topBrands"] = null;
  let salesBlock: ActivityData["sales"] = null;
  if (!sales.error) {
    const amount = (v: number | string | null) => Number(v) || 0;
    const series = dailySeries(sales.rows, (r) => r.created_at, 30, now, (r) => amount(r.order_amount));
    salesBlock = {
      series,
      count: sales.rows.length,
      revenue: Math.round(sumSeries(series) * 100) / 100,
      commission: Math.round(sales.rows.reduce((s, r) => s + amount(r.commission_amount), 0) * 100) / 100,
    };
    const byBrand = new Map<string, { revenue: number; orders: number }>();
    for (const r of sales.rows) {
      const b = byBrand.get(r.user_id) ?? { revenue: 0, orders: 0 };
      b.revenue += amount(r.order_amount);
      b.orders += 1;
      byBrand.set(r.user_id, b);
    }
    const top = Array.from(byBrand, ([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    const ids = top.map((t) => t.userId);
    const labels = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await db.from("profiles").select("id, business_name, full_name, username").in("id", ids);
      for (const p of (data ?? []) as { id: string; business_name?: string | null; full_name?: string | null; username?: string | null }[]) {
        labels.set(p.id, p.business_name || p.full_name || p.username || p.id.slice(0, 8));
      }
    }
    topBrands = top.map((t) => ({
      userId: t.userId,
      label: labels.get(t.userId) ?? t.userId.slice(0, 8),
      revenue: Math.round(t.revenue * 100) / 100,
      orders: t.orders,
    }));
  }

  let payoutsBlock: ActivityData["payouts"] = null;
  if (!payouts.error) {
    const map = new Map<string, { key: string; count: number; amount: number }>();
    for (const p of payouts.rows) {
      const key = (p.status ?? "—").toLowerCase();
      const e = map.get(key) ?? { key, count: 0, amount: 0 };
      e.count += 1;
      e.amount += Number(p.amount) || 0;
      map.set(key, e);
    }
    payoutsBlock = { byStatus: Array.from(map.values()).map((e) => ({ ...e, amount: Math.round(e.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount) };
  }

  const data: ActivityData = {
    ok: true,
    generatedAt: now.toISOString(),
    campaigns: campaigns.error
      ? null
      : {
          byStatus: countBy(campaigns.rows, (r) => (r.status ?? "").toLowerCase() || null),
          created: dailySeries(campaigns.rows, (r) => r.created_at, 30, now),
        },
    sales: salesBlock,
    topBrands,
    payouts: payoutsBlock,
    outreach: outreach.error ? null : { sent30d: outreach.rows.length, series: dailySeries(outreach.rows, (r) => r.created_at, 30, now) },
    gifting: missions.error ? null : { byStatus: countBy(missions.rows, (r) => r.status) },
    content: content.error ? null : { uploads30d: content.rows.length, series: dailySeries(content.rows, (r) => r.created_at, 30, now) },
    warnings,
  };
  return NextResponse.json(data);
}
