import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function missingTableMessage(error: { message?: string } | null) {
  const msg = error?.message || "";
  if (
    msg.includes("brand_rules") &&
    (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("Could not find"))
  ) {
    return "Table brand_rules absente — appliquez supabase/migrations/20260825_000037_brand_rules.sql";
  }
  return msg || "Unknown error";
}

export async function GET(request: NextRequest) {
  const brandId = new URL(request.url).searchParams.get("brandId");
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("brand_rules")
    .select("brand_id, body, updated_at")
    .eq("brand_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });

  return NextResponse.json({
    ok: true,
    rules: data || { brand_id: workspaceId, body: "", updated_at: null },
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : null;
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const text = typeof body?.body === "string" ? body.body : "";
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("brand_rules")
    .upsert(
      {
        brand_id: workspaceId,
        body: text,
        updated_at: now,
      },
      { onConflict: "brand_id" },
    )
    .select("brand_id, body, updated_at")
    .single();

  if (error) return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  return NextResponse.json({ ok: true, rules: data });
}
