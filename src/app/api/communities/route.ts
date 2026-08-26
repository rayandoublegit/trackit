import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function missingTable(error: { message?: string } | null) {
  const msg = error?.message || "";
  if (msg.includes("communities") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("Could not find"))) {
    return "Table communities absente — appliquez supabase/migrations/20260825_000036_communities.sql";
  }
  return msg || "Unknown error";
}

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const brandId = new URL(request.url).searchParams.get("brandId");
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const { data, error } = await admin
    .from("communities")
    .select("id, name, description, avatar_url, members_can_post, created_at, updated_at")
    .eq("brand_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: missingTable(error) }, { status: 500 });

  const ids = (data || []).map((c) => c.id);
  const memberCount = new Map<string, number>();
  if (ids.length) {
    const { data: members } = await admin.from("community_members").select("community_id").in("community_id", ids);
    for (const m of members || []) {
      memberCount.set(m.community_id, (memberCount.get(m.community_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    ok: true,
    communities: (data || []).map((c) => ({
      ...c,
      memberCount: memberCount.get(c.id) || 0,
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const access = await requireWorkspaceAccess(request, body?.brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  const name = String(body?.name || "").trim();
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() : "";
  const membersCanPost = body?.membersCanPost !== false;

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { data, error } = await admin
    .from("communities")
    .insert({
      brand_id: workspaceId,
      name,
      description: description || null,
      avatar_url: avatarUrl || null,
      members_can_post: membersCanPost,
    })
    .select("id, name, description, avatar_url, members_can_post, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: missingTable(error) }, { status: 500 });

  await admin.from("community_members").upsert(
    {
      community_id: data.id,
      user_id: workspaceId,
      role: "owner",
      can_post: true,
    },
    { onConflict: "community_id,user_id" },
  );

  const memberUserIds = Array.isArray(body?.memberUserIds)
    ? [...new Set(body.memberUserIds.map((id: unknown) => String(id || "").trim()).filter(Boolean))]
    : [];

  for (const memberId of memberUserIds) {
    if (memberId === workspaceId) continue;
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", workspaceId)
      .eq("linked_user_id", memberId)
      .maybeSingle();
    if (!creator) continue;
    await admin.from("community_members").upsert(
      {
        community_id: data.id,
        user_id: memberId,
        role: "member",
        can_post: membersCanPost,
      },
      { onConflict: "community_id,user_id" },
    );
  }

  const { count } = await admin
    .from("community_members")
    .select("user_id", { count: "exact", head: true })
    .eq("community_id", data.id);

  return NextResponse.json({
    ok: true,
    community: { ...data, memberCount: count || 1 + memberUserIds.length },
  });
}
