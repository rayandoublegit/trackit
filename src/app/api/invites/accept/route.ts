import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { insertBrandNotification } from "@/lib/brand-notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  CREATOR_ROW_SYNC_SELECT,
  ensureCreatorRowForBrandLink,
  normalizeCreatorHandle,
  syncCreatorRowsByProfileHandle,
} from "@/lib/creator-account";
import { syncCreatorToDiscoverySaved, type BrandCreatorSyncRow } from "@/lib/creator-discovery-sync";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";

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

  const { data: brand } = await supabase
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", invite.brand_id)
    .maybeSingle();

  const brandName = brand?.business_name || brand?.full_name || (brand?.username ? `@${brand.username}` : "this brand");
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

  const profileUpdate: Record<string, unknown> = {
    account_type: "creator",
    onboarding_completed: true,
    username: socialHandle,
  };
  if (fullName) profileUpdate.full_name = fullName;
  const { error: profErr } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", creatorId);
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });

  const { error: linkErr } = await supabase
    .from("creator_links")
    .upsert(
      {
        creator_id: creatorId,
        brand_id: invite.brand_id,
        invite_id: invite.id,
        status: CREATOR_LINK_STATUS.pendingReview,
      },
      { onConflict: "creator_id,brand_id" }
    );
  if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });

  const handle = socialHandle;
  let creatorRowId: string | null = null;
  const brandWorkspaceId = await resolveOwnerActiveWorkspaceId(supabase, invite.brand_id);

  if (handle) {
    let existingQuery = supabase
      .from("creators")
      .select("id, handle")
      .eq("user_id", invite.brand_id);
    if (brandWorkspaceId) existingQuery = existingQuery.eq("workspace_id", brandWorkspaceId);
    const { data: existingRows } = await existingQuery;
    const existing =
      (existingRows ?? []).find((row) => normalizeCreatorHandle(row.handle) === handle) ?? null;

    if (existing) {
      await supabase
        .from("creators")
        .update({ linked_user_id: creatorId, full_name: fullName || undefined, needs_review: true })
        .eq("id", existing.id);
      creatorRowId = existing.id;
    } else {
      const insertRow: Record<string, unknown> = {
        user_id: invite.brand_id,
        handle,
        full_name: fullName || handle,
        linked_user_id: creatorId,
        platform: "tiktok",
        commission_rate: 10,
        needs_review: true,
      };
      if (brandWorkspaceId) insertRow.workspace_id = brandWorkspaceId;
      const { data: inserted, error: insertErr } = await supabase
        .from("creators")
        .insert(insertRow)
        .select("id")
        .single();
      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
      creatorRowId = inserted?.id ?? null;
    }
  }

  if (!creatorRowId) {
    const ensured = await ensureCreatorRowForBrandLink(supabase, invite.brand_id, creatorId, {
      username: socialHandle || null,
      full_name: fullName || null,
    });
    creatorRowId = ensured?.id ?? null;
  }

  if (creatorRowId) {
    const { data: creatorForSync } = await supabase
      .from("creators")
      .select(CREATOR_ROW_SYNC_SELECT)
      .eq("id", creatorRowId)
      .eq("user_id", invite.brand_id)
      .maybeSingle();
    if (creatorForSync) {
      const syncErr = await syncCreatorToDiscoverySaved(
        supabase,
        invite.brand_id,
        creatorForSync as BrandCreatorSyncRow,
        { pipelineStatus: "signed", workspaceId: brandWorkspaceId },
      );
      if (syncErr) return NextResponse.json({ ok: false, error: syncErr.message }, { status: 500 });
    }
  }

  await supabase
    .from("creator_invites")
    .update({ status: "used", used_at: new Date().toISOString(), used_by: creatorId })
    .eq("id", invite.id);

  await syncCreatorRowsByProfileHandle(supabase, creatorId, {
    username: socialHandle,
    full_name: fullName || null,
  });

  await insertBrandNotification(supabase, invite.brand_id, "creator_joined", {
    creatorName: fullName || `@${socialHandle.replace(/^@/, "")}`,
    handle: socialHandle,
  });

  return NextResponse.json({ ok: true, brandId: invite.brand_id, handle: socialHandle });
}
