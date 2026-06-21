import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Ecrit le code promo sur le createur (service role: bypass RLS).
// Appele quand une marque genere un lien d'affiliation avec un code, pour
// que l'attribution des ventes (Shopify sync + ventes manuelles) retrouve
// le createur via creators.discount_code.
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  const creatorId = String(body.creatorId || "");
  const code = String(body.code || "").trim().toUpperCase();

  if (!userId || !creatorId || !code) {
    return NextResponse.json({ ok: false, error: "Missing userId, creatorId or code" }, { status: 400 });
  }

  const { data: owned, error: ownErr } = await supabaseAdmin
    .from("creators")
    .select("id")
    .eq("id", creatorId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownErr) {
    return NextResponse.json({ ok: false, error: ownErr.message }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Creator not found for this user" }, { status: 404 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("creators")
    .update({ discount_code: code })
    .eq("id", creatorId)
    .eq("user_id", userId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, creatorId, code });
}
