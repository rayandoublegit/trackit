import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const campaignId = request.nextUrl.searchParams.get("campaignId")?.trim();
  if (!campaignId || !UUID_RE.test(campaignId)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid campaignId" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    console.error("DELETE /api/campaigns error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
