import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUserId } from "@/lib/api-auth";
import { workspaceMarkObjectPath } from "@/lib/workspace-avatar";

export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Params = { params: Promise<{ id: string }> };

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

async function loadOwnedWorkspace(ownerId: string, id: string) {
  const { data } = await admin
    .from("workspaces")
    .select("id, owner_id, name, avatar_url, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.owner_id !== ownerId) return null;
  return data;
}

export async function POST(request: Request, { params }: Params) {
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workspace = await loadOwnedWorkspace(ownerId, id);
  if (!workspace) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1) {
    return NextResponse.json({ ok: false, error: "Image required" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Image too large" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeExt = ALLOWED_EXT.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
  const path = workspaceMarkObjectPath(id, safeExt);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from("avatars").upload(path, bytes, {
    upsert: true,
    cacheControl: "0",
    contentType: file.type || `image/${safeExt === "jpg" ? "jpeg" : safeExt}`,
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;
  if (!avatarUrl) {
    return NextResponse.json({ ok: false, error: "Could not build image URL" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("workspaces")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id, owner_id, name, avatar_url, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workspace: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const ownerId = await getAuthedUserId(request);
  if (!ownerId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workspace = await loadOwnedWorkspace(ownerId, id);
  if (!workspace) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data, error } = await admin
    .from("workspaces")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id, owner_id, name, avatar_url, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workspace: data });
}
