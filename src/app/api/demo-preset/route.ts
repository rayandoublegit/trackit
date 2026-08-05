import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { seedDemoPresetForUser } from "@/lib/seed-demo-preset";

export const dynamic = "force-dynamic";

/** Ensure Trackit demo list + campaign exist for the authenticated brand workspace. */
export async function POST(request: NextRequest) {
  const workspaceId = await getAuthedUserId(request);
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const result = await seedDemoPresetForUser(admin, workspaceId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error("POST /api/demo-preset", e);
    return NextResponse.json(
      { ok: false, seeded: false, error: e instanceof Error ? e.message : "Seed failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const workspaceId = await getAuthedUserId(request);
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id")
    .eq("user_id", workspaceId)
    .eq("name", "Trackit")
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: folders } = await admin
    .from("discovery_folders")
    .select("id")
    .eq("user_id", workspaceId)
    .eq("name", "Trackit")
    .order("created_at", { ascending: true })
    .limit(1);

  const campaign = campaigns?.[0];
  const folder = folders?.[0];

  return NextResponse.json({
    ok: true,
    ready: Boolean(campaign && folder),
    campaignId: campaign?.id ?? null,
    folderId: folder?.id ?? null,
  });
}
