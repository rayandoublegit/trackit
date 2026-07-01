import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";
import { deactivateCreatorDashboard } from "@/lib/active-dashboard-creators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Brand deactivates a creator dashboard — removes from « dashboards actifs » and blocks creator access. */
export async function POST(request: NextRequest) {
  const brandId = await getAuthedUserId(request);
  if (!brandId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const creatorRowId = (body?.creatorId as string | undefined)?.trim();
  if (!creatorRowId) return NextResponse.json({ error: "Missing creatorId" }, { status: 400 });

  const { data: creator, error: fetchErr } = await admin
    .from("creators")
    .select("id, linked_user_id, handle")
    .eq("id", creatorRowId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const linkedUserId = creator.linked_user_id;

  try {
    await deactivateCreatorDashboard(admin, brandId, creatorRowId);
  } catch (rowErr) {
    return NextResponse.json(
      { error: rowErr instanceof Error ? rowErr.message : "Update failed" },
      { status: 500 },
    );
  }

  if (linkedUserId) {
    await admin
      .from("creator_links")
      .update({ status: CREATOR_LINK_STATUS.revoked })
      .eq("brand_id", brandId)
      .eq("creator_id", linkedUserId);
  }

  const username = String(creator.handle || "").trim().replace(/^@+/, "").toLowerCase();
  if (username) {
    await admin
      .from("discovery_saved")
      .delete()
      .eq("user_id", brandId)
      .eq("creator_username", username);
  }

  return NextResponse.json({ ok: true });
}
