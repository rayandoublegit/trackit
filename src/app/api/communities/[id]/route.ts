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

  const { data: community, error } = await admin
    .from("communities")
    .select("id, brand_id, name, description, avatar_url, members_can_post, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const brandAccess = await requireWorkspaceAccess(request, community.brand_id);
  const isBrand = !("error" in brandAccess);

  const { data: membership } = await admin
    .from("community_members")
    .select("role, can_post")
    .eq("community_id", id)
    .eq("user_id", actorId)
    .maybeSingle();

  if (!membership && !isBrand) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: members } = await admin
    .from("community_members")
    .select("user_id, role, can_post, joined_at")
    .eq("community_id", id)
    .order("joined_at", { ascending: true });

  const userIds = (members || []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name, username, avatar_url, business_name").in("id", userIds)
    : {
        data: [] as {
          id: string;
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
          business_name: string | null;
        }[],
      };
  const profileBy = new Map((profiles || []).map((p) => [p.id, p]));

  const role = membership?.role || (isBrand ? "owner" : "member");
  const canPost =
    isBrand ||
    role === "owner" ||
    role === "admin" ||
    Boolean(membership?.can_post);

  return NextResponse.json({
    ok: true,
    community,
    membership: { role, canPost },
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

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: community } = await admin.from("communities").select("id, brand_id").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireWorkspaceAccess(request, community.brand_id);
  if ("error" in access) return access.error;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.description === "string") updates.description = body.description.trim() || null;
  if (typeof body?.avatarUrl === "string") updates.avatar_url = body.avatarUrl.trim() || null;
  if (typeof body?.membersCanPost === "boolean") updates.members_can_post = body.membersCanPost;

  const { data, error } = await admin
    .from("communities")
    .update(updates)
    .eq("id", id)
    .select("id, brand_id, name, description, avatar_url, members_can_post, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync default speak permission onto non-admin members when the brand toggles it.
  if (typeof body?.membersCanPost === "boolean") {
    await admin
      .from("community_members")
      .update({ can_post: body.membersCanPost })
      .eq("community_id", id)
      .eq("role", "member");
  }

  return NextResponse.json({ ok: true, community: data });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { id } = await ctx.params;
  const { data: community } = await admin.from("communities").select("id, brand_id").eq("id", id).maybeSingle();
  if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireWorkspaceAccess(request, community.brand_id);
  if ("error" in access) return access.error;

  const { error } = await admin.from("communities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
