import { NextResponse, type NextRequest } from "next/server";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { activeUsers, countBy, dailySeries, sumSeries } from "@/lib/admin-aggregate";
import { countRows, fetchRows, isoDaysAgo } from "@/lib/admin-data";
import { devOverview } from "@/lib/admin-dev-fixtures";
import type { AttentionItem, OverviewData } from "@/lib/admin-types";
import { compAccess } from "@/lib/comp-plan";
import { normalizePlan } from "@/lib/plan-limits";
import { PLAN_PRICES } from "@/lib/plan-marketing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTHLY: Record<string, number> = {
  basic: PLAN_PRICES.growthMonthly,
  pro: PLAN_PRICES.proMonthly,
  scale: PLAN_PRICES.scaleMonthly,
};

type ProfileLite = {
  id: string;
  plan: string | null;
  account_type: string | null;
  subscription_active: boolean | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  created_at: string | null;
};

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devOverview());
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const now = new Date();
  const warnings: string[] = [];
  const attention: AttentionItem[] = [];

  const [profiles, sessions, sales, campaignsTotal, campaignsActive, catalog, missions, niches7d, lookups7d] = await Promise.all([
    fetchRows<ProfileLite>(
      db,
      "profiles",
      "id, plan, account_type, subscription_active, subscription_status, stripe_subscription_id, created_at",
      { maxRows: 50_000 },
    ),
    fetchRows<{ user_id: string; last_active_at: string | null }>(db, "user_sessions", "user_id, last_active_at", {
      since: { column: "last_active_at", iso: isoDaysAgo(30, now) },
    }),
    fetchRows<{ order_amount: number | string | null; created_at: string | null }>(db, "sales", "order_amount, created_at", {
      since: { column: "created_at", iso: isoDaysAgo(60, now) },
    }),
    countRows(db, "campaigns"),
    countRows(db, "campaigns", (q) => q.in("status", ["active", "Active"])),
    countRows(db, "creators_index"),
    countRows(db, "gift_missions"),
    countRows(db, "niche_requests", (q) => q.gte("created_at", isoDaysAgo(7, now))),
    countRows(db, "creator_lookup_requests", (q) => q.gte("created_at", isoDaysAgo(7, now))),
  ]);

  // Users
  let users: OverviewData["users"] = { total: null, brands: null, creators: null, new7d: null, newPrev7d: null, signups: null };
  let paying: OverviewData["paying"] = { count: null, comped: null, mrrEstimate: null, byPlan: [] };
  if (profiles.error) {
    warnings.push(`profiles: ${profiles.error}`);
  } else {
    const rows = profiles.rows;
    const signups = dailySeries(rows, (r) => r.created_at, 30, now);
    const fourteen = dailySeries(rows, (r) => r.created_at, 14, now);
    users = {
      total: rows.length,
      creators: rows.filter((r) => (r.account_type ?? "").toLowerCase() === "creator").length,
      brands: rows.filter((r) => (r.account_type ?? "").toLowerCase() !== "creator").length,
      new7d: sumSeries(fourteen, 7),
      newPrev7d: sumSeries(fourteen.slice(0, 7)),
      signups,
    };
    let count = 0;
    let comped = 0;
    let mrr = 0;
    const payingRows: { plan: string }[] = [];
    for (const r of rows) {
      const access = compAccess(r.subscription_status);
      const plan = access.kind === "gift" && !access.active ? "free" : normalizePlan(r.plan);
      if (plan === "free") continue;
      const active = Boolean(r.subscription_active) || access.active || Boolean(r.stripe_subscription_id);
      if (!active) continue;
      if (access.kind === "gift" || access.kind === "comp") {
        comped += 1;
        continue;
      }
      count += 1;
      mrr += MONTHLY[plan] ?? 0;
      payingRows.push({ plan });
    }
    paying = { count, comped, mrrEstimate: mrr, byPlan: countBy(payingRows, (r) => r.plan) };
    if (profiles.truncated) warnings.push("profiles: more than 50,000 rows, totals are truncated.");
  }

  // Activity
  const active: OverviewData["active"] = sessions.error
    ? { d1: null, d7: null, d30: null }
    : { d1: activeUsers(sessions.rows, 1, now), d7: activeUsers(sessions.rows, 7, now), d30: activeUsers(sessions.rows, 30, now) };
  if (sessions.error) warnings.push(`user_sessions: ${sessions.error}`);

  let salesBlock: OverviewData["sales"] = { count30d: null, revenue30d: null, revenuePrev30d: null, series: null };
  if (sales.error) {
    warnings.push(`sales: ${sales.error}`);
  } else {
    const amount = (r: { order_amount: number | string | null }) => Number(r.order_amount) || 0;
    const sixty = dailySeries(sales.rows, (r) => r.created_at, 60, now, amount);
    const counts = dailySeries(sales.rows, (r) => r.created_at, 30, now);
    salesBlock = {
      count30d: sumSeries(counts),
      revenue30d: Math.round(sumSeries(sixty, 30) * 100) / 100,
      revenuePrev30d: Math.round(sumSeries(sixty.slice(0, 30)) * 100) / 100,
      series: sixty.slice(-30),
    };
  }

  for (const [name, result] of [
    ["campaigns", campaignsTotal],
    ["creators_index", catalog],
    ["gift_missions", missions],
  ] as const) {
    if (result.missing) {
      attention.push({ kind: "schema", label: `${name} table missing`, count: 1, href: "/admin/system" });
    } else if (result.error) {
      warnings.push(`${name}: ${result.error}`);
    }
  }
  if ((niches7d.count ?? 0) > 0) {
    attention.push({ kind: "requests", label: "Niches requested this week", count: niches7d.count ?? 0, href: "/admin/requests" });
  }
  if ((lookups7d.count ?? 0) > 0) {
    attention.push({ kind: "lookups", label: "Creators not found this week", count: lookups7d.count ?? 0, href: "/admin/requests" });
  }
  if (warnings.length > 0) {
    attention.push({ kind: "error", label: "Failed reads", count: warnings.length, href: "/admin/system" });
  }

  const data: OverviewData = {
    ok: true,
    generatedAt: now.toISOString(),
    users,
    active,
    paying,
    campaigns: { total: campaignsTotal.count, active: campaignsActive.count },
    sales: salesBlock,
    catalog: { total: catalog.count },
    gifting: { missions: missions.count },
    attention,
    warnings,
  };
  return NextResponse.json(data);
}
