import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Verify the folder belongs to the user before mutating its items.
async function ownsFolder(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string, folderId: string) {
  const { data } = await admin.from("discovery_folders").select("id").eq("id", folderId).eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { folderId?: string; creatorUsername?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const folderId = String(body.folderId ?? "");
  const username = String(body.creatorUsername ?? "").trim().replace(/^@/, "");
  if (!folderId || !username) return NextResponse.json({ error: "Missing folderId or creator" }, { status: 400 });
  if (!(await ownsFolder(admin, userId, folderId))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await admin
    .from("discovery_folder_items")
    .upsert({ folder_id: folderId, creator_username: username }, { onConflict: "folder_id,creator_username", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId") ?? "";
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "") ?? "";
  if (!folderId || !username) return NextResponse.json({ error: "Missing folderId or username" }, { status: 400 });
  if (!(await ownsFolder(admin, userId, folderId))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await admin
    .from("discovery_folder_items")
    .delete()
    .eq("folder_id", folderId)
    .eq("creator_username", username);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
