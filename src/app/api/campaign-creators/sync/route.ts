import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Build a per-campaign affiliate code from the creator's base code + campaign name.
function buildCampaignCode(baseCode: string | null, handle: string, campaignName: string): string {
  const base = (baseCode || handle || "CODE")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "CODE";
  const suffix = (campaignName || "CAMP")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "CAMP";
  return `${base}-${suffix}`;
}

// Sync the creators linked to a campaign (service role: bypasses RLS).
// Mirrors the old client-side syncCampaignCreators: full delete + re-insert.
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
    .select("name, user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow || String(campaignRow.user_id) !== userId) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }
  const campaignName = String(campaignRow.name ?? "");

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

  // 2. Pull each creator's base code + rate (and verify ownership).
  const { data: creatorRows } = await supabaseAdmin
    .from("creators")
    .select("id, handle, discount_code, commission_rate, user_id")
    .in("id", creatorIds)
    .eq("user_id", userId);
  const creatorMap = new Map(
    (creatorRows || []).map((c) => [
      String(c.id),
      c as { handle?: string; discount_code?: string | null; commission_rate?: number | null },
    ]),
  );

  // 3. Build rows with unique per-batch codes.
  const seen = new Set<string>();
  const rows = creatorIds
    .filter((id) => creatorMap.has(id))
    .map((creatorId) => {
      const c = creatorMap.get(creatorId);
      const code = buildCampaignCode(c?.discount_code ?? null, c?.handle ?? "", campaignName);
      let candidate = code;
      let n = 2;
      while (seen.has(candidate.toUpperCase())) {
        candidate = `${code}${n}`;
        n += 1;
      }
      seen.add(candidate.toUpperCase());
      return {
        user_id: userId,
        campaign_id: campaignId,
        creator_id: creatorId,
        discount_code: candidate,
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
