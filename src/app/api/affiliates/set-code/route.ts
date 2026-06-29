import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyDiscountCodeToCreator, ensureCreatorForHandle } from "@/lib/creator-promo-codes";
import { normalizeCreatorHandle } from "@/lib/managed-creator-commission";
import { commissionRateFromDiscountCode } from "@/lib/creator-crm";

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
  let creatorId = String(body.creatorId || "");
  const handle = String(body.handle || body.creator || "").trim();
  const code = String(body.code || "").trim().toUpperCase();

  if (!userId || !code) {
    return NextResponse.json({ ok: false, error: "Missing userId or code" }, { status: 400 });
  }

  if (!creatorId && handle) {
    const normalized = normalizeCreatorHandle(handle);
    const { data: creators } = await supabaseAdmin
      .from("creators")
      .select("id, handle")
      .eq("user_id", userId);

    const match = (creators || []).find(
      (c) => normalizeCreatorHandle(String(c.handle || "")) === normalized
    );
    if (match?.id) {
      creatorId = String(match.id);
    } else {
      const ensured = await ensureCreatorForHandle(supabaseAdmin, userId, handle);
      if (ensured?.id) creatorId = ensured.id;
    }
  }

  if (!creatorId) {
    return NextResponse.json({ ok: false, error: "Creator not found for this user" }, { status: 404 });
  }

  const parsedRate = commissionRateFromDiscountCode(code);

  const ok = await applyDiscountCodeToCreator(supabaseAdmin, userId, creatorId, code, parsedRate ?? null);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Failed to update creator" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, creatorId, code });
}
