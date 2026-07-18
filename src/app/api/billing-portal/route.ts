import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string };

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    });

    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    if (!cookieUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await resolveWorkspaceContextForUser(cookieUser);
    const resolvedUserId = workspace.ownerId;
    if (body.userId?.trim() && body.userId.trim() !== resolvedUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: authUser, error } = await admin.auth.admin.getUserById(resolvedUserId);
    const resolvedEmail = workspace?.ownerEmail ?? authUser?.user?.email ?? null;
    if (error || !resolvedEmail) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const stripe = new Stripe(stripeKey);
    const customerId = await resolveStripeCustomerId(
      admin,
      stripe,
      resolvedUserId,
      resolvedEmail
    );

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    // Pas d'ID de config hardcode: un ID inexistant dans le mode courant
    // (test/live) faisait echouer le portail avec une erreur /p/login.
    // Si une env est fournie on l'utilise, sinon Stripe prend la config
    // par defaut active du portail (a activer dans le dashboard Stripe).
    const configuration = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID;

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://thentrack.it").replace(/\/$/, "");

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/dashboard?view=billing`,
      ...(configuration ? { configuration } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Billing portal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
