import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin-auth";
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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Profil complet
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

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

  return NextResponse.json({
    ok: true,
    profile,
    subscription,
    invoices,
  });
}
