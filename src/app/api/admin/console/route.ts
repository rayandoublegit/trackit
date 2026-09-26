import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin-auth";
import { computeMetrics, type AdminMetrics } from "@/lib/admin-metrics";
import { computeGrowth } from "@/lib/admin-growth";
import { computeOps } from "@/lib/admin-ops";
import { compAccess } from "@/lib/comp-plan";
import { normalizePlan } from "@/lib/plan-limits";
import { PLAN_PRICES } from "@/lib/plan-marketing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listProfileRows } from "@/lib/profile-row";

export const dynamic = "force-dynamic";

const MONTHLY: Record<string, number> = {
  basic: PLAN_PRICES.growthMonthly,
  pro: PLAN_PRICES.proMonthly,
  scale: PLAN_PRICES.scaleMonthly,
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  plan: string | null;
  role: string | null;
  subscription_active: boolean | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  account_type: string | null;
  created_at: string | null;
};

function metricsFromProfiles(users: ProfileRow[]): AdminMetrics {
  const mrrByPlan: Record<string, number> = {};
  const countByPlan: Record<string, number> = {};
  let mrr = 0;
  let activeSubscribers = 0;
  let trialing = 0;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  let newThisMonth = 0;

  for (const user of users) {
    const access = compAccess(user.subscription_status);
    const plan = access.kind === "gift" && !access.active ? "free" : normalizePlan(user.plan);
    const paying =
      plan !== "free" &&
      (user.subscription_active || access.active || Boolean(user.stripe_subscription_id));
    if (!paying) continue;
    const monthly = access.kind === "gift" ? 0 : (MONTHLY[plan] ?? 0);
    activeSubscribers += 1;
    if ((user.subscription_status ?? "").toLowerCase() === "trialing" || access.kind === "gift") trialing += 1;
    mrr += monthly;
    mrrByPlan[plan] = (mrrByPlan[plan] ?? 0) + monthly;
    countByPlan[plan] = (countByPlan[plan] ?? 0) + 1;
    if (user.created_at && Date.parse(user.created_at) >= start.getTime()) newThisMonth += 1;
  }

  return {
    mrr,
    arr: mrr * 12,
    activeSubscribers,
    trialing,
    pastDue: 0,
    canceledThisMonth: 0,
    newThisMonth,
    churnRatePct: 0,
    mrrByPlan,
    countByPlan,
    currency: "eur",
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const listed = await listProfileRows<ProfileRow>(db, [
    "id",
    "email",
    "full_name",
    "username",
    "plan",
    "role",
    "subscription_active",
    "subscription_status",
    "stripe_customer_id",
    "stripe_subscription_id",
    "account_type",
    "created_at",
  ]);
  if (listed.error) {
    return NextResponse.json({ error: listed.error }, { status: 500 });
  }

  const emails = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error: usersError } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError || !data.users.length) break;
    for (const user of data.users) {
      if (user.email) emails.set(user.id, user.email);
    }
    if (data.users.length < 1000) break;
  }

  const rows = listed.rows.map((user) => ({
    ...user,
    email: user.email || emails.get(user.id) || null,
  }));
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let metrics = metricsFromProfiles(rows);
  let growth = null;
  let ops: { failedPayments: unknown[]; acquisition: { source: string; count: number }[] } = {
    failedPayments: [],
    acquisition: [],
  };
  let stripeMode: "live" | "test" | "off" = stripeKey ? (stripeKey.startsWith("sk_live") ? "live" : "test") : "off";

  if (stripeKey) {
    try {
      const stripe = new Stripe(stripeKey);
      metrics = await computeMetrics(stripe);
      growth = await computeGrowth(stripe, db, metrics.churnRatePct, metrics.mrr, metrics.activeSubscribers);
      ops = await computeOps(stripe, db);
    } catch (err) {
      console.error("admin console stripe:", err);
      stripeMode = "off";
    }
  }

  return NextResponse.json({
    ok: true,
    me: admin,
    metrics,
    growth,
    ops,
    users: rows,
    stripeMode,
  });
}
