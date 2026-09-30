import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import {
  aggregateRpmByBrand,
  findCreatorRowsForProfile,
  loadCreatorCampaignContext,
  loadCreatorRowPayoutTerms,
  resolveBrandRpmRate,
  resolveCreatorBrandTerms,
} from "@/lib/creator-account";
import { rpmGrossAmount } from "@/lib/rpm";
import { fetchPostStatsByUrl, isSupportedPostUrl } from "@/lib/scrapecreators";
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
      byBrand: [],
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

  // Refresh stale / missing TikTok / Instagram stats so views stay accurate.
  if (shouldRefresh && content?.length) {
    const now = Date.now();
    let refreshed = 0;
    for (const row of content) {
      if (refreshed >= REFRESH_MAX) break;
      const url = typeof row.post_url === "string" ? row.post_url.trim() : "";
      if (!url || !isSupportedPostUrl(url)) continue;
      const updatedAt = row.stats_updated_at ? new Date(row.stats_updated_at).getTime() : 0;
      const stale = !updatedAt || now - updatedAt > REFRESH_STALE_MS || row.views == null;
      if (!stale) continue;
      try {
        const stats = await fetchPostStatsByUrl(url);
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

  // Brand campaigns + the creator's campaign memberships + per-creator payout terms.
  const [{ campaigns, links: campaignLinks }, payoutTerms] = await Promise.all([
    loadCreatorCampaignContext(admin, rows),
    loadCreatorRowPayoutTerms(admin, creatorRowIds),
  ]);
  const brandTerms = resolveCreatorBrandTerms({ rows, payoutTerms, campaigns, campaignLinks });
  const isRpmBrand = new Set(brandTerms.filter((t) => t.models.includes("rpm")).map((t) => t.brandId));

  // Best active RPM campaign per brand (shown as the video's campaign when not linked to one).
  const rpmCampaignByBrand = new Map<string, { id: string; name: string; rate: number }>();
  for (const c of campaigns) {
    if (!c.isRpm || !c.active) continue;
    const rate = c.rpmRate || DEFAULT_RPM_RATE;
    const prev = rpmCampaignByBrand.get(c.brandId);
    if (!prev || rate >= prev.rate) rpmCampaignByBrand.set(c.brandId, { id: c.id, name: c.name, rate });
  }

  // Rate (€ / 1k views) per brand: creator's own rpm_rate → RPM campaign the creator is on →
  // best active RPM campaign of the brand → default €1 / 1,000 views.
  const rpmRateByBrand = new Map<string, number>();
  const rpmTermsById = new Map(payoutTerms.map((t) => [t.id, t]));
  for (const brandId of brandIds) {
    const brandRowIds = new Set(rows.filter((r) => r.user_id === brandId).map((r) => r.id));
    const linkedCampaignIds = new Set(
      campaignLinks.filter((l) => brandRowIds.has(l.creatorRowId)).map((l) => l.campaignId),
    );
    const activeRpm = campaigns.filter((c) => c.brandId === brandId && c.isRpm && c.active);
    rpmRateByBrand.set(
      brandId,
      resolveBrandRpmRate({
        rowRpmRates: [...brandRowIds].map((id) => rpmTermsById.get(id)?.rpm_rate ?? null),
        linkedCampaignRates: activeRpm.filter((c) => linkedCampaignIds.has(c.id)).map((c) => c.rpmRate),
        brandCampaignRates: activeRpm.map((c) => c.rpmRate || DEFAULT_RPM_RATE),
      }),
    );
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
  for (const c of campaigns) {
    campaignNameById.set(c.id, c.name);
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
      title: row.title || (row.post_url ? "Video" : "Untitled"),
      brandId,
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

  // Same figures split per brand (isRpm tells which brands actually pay per view).
  const byBrand = aggregateRpmByBrand({
    brands: brandIds.map((brandId) => ({
      brandId,
      brandName: brandName.get(brandId) || "",
      rpmRate: rpmRateByBrand.get(brandId) ?? 0,
      isRpm: isRpmBrand.has(brandId),
    })),
    videos,
  });

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
    byBrand,
  });
}
