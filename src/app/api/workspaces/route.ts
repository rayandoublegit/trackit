import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedActorId, getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function ensureDefaultWorkspace(ownerId: string) {
  const { data: existing } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("business_name, full_name")
    .eq("id", ownerId)
    .maybeSingle();

  // Seed the name from the profile as a starting value only; the workspace
  // photo stays independent from the account picture (no avatar copy).
  const name =
    (profile?.business_name && String(profile.business_name).trim()) ||
    (profile?.full_name && String(profile.full_name).trim()) ||
    "Workspace";

  await admin.from("workspaces").upsert(
    {
      id: ownerId,
      owner_id: ownerId,
      name,
      avatar_url: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  await admin.from("profiles").update({ active_workspace_id: ownerId }).eq("id", ownerId);
}

export async function GET(request: Request) {
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  await ensureDefaultWorkspace(ownerId);

  const { data, error } = await admin
    .from("workspaces")
    .select("id, owner_id, name, avatar_url, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // One-time cleanup: older default workspaces were seeded with the account
  // profile picture (same storage file), which kept them visually linked.
  // The account file lives at `avatars/${ownerId}/avatar.*`; workspace photos
  // live at `avatars/${ownerId}/workspaces/${workspaceId}/avatar.*`. Anchor on
  // the bucket segment so a default workspace's own photo (workspaceId ===
  // ownerId) is never mistaken for the account picture.
  const legacyMarker = `/avatars/${ownerId}/avatar.`;
  const workspaces = (data || []).map((w) =>
    w.avatar_url && w.avatar_url.includes(legacyMarker) ? { ...w, avatar_url: null } : w,
  );
  const legacyIds = (data || [])
    .filter((w) => w.avatar_url && w.avatar_url.includes(legacyMarker))
    .map((w) => w.id);
  if (legacyIds.length > 0) {
    await admin.from("workspaces").update({ avatar_url: null }).in("id", legacyIds);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_id")
    .eq("id", ownerId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    workspaces,
    activeWorkspaceId: profile?.active_workspace_id || ownerId,
  });
}

export async function POST(request: Request) {
  const ownerId = await getAuthedUserId(request);
  const actorId = await getAuthedActorId(request);
  if (!ownerId || !actorId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Only the owner (not delegated admin) can create workspaces for now.
  if (actorId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  await ensureDefaultWorkspace(ownerId);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("workspaces")
    .insert({
      owner_id: ownerId,
      name,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .select("id, owner_id, name, avatar_url, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await admin
    .from("profiles")
    .update({ active_workspace_id: data.id })
    .eq("id", ownerId);

  return NextResponse.json({ ok: true, workspace: data });
}
