import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function norm(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
}

// Meme pattern que /api/creator/payment : retrouve la ligne creators du createur
// connecte (par linked_user_id, sinon par handle puis pose le lien).
async function findCreatorRow(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username, account_type")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.account_type !== "creator") return null;

  const { data: linkedRows } = await supabaseAdmin
    .from("creators")
    .select("id, handle, linked_user_id, stripe_account_id")
    .eq("linked_user_id", userId);
  if (linkedRows && linkedRows.length > 0) return linkedRows[0];

  const handle = norm(profile.username);
  if (!handle) return null;
  const { data: all } = await supabaseAdmin
    .from("creators")
    .select("id, handle, linked_user_id, stripe_account_id");
  const match = (all || []).find((c) => norm(c.handle) === handle);
  if (match) {
    await supabaseAdmin.from("creators").update({ linked_user_id: userId }).eq("id", match.id);
    return match;
  }
  return null;
}

// GET : etat de la connexion Stripe du createur (connecte ? onboarde ?).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const row = await findCreatorRow(userId);
  if (!row) return NextResponse.json({ ok: true, linked: false, connected: false, onboarded: false });

  const accountId = row.stripe_account_id as string | undefined;
  if (!accountId) return NextResponse.json({ ok: true, linked: true, connected: false, onboarded: false });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ ok: true, linked: true, connected: true, onboarded: false });
  try {
    const stripe = new Stripe(stripeKey);
    const account = await stripe.accounts.retrieve(accountId);
    const onboarded = !!(account.payouts_enabled && account.details_submitted);
    return NextResponse.json({ ok: true, linked: true, connected: true, onboarded });
  } catch {
    return NextResponse.json({ ok: true, linked: true, connected: true, onboarded: false });
  }
}

// POST : cree le compte Express si besoin et renvoie l'URL d'onboarding hebergee.
export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const row = await findCreatorRow(userId);
  if (!row) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const stripe = new Stripe(stripeKey);
  let accountId = row.stripe_account_id as string | undefined;

  if (!accountId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const account = await stripe.accounts.create({
      type: "express",
      email: profile?.email || undefined,
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await supabaseAdmin.from("creators").update({ stripe_account_id: accountId }).eq("id", row.id);
  }

  const origin = request.headers.get("origin") || "https://thentrack.it";
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard?view=settings&payout_refresh=1`,
    return_url: `${origin}/dashboard?view=settings&payout_connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ ok: true, url: accountLink.url });
}
