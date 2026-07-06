import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { backfillCampaignContent } from "@/lib/content-campaign-sync";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ExistingLinkRow = {
  creator_id: string;
  historical_sales_attached: boolean;
  created_at: string;
};

// Sync the creators linked to a campaign (service role: bypasses RLS).
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  const campaignId = String(body.campaignId || "");
  const creatorIds: string[] = Array.isArray(body.creatorIds)
    ? body.creatorIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const attachHistoricalSales =
    typeof body.attachHistoricalSales === "boolean" ? body.attachHistoricalSales : false;
  const creatorAttachments =
    body.creatorAttachments && typeof body.creatorAttachments === "object"
      ? (body.creatorAttachments as Record<string, boolean>)
      : {};

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!campaignId) return NextResponse.json({ ok: false, error: "No campaignId" }, { status: 400 });

  const { data: campaignRow } = await supabaseAdmin
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow || String(campaignRow.user_id) !== userId) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  const { data: existingLinks } = await supabaseAdmin
    .from("campaign_creators")
    .select("creator_id, historical_sales_attached, created_at")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  const existingByCreator = new Map<string, ExistingLinkRow>(
    (existingLinks || []).map((row) => [
      String(row.creator_id),
      {
        creator_id: String(row.creator_id),
        historical_sales_attached: row.historical_sales_attached !== false,
        created_at: String(row.created_at || new Date().toISOString()),
      },
    ]),
  );

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

  const { data: creatorRows } = await supabaseAdmin
    .from("creators")
    .select("id, user_id")
    .in("id", creatorIds)
    .eq("user_id", userId);

  const validCreatorIds = new Set((creatorRows || []).map((c) => String(c.id)));
  const rows = creatorIds
    .filter((id) => validCreatorIds.has(id))
    .map((creatorId) => {
      const existing = existingByCreator.get(creatorId);
      const explicitAttach = creatorAttachments[creatorId];
      const historicalSalesAttached =
        explicitAttach === true
          ? true
          : explicitAttach === false
            ? false
            : existing
              ? existing.historical_sales_attached
              : attachHistoricalSales;

      const joinedAt =
        !existing
          ? new Date().toISOString()
          : existing.historical_sales_attached && !historicalSalesAttached
            ? new Date().toISOString()
            : existing.created_at;

      return {
        user_id: userId,
        campaign_id: campaignId,
        creator_id: creatorId,
        historical_sales_attached: historicalSalesAttached,
        created_at: joinedAt,
      };
    });

  const { error: insertError } = await supabaseAdmin.from("campaign_creators").insert(rows);
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const backfillErr = await backfillCampaignContent(supabaseAdmin, userId, campaignId);
  if (backfillErr) {
    console.error("campaign content backfill failed:", backfillErr.message);
  }

  return NextResponse.json({ ok: true, linked: rows.length });
}
