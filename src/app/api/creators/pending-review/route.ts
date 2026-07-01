import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { accountEmailForLinkedUser } from "@/lib/linked-creator-emails";

export const dynamic = "force-dynamic";

type CreatorRow = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  commission_rate: number | null;
  discount_code: string | null;
  niche: string | null;
  followers: number | null;
  engagement_rate: number | null;
  linked_user_id: string | null;
};

async function syncCreatorToDiscoverySaved(brandId: string, creator: CreatorRow) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!username) return null;

  const { data: existing } = await admin
    .from("discovery_saved")
    .select("snapshot, pipeline_status, notes")
    .eq("user_id", brandId)
    .eq("creator_username", username)
    .maybeSingle();

  const prevSnap =
    existing?.snapshot && typeof existing.snapshot === "object"
      ? (existing.snapshot as Record<string, unknown>)
      : {};
  const prevCrm =
    prevSnap.crm && typeof prevSnap.crm === "object"
      ? (prevSnap.crm as Record<string, unknown>)
      : {};

  const platform = creator.platform ?? "tiktok";
  const followers = Number(creator.followers ?? 0) || 0;
  const engagementRate = Number(creator.engagement_rate ?? 0) || 0;
  const niche = creator.niche ?? "";
  const displayName = creator.full_name?.trim() || username;
  const avatarUrl = creator.avatar_url ?? "";
  const commissionRate = creator.commission_rate ?? 10;
  const promoCode = creator.discount_code?.trim() ?? "";
  const accountEmail = await accountEmailForLinkedUser(admin, creator.linked_user_id);

  const snapshot: Record<string, unknown> = {
    ...prevSnap,
    username,
    displayName,
    avatarUrl,
    platform,
    followersCount: followers,
    engagementRate,
    primaryNiche: niche,
    niche,
    commissionRate,
    trackitCreatorId: creator.id,
    linkedUserId: creator.linked_user_id,
    ...(accountEmail ? { accountEmail } : {}),
    crm: {
      ...prevCrm,
      ...(promoCode ? { promoCode } : {}),
    },
  };

  const { error } = await admin.from("discovery_saved").upsert(
    {
      user_id: brandId,
      creator_username: username,
      platform,
      display_name: displayName,
      avatar_url: avatarUrl,
      followers,
      engagement_rate: engagementRate,
      primary_niche: niche,
      snapshot,
      pipeline_status: existing?.pipeline_status ?? "signed",
      notes: existing?.notes ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,creator_username" }
  );

  return error;
}

async function addCreatorToFolder(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  brandId: string,
  folderId: string,
  username: string
) {
  const { data: folder } = await admin
    .from("discovery_folders")
    .select("id")
    .eq("id", folderId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (!folder) return new Error("List not found");

  const { error } = await admin.from("discovery_folder_items").upsert(
    { folder_id: folderId, creator_username: username },
    { onConflict: "folder_id,creator_username", ignoreDuplicates: true }
  );
  return error;
}

// GET : liste les créateurs récemment arrivés (needs_review = true) pour cette marque
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, creators: [] });

  const { data, error } = await admin
    .from("creators")
    .select("id, handle, full_name, avatar_url, platform, commission_rate, discount_code")
    .eq("user_id", brandId)
    .eq("needs_review", true)
    .order("id", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, creators: data || [] });
}

// POST : la marque valide/complète un créateur -> needs_review = false + champs
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const brandId = (body?.brandId as string | undefined)?.trim();
  const creatorId = (body?.creatorId as string | undefined)?.trim();
  const commissionRate = body?.commissionRate;
  const discountCode = (body?.discountCode as string | undefined)?.trim() || null;
  const platform = (body?.platform as string | undefined)?.trim() || null;
  const avatarUrl = (body?.avatarUrl as string | undefined)?.trim() || null;
  const niche = (body?.niche as string | undefined)?.trim() || null;
  const followers = body?.followers;
  const engagement = body?.engagement;
  const folderId = (body?.folderId as string | undefined)?.trim() || null;
  if (!brandId || !creatorId) return NextResponse.json({ error: "Missing brandId or creatorId" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const update: Record<string, unknown> = { needs_review: false };
  if (commissionRate !== undefined && commissionRate !== null && commissionRate !== "") update.commission_rate = Number(commissionRate);
  if (discountCode) update.discount_code = discountCode;
  if (platform) update.platform = platform;
  if (avatarUrl) update.avatar_url = avatarUrl;
  if (niche) update.niche = niche;
  if (followers !== undefined && followers !== null && followers !== "") update.followers = Number(followers);
  if (engagement !== undefined && engagement !== null && engagement !== "") update.engagement_rate = Number(engagement);

  const { error } = await admin
    .from("creators")
    .update(update)
    .eq("id", creatorId)
    .eq("user_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: creator, error: fetchErr } = await admin
    .from("creators")
    .select("id, handle, full_name, avatar_url, platform, commission_rate, discount_code, niche, followers, engagement_rate, linked_user_id")
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (creator) {
    const syncErr = await syncCreatorToDiscoverySaved(brandId, creator as CreatorRow);
    if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });
    if (folderId) {
      const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
      const folderErr = await addCreatorToFolder(admin, brandId, folderId, username);
      if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE : la marque ignore le pop-up sans rien changer (juste needs_review = false)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creatorId");
  const brandId = searchParams.get("brandId");
  if (!creatorId || !brandId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await admin
    .from("creators")
    .update({ needs_review: false })
    .eq("id", creatorId)
    .eq("user_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
