import { NextRequest, NextResponse } from "next/server";
import { getAuthedActorId, requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: community } = await admin.from("communities").select("id, brand_id").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const brandAccess = await requireWorkspaceAccess(request, community.brand_id);
  const isBrand = !("error" in brandAccess);
  if (!isBrand) {
    const { data: membership } = await admin
      .from("community_members")
      .select("user_id")
      .eq("community_id", id)
      .eq("user_id", actorId)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: members } = await admin
    .from("community_members")
    .select("user_id, role, can_post, joined_at")
    .eq("community_id", id)
    .order("joined_at", { ascending: true });

  const userIds = (members || []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name, username, avatar_url, business_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null; username: string | null; avatar_url: string | null; business_name: string | null }[] };
  const profileBy = new Map((profiles || []).map((p) => [p.id, p]));

  return NextResponse.json({
    ok: true,
    members: (members || []).map((m) => {
      const p = profileBy.get(m.user_id);
      return {
        userId: m.user_id,
        role: m.role,
        canPost: m.can_post,
        joinedAt: m.joined_at,
        name: p?.business_name || p?.full_name || (p?.username ? `@${p.username}` : m.user_id),
        username: p?.username || null,
        avatarUrl: p?.avatar_url || null,
      };
    }),
  });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: community } = await admin.from("communities").select("id, brand_id, members_can_post").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireWorkspaceAccess(request, community.brand_id);
  if ("error" in access) return access.error;

  const userId = String(body?.userId || "").trim();
  const role = body?.role === "admin" ? "admin" : "member";
  const canPost =
    typeof body?.canPost === "boolean" ? body.canPost : community.members_can_post !== false;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Must be a linked creator (or the brand itself).
  if (userId !== community.brand_id) {
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", community.brand_id)
      .eq("linked_user_id", userId)
      .maybeSingle();
    if (!creator) {
      return NextResponse.json(
        { error: "User must have an active creator dashboard linked to this brand" },
        { status: 400 },
      );
    }
  }

  const { error } = await admin.from("community_members").upsert(
    {
      community_id: id,
      user_id: userId,
      role: userId === community.brand_id ? "owner" : role,
      can_post: userId === community.brand_id ? true : canPost,
    },
    { onConflict: "community_id,user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: community } = await admin.from("communities").select("id, brand_id").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireWorkspaceAccess(request, community.brand_id);
  if ("error" in access) return access.error;

  const userId = String(body?.userId || "").trim();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (userId === community.brand_id) {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body?.role === "admin" || body?.role === "member") updates.role = body.role;
  if (typeof body?.canPost === "boolean") updates.can_post = body.canPost;
  // Admins can always post — keep flag in sync with role.
  if (updates.role === "admin") updates.can_post = true;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: updated, error } = await admin
    .from("community_members")
    .update(updates)
    .eq("community_id", id)
    .eq("user_id", userId)
    .select("role, can_post")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    role: updated?.role ?? updates.role,
    canPost: updated?.can_post ?? updates.can_post,
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
  const { data: community } = await admin.from("communities").select("id, brand_id").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireWorkspaceAccess(request, community.brand_id);
  if ("error" in access) return access.error;
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (userId === community.brand_id) {
    return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });
  }

  const { error } = await admin
    .from("community_members")
    .delete()
    .eq("community_id", id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
