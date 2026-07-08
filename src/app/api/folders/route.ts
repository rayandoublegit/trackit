import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/api-auth";
import { isGrowthOrAbove, normalizePlan } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: folders, error } = await admin
    .from("discovery_folders")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (folders ?? []).map((f) => f.id);
  let items: { folder_id: string; creator_username: string }[] = [];
  if (ids.length) {
    const { data: itemRows } = await admin
      .from("discovery_folder_items")
      .select("folder_id, creator_username, added_at")
      .in("folder_id", ids);
    items = itemRows ?? [];
  }
  return NextResponse.json({ folders: folders ?? [], items });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { name?: string; color?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = normalizePlan(profile?.plan);
  if (!isGrowthOrAbove(plan)) {
    return NextResponse.json({ error: "Upgrade required", code: "plan_required" }, { status: 402 });
  }

  const { count } = await admin.from("discovery_folders").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const { data, error } = await admin
    .from("discovery_folders")
    .insert({ user_id: userId, name, color: String(body.color ?? "gray"), position: count ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: data });
}

export async function PATCH(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { id?: string; name?: string; color?: string; position?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.color !== undefined) patch.color = String(body.color);
  if (body.position !== undefined) patch.position = Number(body.position);

  const { data, error } = await admin
    .from("discovery_folders")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", body.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await admin.from("discovery_folders").delete().eq("user_id", userId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
