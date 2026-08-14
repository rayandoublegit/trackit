import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import { brandTablesHaveWorkspaceId } from "@/lib/workspace-db";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId, spaceId } = access;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const useWs = await brandTablesHaveWorkspaceId(admin);
  let q = admin.from("creators").select("*").eq("user_id", ownerId);
  if (useWs) q = q.eq("workspace_id", spaceId);
  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/creators error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId, spaceId } = access;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim().replace(/^@/, "");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const useWs = await brandTablesHaveWorkspaceId(admin);
  const row: Record<string, unknown> = {
    user_id: ownerId,
    handle: username,
    full_name: String(body.display_name ?? username),
    avatar_url: String(body.avatar_url ?? ""),
    platform: String(body.platform ?? "TikTok"),
    followers: Number(body.followers_count ?? 0) || 0,
    engagement_rate: Number(body.engagement_rate ?? 0) || 0,
    niche: String(body.niche ?? ""),
  };
  if (useWs) row.workspace_id = spaceId;

  const { data, error } = await admin
    .from("creators")
    .upsert(row, { onConflict: useWs ? "workspace_id,handle" : "user_id,handle" })
    .select()
    .single();

  if (error) {
    console.error("POST /api/creators error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId, spaceId } = access;

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("creatorId")?.trim();
  const creatorId = rawId && UUID_RE.test(rawId) ? rawId : undefined;
  const handle = searchParams.get("handle")?.trim()?.replace(/^@/, "");
  if (!creatorId && !handle) {
    return NextResponse.json({ error: "Missing creatorId or handle" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const useWs = await brandTablesHaveWorkspaceId(admin);
  let query = admin.from("creators").delete().eq("user_id", ownerId);
  if (useWs) query = query.eq("workspace_id", spaceId);
  if (creatorId) query = query.eq("id", creatorId);
  else if (handle) query = query.eq("handle", handle);

  const { data, error } = await query.select("id");

  if (error) {
    console.error("DELETE /api/creators error:", error.message, error.code, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
