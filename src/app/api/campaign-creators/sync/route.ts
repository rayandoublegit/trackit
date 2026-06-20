import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sync the creators linked to a campaign (service role: bypasses RLS).
// The promo code lives on the creator, NOT on the link, so discount_code stays
// null here. Attribution reads the creator's own code. No code generation = no
// collision on the unique index over upper(discount_code).
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  const campaignId = String(body.campaignId || "");
  const creatorIds: string[] = Array.isArray(body.creatorIds)
    ? body.creatorIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!campaignId) return NextResponse.json({ ok: false, error: "No campaignId" }, { status: 400 });

  // Ownership guard: the campaign must belong to this user.
  const { data: campaignRow } = await supabaseAdmin
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow || String(campaignRow.user_id) !== userId) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  // 1. Wipe existing links for this campaign.
  const { error: deleteError } = await supabaseAdmin
    .from("campaign_creators")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  if (creatorIds.length === 0) {
    return NextResponse.json({ ok: true, linked: 0 });
  }

  // 2. Pull each creator's rate (and verify ownership).
  const { data: creatorRows } = await supabaseAdmin
    .from("creators")
    .select("id, commission_rate, user_id")
    .in("id", creatorIds)
    .eq("user_id", userId);
  const creatorMap = new Map(
    (creatorRows || []).map((c) => [
      String(c.id),
      c as { commission_rate?: number | null },
    ]),
  );

  // 3. Build link rows (no discount_code -> stays null -> no collision).
  const rows = creatorIds
    .filter((id) => creatorMap.has(id))
    .map((creatorId) => {
      const c = creatorMap.get(creatorId);
      return {
        user_id: userId,
        campaign_id: campaignId,
        creator_id: creatorId,
        commission_rate: c?.commission_rate ?? null,
        commission_type: "percentage",
      };
    });

  const { error: insertError } = await supabaseAdmin.from("campaign_creators").insert(rows);
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, linked: rows.length });
}
