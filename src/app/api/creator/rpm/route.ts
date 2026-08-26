import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { findCreatorRowsForProfile } from "@/lib/creator-account";
import { isRpmCampaign, resolveRpmRate, rpmGrossAmount } from "@/lib/rpm";
import { fetchTikTokVideoRaw, parseVideoStats } from "@/lib/scrapecreators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const DEFAULT_RPM_RATE = 1; // €1 / 1,000 views
const REFRESH_MAX = 8;
const REFRESH_STALE_MS = 60 * 60 * 1000; // 1h

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  const shouldRefresh = searchParams.get("refresh") !== "0";

  const { rows } = await findCreatorRowsForProfile(admin, userId);
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      linked: false,
      totals: { views: 0, accrued: 0, pending: 0, videos: 0, rpmRate: 0 },
      videos: [],
    });
  }

  const creatorRowIds = rows.map((r) => r.id);
  const brandIds = [...new Set(rows.map((r) => r.user_id))];

  let { data: content, error: contentErr } = await admin
    .from("creator_content")
    .select(
      "id, brand_id, title, views, likes, comments, shares, post_url, created_at, posted_at, stats_updated_at",
    )
    .eq("creator_user_id", userId)
    .in("creator_row_id", creatorRowIds)
    .order("created_at", { ascending: false });

  if (contentErr?.message?.includes("creator_user_id")) {
    const fallback = await admin
      .from("creator_content")
      .select(
        "id, brand_id, title, views, likes, comments, shares, post_url, created_at, posted_at, stats_updated_at",
      )
      .in("creator_row_id", creatorRowIds)
      .order("created_at", { ascending: false });
    content = fallback.data;
    contentErr = fallback.error;
  }

  if (contentErr) return NextResponse.json({ error: contentErr.message }, { status: 500 });

  // Refresh stale / missing TikTok stats so views stay accurate.
  if (shouldRefresh && content?.length) {
    const now = Date.now();
    let refreshed = 0;
    for (const row of content) {
      if (refreshed >= REFRESH_MAX) break;
      const url = typeof row.post_url === "string" ? row.post_url.trim() : "";
      if (!url || !/tiktok\.com\//i.test(url)) continue;
      const updatedAt = row.stats_updated_at ? new Date(row.stats_updated_at).getTime() : 0;
      const stale = !updatedAt || now - updatedAt > REFRESH_STALE_MS || row.views == null;
      if (!stale) continue;
      try {
        const stats = parseVideoStats(await fetchTikTokVideoRaw(url));
        const patch = {
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
          shares: stats.shares,
          posted_at: stats.postedAt,
          stats_updated_at: new Date().toISOString(),
        };
        await admin.from("creator_content").update(patch).eq("id", row.id);
        Object.assign(row, patch);
        refreshed += 1;
      } catch (e) {
        console.error("creator rpm stats refresh skipped:", (e as Error).message);
      }
    }
  }

  const contentIds = (content || []).map((c) => c.id);
  const linkCampaignByContent = new Map<string, string>();

  if (contentIds.length) {
    const withCols = await admin
      .from("campaign_content")
      .select("content_id, campaign_id")
      .in("content_id", contentIds);
    if (!withCols.error) {
      for (const link of withCols.data || []) {
        const id = String(link.content_id);
        if (!linkCampaignByContent.has(id)) {
          linkCampaignByContent.set(id, String(link.campaign_id));
        }
      }
    }
  }

  // Brand RPM campaigns → rate (€ / 1k views). Default €1 when an RPM campaign exists.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, name, user_id, rpm_rate, commission_type, description, status")
    .in("user_id", brandIds);

  const rpmRateByBrand = new Map<string, number>();
  const rpmCampaignByBrand = new Map<string, { id: string; name: string }>();
  for (const c of campaigns || []) {
    if (!isRpmCampaign(c)) continue;
    const status = String(c.status || "").toLowerCase();
    if (status === "ended" || status === "archived") continue;
    const brandId = String(c.user_id);
    const rate = resolveRpmRate(c) || DEFAULT_RPM_RATE;
    const prev = rpmRateByBrand.get(brandId);
    if (prev == null || rate >= prev) {
      rpmRateByBrand.set(brandId, rate);
      rpmCampaignByBrand.set(brandId, { id: String(c.id), name: String(c.name || "") });
    }
  }

  // Default: €1 / 1,000 views for every linked brand (overridden by campaign rpm_rate above).
  for (const brandId of brandIds) {
    if (!rpmRateByBrand.has(brandId)) rpmRateByBrand.set(brandId, DEFAULT_RPM_RATE);
  }

  const { data: brands } = await admin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map(
    (brands || []).map((b) => [
      b.id,
      b.business_name || b.full_name || (b.username ? `@${b.username}` : ""),
    ]),
  );

  const campaignNameById = new Map<string, string>();
  for (const c of campaigns || []) {
    campaignNameById.set(String(c.id), String(c.name || ""));
  }

  // Outstanding balance = money credited but not yet paid out (versement).
  const { data: creatorBalances } = await admin
    .from("creators")
    .select("id, balance")
    .in("id", creatorRowIds);
  const balanceDue = roundMoney(
    (creatorBalances || []).reduce((sum, row) => sum + Math.max(0, Number(row.balance ?? 0)), 0),
  );

  // Paid-out history (reduces what is still “en attente”).
  let paidOut = 0;
  const payoutQuery = await admin
    .from("payouts")
    .select("amount, status")
    .in("creator_id", creatorRowIds);
  if (!payoutQuery.error) {
    for (const p of payoutQuery.data || []) {
      const status = String(p.status || "").toLowerCase();
      if (status === "paid" || status === "completed" || status === "success") {
        paidOut += Math.max(0, Number(p.amount ?? 0));
      }
    }
  }
  paidOut = roundMoney(paidOut);

  let viewsTotal = 0;
  let earnedTotal = 0;
  let displayRate = 0;

  const videos = (content || []).map((row) => {
    const views = Math.max(0, Number(row.views ?? 0));
    viewsTotal += views;
    const brandId = String(row.brand_id);
    const rate = rpmRateByBrand.get(brandId) ?? 0;
    if (rate > displayRate) displayRate = rate;

    // Gains = (views / 1000) × € rate — e.g. 1 000 vues × €1 → €1 ; 100 000 vues → €100
    const earned = rate > 0 ? roundMoney(rpmGrossAmount(views, rate)) : 0;
    earnedTotal += earned;

    const linkedCampaignId = linkCampaignByContent.get(String(row.id));
    const brandCamp = rpmCampaignByBrand.get(brandId);

    return {
      id: row.id,
      title: row.title || (row.post_url ? "Vidéo" : "Sans titre"),
      brandName: brandName.get(row.brand_id) || "",
      campaignName:
        (linkedCampaignId && campaignNameById.get(linkedCampaignId)) || brandCamp?.name || null,
      views,
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
      accrued: earned,
      pending: 0, // filled below once unpaid total is known
      rpmRate: rate,
      postUrl: row.post_url,
      postedAt: row.posted_at || row.created_at,
    };
  });

  earnedTotal = roundMoney(earnedTotal);

  // En attente = gains not yet paid out.
  // Prefer outstanding creator balance (credited RPM/sales minus payouts).
  // Fallback to earned − paid when balance row is empty but gains exist.
  const unpaidFromBalance = balanceDue;
  const unpaidFromLedger = roundMoney(Math.max(0, earnedTotal - paidOut));
  const pendingTotal = roundMoney(
    Math.min(earnedTotal, unpaidFromBalance > 0 ? unpaidFromBalance : unpaidFromLedger),
  );

  // Distribute unpaid across videos proportional to each video’s earned share.
  for (const video of videos) {
    if (earnedTotal <= 0 || pendingTotal <= 0) {
      video.pending = 0;
    } else {
      video.pending = roundMoney((video.accrued / earnedTotal) * pendingTotal);
    }
  }

  // Prefer highest views first in the table
  videos.sort((a, b) => b.views - a.views);

  return NextResponse.json({
    ok: true,
    linked: true,
    totals: {
      views: viewsTotal,
      accrued: earnedTotal,
      pending: pendingTotal,
      videos: videos.length,
      rpmRate: displayRate,
      balanceDue,
      paidOut,
    },
    videos,
  });
}
