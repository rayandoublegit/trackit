import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyDiscountCodeToCreator, ensureCreatorForHandle } from "@/lib/creator-promo-codes";
import { normalizeCreatorHandle } from "@/lib/managed-creator-commission";
import { commissionRateFromDiscountCode } from "@/lib/creator-crm";
import { buildTrackitShortLink } from "@/lib/affiliate-short-link";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncCrmSnapshot(
  userId: string,
  handle: string,
  code: string,
  affiliateRef?: string | null
) {
  const normalized = normalizeCreatorHandle(handle);
  if (!normalized) return;

  const { data: savedRows } = await supabaseAdmin
    .from("discovery_saved")
    .select("id, creator_username, snapshot")
    .eq("user_id", userId);

  const row = (savedRows ?? []).find(
    (r) => normalizeCreatorHandle(String(r.creator_username || "")) === normalized
  );
  if (!row?.id) return;

  const snap =
    row.snapshot && typeof row.snapshot === "object"
      ? { ...(row.snapshot as Record<string, unknown>) }
      : {};
  const crm =
    snap.crm && typeof snap.crm === "object"
      ? { ...(snap.crm as Record<string, unknown>) }
      : {};
  crm.promoCode = code;
  if (affiliateRef) crm.affiliateRef = affiliateRef;
  snap.crm = crm;

  await supabaseAdmin.from("discovery_saved").update({ snapshot: snap }).eq("id", row.id);
}

// Ecrit le code promo (+ ref affiliation) sur le createur et le CRM Gérer.
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  let creatorId = String(body.creatorId || "");
  const handle = String(body.handle || body.creator || "").trim();
  const code = String(body.code || "").trim().toUpperCase();
  const affiliateRef = String(body.ref || body.affiliateRef || "").trim().toLowerCase() || null;

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

  if (affiliateRef) {
    const withRef = await supabaseAdmin
      .from("creators")
      .update({ affiliate_ref: affiliateRef })
      .eq("id", creatorId)
      .eq("user_id", userId);
    // Column may not exist yet — ignore.
    if (withRef.error && !withRef.error.message.toLowerCase().includes("affiliate_ref")) {
      /* ignore non-column errors silently for attribution path */
    }
  }

  const { data: creatorRow } = await supabaseAdmin
    .from("creators")
    .select("handle")
    .eq("id", creatorId)
    .maybeSingle();

  const creatorHandle = handle || String(creatorRow?.handle || "");
  if (creatorHandle) {
    await syncCrmSnapshot(userId, creatorHandle, code, affiliateRef);
  }

  let destinationUrl: string | null = null;
  if (affiliateRef) {
    const { data: linkRow } = await supabaseAdmin
      .from("affiliate_links")
      .select("destination_url")
      .eq("brand_id", userId)
      .eq("slug", affiliateRef)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    destinationUrl = linkRow?.destination_url ? String(linkRow.destination_url) : null;
  }

  return NextResponse.json({
    ok: true,
    creatorId,
    code,
    ref: affiliateRef,
    link: affiliateRef ? buildTrackitShortLink(affiliateRef, destinationUrl) : null,
  });
}
