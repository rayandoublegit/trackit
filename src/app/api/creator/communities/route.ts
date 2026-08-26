import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;

  const { data: memberships, error } = await admin
    .from("community_members")
    .select("community_id, role, can_post, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    if (String(error.message || "").includes("community_members")) {
      return NextResponse.json({ ok: true, communities: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (memberships || []).map((m) => m.community_id);
  if (!ids.length) return NextResponse.json({ ok: true, communities: [] });

  const { data: communities, error: cErr } = await admin
    .from("communities")
    .select("id, brand_id, name, description, avatar_url, members_can_post, created_at")
    .in("id", ids);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const brandIds = [...new Set((communities || []).map((c) => c.brand_id))];
  const { data: brands } = brandIds.length
    ? await admin.from("profiles").select("id, business_name, full_name, username").in("id", brandIds)
    : { data: [] as { id: string; business_name: string | null; full_name: string | null; username: string | null }[] };
  const brandName = new Map(
    (brands || []).map((b) => [b.id, b.business_name || b.full_name || (b.username ? `@${b.username}` : "")]),
  );
  const memBy = new Map((memberships || []).map((m) => [m.community_id, m]));

  return NextResponse.json({
    ok: true,
    communities: (communities || []).map((c) => {
      const mem = memBy.get(c.id);
      return {
        ...c,
        brandName: brandName.get(c.brand_id) || "",
        role: mem?.role || "member",
        canPost: Boolean(mem?.can_post) && (mem?.role === "owner" || mem?.role === "admin" || c.members_can_post),
      };
    }),
  });
}
