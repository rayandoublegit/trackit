import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin-auth";
import { computeMetrics } from "@/lib/admin-metrics";
import { computeGrowth } from "@/lib/admin-growth";
import { computeOps } from "@/lib/admin-ops";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  try {
    const stripe = new Stripe(stripeKey);

    // Metriques business (Stripe = source de verite argent)
    const metrics = await computeMetrics(stripe);

    // Donnees de croissance: serie mensuelle, ARPU, LTV, funnel
    const growth = await computeGrowth(
      stripe,
      db,
      metrics.churnRatePct,
      metrics.mrr,
      metrics.activeSubscribers
    );

    // Operations: impayes a relancer + sources d'acquisition
    const ops = await computeOps(stripe, db);

    // Liste des users depuis profiles (etat applicatif)
    const { data: users, error } = await db
      .from("profiles")
      .select(
        "id, email, full_name, username, plan, role, subscription_active, subscription_status, stripe_customer_id, stripe_subscription_id, account_type, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      me: admin,
      metrics,
      growth,
      ops,
      users: users ?? [],
      stripeMode: stripeKey.startsWith("sk_live") ? "live" : "test",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Console error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
