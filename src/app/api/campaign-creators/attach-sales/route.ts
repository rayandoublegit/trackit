import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const access = await requireWorkspaceAccess(request, body?.userId);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;
  const campaignId = String(body?.campaignId || "").trim();
  const creatorId = String(body?.creatorId || "").trim();

  if (!userId || !campaignId || !creatorId) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const { data: campaignRow } = await supabaseAdmin
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow || String(campaignRow.user_id) !== userId) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  const { data: link, error: fetchErr } = await supabaseAdmin
    .from("campaign_creators")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!link) return NextResponse.json({ ok: false, error: "Creator not in campaign" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("campaign_creators")
    .update({ historical_sales_attached: true })
    .eq("id", link.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
