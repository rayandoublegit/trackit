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
import { settleNewContentRpm } from "@/lib/rpm";
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

  const { data: creatorProfile } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle();
  const creatorHandle = String(creatorProfile?.username || "")
    .replace(/^@+/, "")
    .trim();
  const creatorDisplayName = String(creatorProfile?.full_name || "").trim() || null;

  const result = (items || []).map((item) => ({
    ...item,
    brandName: brandName.get(item.brand_id) || "",
    creatorHandle: creatorHandle || null,
    creatorName: creatorDisplayName,
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
  const titleRaw = (body?.title as string | undefined)?.trim() || "";
  const notes = (body?.notes as string | undefined)?.trim() || null;
  const fileUrlRaw = (body?.fileUrl as string | undefined)?.trim() || "";
  const fileNameRaw = (body?.fileName as string | undefined)?.trim() || "";
  const fileType = (body?.fileType as string | undefined)?.trim() || null;
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : null;

  if (!userId) {
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

  // Performance-by-content: TikTok post URL required to fetch views / engagement.
  const rawPostUrl = typeof body.postUrl === "string" ? body.postUrl.trim() : "";
  if (!rawPostUrl) {
    return NextResponse.json(
      { error: "TikTok post URL is required to track views" },
      { status: 400 },
    );
  }
  if (!/tiktok\.com\//i.test(rawPostUrl)) {
    return NextResponse.json(
      { error: "URL must be a TikTok link (tiktok.com)" },
      { status: 400 },
    );
  }
  const postUrl = rawPostUrl;

  const hookIdRaw = typeof body?.hookId === "string" ? body.hookId.trim() : "";
  if (!hookIdRaw) {
    return NextResponse.json({ error: "Hook is required" }, { status: 400 });
  }
  const { data: hookRow, error: hookErr } = await admin
    .from("hooks")
    .select("id")
    .eq("id", hookIdRaw)
    .eq("brand_id", targetBrandId)
    .maybeSingle();
  if (hookErr) return NextResponse.json({ error: hookErr.message }, { status: 500 });
  if (!hookRow) return NextResponse.json({ error: "Hook not found" }, { status: 400 });
  const hookId = hookRow.id;

  // Auto-title when the creator skips details: Contenu numéro N
  let title = titleRaw;
  if (!title) {
    const { count } = await admin
      .from("creator_content")
      .select("id", { count: "exact", head: true })
      .eq("creator_user_id", userId)
      .eq("creator_row_id", targetCreatorRowId);
    const nextNum = (count ?? 0) + 1;
    title = `Contenu numéro ${nextNum}`;
  }

  // File is optional — URL-only posts store the TikTok link as the media ref.
  const fileUrl = fileUrlRaw || postUrl;
  const fileName = fileNameRaw || "tiktok-post.url";
  const resolvedFileType = fileUrlRaw ? fileType : "text/uri-list";
  const resolvedFileSize = fileUrlRaw ? fileSize : null;

  let stats: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    postedAt: string | null;
  };
  try {
    stats = parseVideoStats(await fetchTikTokVideoRaw(postUrl));
  } catch (e) {
    console.error("post stats fetch failed:", (e as Error).message);
    return NextResponse.json(
      {
        error:
          "Impossible de récupérer les stats TikTok (ScrapeCreators). Vérifiez l’URL et réessayez.",
        detail: (e as Error).message,
      },
      { status: 502 },
    );
  }
  if (stats.views == null || !Number.isFinite(Number(stats.views))) {
    return NextResponse.json(
      { error: "ScrapeCreators n’a pas renvoyé de vues pour cette URL." },
      { status: 502 },
    );
  }
  const views = Math.max(0, Math.floor(Number(stats.views)));

  const insertPayload: Record<string, unknown> = {
    brand_id: targetBrandId,
    post_url: postUrl,
    views,
    likes: stats.likes ?? null,
    comments: stats.comments ?? null,
    shares: stats.shares ?? null,
    posted_at: stats.postedAt ?? null,
    stats_updated_at: new Date().toISOString(),
    creator_row_id: targetCreatorRowId,
    creator_user_id: userId,
    title,
    notes,
    file_url: fileUrl,
    file_name: fileName,
    file_type: resolvedFileType,
    file_size: resolvedFileSize,
    hook_id: hookId,
  };

  let { data, error } = await admin.from("creator_content").insert(insertPayload).select("id").single();
  if (error?.message?.includes("hook_id") && hookId) {
    delete insertPayload.hook_id;
    const retry = await admin.from("creator_content").insert(insertPayload).select("id").single();
    data = retry.data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  const syncErr = await syncContentRefToDiscoverySaved(admin, targetBrandId, targetCreatorRowId, {
    id: data.id,
    title,
  });
  if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });

  const campaignSyncErr = await backfillCreatorContentToCampaigns(admin, targetBrandId, targetCreatorRowId);
  if (campaignSyncErr) {
    console.error("campaign content sync failed:", campaignSyncErr.message);
  }

  // Credit RPM from scraped views → creator balance (baseline 0 so current views count).
  const rpm = await settleNewContentRpm(admin, {
    brandId: targetBrandId,
    creatorRowId: targetCreatorRowId,
    contentId: data.id,
    views,
  });
  if (rpm.error) {
    console.error("rpm settle on upload failed:", rpm.error);
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
    stats: {
      views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      postedAt: stats.postedAt,
    },
    rpm: {
      amount: rpm.amount,
      rpmRate: rpm.rpmRate,
      linked: rpm.linked,
    },
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
