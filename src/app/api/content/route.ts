import { NextResponse } from "next/server";
import {
  backfillCampaignContent,
  backfillCreatorContentToCampaigns,
  loadBrandContentForCreators,
  resolveCampaignContentIds,
  resolveCreatorRowIdsByHandle,
} from "@/lib/content-campaign-sync";
import { backfillDiscoveryContentRefs, syncContentRefToDiscoverySaved } from "@/lib/content-creator-sync";
import { CONTENT_STATS_SELECT } from "@/lib/content-shared";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function enrichContentItems(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  brandId: string,
  rows: Record<string, unknown>[],
) {
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

  return rows.map((item) => {
    const meta = item.creator_row_id ? nameById.get(String(item.creator_row_id)) : null;
    return {
      ...item,
      creatorName: meta?.name || null,
      creatorHandle: meta?.handle || null,
      campaignNames: campaignsByContent.get(String(item.id)) ?? [],
    };
  });
}

// GET — brand lists content (optionally by creator handle or campaign)
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const targetHandle = searchParams.get("targetHandle")?.trim().replace(/^@/, "") || null;
  const campaignId = searchParams.get("campaignId")?.trim() || null;
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });

  if (campaignId) {
    const { ids: contentIds, error: resolveErr } = await resolveCampaignContentIds(admin, brandId, campaignId);
    if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });
    if (contentIds.length === 0) return NextResponse.json({ ok: true, items: [] });

    const { data, error } = await admin
      .from("creator_content")
      .select(
        `id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at, ${CONTENT_STATS_SELECT}`,
      )
      .eq("brand_id", brandId)
      .in("id", contentIds)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const items = await enrichContentItems(admin, brandId, (data || []) as Record<string, unknown>[]);
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

    const items = await enrichContentItems(admin, brandId, data);
    return NextResponse.json({ ok: true, items });
  }

  const { data, error } = await admin
    .from("creator_content")
    .select(
      `id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at, ${CONTENT_STATS_SELECT}`,
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = await enrichContentItems(admin, brandId, (data || []) as Record<string, unknown>[]);
  return NextResponse.json({ ok: true, items });
}

// POST — brand adds content on behalf of a creator
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const brandId = (body?.brandId as string | undefined)?.trim();
  const creatorRowId = (body?.creatorRowId as string | undefined)?.trim();
  const title = (body?.title as string | undefined)?.trim();
  const notes = (body?.notes as string | undefined)?.trim() || null;
  const fileUrl = (body?.fileUrl as string | undefined)?.trim();
  const fileName = (body?.fileName as string | undefined)?.trim();
  const fileType = (body?.fileType as string | undefined)?.trim() || null;
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : null;

  if (!brandId || !creatorRowId || !title || !fileUrl || !fileName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
