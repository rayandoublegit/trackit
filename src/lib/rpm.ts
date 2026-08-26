import type { SupabaseClient } from "@supabase/supabase-js";

export const RPM_COMMISSION_TYPE = "rpm";

export function isRpmCampaign(row: {
  commission_type?: string | null;
  description?: string | null;
}): boolean {
  if (String(row.commission_type || "").toLowerCase() === RPM_COMMISSION_TYPE) return true;
  try {
    const parsed = JSON.parse(String(row.description || ""));
    return parsed?.kind === "rpm";
  } catch {
    return false;
  }
}

/** Prefer column, fall back to description.rpmRate when migration not applied. */
export function resolveRpmRate(row: {
  rpm_rate?: number | null;
  description?: string | null;
}): number {
  const fromCol = Number(row.rpm_rate);
  if (Number.isFinite(fromCol) && fromCol > 0) return fromCol;
  try {
    const parsed = JSON.parse(String(row.description || ""));
    const fromDesc = Number(parsed?.rpmRate);
    if (Number.isFinite(fromDesc) && fromDesc > 0) return fromDesc;
  } catch {
    /* ignore */
  }
  return 0;
}

/** Gross pool for billable views at the campaign RPM rate. */
export function rpmGrossAmount(billableViews: number, rpmRate: number): number {
  const views = Math.max(0, Number(billableViews) || 0);
  const rate = Math.max(0, Number(rpmRate) || 0);
  return (views / 1000) * rate;
}

/**
 * Creator payout = (billableViews / 1000) * rpmRate * (commissionPct / 100).
 * Example: 10_000 views, €1 / 1k, 30% → €3.00
 */
export function rpmCreatorAmount(
  billableViews: number,
  rpmRate: number,
  commissionPct: number,
): number {
  const gross = rpmGrossAmount(billableViews, rpmRate);
  const pct = Math.max(0, Math.min(100, Number(commissionPct) || 0));
  return Math.round(gross * (pct / 100) * 100) / 100;
}

export type RpmCampaignRow = {
  id: string;
  name: string;
  status: string;
  rpm_rate: number | null;
  commission_rate: number | null;
  commission_type: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  description?: string | null;
};

export type RpmCreatorAnalytics = {
  creatorId: string;
  handle: string;
  fullName: string;
  avatarUrl: string | null;
  platform: string;
  contentCount: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  billableViews: number;
  accrued: number;
  pending: number;
};

export type RpmAnalyticsSnapshot = {
  campaign: RpmCampaignRow;
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    contentCount: number;
    accrued: number;
    pending: number;
  };
  creators: RpmCreatorAnalytics[];
  content: Array<{
    id: string;
    title: string;
    creatorId: string;
    creatorHandle: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    postUrl: string | null;
    viewsLastSettled: number;
    rpmAccrued: number;
    pending: number;
  }>;
};

function engagementRate(views: number, likes: number, comments: number, shares: number): number {
  if (views <= 0) return 0;
  return Math.round((((likes + comments + shares) / views) * 100) * 100) / 100;
}

/** Settle RPM for one content row already linked to an RPM campaign. */
export async function settleRpmForContent(
  admin: SupabaseClient,
  opts: {
    brandId: string;
    contentId: string;
    views: number;
  },
): Promise<{ settled: number; amount: number } | { error: string }> {
  const views = Math.max(0, Math.floor(Number(opts.views) || 0));

  const { data: links, error: linkErr } = await admin
    .from("campaign_content")
    .select("campaign_id, creator_row_id, views_last_settled, views_baseline, rpm_accrued")
    .eq("brand_id", opts.brandId)
    .eq("content_id", opts.contentId);

  let resolvedLinks = links;
  if (linkErr?.message?.includes("views_last_settled") || linkErr?.message?.includes("views_baseline") || linkErr?.message?.includes("rpm_accrued")) {
    const basic = await admin
      .from("campaign_content")
      .select("campaign_id, creator_row_id")
      .eq("brand_id", opts.brandId)
      .eq("content_id", opts.contentId);
    if (basic.error) return { error: basic.error.message };
    resolvedLinks = (basic.data || []).map((l) => ({
      ...l,
      views_last_settled: 0,
      views_baseline: 0,
      rpm_accrued: 0,
    }));
  } else if (linkErr) {
    return { error: linkErr.message };
  }
  if (!resolvedLinks?.length) return { settled: 0, amount: 0 };

  let totalAmount = 0;
  let settledLinks = 0;

  for (const link of resolvedLinks) {
    const campaignId = String(link.campaign_id);
    const creatorId = String(link.creator_row_id);
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, commission_type, commission_rate, rpm_rate, status, user_id, description")
      .eq("id", campaignId)
      .eq("user_id", opts.brandId)
      .maybeSingle();

    if (!campaign || !isRpmCampaign(campaign)) continue;
    const status = String(campaign.status || "").toLowerCase();
    if (status !== "active" && status !== "paused") continue;

    const rpmRate = resolveRpmRate(campaign) || 1;
    // Full RPM pool to creator: (billableViews / 1000) × rpmRate (e.g. 1 000 vues × €1 → €1)
    const commissionPct = 100;
    if (rpmRate <= 0) continue;

    const lastSettled = Math.max(0, Number(link.views_last_settled ?? link.views_baseline ?? 0));
    const billable = Math.max(0, views - lastSettled);
    if (billable <= 0) continue;

    const amount = rpmGrossAmount(billable, rpmRate);
    const amountRounded = Math.round(amount * 100) / 100;
    if (amountRounded <= 0) {
      await admin
        .from("campaign_content")
        .update({ views_last_settled: views })
        .eq("campaign_id", campaignId)
        .eq("content_id", opts.contentId);
      continue;
    }

    const { error: accrualErr } = await admin.from("rpm_accruals").insert({
      brand_id: opts.brandId,
      campaign_id: campaignId,
      creator_id: creatorId,
      content_id: opts.contentId,
      views_from: lastSettled,
      views_to: views,
      billable_views: billable,
      rpm_rate: rpmRate,
      commission_pct: commissionPct,
      amount: amountRounded,
    });
    if (accrualErr && !accrualErr.message?.includes("rpm_accruals")) {
      return { error: accrualErr.message };
    }

    const prevAccrued = Number(link.rpm_accrued ?? 0);
    const linkUpdate = await admin
      .from("campaign_content")
      .update({
        views_last_settled: views,
        rpm_accrued: Math.round((prevAccrued + amountRounded) * 100) / 100,
      })
      .eq("campaign_id", campaignId)
      .eq("content_id", opts.contentId);
    if (
      linkUpdate.error?.message?.includes("views_last_settled") ||
      linkUpdate.error?.message?.includes("rpm_accrued")
    ) {
      return {
        error:
          "RPM schema missing — apply supabase/migrations/20260817_000033_rpm_campaigns.sql",
      };
    }
    if (linkUpdate.error) {
      return { error: linkUpdate.error.message };
    }

    const { data: creator } = await admin
      .from("creators")
      .select("balance, total_earned")
      .eq("id", creatorId)
      .eq("user_id", opts.brandId)
      .maybeSingle();

    if (creator) {
      const balance = Number(creator.balance ?? 0) + amountRounded;
      const totalEarned = Number(creator.total_earned ?? 0) + amountRounded;
      await admin
        .from("creators")
        .update({ balance, total_earned: totalEarned })
        .eq("id", creatorId)
        .eq("user_id", opts.brandId);
    }

    totalAmount += amountRounded;
    settledLinks += 1;
    // One content row → one RPM payout (avoid multi-campaign double credit).
    break;
  }

  return { settled: settledLinks, amount: Math.round(totalAmount * 100) / 100 };
}

/** Baseline new RPM links then settle any billable growth. */
export async function baselineAndSettleRpmForContent(
  admin: SupabaseClient,
  brandId: string,
  contentId: string,
  views: number,
): Promise<{ settled: number; amount: number } | { error: string }> {
  await baselineRpmLinksForContent(admin, brandId, contentId, views);
  return settleRpmForContent(admin, { brandId, contentId, views });
}

/** After linking content to campaigns, baseline views so only growth is billable. */
export async function baselineRpmLinksForContent(
  admin: SupabaseClient,
  brandId: string,
  contentId: string,
  views: number,
): Promise<void> {
  const v = Math.max(0, Math.floor(Number(views) || 0));
  const { data: links } = await admin
    .from("campaign_content")
    .select("campaign_id, views_last_settled, views_baseline")
    .eq("brand_id", brandId)
    .eq("content_id", contentId);

  for (const link of links || []) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("commission_type")
      .eq("id", String(link.campaign_id))
      .maybeSingle();
    if (!campaign || !isRpmCampaign(campaign)) continue;

    // Only set baseline once (new link).
    if (Number(link.views_last_settled ?? 0) > 0 || Number(link.views_baseline ?? 0) > 0) continue;

    await admin
      .from("campaign_content")
      .update({ views_baseline: v, views_last_settled: v })
      .eq("campaign_id", String(link.campaign_id))
      .eq("content_id", contentId);
  }
}

/**
 * New creator upload with scraped views: link to RPM (baseline 0) then credit balance
 * for the full current view count — (views / 1000) × rate.
 */
export async function settleNewContentRpm(
  admin: SupabaseClient,
  opts: {
    brandId: string;
    creatorRowId: string;
    contentId: string;
    views: number;
  },
): Promise<{ amount: number; views: number; rpmRate: number; linked: boolean; error?: string }> {
  const views = Math.max(0, Math.floor(Number(opts.views) || 0));
  const defaultRate = 1;

  const { data: camps } = await admin
    .from("campaigns")
    .select("id, name, status, rpm_rate, commission_type, description")
    .eq("user_id", opts.brandId);

  const rpmCamps = (camps || [])
    .filter((c) => {
      if (!isRpmCampaign(c)) return false;
      const s = String(c.status || "").toLowerCase();
      return s === "active" || s === "paused" || !s;
    })
    .map((c) => ({
      id: String(c.id),
      rate: resolveRpmRate(c) || defaultRate,
    }))
    .sort((a, b) => b.rate - a.rate);

  let rpmRate = defaultRate;
  let linked = false;
  const queue: { id: string; rate: number }[] = [...rpmCamps];

  if (queue.length === 0) {
    const insert = await admin
      .from("campaigns")
      .insert({
        user_id: opts.brandId,
        name: "RPM",
        description: JSON.stringify({
          version: 1,
          kind: "rpm",
          rpmRate: defaultRate,
          hashtags: "",
          trackAllCreatorContent: true,
        }),
        platform: "All",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        commission_type: "rpm",
        commission_rate: 100,
        rpm_rate: defaultRate,
        auto_payout: false,
        status: "active",
      })
      .select("id")
      .single();

    if (!insert.error && insert.data?.id) {
      queue.push({ id: String(insert.data.id), rate: defaultRate });
      // Ensure creator is on the campaign roster
      await admin.from("campaign_creators").upsert(
        {
          user_id: opts.brandId,
          campaign_id: insert.data.id,
          creator_id: opts.creatorRowId,
        },
        { onConflict: "campaign_id,creator_id", ignoreDuplicates: true },
      );
    } else if (insert.error?.message?.includes("rpm_rate")) {
      const fallback = await admin
        .from("campaigns")
        .insert({
          user_id: opts.brandId,
          name: "RPM",
          description: JSON.stringify({
            version: 1,
            kind: "rpm",
            rpmRate: defaultRate,
            hashtags: "",
            trackAllCreatorContent: true,
          }),
          platform: "All",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: null,
          commission_type: "rpm",
          commission_rate: 100,
          auto_payout: false,
          status: "active",
        })
        .select("id")
        .single();
      if (!fallback.error && fallback.data?.id) {
        queue.push({ id: String(fallback.data.id), rate: defaultRate });
        await admin.from("campaign_creators").upsert(
          {
            user_id: opts.brandId,
            campaign_id: fallback.data.id,
            creator_id: opts.creatorRowId,
          },
          { onConflict: "campaign_id,creator_id", ignoreDuplicates: true },
        );
      }
    }
  }

  if (queue.length > 0) {
    const primary = queue[0];
    rpmRate = primary.rate;
    const upsert = await admin.from("campaign_content").upsert(
      {
        brand_id: opts.brandId,
        campaign_id: primary.id,
        creator_row_id: opts.creatorRowId,
        content_id: opts.contentId,
        views_baseline: 0,
        views_last_settled: 0,
        rpm_accrued: 0,
      },
      { onConflict: "campaign_id,content_id" },
    );
    if (upsert.error && !upsert.error.message?.includes("campaign_content")) {
      return { amount: 0, views, rpmRate, linked: false, error: upsert.error.message };
    }
    linked = !upsert.error;

    // Ensure billable window starts at 0 even if another path baselined already.
    await admin
      .from("campaign_content")
      .update({ views_baseline: 0, views_last_settled: 0, rpm_accrued: 0 })
      .eq("brand_id", opts.brandId)
      .eq("content_id", opts.contentId)
      .eq("campaign_id", primary.id);

    const settled = await settleRpmForContent(admin, {
      brandId: opts.brandId,
      contentId: opts.contentId,
      views,
    });
    if ("error" in settled) {
      return { amount: 0, views, rpmRate, linked, error: settled.error };
    }
    return { amount: settled.amount, views, rpmRate, linked };
  }

  // Last resort: credit balance directly at €1 / 1k if campaigns table unavailable.
  const amount = Math.round(rpmGrossAmount(views, defaultRate) * 100) / 100;
  if (amount > 0) {
    const { data: creator } = await admin
      .from("creators")
      .select("balance, total_earned")
      .eq("id", opts.creatorRowId)
      .eq("user_id", opts.brandId)
      .maybeSingle();
    if (creator) {
      await admin
        .from("creators")
        .update({
          balance: Number(creator.balance ?? 0) + amount,
          total_earned: Number(creator.total_earned ?? 0) + amount,
        })
        .eq("id", opts.creatorRowId)
        .eq("user_id", opts.brandId);
    }
  }

  return { amount, views, rpmRate: defaultRate, linked: false };
}

export async function buildRpmAnalytics(
  admin: SupabaseClient,
  brandId: string,
  campaignId: string,
): Promise<RpmAnalyticsSnapshot | { error: string }> {
  const { data: campaign, error: campErr } = await admin
    .from("campaigns")
    .select("id, name, status, rpm_rate, commission_rate, commission_type, start_date, end_date, created_at, description")
    .eq("id", campaignId)
    .eq("user_id", brandId)
    .maybeSingle();

  if (campErr) return { error: campErr.message };
  if (!campaign || !isRpmCampaign(campaign)) return { error: "RPM campaign not found" };

  const rpmRate = resolveRpmRate(campaign);
  const commissionPct = Number(campaign.commission_rate ?? 100);

  type LinkRow = {
    content_id: string;
    creator_row_id: string;
    views_baseline?: number | null;
    views_last_settled?: number | null;
    rpm_accrued?: number | null;
  };

  let links: LinkRow[] = [];

  {
    const withCols = await admin
      .from("campaign_content")
      .select("content_id, creator_row_id, views_baseline, views_last_settled, rpm_accrued")
      .eq("brand_id", brandId)
      .eq("campaign_id", campaignId);
    if (withCols.error?.message?.includes("views_baseline") || withCols.error?.message?.includes("rpm_accrued")) {
      const basic = await admin
        .from("campaign_content")
        .select("content_id, creator_row_id")
        .eq("brand_id", brandId)
        .eq("campaign_id", campaignId);
      links = (basic.data || []) as LinkRow[];
    } else if (withCols.error) {
      return { error: withCols.error.message };
    } else {
      links = (withCols.data || []) as LinkRow[];
    }
  }

  const contentIds = [...new Set(links.map((l) => String(l.content_id)).filter(Boolean))];
  const creatorIds = [...new Set(links.map((l) => String(l.creator_row_id)).filter(Boolean))];

  const contentById = new Map<string, Record<string, unknown>>();
  if (contentIds.length) {
    const { data: contentRows } = await admin
      .from("creator_content")
      .select("id, title, views, likes, comments, shares, post_url, creator_row_id")
      .eq("brand_id", brandId)
      .in("id", contentIds);
    for (const row of contentRows || []) contentById.set(String(row.id), row as Record<string, unknown>);
  }

  const creatorById = new Map<string, Record<string, unknown>>();
  if (creatorIds.length) {
    const { data: creators } = await admin
      .from("creators")
      .select("id, handle, full_name, avatar_url, platform, balance")
      .eq("user_id", brandId)
      .in("id", creatorIds);
    for (const row of creators || []) creatorById.set(String(row.id), row as Record<string, unknown>);
  }

  const linkByContent = new Map(links.map((l) => [String(l.content_id), l]));

  const contentOut: RpmAnalyticsSnapshot["content"] = [];
  const byCreator = new Map<string, RpmCreatorAnalytics>();

  for (const contentId of contentIds) {
    const row = contentById.get(contentId);
    if (!row) continue;
    const link = linkByContent.get(contentId);
    const creatorId = String(link?.creator_row_id || row.creator_row_id || "");
    const creator = creatorById.get(creatorId);
    const views = Number(row.views ?? 0);
    const likes = Number(row.likes ?? 0);
    const comments = Number(row.comments ?? 0);
    const shares = Number(row.shares ?? 0);
    const lastSettled = Number(link?.views_last_settled ?? 0);
    const accrued = Number(link?.rpm_accrued ?? 0);
    const billablePending = Math.max(0, views - lastSettled);
    const pending = rpmCreatorAmount(billablePending, rpmRate, commissionPct);

    contentOut.push({
      id: contentId,
      title: String(row.title || "Untitled"),
      creatorId,
      creatorHandle: String(creator?.handle || "").replace(/^@/, ""),
      views,
      likes,
      comments,
      shares,
      postUrl: typeof row.post_url === "string" ? row.post_url : null,
      viewsLastSettled: lastSettled,
      rpmAccrued: accrued,
      pending,
    });

    const agg = byCreator.get(creatorId) || {
      creatorId,
      handle: String(creator?.handle || "").replace(/^@/, ""),
      fullName: String(creator?.full_name || creator?.handle || "Creator"),
      avatarUrl: typeof creator?.avatar_url === "string" ? creator.avatar_url : null,
      platform: String(creator?.platform || "TikTok"),
      contentCount: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      engagementRate: 0,
      billableViews: 0,
      accrued: 0,
      pending: 0,
    };
    agg.contentCount += 1;
    agg.views += views;
    agg.likes += likes;
    agg.comments += comments;
    agg.shares += shares;
    agg.billableViews += billablePending;
    agg.accrued += accrued;
    agg.pending += pending;
    agg.engagementRate = engagementRate(agg.views, agg.likes, agg.comments, agg.shares);
    byCreator.set(creatorId, agg);
  }

  const creators = [...byCreator.values()].sort((a, b) => b.views - a.views);
  const totals = creators.reduce(
    (acc, c) => {
      acc.views += c.views;
      acc.likes += c.likes;
      acc.comments += c.comments;
      acc.shares += c.shares;
      acc.contentCount += c.contentCount;
      acc.accrued += c.accrued;
      acc.pending += c.pending;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, contentCount: 0, accrued: 0, pending: 0 },
  );
  totals.engagementRate = engagementRate(totals.views, totals.likes, totals.comments, totals.shares);
  totals.accrued = Math.round(totals.accrued * 100) / 100;
  totals.pending = Math.round(totals.pending * 100) / 100;

  return {
    campaign: {
      id: String(campaign.id),
      name: String(campaign.name),
      status: String(campaign.status),
      rpm_rate: rpmRate,
      commission_rate: commissionPct,
      commission_type: String(campaign.commission_type),
      start_date: campaign.start_date as string | null,
      end_date: campaign.end_date as string | null,
      created_at: campaign.created_at as string | null,
      description: campaign.description as string | null,
    },
    totals,
    creators,
    content: contentOut.sort((a, b) => b.views - a.views),
  };
}
