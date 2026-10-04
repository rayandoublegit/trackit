import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { countRows } from "@/lib/admin-data";
import { devUserDetail } from "@/lib/admin-dev-fixtures";
import type { UserSession, UserUsage } from "@/lib/admin-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devUserDetail(userId));
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Profil complet
  const { data: row, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  let profile = row;
  if (!error && !profile) {
    // Sign-in account without a profile row yet: show what auth knows.
    const { data: authUser } = await db.auth.admin.getUserById(userId);
    if (authUser.user) {
      profile = { id: userId, email: authUser.user.email ?? null, created_at: authUser.user.created_at ?? null, plan: null };
    }
  }
  if (error || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Detail Stripe (abonnement courant + dernieres factures)
  let subscription: {
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    amount: number;
    currency: string;
    interval: string | null;
    priceId: string | null;
  } | null = null;
  let invoices: { id: string; amountPaid: number; currency: string; status: string | null; created: number; pdf: string | null }[] = [];

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && profile.stripe_customer_id) {
    try {
      const stripe = new Stripe(stripeKey);

      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 1,
        expand: ["data.items.data.price"],
      });
      const sub = subs.data[0];
      if (sub) {
        const price = sub.items.data[0]?.price;
        subscription = {
          status: sub.status,
          currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          amount: (price?.unit_amount ?? 0) / 100,
          currency: price?.currency ?? "eur",
          interval: price?.recurring?.interval ?? null,
          priceId: typeof price === "object" ? price?.id ?? null : null,
        };
      }

      const inv = await stripe.invoices.list({
        customer: profile.stripe_customer_id,
        limit: 6,
      });
      invoices = inv.data.map((i) => ({
        id: i.id ?? "",
        amountPaid: (i.amount_paid ?? 0) / 100,
        currency: i.currency ?? "eur",
        status: i.status ?? null,
        created: i.created,
        pdf: i.invoice_pdf ?? null,
      }));
    } catch (e) {
      console.error("stripe detail:", e);
    }
  }

  // Usage across the product and recent sessions. A failed count stays null.
  const byUser = (column: string) => (q: { eq: (c: string, v: string) => unknown }) => q.eq(column, userId);
  const [campaigns, creators, sales, outreach, gifts, sessionRows, salesRows] = await Promise.all([
    countRows(db, "campaigns", byUser("user_id")),
    countRows(db, "creators", byUser("user_id")),
    countRows(db, "sales", byUser("user_id")),
    countRows(db, "outreach_history", byUser("user_id")),
    countRows(db, "gift_missions", byUser("user_id")),
    db
      .from("user_sessions")
      .select("device_label, location_label, ip_address, last_active_at")
      .eq("user_id", userId)
      .order("last_active_at", { ascending: false })
      .limit(8),
    db.from("sales").select("order_amount").eq("user_id", userId).limit(5000),
  ]);
  const usage: UserUsage = {
    campaigns: campaigns.count,
    creators: creators.count,
    sales: sales.count,
    salesRevenue: salesRows.error
      ? null
      : Math.round(((salesRows.data ?? []) as { order_amount: number | string | null }[]).reduce((s, r) => s + (Number(r.order_amount) || 0), 0) * 100) / 100,
    outreach: outreach.count,
    giftMissions: gifts.count,
  };
  const sessions: UserSession[] = sessionRows.error ? [] : ((sessionRows.data ?? []) as UserSession[]);

  return NextResponse.json({
    ok: true,
    profile,
    subscription,
    invoices,
    usage,
    sessions,
  });
}
