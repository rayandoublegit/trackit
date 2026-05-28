import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const { data: authUser, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    if (error || !authUser?.user?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const email = authUser.user.email;

    const customers = await getStripe().customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    const configuration =
      process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID ??
      "bpc_1T5pKiFC3qsxzaqx37tUdyDM";

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://trackit.app").replace(/\/$/, "");

    const session = await getStripe().billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${base}/dashboard`,
      configuration,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
