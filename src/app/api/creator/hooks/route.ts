import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { findCreatorRowsForProfile } from "@/lib/creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function findCreatorBrandIds(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [] as string[];
  const { rows } = await findCreatorRowsForProfile(admin, userId);
  return Array.from(new Set(rows.map((r) => r.user_id)));
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;

  const brandIds = await findCreatorBrandIds(userId);
  if (brandIds.length === 0) return NextResponse.json({ ok: true, hooks: [] });

  const { data: hooks, error } = await admin
    .from("hooks")
    .select("id, brand_id, title, body, color, created_at")
    .in("brand_id", brandIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: reads } = await admin
    .from("hook_reads")
    .select("hook_id, status")
    .eq("creator_user_id", userId);

  const statusBy = new Map((reads || []).map((r) => [String(r.hook_id), String(r.status)]));

  const { data: brands } = await admin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map(
    (brands || []).map((b) => [
      b.id,
      b.business_name || b.full_name || (b.username ? `@${b.username}` : ""),
    ]),
  );

  const result = (hooks || []).map((h) => ({
    id: h.id,
    title: h.title,
    body: h.body,
    color: h.color,
    created_at: h.created_at,
    brandName: brandName.get(h.brand_id) || "",
    status: statusBy.get(String(h.id)) || null,
  }));

  return NextResponse.json({ ok: true, hooks: result });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const access = await requireActorAccess(request, body?.userId);
  if ("error" in access) return access.error;
  const userId = access.actorId;
  const hookId = String(body?.hookId || "").trim();
  const status = String(body?.status || "done").trim() || "done";
  if (!hookId) return NextResponse.json({ error: "Missing hookId" }, { status: 400 });

  const brandIds = await findCreatorBrandIds(userId);
  if (brandIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: hook } = await admin
    .from("hooks")
    .select("id, brand_id")
    .eq("id", hookId)
    .maybeSingle();
  if (!hook || !brandIds.includes(String(hook.brand_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin.from("hook_reads").upsert(
    {
      hook_id: hookId,
      creator_user_id: userId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hook_id,creator_user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
