import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedActorId, getAuthedUserId } from "@/lib/api-auth";
import { workspaceAvatarOrNull } from "@/lib/workspace-avatar";

export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let { data: workspace } = await admin
    .from("workspaces")
    .select("id, owner_id, name, avatar_url")
    .eq("id", id)
    .maybeSingle();

  // Recreate missing default / owned row so the info page can always save.
  if (!workspace && id === ownerId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("business_name, full_name")
      .eq("id", ownerId)
      .maybeSingle();
    const seedName =
      (profile?.business_name && String(profile.business_name).trim()) ||
      (profile?.full_name && String(profile.full_name).trim()) ||
      "Workspace";
    // Workspace photo is independent from the account picture: never seed it.
    const { data: created, error: createError } = await admin
      .from("workspaces")
      .upsert(
        {
          id: ownerId,
          owner_id: ownerId,
          name: seedName,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id, owner_id, name, avatar_url")
      .single();
    if (createError || !created) {
      return NextResponse.json(
        { ok: false, error: createError?.message || "Could not create workspace" },
        { status: 500 },
      );
    }
    workspace = created;
  }

  if (!workspace || workspace.owner_id !== ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.avatarUrl === null) patch.avatar_url = null;
  if (typeof body.avatarUrl === "string") {
    patch.avatar_url = workspaceAvatarOrNull(ownerId, id, body.avatarUrl.trim() || null);
  }

  const { data, error } = await admin
    .from("workspaces")
    .update(patch)
    .eq("id", id)
    .select("id, owner_id, name, avatar_url, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Workspace identity (name + photo) is intentionally independent from the
  // account profile: no sync back to profiles.business_name / avatar_url.
  return NextResponse.json({ ok: true, workspace: data });
}

export async function POST(request: Request, { params }: Params) {
  // Activate workspace
  const ownerId = await getAuthedUserId(request);
  const actorId = await getAuthedActorId(request);
  if (!ownerId || !actorId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  if (body.action !== "activate") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!workspace || workspace.owner_id !== ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await admin.from("profiles").update({ active_workspace_id: id }).eq("id", ownerId);
  return NextResponse.json({ ok: true, activeWorkspaceId: id });
}

export async function DELETE(request: Request, { params }: Params) {
  const ownerId = await getAuthedUserId(request);
  const actorId = await getAuthedActorId(request);
  if (!ownerId || !actorId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Only the owner (not delegated admin) can delete workspaces.
  if (actorId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // The default workspace shares the account id and holds legacy data.
  if (id === ownerId) {
    return NextResponse.json(
      { ok: false, error: "Cannot delete the default workspace" },
      { status: 400 },
    );
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!workspace || workspace.owner_id !== ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // workspace_id FKs are ON DELETE CASCADE: this removes the space's data too.
  const { error } = await admin.from("workspaces").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_id")
    .eq("id", ownerId)
    .maybeSingle();
  if (profile?.active_workspace_id === id) {
    await admin.from("profiles").update({ active_workspace_id: ownerId }).eq("id", ownerId);
  }

  return NextResponse.json({ ok: true });
}
