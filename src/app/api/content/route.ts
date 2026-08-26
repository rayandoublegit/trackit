import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import {
  backfillCampaignContent,
  backfillCreatorContentToCampaigns,
  loadBrandContentForCreators,
  resolveCampaignContentIds,
  resolveCreatorRowIdsByHandle,
} from "@/lib/content-campaign-sync";
import {
  backfillDiscoveryContentRefs,
  removeContentRefFromDiscoverySaved,
  syncContentRefToDiscoverySaved,
} from "@/lib/content-creator-sync";
import {
  CONTENT_LIST_SELECT,
  CONTENT_STATS_SELECT,
  type ContentListItem,
} from "@/lib/content-shared";
import {
  CREATOR_CONTENT_MAX_FILE_BYTES,
  CREATOR_CONTENT_MAX_FILE_LABEL,
} from "@/lib/content-upload-limits";
import { fetchTikTokVideoRaw, parseVideoStats } from "@/lib/scrapecreators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function enrichContentItems(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  brandId: string,
  rows: Record<string, unknown>[],
): Promise<ContentListItem[]> {
  const creatorIds = [...new Set(rows.map((r) => r.creator_row_id).filter(Boolean))] as string[];
  const contentIds = rows.map((r) => String(r.id));

  const { data: creators } = creatorIds.length
    ? await admin.from("creators").select("id, handle, full_name").in("id", creatorIds)
    : { data: [] as { id: string; handle: string | null; full_name: string | null }[] };

  const nameById = new Map(
    (creators || []).map((c) => [
      c.id,
      {
        name: c.full_name || (c.handle ? `@${c.handle.replace(/^@/, "")}` : ""),
        handle: c.handle?.replace(/^@/, "") ?? "",
      },
    ]),
  );

  const { data: campaignLinks } = contentIds.length
    ? await admin
        .from("campaign_content")
        .select("content_id, campaign_id")
        .eq("brand_id", brandId)
        .in("content_id", contentIds)
    : { data: [] as { content_id: string; campaign_id: string }[] };

  const campaignIds = [...new Set((campaignLinks || []).map((l) => l.campaign_id))];
  const { data: campaigns } = campaignIds.length
    ? await admin.from("campaigns").select("id, name").in("id", campaignIds)
    : { data: [] as { id: string; name: string }[] };
  const campaignNameById = new Map((campaigns || []).map((c) => [c.id, c.name]));

  const campaignsByContent = new Map<string, string[]>();
  for (const link of campaignLinks || []) {
    const name = campaignNameById.get(link.campaign_id);
    if (!name) continue;
    const list = campaignsByContent.get(link.content_id) ?? [];
    if (!list.includes(name)) list.push(name);
    campaignsByContent.set(link.content_id, list);
  }

  const hookIds = [
    ...new Set(rows.map((r) => (r.hook_id ? String(r.hook_id) : null)).filter(Boolean)),
  ] as string[];
  const { data: hooks } = hookIds.length
    ? await admin.from("hooks").select("id, title").in("id", hookIds)
    : { data: [] as { id: string; title: string }[] };
  const hookTitleById = new Map((hooks || []).map((h) => [h.id, h.title]));

  return rows.map((item) => {
    const meta = item.creator_row_id ? nameById.get(String(item.creator_row_id)) : null;
    const hookIdValue = item.hook_id ? String(item.hook_id) : null;
    return {
      ...(item as unknown as ContentListItem),
      creatorName: meta?.name || null,
      creatorHandle: meta?.handle || null,
      campaignNames: campaignsByContent.get(String(item.id)) ?? [],
      hook_id: hookIdValue,
      hookTitle: hookIdValue ? hookTitleById.get(hookIdValue) || null : null,
    } satisfies ContentListItem;
  }) as ContentListItem[];
}

// GET — brand lists content (optionally by creator handle, campaign, hook, search, quality)
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const requestedBrandId = searchParams.get("brandId");
  const targetHandle = searchParams.get("targetHandle")?.trim().replace(/^@/, "") || null;
  const campaignId = searchParams.get("campaignId")?.trim() || null;
  const hookId = searchParams.get("hookId")?.trim() || null;
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const quality = searchParams.get("quality")?.trim().toLowerCase() || ""; // "" | "top" | "with-stats"
  const sort = searchParams.get("sort")?.trim().toLowerCase() || "recent"; // recent | views
  if (!requestedBrandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });
  const access = await requireWorkspaceAccess(request, requestedBrandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;

  const applyClientFilters = (items: ContentListItem[]) => {
    let next = items;
    if (hookId) {
      next = next.filter((item) => String(item.hook_id || "") === hookId);
    }
    if (q) {
      next = next.filter((item) => {
        const hay = [
          item.title,
          item.notes,
          item.hookTitle,
          item.creatorName,
          item.creatorHandle,
          ...(item.campaignNames || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (quality === "with-stats") {
      next = next.filter((item) => (item.views ?? 0) > 0 || Boolean(item.post_url));
    } else if (quality === "top") {
      const scored = next
        .map((item) => ({ item, views: item.views ?? 0 }))
        .filter((row) => row.views > 0)
        .sort((a, b) => b.views - a.views);
      if (scored.length === 0) {
        next = [];
      } else {
        const cutoff = Math.max(1, Math.ceil(scored.length * 0.25));
        const minViews = scored[Math.min(cutoff, scored.length) - 1]?.views ?? 1;
        next = scored.filter((row) => row.views >= minViews).map((row) => row.item);
      }
    }
    if (sort === "views") {
      next = [...next].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    }
    return next;
  };

  if (campaignId) {
    const { ids: contentIds, error: resolveErr } = await resolveCampaignContentIds(admin, brandId, campaignId);
    if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });
    if (contentIds.length === 0) return NextResponse.json({ ok: true, items: [] });

    let query = admin
      .from("creator_content")
      .select(CONTENT_LIST_SELECT)
      .eq("brand_id", brandId)
      .in("id", contentIds)
      .order("created_at", { ascending: false });
    if (hookId) query = query.eq("hook_id", hookId);

    const { data, error } = await query;
    if (error) {
      // Graceful if hook_id migration not applied yet.
      if (String(error.message || "").includes("hook_id")) {
        const fallback = await admin
          .from("creator_content")
          .select(
            `id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at, ${CONTENT_STATS_SELECT}`,
          )
          .eq("brand_id", brandId)
          .in("id", contentIds)
          .order("created_at", { ascending: false });
        if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        const items = applyClientFilters(
          await enrichContentItems(admin, brandId, (fallback.data || []) as Record<string, unknown>[]),
        );
        return NextResponse.json({ ok: true, items });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const items = applyClientFilters(
      await enrichContentItems(admin, brandId, (data || []) as Record<string, unknown>[]),
    );
    return NextResponse.json({ ok: true, items });
  }

  if (targetHandle) {
    const creatorRowIds = await resolveCreatorRowIdsByHandle(admin, brandId, targetHandle);
    if (creatorRowIds.length === 0) return NextResponse.json({ ok: true, items: [] });

    for (const creatorRowId of creatorRowIds) {
      await backfillDiscoveryContentRefs(admin, brandId, creatorRowId);
      await backfillCreatorContentToCampaigns(admin, brandId, creatorRowId);
    }

    const { data: creatorRows } = await admin
      .from("creators")
      .select("id, linked_user_id")
      .eq("user_id", brandId)
      .in("id", creatorRowIds);

    const linkedUserIds = [
      ...new Set(
        (creatorRows || [])
          .map((row) => (row.linked_user_id ? String(row.linked_user_id) : null))
          .filter(Boolean),
      ),
    ] as string[];

    const { data, error } = await loadBrandContentForCreators(admin, brandId, creatorRowIds, linkedUserIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = applyClientFilters(await enrichContentItems(admin, brandId, data));
    return NextResponse.json({ ok: true, items });
  }

  let listQuery = admin
    .from("creator_content")
    .select(CONTENT_LIST_SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (hookId) listQuery = listQuery.eq("hook_id", hookId);

  const { data, error } = await listQuery;

  if (error) {
    if (String(error.message || "").includes("hook_id")) {
      const fallback = await admin
        .from("creator_content")
        .select(
          `id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at, ${CONTENT_STATS_SELECT}`,
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      const items = applyClientFilters(
        await enrichContentItems(admin, brandId, (fallback.data || []) as Record<string, unknown>[]),
      );
      return NextResponse.json({ ok: true, items });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = applyClientFilters(
    await enrichContentItems(admin, brandId, (data || []) as Record<string, unknown>[]),
  );
  return NextResponse.json({ ok: true, items });
}

// POST — brand adds content on behalf of a creator
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const access = await requireWorkspaceAccess(request, body?.brandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;
  const creatorRowId = (body?.creatorRowId as string | undefined)?.trim();
  const title = (body?.title as string | undefined)?.trim();
  const notes = (body?.notes as string | undefined)?.trim() || null;
  const fileUrl = (body?.fileUrl as string | undefined)?.trim();
  const fileName = (body?.fileName as string | undefined)?.trim();
  const fileType = (body?.fileType as string | undefined)?.trim() || null;
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : null;
  const postUrlRaw = typeof body?.postUrl === "string" ? body.postUrl.trim() : "";

  if (!brandId || !creatorRowId || !title || !fileUrl || !fileName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (fileSize != null && fileSize > CREATOR_CONTENT_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum ${CREATOR_CONTENT_MAX_FILE_LABEL}.` },
      { status: 413 }
    );
  }
  if (postUrlRaw && !/tiktok\.com\//i.test(postUrlRaw)) {
    return NextResponse.json({ error: "URL must be a TikTok link (tiktok.com)." }, { status: 400 });
  }

  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, linked_user_id, handle")
    .eq("id", creatorRowId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (creatorErr) return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const creatorUserId = creator.linked_user_id;
  if (!creatorUserId) {
    return NextResponse.json(
      {
        error:
          "Creator has no linked account. They must join via your invite link before you can attach content.",
      },
      { status: 400 },
    );
  }

  const postUrl = postUrlRaw && /tiktok\.com\//i.test(postUrlRaw) ? postUrlRaw : null;
  let stats: { views: number | null; likes: number | null; comments: number | null; shares: number | null; postedAt: string | null } | null = null;
  if (postUrl) {
    try {
      stats = parseVideoStats(await fetchTikTokVideoRaw(postUrl));
    } catch (e) {
      console.error("post stats fetch skipped:", (e as Error).message);
    }
  }

  const { data, error } = await admin
    .from("creator_content")
    .insert({
      brand_id: brandId,
      creator_row_id: creatorRowId,
      creator_user_id: creatorUserId,
      title,
      notes,
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      post_url: postUrl,
      views: stats?.views ?? null,
      likes: stats?.likes ?? null,
      comments: stats?.comments ?? null,
      shares: stats?.shares ?? null,
      posted_at: stats?.postedAt ?? null,
      stats_updated_at: stats ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const syncErr = await syncContentRefToDiscoverySaved(admin, brandId, creatorRowId, {
    id: data.id,
    title,
  });
  if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });

  const campaignSyncErr = await backfillCreatorContentToCampaigns(admin, brandId, creatorRowId);
  if (campaignSyncErr) {
    console.error("campaign content sync failed:", campaignSyncErr.message);
  }

  return NextResponse.json({ ok: true, id: data.id, creatorRowId });
}

// DELETE — brand removes uploaded content
export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const requestedBrandId = searchParams.get("brandId")?.trim();
  if (!id || !requestedBrandId) return NextResponse.json({ error: "Missing id or brandId" }, { status: 400 });
  const access = await requireWorkspaceAccess(request, requestedBrandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;

  const { data: row, error: fetchErr } = await admin
    .from("creator_content")
    .select("id, creator_row_id")
    .eq("id", id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  const { error } = await admin.from("creator_content").delete().eq("id", id).eq("brand_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row.creator_row_id) {
    const syncErr = await removeContentRefFromDiscoverySaved(admin, brandId, String(row.creator_row_id), id);
    if (syncErr) console.error("discovery content ref cleanup failed:", syncErr.message);
  }

  return NextResponse.json({ ok: true });
}
