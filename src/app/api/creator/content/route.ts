import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { insertBrandNotification, resolveCreatorDisplayName } from "@/lib/brand-notifications";
import { fetchTikTokVideoRaw, parseVideoStats } from "@/lib/scrapecreators";
import { findCreatorRowsForProfile, resolveCreatorUploadTarget } from "@/lib/creator-account";
import { syncContentRefToDiscoverySaved } from "@/lib/content-creator-sync";
import { backfillCreatorContentToCampaigns } from "@/lib/content-campaign-sync";
import {
  CREATOR_CONTENT_MAX_FILE_BYTES,
  CREATOR_CONTENT_MAX_FILE_LABEL,
} from "@/lib/content-upload-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildTrackitShortLink } from "@/lib/affiliate-short-link";

export const dynamic = "force-dynamic";

// GET — list content uploaded by this creator + brands they can upload to
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const linkCheck = await resolveCreatorUploadTarget(admin, userId);
  const { rows } = await findCreatorRowsForProfile(admin, userId);
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      items: [],
      brands: [],
      linkError: "error" in linkCheck ? linkCheck.error : "No brand linked",
    });
  }

  const creatorRowIds = rows.map((r) => r.id);
  const brandIds = [...new Set(rows.map((r) => r.user_id))];

  const { data: items, error } = await admin
    .from("creator_content")
    .select(
      "id, brand_id, creator_row_id, title, notes, file_url, file_name, file_type, file_size, created_at, post_url, views, likes, comments, shares, posted_at, stats_updated_at",
    )
    .eq("creator_user_id", userId)
    .in("creator_row_id", creatorRowIds)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: brands } = await admin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map(
    (brands || []).map((b) => [b.id, b.business_name || b.full_name || (b.username ? `@${b.username}` : "")]),
  );

  const result = (items || []).map((item) => ({
    ...item,
    brandName: brandName.get(item.brand_id) || "",
  }));

  const contentIds = (items || []).map((item) => item.id);
  const linkByContent = new Map<string, string>();
  if (contentIds.length) {
    const { data: linkRows } = await admin
      .from("affiliate_links")
      .select("content_id, slug, destination_url")
      .in("content_id", contentIds)
      .eq("active", true);
    for (const row of linkRows || []) {
      if (row.content_id && row.slug) {
        linkByContent.set(
          String(row.content_id),
          buildTrackitShortLink(String(row.slug), row.destination_url ? String(row.destination_url) : null),
        );
      }
    }
  }

  const withLinks = result.map((item) => ({
    ...item,
    linkUrl: linkByContent.get(item.id) ?? null,
  }));

  const brandOptions = brandIds.map((id) => ({
    id,
    name: brandName.get(id) || id,
    creatorRowId: rows.find((r) => r.user_id === id)?.id ?? null,
  }));

  return NextResponse.json({ ok: true, items: withLinks, brands: brandOptions });
}

// POST — register uploaded content (files uploaded client-side to storage first)
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const access = await requireActorAccess(request, body?.userId);
  if ("error" in access) return access.error;
  const userId = access.actorId;
  const brandId = (body?.brandId as string | undefined)?.trim() || null;
  const creatorRowId = (body?.creatorRowId as string | undefined)?.trim() || null;
  const title = (body?.title as string | undefined)?.trim();
  const notes = (body?.notes as string | undefined)?.trim() || null;
  const fileUrl = (body?.fileUrl as string | undefined)?.trim();
  const fileName = (body?.fileName as string | undefined)?.trim();
  const fileType = (body?.fileType as string | undefined)?.trim() || null;
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : null;

  if (!userId || !title || !fileUrl || !fileName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (fileSize != null && fileSize > CREATOR_CONTENT_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum ${CREATOR_CONTENT_MAX_FILE_LABEL}.` },
      { status: 413 }
    );
  }

  const resolved = await resolveCreatorUploadTarget(admin, userId, brandId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 403 });
  }

  const targetBrandId = brandId || resolved.target.brandId;
  const targetCreatorRowId = creatorRowId || resolved.target.creatorRowId;

  const { rows } = await findCreatorRowsForProfile(admin, userId);
  const match = rows.find((r) => r.id === targetCreatorRowId && r.user_id === targetBrandId);
  if (!match) {
    return NextResponse.json({ error: "Creator not linked to brand" }, { status: 403 });
  }

  // Performance-by-content: creator may submit the TikTok post URL.
  const postUrl = typeof body.postUrl === "string" && /tiktok\.com\//.test(body.postUrl) ? body.postUrl.trim() : null;
  let stats: { views: number | null; likes: number | null; comments: number | null; shares: number | null; postedAt: string | null } | null = null;
  if (postUrl) {
    try {
      stats = parseVideoStats(await fetchTikTokVideoRaw(postUrl));
    } catch (e) {
      // No credits / API down: store the URL anyway, stats stay pending.
      console.error("post stats fetch skipped:", (e as Error).message);
    }
  }

  const { data, error } = await admin
    .from("creator_content")
    .insert({
      brand_id: targetBrandId,
      post_url: postUrl,
      views: stats?.views ?? null,
      likes: stats?.likes ?? null,
      comments: stats?.comments ?? null,
      shares: stats?.shares ?? null,
      posted_at: stats?.postedAt ?? null,
      stats_updated_at: stats ? new Date().toISOString() : null,
      creator_row_id: targetCreatorRowId,
      creator_user_id: userId,
      title,
      notes,
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const syncErr = await syncContentRefToDiscoverySaved(admin, targetBrandId, targetCreatorRowId, {
    id: data.id,
    title,
  });
  if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });

  const campaignSyncErr = await backfillCreatorContentToCampaigns(admin, targetBrandId, targetCreatorRowId);
  if (campaignSyncErr) {
    console.error("campaign content sync failed:", campaignSyncErr.message);
  }

  const creatorName = await resolveCreatorDisplayName(admin, userId);
  await insertBrandNotification(admin, targetBrandId, "content_uploaded", {
    creatorName,
    title,
    fileName,
  });

  return NextResponse.json({
    ok: true,
    id: data.id,
    brandId: targetBrandId,
    creatorRowId: targetCreatorRowId,
  });
}

// DELETE — creator removes own content
export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  if (!id || !userId) return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });

  const { error } = await admin
    .from("creator_content")
    .delete()
    .eq("id", id)
    .eq("creator_user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
