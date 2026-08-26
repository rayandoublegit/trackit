import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { hasReachedCampaignLimit, normalizePlan } from "@/lib/plan-limits";
import { isDemoPresetCampaign } from "@/lib/demo-preset-data";
import {
  baselineAndSettleRpmForContent,
  buildRpmAnalytics,
  isRpmCampaign,
  resolveRpmRate,
  RPM_COMMISSION_TYPE,
} from "@/lib/rpm";
import { fetchTikTokVideoRaw, parseVideoStats } from "@/lib/scrapecreators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncCampaignCreators } from "@/lib/db";

function isActiveCampaignStatus(status: string | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "paused";
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const campaignId = searchParams.get("campaignId");
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  if (campaignId) {
    const snapshot = await buildRpmAnalytics(admin, workspaceId, campaignId);
    if ("error" in snapshot) return NextResponse.json(snapshot, { status: 404 });
    return NextResponse.json({ ok: true, ...snapshot });
  }

  const { data, error } = await admin
    .from("campaigns")
    .select("id, name, status, rpm_rate, commission_rate, commission_type, start_date, end_date, created_at, description")
    .eq("user_id", workspaceId)
    .eq("commission_type", RPM_COMMISSION_TYPE)
    .order("created_at", { ascending: false });

  if (error?.message?.includes("rpm_rate")) {
    const fallback = await admin
      .from("campaigns")
      .select("id, name, status, commission_rate, commission_type, start_date, end_date, created_at, description")
      .eq("user_id", workspaceId)
      .eq("commission_type", RPM_COMMISSION_TYPE)
      .order("created_at", { ascending: false });
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    const campaigns = (fallback.data || []).map((row) => ({
      ...row,
      rpm_rate: resolveRpmRate(row),
    }));
    return NextResponse.json({ ok: true, campaigns });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    campaigns: (data || []).map((row) => ({
      ...row,
      rpm_rate: resolveRpmRate(row),
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "create");
  const brandId = body?.brandId as string | undefined;
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  if (action === "settle") {
    const contentId = String(body?.contentId || "").trim();
    const views = Number(body?.views ?? 0);
    if (!contentId) return NextResponse.json({ error: "contentId required" }, { status: 400 });
    const result = await baselineAndSettleRpmForContent(admin, workspaceId, contentId, views);
    if ("error" in result) return NextResponse.json(result, { status: 500 });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "settle-campaign" || action === "sync-campaign") {
    const campaignId = String(body?.campaignId || "").trim();
    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, commission_type")
      .eq("id", campaignId)
      .eq("user_id", workspaceId)
      .maybeSingle();
    if (!campaign || !isRpmCampaign(campaign)) {
      return NextResponse.json({ error: "RPM campaign not found" }, { status: 404 });
    }

    const { data: links } = await admin
      .from("campaign_content")
      .select("content_id")
      .eq("brand_id", workspaceId)
      .eq("campaign_id", campaignId);

    const contentIds = [...new Set((links || []).map((l) => String(l.content_id)))];
    let totalAmount = 0;
    let settled = 0;
    let refreshed = 0;
    let refreshedFailed = 0;
    const syncLive = action === "sync-campaign";

    if (contentIds.length) {
      const { data: rows } = await admin
        .from("creator_content")
        .select("id, views, likes, comments, shares, post_url")
        .eq("brand_id", workspaceId)
        .in("id", contentIds);

      for (const row of rows || []) {
        let views = Number(row.views ?? 0);

        if (syncLive && typeof row.post_url === "string" && row.post_url.trim()) {
          try {
            const stats = parseVideoStats(await fetchTikTokVideoRaw(row.post_url));
            const nextViews = Number(stats.views ?? views);
            await admin
              .from("creator_content")
              .update({
                views: nextViews,
                likes: stats.likes ?? row.likes,
                comments: stats.comments ?? row.comments,
                shares: stats.shares ?? row.shares,
                posted_at: stats.postedAt,
                stats_updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            views = nextViews;
            refreshed += 1;
          } catch {
            refreshedFailed += 1;
          }
        }

        const result = await baselineAndSettleRpmForContent(
          admin,
          workspaceId,
          String(row.id),
          views,
        );
        if ("error" in result) continue;
        totalAmount += result.amount;
        settled += result.settled;
      }
    }

    const snapshot = await buildRpmAnalytics(admin, workspaceId, campaignId);
    return NextResponse.json({
      ok: true,
      settled,
      amount: Math.round(totalAmount * 100) / 100,
      refreshed,
      refreshedFailed,
      ...(typeof snapshot === "object" && !("error" in snapshot) ? snapshot : {}),
    });
  }

  // create
  const name = String(body?.name || "").trim();
  const rpmRate = Number(body?.rpmRate);
  const commissionRate = Number(body?.commissionRate ?? 100);
  const creatorIds = Array.isArray(body?.creatorIds)
    ? body.creatorIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const startDate = typeof body?.startDate === "string" ? body.startDate : undefined;
  const endDate = typeof body?.endDate === "string" ? body.endDate : undefined;

  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!Number.isFinite(rpmRate) || rpmRate <= 0) {
    return NextResponse.json({ error: "RPM rate must be > 0" }, { status: 400 });
  }
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return NextResponse.json({ error: "Commission must be 0–100%" }, { status: 400 });
  }

  const { data: profile } = await admin.from("profiles").select("plan").eq("id", workspaceId).maybeSingle();
  const { data: existing } = await admin
    .from("campaigns")
    .select("status, name, description")
    .eq("user_id", workspaceId);
  const plan = normalizePlan(profile?.plan);
  const activeCount = (existing || []).filter(
    (row) => isActiveCampaignStatus(row.status) && !isDemoPresetCampaign(row),
  ).length;
  if (hasReachedCampaignLimit(plan, activeCount)) {
    return NextResponse.json({ error: "Campaign limit reached" }, { status: 402 });
  }

  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      user_id: workspaceId,
      name,
      description: JSON.stringify({
        version: 1,
        kind: "rpm",
        rpmRate,
        hashtags: "",
        trackAllCreatorContent: true,
      }),
      platform: "All",
      start_date: startDate || new Date().toISOString().slice(0, 10),
      end_date: endDate || null,
      commission_type: RPM_COMMISSION_TYPE,
      commission_rate: commissionRate,
      rpm_rate: rpmRate,
      auto_payout: false,
      status: "active",
    })
    .select("id, name, status, rpm_rate, commission_rate, commission_type")
    .single();

  if (error) {
    // Fallback if rpm_rate column missing — still create as rpm type.
    if (error.message?.includes("rpm_rate")) {
      const { data: fallback, error: fbErr } = await admin
        .from("campaigns")
        .insert({
          user_id: workspaceId,
          name,
          description: JSON.stringify({
            version: 1,
            kind: "rpm",
            rpmRate,
            hashtags: "",
            trackAllCreatorContent: true,
          }),
          platform: "All",
          start_date: startDate || new Date().toISOString().slice(0, 10),
          end_date: endDate || null,
          commission_type: RPM_COMMISSION_TYPE,
          commission_rate: commissionRate,
          auto_payout: false,
          status: "active",
        })
        .select("id, name, status, commission_rate, commission_type")
        .single();
      if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 });
      if (creatorIds.length && fallback?.id) {
        await syncCampaignCreators(workspaceId, fallback.id, creatorIds);
      }
      return NextResponse.json({ ok: true, campaign: { ...fallback, rpm_rate: rpmRate } });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (creatorIds.length && campaign?.id) {
    await syncCampaignCreators(workspaceId, campaign.id, creatorIds);
  }

  return NextResponse.json({ ok: true, campaign });
}

export async function PATCH(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const brandId = body?.brandId as string | undefined;
  const campaignId = String(body?.campaignId || "").trim();
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const { data: existing } = await admin
    .from("campaigns")
    .select("id, commission_type")
    .eq("id", campaignId)
    .eq("user_id", workspaceId)
    .maybeSingle();
  if (!existing || !isRpmCampaign(existing)) {
    return NextResponse.json({ error: "RPM campaign not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.status === "string") updates.status = body.status;
  if (body?.rpmRate != null && Number(body.rpmRate) > 0) updates.rpm_rate = Number(body.rpmRate);
  if (body?.commissionRate != null) {
    const pct = Number(body.commissionRate);
    if (pct >= 0 && pct <= 100) updates.commission_rate = pct;
  }
  if (Array.isArray(body?.creatorIds)) {
    await syncCampaignCreators(
      workspaceId,
      campaignId,
      body.creatorIds.map((id: unknown) => String(id)).filter(Boolean),
    );
  }

  if (Object.keys(updates).length) {
    const { error } = await admin
      .from("campaigns")
      .update(updates)
      .eq("id", campaignId)
      .eq("user_id", workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
