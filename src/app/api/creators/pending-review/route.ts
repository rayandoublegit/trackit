import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseFollowersCount } from "@/lib/parse-creator-import";
import { syncCreatorToDiscoverySaved, type BrandCreatorSyncRow } from "@/lib/creator-discovery-sync";
import { activateCreatorDashboard } from "@/lib/active-dashboard-creators";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";
import { isRpmCampaign, RPM_COMMISSION_TYPE } from "@/lib/rpm";

export const dynamic = "force-dynamic";

async function addCreatorToFolder(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  brandId: string,
  folderId: string,
  username: string,
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
    { onConflict: "folder_id,creator_username", ignoreDuplicates: true },
  );
  return error;
}

/** Ensure creator is on an active RPM campaign matching this rate. */
async function ensureCreatorOnRpmCampaign(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  brandId: string,
  creatorId: string,
  rpmRate: number,
  creatorHandle: string | null,
) {
  const { data: camps } = await admin
    .from("campaigns")
    .select("id, name, status, rpm_rate, commission_type, description")
    .eq("user_id", brandId);

  const activeRpm = (camps || []).filter((c) => {
    if (!isRpmCampaign(c)) return false;
    const s = String(c.status || "").toLowerCase();
    return s === "active" || s === "paused" || !s;
  });

  let campaignId =
    activeRpm.find((c) => Math.abs(Number(c.rpm_rate ?? 0) - rpmRate) < 0.0001)?.id ||
    activeRpm[0]?.id ||
    null;

  if (!campaignId) {
    const name = creatorHandle
      ? `RPM · @${String(creatorHandle).replace(/^@/, "")}`
      : "RPM";
    const insert = await admin
      .from("campaigns")
      .insert({
        user_id: brandId,
        name,
        description: JSON.stringify({
          version: 1,
          kind: "rpm",
          rpmRate,
          hashtags: "",
          trackAllCreatorContent: true,
        }),
        platform: "All",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        commission_type: RPM_COMMISSION_TYPE,
        commission_rate: 100,
        rpm_rate: rpmRate,
        auto_payout: false,
        status: "active",
      })
      .select("id")
      .single();

    if (insert.error?.message?.includes("rpm_rate")) {
      const fallback = await admin
        .from("campaigns")
        .insert({
          user_id: brandId,
          name,
          description: JSON.stringify({
            version: 1,
            kind: "rpm",
            rpmRate,
            hashtags: "",
            trackAllCreatorContent: true,
          }),
          platform: "All",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: null,
          commission_type: RPM_COMMISSION_TYPE,
          commission_rate: 100,
          auto_payout: false,
          status: "active",
        })
        .select("id")
        .single();
      if (fallback.error || !fallback.data?.id) return;
      campaignId = fallback.data.id;
    } else if (insert.error || !insert.data?.id) {
      return;
    } else {
      campaignId = insert.data.id;
    }
  } else {
    await admin
      .from("campaigns")
      .update({ rpm_rate: rpmRate, commission_rate: 100 })
      .eq("id", campaignId)
      .eq("user_id", brandId);
  }

  if (!campaignId) return;

  await admin.from("campaign_creators").upsert(
    {
      user_id: brandId,
      campaign_id: campaignId,
      creator_id: creatorId,
    },
    { onConflict: "campaign_id,creator_id", ignoreDuplicates: true },
  );
}

// GET : liste les créateurs récemment arrivés (needs_review = true) pour cette marque
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedBrandId = searchParams.get("brandId");
  if (!requestedBrandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });
  const access = await requireWorkspaceAccess(request, requestedBrandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, creators: [] });

  const { data, error } = await admin
    .from("creators")
    .select(
      "id, handle, full_name, avatar_url, platform, commission_rate, discount_code, payout_model, rpm_rate, rpm_per_views",
    )
    .eq("user_id", brandId)
    .eq("needs_review", true)
    .order("id", { ascending: false });

  if (error?.message?.includes("payout_model") || error?.message?.includes("rpm_rate") || error?.message?.includes("rpm_per_views")) {
    const legacy = await admin
      .from("creators")
      .select("id, handle, full_name, avatar_url, platform, commission_rate, discount_code")
      .eq("user_id", brandId)
      .eq("needs_review", true)
      .order("id", { ascending: false });
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, creators: legacy.data || [] });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, creators: data || [] });
}

// POST : la marque valide/complète un créateur -> needs_review = false + champs
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const access = await requireWorkspaceAccess(request, body?.brandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;
  const creatorId = (body?.creatorId as string | undefined)?.trim();
  const payoutModel = String(body?.payoutModel || "commission").toLowerCase() === "rpm" ? "rpm" : "commission";
  const commissionRate = body?.commissionRate;
  const discountCode = (body?.discountCode as string | undefined)?.trim() || null;
  const platform = (body?.platform as string | undefined)?.trim() || null;
  const avatarUrl = (body?.avatarUrl as string | undefined)?.trim() || null;
  const niche = (body?.niche as string | undefined)?.trim() || null;
  const followers = body?.followers;
  const engagement = body?.engagement;
  const folderId = (body?.folderId as string | undefined)?.trim() || null;
  const rpmAmount = Number(body?.rpmAmount);
  const rpmPerViews = Math.max(1, Math.floor(Number(body?.rpmPerViews) || 1000));

  if (!brandId || !creatorId) return NextResponse.json({ error: "Missing brandId or creatorId" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  if (payoutModel === "rpm") {
    if (!Number.isFinite(rpmAmount) || rpmAmount <= 0) {
      return NextResponse.json({ error: "RPM amount must be > 0" }, { status: 400 });
    }
  } else if (commissionRate === undefined || commissionRate === null || commissionRate === "") {
    return NextResponse.json({ error: "Commission rate required" }, { status: 400 });
  }

  const { data: beforeRow } = await admin
    .from("creators")
    .select("linked_user_id, handle")
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();

  const linkedUserId = beforeRow?.linked_user_id ?? null;
  const normalizedRpmRate =
    payoutModel === "rpm" ? Math.round(((rpmAmount / rpmPerViews) * 1000) * 10000) / 10000 : null;

  const update: Record<string, unknown> = {
    needs_review: false,
    dashboard_active: true,
    payout_model: payoutModel,
  };
  if (linkedUserId) update.linked_user_id = linkedUserId;

  if (payoutModel === "rpm") {
    update.rpm_rate = normalizedRpmRate;
    update.rpm_per_views = rpmPerViews;
    update.commission_rate = 100;
    if (discountCode) update.discount_code = discountCode;
  } else {
    update.commission_rate = Number(commissionRate);
    update.rpm_rate = null;
    update.rpm_per_views = null;
    if (discountCode) update.discount_code = discountCode;
  }

  if (platform) update.platform = platform;
  if (avatarUrl) update.avatar_url = avatarUrl;
  if (niche) update.niche = niche;
  if (followers !== undefined && followers !== null && followers !== "") {
    update.followers = parseFollowersCount(String(followers));
  }
  if (engagement !== undefined && engagement !== null && engagement !== "") {
    update.engagement_rate = Number(engagement);
  }

  let { error } = await admin.from("creators").update(update).eq("id", creatorId).eq("user_id", brandId);

  if (
    error?.message?.includes("dashboard_active") ||
    error?.message?.includes("payout_model") ||
    error?.message?.includes("rpm_")
  ) {
    const legacyUpdate = { ...update };
    delete legacyUpdate.dashboard_active;
    delete legacyUpdate.payout_model;
    delete legacyUpdate.rpm_rate;
    delete legacyUpdate.rpm_per_views;
    ({ error } = await admin.from("creators").update(legacyUpdate).eq("id", creatorId).eq("user_id", brandId));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await activateCreatorDashboard(admin, brandId, creatorId, linkedUserId);
  } catch {
    /* garde-fou si la colonne dashboard_active est absente */
  }

  if (payoutModel === "rpm" && normalizedRpmRate != null && normalizedRpmRate > 0) {
    try {
      await ensureCreatorOnRpmCampaign(
        admin,
        brandId,
        creatorId,
        normalizedRpmRate,
        beforeRow?.handle ? String(beforeRow.handle) : null,
      );
    } catch (e) {
      console.error("ensureCreatorOnRpmCampaign", e);
    }
  }

  const { data: creator, error: fetchErr } = await admin
    .from("creators")
    .select(
      "id, handle, full_name, avatar_url, platform, commission_rate, discount_code, niche, followers, engagement_rate, linked_user_id",
    )
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (creator) {
    const resolvedLinkedUserId = creator.linked_user_id || linkedUserId;
    if (resolvedLinkedUserId && !creator.linked_user_id) {
      await admin.from("creators").update({ linked_user_id: resolvedLinkedUserId }).eq("id", creatorId);
      creator.linked_user_id = resolvedLinkedUserId;
    }
    if (resolvedLinkedUserId) {
      const { error: linkErr } = await admin.from("creator_links").upsert(
        {
          creator_id: resolvedLinkedUserId,
          brand_id: brandId,
          status: CREATOR_LINK_STATUS.active,
        },
        { onConflict: "creator_id,brand_id" },
      );
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }
    const syncErr = await syncCreatorToDiscoverySaved(admin, brandId, creator as BrandCreatorSyncRow);
    if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });
    if (folderId) {
      const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
      const folderErr = await addCreatorToFolder(admin, brandId, folderId, username);
      if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    payoutModel,
    rpmRate: normalizedRpmRate,
    rpmPerViews: payoutModel === "rpm" ? rpmPerViews : null,
  });
}

// DELETE : ignorer le pop-up — pas de dashboard actif pour ce créateur
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creatorId");
  const brandId = searchParams.get("brandId");
  if (!creatorId || !brandId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: creator } = await admin
    .from("creators")
    .select("linked_user_id, handle")
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();

  const { error } = await admin
    .from("creators")
    .update({ needs_review: false, linked_user_id: null, dashboard_active: false })
    .eq("id", creatorId)
    .eq("user_id", brandId);
  if (error?.message?.includes("dashboard_active")) {
    const { error: legacyErr } = await admin
      .from("creators")
      .update({ needs_review: false, linked_user_id: null })
      .eq("id", creatorId)
      .eq("user_id", brandId);
    if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 });
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (creator?.linked_user_id) {
    await admin
      .from("creator_links")
      .update({ status: CREATOR_LINK_STATUS.ignored })
      .eq("brand_id", brandId)
      .eq("creator_id", creator.linked_user_id);
  }

  return NextResponse.json({ ok: true });
}
