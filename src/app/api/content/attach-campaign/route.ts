import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { baselineRpmLinksForContent } from "@/lib/rpm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contentId = String(body.contentId || "").trim();
  const campaignId = String(body.campaignId || "").trim();
  const requestedBrandId = String(body.brandId || "").trim();

  if (!contentId || !campaignId || !requestedBrandId) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const access = await requireWorkspaceAccess(request, requestedBrandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;

  const [{ data: content, error: contentErr }, { data: campaign, error: campaignErr }] = await Promise.all([
    admin
      .from("creator_content")
      .select("id, creator_row_id, views")
      .eq("id", contentId)
      .eq("brand_id", brandId)
      .maybeSingle(),
    admin.from("campaigns").select("id, name").eq("id", campaignId).eq("user_id", brandId).maybeSingle(),
  ]);

  if (contentErr || campaignErr) {
    return NextResponse.json(
      { ok: false, error: contentErr?.message || campaignErr?.message || "Lookup failed" },
      { status: 500 },
    );
  }
  if (!content) return NextResponse.json({ ok: false, error: "Content not found" }, { status: 404 });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const { error } = await admin.from("campaign_content").upsert(
    {
      brand_id: brandId,
      campaign_id: campaignId,
      creator_row_id: content.creator_row_id,
      content_id: contentId,
    },
    { onConflict: "campaign_id,content_id", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await baselineRpmLinksForContent(
    admin,
    brandId,
    contentId,
    Number(content.views ?? 0),
  );

  return NextResponse.json({ ok: true, campaignName: campaign.name });
}
