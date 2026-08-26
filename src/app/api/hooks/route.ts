import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function missingTableMessage(error: { message?: string } | null) {
  const msg = error?.message || "";
  if (
    msg.includes("hooks") &&
    (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("Could not find"))
  ) {
    return "Table hooks absente — appliquez supabase/migrations/20260825_000034_hooks.sql dans le SQL Editor Trackit";
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
    .from("hooks")
    .select("id, title, body, color, created_at")
    .eq("brand_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hooks: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : null;
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const title = String(body?.title || "").trim();
  const hookBody = typeof body?.body === "string" ? body.body.trim() : "";
  const color = Number.isFinite(Number(body?.color)) ? Math.max(0, Math.min(7, Number(body.color))) : 0;

  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const { data, error } = await admin
    .from("hooks")
    .insert({
      brand_id: workspaceId,
      title,
      body: hookBody || null,
      color,
    })
    .select("id, title, body, color, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hook: data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : null;
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.body === "string") updates.body = body.body.trim() || null;
  if (body?.color != null && Number.isFinite(Number(body.color))) {
    updates.color = Math.max(0, Math.min(7, Number(body.color)));
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("hooks")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", workspaceId)
    .select("id, title, body, color, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, hook: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await admin.from("hooks").delete().eq("id", id).eq("brand_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
