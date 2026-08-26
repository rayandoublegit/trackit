import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";
import {
  DEMO_CAMPAIGN_DESCRIPTION,
  DEMO_CAMPAIGN_NAME,
  DEMO_CREATOR_NOTES,
  DEMO_LIST_MAX_CREATORS,
  DEMO_LIST_NAME,
  buildDemoSalePlans,
  daysAgoToIso,
  demoAvatarUrl,
  mulberry32,
  pickDemoCreators,
  type DemoCreatorSeed,
} from "@/lib/demo-preset-data";

export type DemoPresetAffiliate = {
  creator: string;
  platform: string;
  ref: string;
  code: string;
  clicks: number;
  conversions: number;
  sales: number;
  commission: number;
  status: string;
  destinationUrl: string;
  link: string;
};

export type DemoPresetResult = {
  ok: boolean;
  seeded: boolean;
  already?: boolean;
  error?: string;
  campaignId?: string;
  folderId?: string;
  creatorHandles?: string[];
  affiliates?: DemoPresetAffiliate[];
};

const CONTENT_TITLES = [
  "Hook UGC — unboxing produit",
  "Story time — avant / après",
  "Haul + lien bio",
];

function daysAgoIso(daysAgo: number, rand: () => number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(8 + Math.floor(rand() * 12), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return d.toISOString();
}

async function purgeDemoAffiliateLinks(
  admin: SupabaseClient,
  userId: string,
  campaignId: string,
): Promise<void> {
  // Demo campaign only — wipe every seeded affiliate link + fake clicks.
  const { data: links } = await admin
    .from("affiliate_links")
    .select("id")
    .eq("brand_id", userId)
    .eq("campaign_id", campaignId);

  const ids = (links || []).map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return;

  await admin.from("link_clicks").delete().in("link_id", ids);
  await admin.from("affiliate_links").delete().in("id", ids).eq("brand_id", userId);
}

async function ensureAttributedSales(
  admin: SupabaseClient,
  userId: string,
  campaignId: string,
  demoCreators: DemoCreatorSeed[],
  creatorIdsByHandle: Map<string, string>,
  slugByHandle: Map<string, { linkId: string; slug: string }>,
  shopDomain: string,
  rand: () => number,
): Promise<void> {
  const rateByHandle = new Map(demoCreators.map((c) => [c.handle.toLowerCase(), c.commissionRate]));
  const promoByHandle = new Map(demoCreators.map((c) => [c.handle.toLowerCase(), c.promoCode]));

  // Backfill attributed_ref on existing campaign sales (analytics + affiliate CA)
  const { data: unattributed } = await admin
    .from("sales")
    .select("id, creator_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .is("attributed_ref", null)
    .limit(500);

  if (unattributed?.length) {
    const handleByCreatorId = new Map<string, string>();
    for (const [handle, id] of creatorIdsByHandle) handleByCreatorId.set(id, handle);

    for (const row of unattributed) {
      const handle = handleByCreatorId.get(String(row.creator_id));
      const slug = handle ? slugByHandle.get(handle)?.slug : undefined;
      if (!slug) continue;
      await admin.from("sales").update({ attributed_ref: slug }).eq("id", row.id).eq("user_id", userId);
    }
  }

  const { count: attributedCount } = await admin
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .not("attributed_ref", "is", null);

  if ((attributedCount ?? 0) > 0) return;

  // Fresh sales batch with affiliate attribution
  const handles = demoCreators.map((c) => c.handle);
  const salePlans = buildDemoSalePlans(userId, handles);
  const commissionTotals = new Map<string, { earned: number; sales: number; balance: number }>();
  const salesRows: Record<string, unknown>[] = [];

  for (let i = 0; i < salePlans.length; i++) {
    const plan = salePlans[i]!;
    const creatorId = creatorIdsByHandle.get(plan.handle.toLowerCase());
    if (!creatorId) continue;
    const rate = rateByHandle.get(plan.handle.toLowerCase()) ?? 15;
    const commission = parseFloat(((plan.orderAmount * rate) / 100).toFixed(2));
    const promo = promoByHandle.get(plan.handle.toLowerCase()) || "DEMO";
    const createdAt = daysAgoIso(plan.daysAgo, rand);
    const isShopify = plan.kind === "shopify";
    const slug = slugByHandle.get(plan.handle.toLowerCase())?.slug ?? null;

    salesRows.push({
      user_id: userId,
      creator_id: creatorId,
      campaign_id: campaignId,
      shopify_order_id: isShopify
        ? `demo_${userId.slice(0, 8)}_${i}_${Math.floor(rand() * 1e9)}`
        : `manual_demo_${userId.slice(0, 8)}_${i}_${Math.floor(rand() * 1e9)}`,
      order_amount: plan.orderAmount,
      commission_amount: commission,
      discount_code_used: promo,
      shop_domain: isShopify ? shopDomain : "manual",
      status: "paid",
      created_at: createdAt,
      attributed_ref: slug,
    });

    const prev = commissionTotals.get(creatorId) || { earned: 0, sales: 0, balance: 0 };
    prev.earned += commission;
    prev.sales += 1;
    prev.balance += commission;
    commissionTotals.set(creatorId, prev);
  }

  if (!salesRows.length) return;

  const { error: salesErr } = await admin.from("sales").insert(salesRows);
  if (salesErr) {
    // Retry without attributed_ref if column missing in older DBs
    if (String(salesErr.message || "").toLowerCase().includes("attributed_ref")) {
      const stripped = salesRows.map(({ attributed_ref: _a, ...rest }) => rest);
      const { error: retryErr } = await admin.from("sales").insert(stripped);
      if (retryErr) throw new Error(retryErr.message);
    } else {
      throw new Error(salesErr.message);
    }
  }

  for (const [creatorId, totals] of commissionTotals) {
    await admin
      .from("creators")
      .update({
        total_earned: Math.round(totals.earned * 100) / 100,
        total_sales: totals.sales,
        balance: Math.round(totals.balance * 100) / 100,
      })
      .eq("id", creatorId)
      .eq("user_id", userId);
  }
}

async function ensureDemoContent(
  admin: SupabaseClient,
  userId: string,
  campaignId: string,
  demoCreators: DemoCreatorSeed[],
  creatorIdsByHandle: Map<string, string>,
  rand: () => number,
): Promise<void> {
  const { count } = await admin
    .from("campaign_content")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", userId)
    .eq("campaign_id", campaignId);

  if ((count ?? 0) >= 2) return;

  const picks = demoCreators.filter((c) => creatorIdsByHandle.has(c.handle.toLowerCase())).slice(0, 3);
  if (!picks.length) return;

  for (let i = 0; i < picks.length; i++) {
    const c = picks[i]!;
    const creatorRowId = creatorIdsByHandle.get(c.handle.toLowerCase())!;
    const views = 12_000 + Math.floor(rand() * 180_000);
    const likes = Math.floor(views * (0.04 + rand() * 0.08));
    const comments = Math.floor(likes * (0.04 + rand() * 0.1));
    const shares = Math.floor(likes * (0.02 + rand() * 0.06));
    const postedAt = daysAgoToIso(3 + Math.floor(rand() * 25), 14 + i);
    const seed = `trackit-content-${userId.slice(0, 6)}-${c.handle}-${i}`;
    const title = CONTENT_TITLES[i] ?? `Contenu démo ${i + 1}`;
    const postId = String(700_000_000_000_000_000 + Math.floor(rand() * 1e15));

    const row: Record<string, unknown> = {
      brand_id: userId,
      creator_row_id: creatorRowId,
      creator_user_id: userId,
      title,
      notes: "Contenu démo Trackit — stats mockées pour analystes",
      file_url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/500`,
      file_name: `${c.handle}-ugc-${i + 1}.jpg`,
      file_type: "image/jpeg",
      file_size: 420_000 + Math.floor(rand() * 800_000),
      post_url: `https://www.tiktok.com/@${c.handle}/video/${postId}`,
      views,
      likes,
      comments,
      shares,
      posted_at: postedAt,
      stats_updated_at: new Date().toISOString(),
      created_at: postedAt,
    };

    const { data: inserted, error } = await admin.from("creator_content").insert(row).select("id").single();

    if (error || !inserted) {
      // Schema without stats columns
      if (error && /views|post_url|stats_/i.test(error.message)) {
        const minimal = {
          brand_id: userId,
          creator_row_id: creatorRowId,
          creator_user_id: userId,
          title,
          notes: row.notes,
          file_url: row.file_url,
          file_name: row.file_name,
          file_type: row.file_type,
          file_size: row.file_size,
        };
        const retry = await admin.from("creator_content").insert(minimal).select("id").single();
        if (retry.error || !retry.data) continue;
        await admin.from("campaign_content").upsert(
          {
            brand_id: userId,
            campaign_id: campaignId,
            creator_row_id: creatorRowId,
            content_id: retry.data.id,
          },
          { onConflict: "campaign_id,content_id", ignoreDuplicates: true },
        );
        continue;
      }
      continue;
    }

    await admin.from("campaign_content").upsert(
      {
        brand_id: userId,
        campaign_id: campaignId,
        creator_row_id: creatorRowId,
        content_id: inserted.id,
      },
      { onConflict: "campaign_id,content_id", ignoreDuplicates: true },
    );
  }
}

/** Prefer the oldest campaign; merge then delete other "Trackit" rows so UI shows one preset. */
async function resolveSingletonDemoCampaign(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: rows } = await admin
    .from("campaigns")
    .select("id, created_at, description")
    .eq("user_id", userId)
    .eq("name", DEMO_CAMPAIGN_NAME)
    .order("created_at", { ascending: true });

  if (!rows?.length) return null;

  // Prefer the row flagged with the demo marker when present
  const marked = rows.find((r) =>
    String(r.description || "").includes("[trackit-demo-preset]"),
  );
  const keeperId = String((marked ?? rows[0]!).id);
  const dupIds = rows.map((r) => String(r.id)).filter((id) => id !== keeperId);

  if (dupIds.length) {
    // Re-point linked data to the single keeper, then drop extras
    await admin.from("sales").update({ campaign_id: keeperId }).in("campaign_id", dupIds).eq("user_id", userId);
    await admin.from("affiliate_links").update({ campaign_id: keeperId }).in("campaign_id", dupIds).eq("brand_id", userId);
    await admin.from("campaign_content").update({ campaign_id: keeperId }).in("campaign_id", dupIds).eq("brand_id", userId);
    // campaign_creators unique (campaign_id, creator_id) — delete dups first then re-seed later
    await admin.from("campaign_creators").delete().in("campaign_id", dupIds).eq("user_id", userId);
    await admin.from("campaigns").delete().in("id", dupIds).eq("user_id", userId);
  }

  // Ensure description still marks the keeper as demo preset
  await admin
    .from("campaigns")
    .update({ description: DEMO_CAMPAIGN_DESCRIPTION })
    .eq("id", keeperId)
    .eq("user_id", userId);

  return keeperId;
}

async function resolveSingletonDemoFolder(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: rows } = await admin
    .from("discovery_folders")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("name", DEMO_LIST_NAME)
    .order("created_at", { ascending: true });

  if (!rows?.length) return null;

  const keeperId = String(rows[0]!.id);
  const dupIds = rows.slice(1).map((r) => String(r.id));
  if (dupIds.length) {
    // Move items onto keeper (unique folder_id+username) then drop dups
    for (const dupId of dupIds) {
      const { data: items } = await admin
        .from("discovery_folder_items")
        .select("creator_username")
        .eq("folder_id", dupId);
      if (items?.length) {
        await admin.from("discovery_folder_items").upsert(
          items.map((it) => ({
            folder_id: keeperId,
            creator_username: it.creator_username,
          })),
          { onConflict: "folder_id,creator_username", ignoreDuplicates: true },
        );
      }
    }
    await admin.from("discovery_folders").delete().in("id", dupIds).eq("user_id", userId);
  }
  return keeperId;
}

/**
 * Server-side seed of the Trackit demo list + campaign for a brand workspace.
 * Idempotent: exactly one "Trackit" campaign + list; completes missing mock data.
 */
export async function seedDemoPresetForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<DemoPresetResult> {
  const { data: profile } = await admin
    .from("profiles")
    .select("account_type, shopify_store")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.account_type === "creator") {
    return { ok: true, seeded: false, already: true };
  }

  // Collapse any prior multi-seed races into one campaign + one list
  let campaignId = (await resolveSingletonDemoCampaign(admin, userId)) || "";
  let folderId = (await resolveSingletonDemoFolder(admin, userId)) || "";

  const demoCreators = pickDemoCreators(userId, DEMO_LIST_MAX_CREATORS);
  const rand = mulberry32(
    demoCreators.reduce((acc, c) => acc + c.handle.length * 17, userId.length * 31),
  );

  // ── Creators table + discovery_saved ──────────────────────────────
  const creatorIdsByHandle = new Map<string, string>();
  const workspaceId = await resolveOwnerActiveWorkspaceId(admin, userId);

  for (const c of demoCreators) {
    const avatar = demoAvatarUrl(c.avatarSeed);
    const snapshot = buildDiscoverySnapshot(c, avatar);

    const creatorPayload: Record<string, unknown> = {
      user_id: userId,
      handle: c.handle,
      full_name: c.displayName,
      avatar_url: avatar,
      platform: c.platform,
      followers: c.followers,
      engagement_rate: c.engagement,
      niche: c.niche,
      commission_rate: c.commissionRate,
      discount_code: c.promoCode,
      balance: 0,
      total_earned: 0,
      total_sales: 0,
    };
    if (workspaceId) creatorPayload.workspace_id = workspaceId;

    const { data: existingCreators } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", userId)
      .eq("handle", c.handle)
      .limit(1);
    const existingCreatorId = existingCreators?.[0]?.id ? String(existingCreators[0].id) : null;

    let creatorRowId = existingCreatorId;
    let creatorErrMsg: string | null = null;
    if (existingCreatorId) {
      const { error } = await admin.from("creators").update(creatorPayload).eq("id", existingCreatorId);
      if (error) creatorErrMsg = error.message;
    } else {
      const { data: inserted, error } = await admin
        .from("creators")
        .insert(creatorPayload)
        .select("id")
        .single();
      if (error || !inserted) creatorErrMsg = error?.message || null;
      else creatorRowId = String(inserted.id);
    }

    if (creatorErrMsg || !creatorRowId) {
      return { ok: false, seeded: false, error: creatorErrMsg || `Failed to upsert @${c.handle}` };
    }
    creatorIdsByHandle.set(c.handle.toLowerCase(), creatorRowId);

    const savedPayload: Record<string, unknown> = {
      user_id: userId,
      creator_username: c.handle,
      platform: c.platform.toLowerCase(),
      display_name: c.displayName,
      avatar_url: avatar,
      followers: c.followers,
      engagement_rate: c.engagement,
      primary_niche: c.niche,
      country_code: c.country,
      value_score: Math.round(50 + rand() * 40),
      pipeline_status: c.stage,
      notes: DEMO_CREATOR_NOTES,
      snapshot,
      updated_at: new Date().toISOString(),
    };
    if (workspaceId) savedPayload.workspace_id = workspaceId;

    const { data: existingSaved } = await admin
      .from("discovery_saved")
      .select("id")
      .eq("user_id", userId)
      .eq("creator_username", c.handle)
      .limit(1);
    if (existingSaved?.[0]?.id) {
      await admin.from("discovery_saved").update(savedPayload).eq("id", existingSaved[0].id);
    } else {
      await admin.from("discovery_saved").insert(savedPayload);
    }
  }

  // ── Folder "Trackit" (single instance) ────────────────────────────
  if (!folderId) {
    const { count } = await admin
      .from("discovery_folders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: folder, error: folderErr } = await admin
      .from("discovery_folders")
      .insert({
        user_id: userId,
        name: DEMO_LIST_NAME,
        color: "blue",
        position: count ?? 0,
      })
      .select("id")
      .single();

    if (folderErr || !folder) {
      const raced = await resolveSingletonDemoFolder(admin, userId);
      if (!raced) {
        return { ok: false, seeded: false, error: folderErr?.message || "Failed to create Trackit list" };
      }
      folderId = raced;
    } else {
      folderId = String(folder.id);
      folderId = (await resolveSingletonDemoFolder(admin, userId)) || folderId;
    }
  } else {
    folderId = (await resolveSingletonDemoFolder(admin, userId)) || folderId;
  }

  const keepHandles = demoCreators.map((c) => c.handle);
  const keepHandlesLower = new Set(keepHandles.map((h) => h.toLowerCase()));

  await admin.from("discovery_folder_items").upsert(
    keepHandles.map((handle) => ({ folder_id: folderId, creator_username: handle })),
    { onConflict: "folder_id,creator_username", ignoreDuplicates: true },
  );

  // Cap the demo list: remove leftover items from older seeds (> 8).
  const { data: folderItems } = await admin
    .from("discovery_folder_items")
    .select("creator_username")
    .eq("folder_id", folderId);
  const extraHandles = (folderItems ?? [])
    .map((row) => String(row.creator_username || ""))
    .filter((handle) => handle && !keepHandlesLower.has(handle.toLowerCase()));
  if (extraHandles.length) {
    await admin
      .from("discovery_folder_items")
      .delete()
      .eq("folder_id", folderId)
      .in("creator_username", extraHandles);
  }

  // ── Campaign "Trackit" (single instance) ──────────────────────────
  if (!campaignId) {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 60);

    const { data: campaign, error: campErr } = await admin
      .from("campaigns")
      .insert({
        user_id: userId,
        name: DEMO_CAMPAIGN_NAME,
        description: DEMO_CAMPAIGN_DESCRIPTION,
        platform: "All",
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        commission_type: "percentage",
        commission_rate: 15,
        auto_payout: false,
        status: "active",
      })
      .select("id")
      .single();

    if (campErr || !campaign) {
      // Race: another request just inserted — pick the singleton
      const raced = await resolveSingletonDemoCampaign(admin, userId);
      if (!raced) {
        return { ok: false, seeded: false, error: campErr?.message || "Campaign insert failed" };
      }
      campaignId = raced;
    } else {
      campaignId = String(campaign.id);
      // Collapse if a parallel insert landed at the same time
      campaignId = (await resolveSingletonDemoCampaign(admin, userId)) || campaignId;
    }
  } else {
    campaignId = (await resolveSingletonDemoCampaign(admin, userId)) || campaignId;
  }

  const campaignCreatorRows = demoCreators
    .map((c) => {
      const creatorId = creatorIdsByHandle.get(c.handle.toLowerCase());
      if (!creatorId) return null;
      return {
        user_id: userId,
        campaign_id: campaignId,
        creator_id: creatorId,
        historical_sales_attached: true,
      };
    })
    .filter(Boolean);

  if (campaignCreatorRows.length) {
    await admin.from("campaign_creators").upsert(campaignCreatorRows as object[], {
      onConflict: "campaign_id,creator_id",
      ignoreDuplicates: true,
    });
  }

  // Keep demo campaign inventory aligned with the 8-creator list.
  const keepCreatorIds = [...creatorIdsByHandle.values()];
  const { data: linkedCreators } = await admin
    .from("campaign_creators")
    .select("creator_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId);
  const extraCreatorIds = (linkedCreators ?? [])
    .map((row) => String(row.creator_id || ""))
    .filter((id) => id && !keepCreatorIds.includes(id));
  if (extraCreatorIds.length) {
    await admin
      .from("campaign_creators")
      .delete()
      .eq("user_id", userId)
      .eq("campaign_id", campaignId)
      .in("creator_id", extraCreatorIds);
  }

  // ── Affiliate links: no longer seed mock data ─────────────────────
  // Purge any previously seeded demo affiliate links + fake clicks.
  await purgeDemoAffiliateLinks(admin, userId, campaignId);

  const slugByHandle = new Map<string, { linkId: string; slug: string }>();

  const shopDomain = profile?.shopify_store
    ? String(profile.shopify_store).includes(".")
      ? String(profile.shopify_store)
      : `${profile.shopify_store}.myshopify.com`
    : "trackit-demo.myshopify.com";

  try {
    await ensureAttributedSales(
      admin,
      userId,
      campaignId,
      demoCreators,
      creatorIdsByHandle,
      slugByHandle,
      shopDomain,
      rand,
    );
  } catch (e) {
    return {
      ok: false,
      seeded: false,
      error: e instanceof Error ? e.message : "Sales seed failed",
    };
  }

  // ── Campaign content (2–3 posts + views/likes stats) ──────────────
  await ensureDemoContent(admin, userId, campaignId, demoCreators, creatorIdsByHandle, rand);

  return {
    ok: true,
    seeded: true,
    campaignId,
    folderId,
    creatorHandles: demoCreators.map((c) => c.handle),
    affiliates: [] as DemoPresetAffiliate[],
  };
}

function buildDiscoverySnapshot(c: DemoCreatorSeed, avatar: string) {
  return {
    username: c.handle,
    displayName: c.displayName,
    avatarUrl: avatar,
    followersCount: c.followers,
    engagementRate: c.engagement,
    platform: c.platform.toLowerCase(),
    primaryNiche: c.niche,
    countryCode: c.country,
    avgViews: Math.round(c.followers * (0.08 + Math.random() * 0.12)),
    avgLikes: Math.round(c.followers * 0.04),
    avgComments: Math.round(c.followers * 0.003),
    avgShares: Math.round(c.followers * 0.001),
    commissionRate: c.commissionRate,
    crm: {
      promoCode: c.promoCode,
      commissionRate: c.commissionRate,
      lastEmail: c.email,
      label: "Demo Trackit",
    },
  };
}
