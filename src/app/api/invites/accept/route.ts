import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCreatorHandle } from "@/lib/creator-account";
import { joinCreatorToBrand, notifyCreatorJoined, publicBrandName } from "@/lib/creator-brand-join";

export const dynamic = "force-dynamic";

// Valide un token d'invitation. GET = lire les infos (qui invite), POST = relier un créateur.
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") || "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const { data: invite } = await supabase
    .from("creator_invites")
    .select("id, brand_id, status")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 404 });
  if (invite.status === "revoked") return NextResponse.json({ ok: false, error: "Invite revoked" }, { status: 410 });

  const brandName = (await publicBrandName(supabase, invite.brand_id)) || "this brand";
  return NextResponse.json({ ok: true, brandName, brandId: invite.brand_id });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  let body: { token?: string; creatorId?: string; fullName?: string; socialHandle?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 }); }

  const token = (body.token || "").trim();
  const access = await requireActorAccess(req, body.creatorId);
  if ("error" in access) return access.error;
  const creatorId = access.actorId;
  const fullName = (body.fullName || "").trim();
  const socialHandle = normalizeCreatorHandle(body.socialHandle);
  if (!token || !creatorId) return NextResponse.json({ ok: false, error: "Missing token or creatorId" }, { status: 400 });
  if (!socialHandle) return NextResponse.json({ ok: false, error: "Missing social handle" }, { status: 400 });

  const { data: invite } = await supabase
    .from("creator_invites")
    .select("id, brand_id, status")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 404 });
  if (invite.status === "revoked") return NextResponse.json({ ok: false, error: "Invite revoked" }, { status: 410 });

  const joined = await joinCreatorToBrand(supabase, {
    brandId: invite.brand_id,
    creatorId,
    socialHandle,
    fullName,
    inviteId: invite.id,
  });
  if (!joined.ok) return NextResponse.json({ ok: false, error: joined.error }, { status: 500 });

  await supabase
    .from("creator_invites")
    .update({ status: "used", used_at: new Date().toISOString(), used_by: creatorId })
    .eq("id", invite.id);

  await notifyCreatorJoined(supabase, invite.brand_id, socialHandle, fullName || null);

  return NextResponse.json({ ok: true, brandId: invite.brand_id, handle: socialHandle });
}
