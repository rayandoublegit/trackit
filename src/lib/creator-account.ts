import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREATOR_DASHBOARD_ACCESS_STATUSES,
  CREATOR_LINK_STATUS,
  type CreatorLinkStatus,
} from "@/lib/creator-dashboard-access";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";
import { buildTrackitShortLink } from "@/lib/affiliate-short-link";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";
import { isRpmCampaign, resolveRpmRate } from "@/lib/rpm";

export type CreatorManagedRow = {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_sales: number;
  commission_rate: number | null;
  discount_code: string | null;
  handle: string | null;
  full_name: string | null;
  linked_user_id: string | null;
};

export function normalizeCreatorHandle(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");
}

function dedupeCreatorRows(rows: CreatorManagedRow[]): CreatorManagedRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

const CREATOR_ROW_SELECT =
  "id, user_id, balance, total_earned, total_sales, commission_rate, discount_code, handle, full_name, linked_user_id";

const CREATOR_ROW_MIN_SELECT =
  "id, user_id, commission_rate, discount_code, handle, full_name, linked_user_id";

function asCreatorManagedRow(row: Record<string, unknown>): CreatorManagedRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    balance: Number(row.balance ?? 0) || 0,
    total_earned: Number(row.total_earned ?? 0) || 0,
    total_sales: Number(row.total_sales ?? 0) || 0,
    commission_rate: (row.commission_rate as number | null) ?? null,
    discount_code: (row.discount_code as string | null) ?? null,
    handle: (row.handle as string | null) ?? null,
    full_name: (row.full_name as string | null) ?? null,
    linked_user_id: (row.linked_user_id as string | null) ?? null,
  };
}

async function selectCreatorRows(
  run: (select: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<CreatorManagedRow[]> {
  const full = await run(CREATOR_ROW_SELECT);
  if (!full.error && full.data?.length) {
    return (full.data as Record<string, unknown>[]).map(asCreatorManagedRow);
  }
  const minimal = await run(CREATOR_ROW_MIN_SELECT);
  if (minimal.error || !minimal.data?.length) return [];
  return (minimal.data as Record<string, unknown>[]).map(asCreatorManagedRow);
}

export const CREATOR_ROW_SYNC_SELECT =
  "id, handle, full_name, avatar_url, platform, commission_rate, discount_code, niche, followers, engagement_rate, linked_user_id, workspace_id";

export async function ensureCreatorRowForBrandLink(
  supabase: SupabaseClient,
  brandId: string,
  userId: string,
  profile: { username: string | null; full_name: string | null },
): Promise<CreatorManagedRow | null> {
  const linkedList = await selectCreatorRows((select) =>
    supabase.from("creators").select(select).eq("user_id", brandId).eq("linked_user_id", userId).limit(1),
  );
  if (linkedList[0]) return linkedList[0];

  const handle = normalizeCreatorHandle(profile.username);
  if (handle) {
    const onBrand = await selectCreatorRows((select) =>
      supabase.from("creators").select(select).eq("user_id", brandId),
    );
    const match = onBrand.find((row) => normalizeCreatorHandle(row.handle) === handle);
    if (match && (!match.linked_user_id || match.linked_user_id === userId)) {
      await supabase.from("creators").update({ linked_user_id: userId, handle }).eq("id", match.id);
      return { ...match, linked_user_id: userId, handle };
    }
  }

  const fallbackHandle =
    handle ||
    `u_${userId.replace(/-/g, "").slice(0, 12)}`;

  const insertRow: Record<string, unknown> = {
    user_id: brandId,
    handle: fallbackHandle,
    full_name: profile.full_name || fallbackHandle,
    linked_user_id: userId,
    platform: "tiktok",
    commission_rate: 10,
    needs_review: true,
  };
  const workspaceId = await resolveOwnerActiveWorkspaceId(supabase, brandId);
  if (workspaceId) insertRow.workspace_id = workspaceId;

  const { data: inserted, error } = await supabase
    .from("creators")
    .insert(insertRow)
    .select(CREATOR_ROW_SELECT)
    .single();

  if (!error && inserted) return asCreatorManagedRow(inserted as Record<string, unknown>);

  const retryList = await selectCreatorRows((select) =>
    supabase.from("creators").select(select).eq("user_id", brandId).eq("linked_user_id", userId).limit(1),
  );
  return retryList[0] ?? null;
}

/**
 * Relie le créateur aux fiches marque via le pseudo onboarding (profiles.username).
 * Même pseudo normalisé côté compte et côté marque → upload & dashboard OK.
 */
export async function syncCreatorRowsByProfileHandle(
  supabase: SupabaseClient,
  userId: string,
  profile?: { username: string | null; full_name: string | null } | null,
): Promise<void> {
  let profileRow = profile;
  if (!profileRow) {
    const { data } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", userId)
      .maybeSingle();
    profileRow = data;
  }

  const handle = normalizeCreatorHandle(profileRow?.username);
  if (!handle) return;

  if (profileRow?.username && profileRow.username !== handle) {
    await supabase.from("profiles").update({ username: handle }).eq("id", userId);
  }

  const links = await fetchCreatorLinksForUser(supabase, userId);
  const brandIds = new Set<string>();

  for (const link of links) {
    if (isBrandBlocked(links, link.brand_id)) continue;
    if ((CREATOR_DASHBOARD_ACCESS_STATUSES as readonly string[]).includes(link.status)) {
      brandIds.add(link.brand_id);
    }
  }

  const alreadyLinked = await selectCreatorRows((cols) =>
    supabase.from("creators").select(cols).eq("linked_user_id", userId),
  );
  for (const row of alreadyLinked) {
    if (!isBrandBlocked(links, row.user_id)) brandIds.add(row.user_id);
  }

  for (const brandId of brandIds) {
    const brandRows = await selectCreatorRows((cols) =>
      supabase.from("creators").select(cols).eq("user_id", brandId),
    );

    const byHandle = brandRows.filter((r) => normalizeCreatorHandle(r.handle) === handle);
    const owned = byHandle.find((r) => !r.linked_user_id || r.linked_user_id === userId)
      ?? brandRows.find((r) => r.linked_user_id === userId)
      ?? null;

    if (owned) {
      const patch: Record<string, unknown> = {};
      if (owned.linked_user_id !== userId) patch.linked_user_id = userId;
      if (normalizeCreatorHandle(owned.handle) !== handle) patch.handle = handle;
      const nextName = (profileRow?.full_name || "").trim();
      if (nextName && owned.full_name !== nextName) patch.full_name = nextName;
      if (Object.keys(patch).length) {
        await supabase.from("creators").update(patch).eq("id", owned.id);
      }
      if (!links.some((l) => l.brand_id === brandId)) {
        await ensureCreatorLinkRecord(supabase, userId, brandId, CREATOR_LINK_STATUS.pendingReview);
      }
      continue;
    }

    const takenByOther = byHandle.some((r) => r.linked_user_id && r.linked_user_id !== userId);
    if (takenByOther) continue;

    if (hasBrandAccessLink(links, brandId) || alreadyLinked.some((r) => r.user_id === brandId)) {
      const insertRow: Record<string, unknown> = {
        user_id: brandId,
        handle,
        full_name: profileRow?.full_name || handle,
        linked_user_id: userId,
        platform: "tiktok",
        commission_rate: 10,
        needs_review: true,
      };
      const brandWorkspaceId = await resolveOwnerActiveWorkspaceId(supabase, brandId);
      if (brandWorkspaceId) insertRow.workspace_id = brandWorkspaceId;
      await supabase.from("creators").insert(insertRow);
      if (!links.some((l) => l.brand_id === brandId)) {
        await ensureCreatorLinkRecord(supabase, userId, brandId, CREATOR_LINK_STATUS.pendingReview);
      }
    }
  }
}

export type CreatorUploadTarget = { brandId: string; creatorRowId: string };

export type CreatorBrandMembership = {
  brandId: string;
  brandName: string;
  creatorRowId: string;
  creatorHandle: string | null;
  linkStatus: CreatorLinkStatus | "legacy";
  handleMatched: boolean;
};

type CreatorLinkRow = { brand_id: string; status: string };

async function fetchCreatorLinksForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<CreatorLinkRow[]> {
  const { data, error } = await supabase
    .from("creator_links")
    .select("brand_id, status")
    .eq("creator_id", userId);
  if (error) return [];
  return (data ?? []).map((l) => ({ brand_id: String(l.brand_id), status: String(l.status) }));
}

function isBrandBlocked(links: CreatorLinkRow[], brandId: string): boolean {
  const link = links.find((l) => l.brand_id === brandId);
  return (
    link?.status === CREATOR_LINK_STATUS.revoked || link?.status === CREATOR_LINK_STATUS.ignored
  );
}

function hasBrandAccessLink(links: CreatorLinkRow[], brandId: string): boolean {
  const link = links.find((l) => l.brand_id === brandId);
  if (!link) return false;
  return (CREATOR_DASHBOARD_ACCESS_STATUSES as readonly string[]).includes(link.status);
}

function filterAccessibleCreatorRows(
  rows: CreatorManagedRow[],
  userId: string,
  links: CreatorLinkRow[],
  handle: string,
): CreatorManagedRow[] {
  return dedupeCreatorRows(rows).filter((row) => {
    if (isBrandBlocked(links, row.user_id)) return false;
    if (row.linked_user_id === userId) return true;
    if (hasBrandAccessLink(links, row.user_id)) return true;
    if (handle && normalizeCreatorHandle(row.handle) === handle) {
      if (row.linked_user_id && row.linked_user_id !== userId) return false;
      if (!row.linked_user_id || row.linked_user_id === userId) return true;
    }
    return false;
  });
}

async function ensureCreatorLinkRecord(
  supabase: SupabaseClient,
  userId: string,
  brandId: string,
  status: CreatorLinkStatus = CREATOR_LINK_STATUS.pendingReview,
): Promise<void> {
  await supabase.from("creator_links").upsert(
    { creator_id: userId, brand_id: brandId, status },
    { onConflict: "creator_id,brand_id", ignoreDuplicates: true },
  );
}

async function reconcileCreatorBrandRows(
  supabase: SupabaseClient,
  userId: string,
  rows: CreatorManagedRow[],
  links: CreatorLinkRow[],
  handle: string,
): Promise<CreatorManagedRow[]> {
  const updated = [...rows];
  for (const row of updated) {
    if (isBrandBlocked(links, row.user_id)) continue;

    const rowHandle = normalizeCreatorHandle(row.handle);
    const handleMatch = Boolean(handle && rowHandle === handle);
    const shouldOwn = row.linked_user_id === userId || handleMatch || hasBrandAccessLink(links, row.user_id);

    if (shouldOwn && row.linked_user_id !== userId) {
      await supabase.from("creators").update({ linked_user_id: userId }).eq("id", row.id);
      row.linked_user_id = userId;
    }

    if (row.linked_user_id === userId && !links.some((l) => l.brand_id === row.user_id)) {
      await ensureCreatorLinkRecord(supabase, userId, row.user_id, CREATOR_LINK_STATUS.pendingReview);
    }
  }
  return updated;
}

/** Brands a creator belongs to (for settings + content upload). */
export async function listCreatorBrandMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: { username: string | null; full_name: string | null } | null; brands: CreatorBrandMembership[] }> {
  const { profile, rows } = await findCreatorRowsForProfile(supabase, userId);
  if (rows.length === 0) {
    return { profile, brands: [] };
  }

  const brandIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: brandProfiles } = await supabase
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);

  const links = await fetchCreatorLinksForUser(supabase, userId);
  const handle = normalizeCreatorHandle(profile?.username);

  const nameById = new Map(
    (brandProfiles ?? []).map((b) => [
      b.id,
      b.business_name || b.full_name || (b.username ? `@${b.username}` : "Marque"),
    ]),
  );

  const brands: CreatorBrandMembership[] = rows.map((row) => {
    const link = links.find((l) => l.brand_id === row.user_id);
    const linkStatus: CreatorBrandMembership["linkStatus"] =
      link && (CREATOR_DASHBOARD_ACCESS_STATUSES as readonly string[]).includes(link.status)
        ? (link.status as CreatorLinkStatus)
        : "legacy";
    return {
      brandId: row.user_id,
      brandName: nameById.get(row.user_id) || "Marque",
      creatorRowId: row.id,
      creatorHandle: row.handle,
      linkStatus,
      handleMatched: Boolean(handle && normalizeCreatorHandle(row.handle) === handle),
    };
  });

  return { profile, brands };
}

/** Resolve (and if needed create) the creators row used for content upload. */
export async function resolveCreatorUploadTarget(
  supabase: SupabaseClient,
  userId: string,
  preferredBrandId?: string | null,
): Promise<{ target: CreatorUploadTarget } | { error: string }> {
  let { profile, rows } = await findCreatorRowsForProfile(supabase, userId);

  if (rows.length === 0) {
    if (!profile) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("username, full_name, account_type")
        .eq("id", userId)
        .maybeSingle();
      profile = profileRow;
    }
    if (!profile) return { error: "Profile not found" };

    const { data: brandLinks } = await supabase
      .from("creator_links")
      .select("brand_id")
      .eq("creator_id", userId)
      .in("status", [...CREATOR_DASHBOARD_ACCESS_STATUSES]);

    for (const link of brandLinks ?? []) {
      const brandId = String(link.brand_id || "").trim();
      if (!brandId) continue;
      await ensureCreatorRowForBrandLink(supabase, brandId, userId, profile);
    }

    ({ rows } = await findCreatorRowsForProfile(supabase, userId));
  }

  if (rows.length === 0) {
    return { error: "No brand linked to this creator account" };
  }

  const row =
    (preferredBrandId ? rows.find((r) => r.user_id === preferredBrandId) : null) ?? rows[0];
  if (!row?.id || !row.user_id) {
    return { error: "Could not resolve brand link" };
  }

  return { target: { brandId: row.user_id, creatorRowId: row.id } };
}

export async function findCreatorRowsForProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: { username: string | null; full_name: string | null; account_type: string | null } | null; rows: CreatorManagedRow[] }> {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("username, full_name, account_type")
    .eq("id", userId)
    .maybeSingle();

  let profile = profileRow;

  if (profile?.username) {
    await syncCreatorRowsByProfileHandle(supabase, userId, profile);
    const { data: refreshed } = await supabase
      .from("profiles")
      .select("username, full_name, account_type")
      .eq("id", userId)
      .maybeSingle();
    if (refreshed) profile = refreshed;
  }

  const found: CreatorManagedRow[] = [];

  const allLinks = await fetchCreatorLinksForUser(supabase, userId);
  const accessBrandIds = [
    ...new Set(
      allLinks
        .filter((l) => (CREATOR_DASHBOARD_ACCESS_STATUSES as readonly string[]).includes(l.status))
        .map((l) => l.brand_id),
    ),
  ];
  const brandIds = accessBrandIds;
  const hasActiveBrandLinks = brandIds.length > 0;

  const linkedRows = await selectCreatorRows((cols) =>
    supabase.from("creators").select(cols).eq("linked_user_id", userId),
  );
  if (linkedRows.length) found.push(...linkedRows);

  if (!profile) {
    const reconciled = await reconcileCreatorBrandRows(supabase, userId, found, allLinks, "");
    return {
      profile: null,
      rows: filterAccessibleCreatorRows(reconciled, userId, allLinks, ""),
    };
  }

  if (profile.account_type !== "creator" && (hasActiveBrandLinks || found.length > 0)) {
    await supabase.from("profiles").update({ account_type: "creator" }).eq("id", userId);
    profile = { ...profile, account_type: "creator" };
  }

  if (profile.account_type !== "creator") {
    const handleEarly = normalizeCreatorHandle(profile.username);
    if (handleEarly) {
      const handleRows = await selectCreatorRows((cols) =>
        supabase.from("creators").select(cols).ilike("handle", handleEarly),
      );
      for (const row of handleRows) {
        if (normalizeCreatorHandle(row.handle) === handleEarly && !found.some((f) => f.id === row.id)) {
          found.push(row);
        }
      }
    }
    const reconciled = await reconcileCreatorBrandRows(supabase, userId, found, allLinks, handleEarly);
    return {
      profile,
      rows: filterAccessibleCreatorRows(reconciled, userId, allLinks, handleEarly),
    };
  }

  const handle = normalizeCreatorHandle(profile.username);

  if (brandIds.length > 0) {
    const brandRows = await selectCreatorRows((cols) =>
      supabase.from("creators").select(cols).in("user_id", brandIds),
    );
    const rowsByBrand = new Map<string, CreatorManagedRow[]>();
    for (const row of brandRows) {
      const list = rowsByBrand.get(row.user_id) || [];
      list.push(row);
      rowsByBrand.set(row.user_id, list);
    }

    for (const brandId of brandIds) {
      const brandCreators = rowsByBrand.get(brandId) || [];
      for (const row of brandCreators) {
        const rowHandle = normalizeCreatorHandle(row.handle);
        const alreadyLinked = row.linked_user_id === userId;
        const handleMatch = Boolean(handle && rowHandle === handle);
        if (alreadyLinked || handleMatch) {
          found.push(row);
          if (!row.linked_user_id) {
            await supabase.from("creators").update({ linked_user_id: userId }).eq("id", row.id);
          }
        }
      }

      const unlinkedOnBrand = brandCreators.filter((row) => !row.linked_user_id);
      const linkedToUser = brandCreators.filter((row) => row.linked_user_id === userId);
      if (linkedToUser.length === 0 && unlinkedOnBrand.length === 1) {
        const row = unlinkedOnBrand[0];
        if (!found.some((f) => f.id === row.id)) {
          found.push(row);
          await supabase.from("creators").update({ linked_user_id: userId }).eq("id", row.id);
        }
      }

      if (!found.some((f) => f.user_id === brandId)) {
        const ensured = await ensureCreatorRowForBrandLink(supabase, brandId, userId, profile);
        if (ensured && !found.some((f) => f.id === ensured.id)) {
          found.push(ensured);
        }
      }
    }
  }

  if (found.length === 0 && handle) {
    const handleRows = await selectCreatorRows((cols) =>
      supabase.from("creators").select(cols).ilike("handle", handle),
    );
    const exact = handleRows.filter((row) => normalizeCreatorHandle(row.handle) === handle);
    for (const row of exact) {
      if (isBrandBlocked(allLinks, row.user_id)) continue;
      if (row.linked_user_id && row.linked_user_id !== userId) continue;
      found.push(row);
    }
  } else if (handle) {
    const handleRows = await selectCreatorRows((cols) =>
      supabase.from("creators").select(cols).ilike("handle", handle),
    );
    for (const row of handleRows) {
      if (normalizeCreatorHandle(row.handle) !== handle) continue;
      if (isBrandBlocked(allLinks, row.user_id)) continue;
      if (row.linked_user_id && row.linked_user_id !== userId) continue;
      if (!found.some((f) => f.id === row.id)) found.push(row);
    }
  }

  const reconciled = await reconcileCreatorBrandRows(supabase, userId, found, allLinks, handle);
  const filtered = filterAccessibleCreatorRows(reconciled, userId, allLinks, handle);

  return { profile, rows: filtered };
}

async function fetchSalesForCreator(
  supabase: SupabaseClient,
  creatorIds: string[],
  brandIds: string[],
  discountCodes: string[],
) {
  type SaleRow = {
    id: string;
    order_amount: number | null;
    commission_amount: number | null;
    created_at: string | null;
    discount_code_used: string | null;
    status: string | null;
    user_id: string | null;
    creator_id?: string | null;
  };

  const select =
    "id, user_id, creator_id, order_amount, commission_amount, created_at, discount_code_used, status";
  const byId = new Map<string, SaleRow>();

  if (creatorIds.length > 0) {
    const { data } = await supabase
      .from("sales")
      .select(select)
      .in("creator_id", creatorIds)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const row of (data || []) as SaleRow[]) {
      byId.set(row.id, row);
    }
  }

  const normalizedCodes = [...new Set(discountCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (brandIds.length > 0 && normalizedCodes.length > 0) {
    const { data } = await supabase
      .from("sales")
      .select(select)
      .in("user_id", brandIds)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const row of (data || []) as SaleRow[]) {
      const code = String(row.discount_code_used || "").trim().toUpperCase();
      if (normalizedCodes.includes(code)) {
        byId.set(row.id, row);
      }
    }
  }

  return [...byId.values()].sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );
}

export type CreatorStatsPayload = {
  ok: true;
  linked: boolean;
  accessRevoked?: boolean;
  revokedBrandName?: string | null;
  creatorName: string | null;
  brandName: string | null;
  discountCode: string | null;
  commissionRate: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned: number;
  totalPaidOut?: number;
  salesCount: number;
  sales: {
    id: string;
    orderAmount: number;
    commissionAmount: number;
    date: string;
    discountCode: string | null;
    status: string | null;
    brandName: string | null;
    /** Brand (owner user id) the sale belongs to. */
    brandId: string | null;
  }[];
  /** Commission figures per brand the creator has a creators row with. */
  byBrand: CreatorCommissionBrandStats[];
};

export async function buildCreatorStatsPayload(
  supabase: SupabaseClient,
  userId: string,
): Promise<CreatorStatsPayload | { error: string; status: number }> {
  const { profile, rows } = await findCreatorRowsForProfile(supabase, userId);

  if (!profile || profile.account_type !== "creator") {
    return { error: "Not a creator", status: 403 };
  }

  const creatorName = profile.full_name || (profile.username ? `@${profile.username}` : null);

  const { data: revokedLinks } = await supabase
    .from("creator_links")
    .select("brand_id")
    .eq("creator_id", userId)
    .eq("status", CREATOR_LINK_STATUS.revoked)
    .order("created_at", { ascending: false })
    .limit(1);

  let revokedBrandName: string | null = null;
  if (revokedLinks?.[0]?.brand_id) {
    const { data: revokedBrand } = await supabase
      .from("profiles")
      .select("business_name, full_name, username")
      .eq("id", revokedLinks[0].brand_id)
      .maybeSingle();
    if (revokedBrand) {
      revokedBrandName =
        revokedBrand.business_name ||
        revokedBrand.full_name ||
        (revokedBrand.username ? `@${revokedBrand.username}` : null);
    }
  }

  if (rows.length === 0) {
    return {
      ok: true,
      linked: false,
      accessRevoked: (revokedLinks?.length ?? 0) > 0,
      revokedBrandName,
      creatorName,
      brandName: null,
      discountCode: null,
      commissionRate: null,
      totalSales: 0,
      totalCommissions: 0,
      balance: 0,
      totalEarned: 0,
      salesCount: 0,
      sales: [],
      byBrand: [],
    };
  }

  const creatorIds = rows.map((row) => row.id);
  const brandIds = [...new Set(rows.map((row) => row.user_id))];
  const discountCodes = rows.map((row) => row.discount_code).filter(Boolean) as string[];

  const { data: campaignCodes } = await supabase
    .from("campaign_creators")
    .select("discount_code")
    .in("creator_id", creatorIds);
  for (const row of campaignCodes || []) {
    if (row.discount_code) discountCodes.push(String(row.discount_code));
  }

  const sales = await fetchSalesForCreator(supabase, creatorIds, brandIds, discountCodes);
  const totalSales = sales.reduce((sum, s) => sum + (Number(s.order_amount) || 0), 0);
  const totalCommissions = sales.reduce((sum, s) => sum + (Number(s.commission_amount) || 0), 0);

  const { data: brandProfiles } = brandIds.length
    ? await supabase
        .from("profiles")
        .select("id, business_name, full_name, username")
        .in("id", brandIds)
    : { data: [] as { id: string; business_name: string | null; full_name: string | null; username: string | null }[] };

  const brandNameById = new Map(
    (brandProfiles || []).map((b) => [
      b.id,
      b.business_name || b.full_name || (b.username ? `@${b.username}` : null),
    ]),
  );

  const { data: payoutRows } = await supabase
    .from("payouts")
    .select("amount, status")
    .in("creator_id", creatorIds);

  const totalPaidOut = (payoutRows || [])
    .filter((p) => ["paid", "completed", "success"].includes(String(p.status || "").toLowerCase()))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const balanceFromRows = rows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  // Outstanding balance includes commissions + RPM credits minus payouts (kept on creators.balance).
  const balance = balanceFromRows;
  const totalEarnedFromRows = rows.reduce((sum, row) => sum + (Number(row.total_earned) || 0), 0);
  const totalEarned = Math.max(totalCommissions, totalEarnedFromRows);

  const brandByRowId = new Map(rows.map((row) => [row.id, row.user_id]));
  const saleBrand = new Map(sales.map((s) => [s.id, saleBrandId(s, brandByRowId)]));

  const [payoutTerms, campaignContext] = await Promise.all([
    loadCreatorRowPayoutTerms(supabase, creatorIds),
    loadCreatorCampaignContext(supabase, rows),
  ]);
  const byBrand = aggregateCommissionByBrand({
    terms: resolveCreatorBrandTerms({
      rows,
      payoutTerms,
      campaigns: campaignContext.campaigns,
      campaignLinks: campaignContext.links,
    }),
    rows,
    sales: sales.map((s) => ({
      brandId: saleBrand.get(s.id) ?? null,
      orderAmount: Number(s.order_amount) || 0,
      commissionAmount: Number(s.commission_amount) || 0,
    })),
    brandNameById,
  });

  const primaryRow = rows[0];
  let brandName: string | null = null;
  const { data: brand } = await supabase
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", primaryRow.user_id)
    .maybeSingle();
  if (brand) {
    brandName = brand.business_name || brand.full_name || (brand.username ? `@${brand.username}` : null);
  }

  const discountCode =
    rows.find((row) => row.discount_code)?.discount_code || primaryRow.discount_code || null;
  const commissionRate =
    rows.find((row) => row.commission_rate != null)?.commission_rate ?? primaryRow.commission_rate ?? null;

  return {
    ok: true,
    linked: true,
    creatorName,
    brandName,
    discountCode,
    commissionRate,
    totalSales,
    totalCommissions,
    balance,
    totalEarned,
    totalPaidOut,
    salesCount: sales.length,
    sales: sales.map((s) => ({
      id: s.id,
      orderAmount: Number(s.order_amount) || 0,
      commissionAmount: Number(s.commission_amount) || 0,
      date: String(s.created_at || ""),
      discountCode: s.discount_code_used || null,
      status: s.status || null,
      brandName: s.user_id ? brandNameById.get(s.user_id) ?? null : null,
      brandId: saleBrand.get(s.id) ?? null,
    })),
    byBrand,
  };
}

// ---------------------------------------------------------------------------
// Per-brand view of a creator account (commission / RPM / gifting).
// Pure helpers first (unit-tested), then the Supabase loaders that feed them.
// ---------------------------------------------------------------------------

export type CreatorBrandModel = "commission" | "rpm" | "gifting";

/** Default RPM rate (EUR per 1000 views) when a brand pays per view without an explicit rate. */
export const DEFAULT_CREATOR_RPM_RATE = 1;

/** Payout terms stored on a creators row (migration 20260826_000039). */
export type CreatorRowPayoutTerms = {
  id: string;
  payout_model: string | null;
  rpm_rate: number | null;
};

/** A brand campaign as seen from the creator side. */
export type CreatorCampaignLite = {
  id: string;
  brandId: string;
  name: string;
  isRpm: boolean;
  /** Not ended / archived. */
  active: boolean;
  commissionRate: number | null;
  /** EUR per 1000 views; 0 when not an RPM campaign or no rate set. */
  rpmRate: number;
};

/** campaign_creators row for one of the creator's creators rows. */
export type CreatorCampaignLink = {
  creatorRowId: string;
  campaignId: string;
  discountCode: string | null;
};

export type CreatorBrandTermsInput = {
  rows: Pick<CreatorManagedRow, "id" | "user_id" | "commission_rate" | "discount_code">[];
  payoutTerms?: CreatorRowPayoutTerms[];
  campaigns?: CreatorCampaignLite[];
  campaignLinks?: CreatorCampaignLink[];
  /** Brand ids (gift_missions.user_id) of the creator's non-declined gift missions. */
  giftBrandIds?: string[];
};

export type CreatorBrandTerms = {
  brandId: string;
  models: CreatorBrandModel[];
  /** First creators row for this brand (null for gifting-only brands). */
  primaryRowId: string | null;
  rowIds: string[];
  commissionRate: number | null;
  /** EUR per 1000 views, only when the brand pays RPM. */
  rpmRate: number | null;
  discountCode: string | null;
};

function positiveNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanCode(value: string | null | undefined): string | null {
  const code = (value || "").trim();
  return code || null;
}

const MODEL_ORDER: CreatorBrandModel[] = ["commission", "rpm", "gifting"];

export function isDeclinedGiftStatus(status: string | null | undefined): boolean {
  return String(status || "").trim().toLowerCase() === "declined";
}

/**
 * RPM rate (EUR / 1000 views) for a brand:
 * creator's own negotiated rate, else best active RPM campaign the creator is on,
 * else best active RPM campaign of the brand, else the €1 default.
 */
export function resolveBrandRpmRate(opts: {
  rowRpmRates: (number | null | undefined)[];
  linkedCampaignRates: number[];
  brandCampaignRates: number[];
}): number {
  const own = opts.rowRpmRates.map(positiveNumber).filter((n): n is number => n != null);
  if (own.length) return Math.max(...own);
  const linked = opts.linkedCampaignRates.filter((n) => n > 0);
  if (linked.length) return Math.max(...linked);
  const brand = opts.brandCampaignRates.filter((n) => n > 0);
  if (brand.length) return Math.max(...brand);
  return DEFAULT_CREATOR_RPM_RATE;
}

/**
 * Which models (commission / RPM / gifting) link the creator to each brand, with the terms that apply.
 *
 * - commission: a creators row whose payout_model is not "rpm" (the default model), or membership
 *   of a non-RPM campaign of the brand.
 * - rpm: a creators row with payout_model "rpm", or membership of an active RPM campaign of the brand.
 * - gifting: at least one non-declined gift mission with the brand. Brands only known through gift
 *   missions are listed too, after the brands that have a creators row.
 */
export function resolveCreatorBrandTerms(input: CreatorBrandTermsInput): CreatorBrandTerms[] {
  const payoutById = new Map((input.payoutTerms ?? []).map((t) => [t.id, t]));
  const campaignById = new Map((input.campaigns ?? []).map((c) => [c.id, c]));
  const giftBrands = new Set((input.giftBrandIds ?? []).filter(Boolean));

  const order: string[] = [];
  const rowsByBrand = new Map<string, CreatorBrandTermsInput["rows"]>();
  for (const row of input.rows) {
    if (!row.user_id) continue;
    let list = rowsByBrand.get(row.user_id);
    if (!list) {
      list = [];
      rowsByBrand.set(row.user_id, list);
      order.push(row.user_id);
    }
    list.push(row);
  }
  for (const brandId of giftBrands) {
    if (!rowsByBrand.has(brandId)) order.push(brandId);
  }

  return order.map((brandId) => {
    const rows = rowsByBrand.get(brandId) ?? [];
    const rowIds = rows.map((r) => r.id);
    const rowIdSet = new Set(rowIds);

    const links = (input.campaignLinks ?? []).filter((l) => rowIdSet.has(l.creatorRowId));
    const linkedCampaigns = links
      .map((l) => campaignById.get(l.campaignId))
      .filter((c): c is CreatorCampaignLite => Boolean(c && c.brandId === brandId));
    const linkedRpm = linkedCampaigns.filter((c) => c.isRpm && c.active);
    const linkedCommission = linkedCampaigns.filter((c) => !c.isRpm);

    const rowModels = rows.map((r) =>
      String(payoutById.get(r.id)?.payout_model || "commission").trim().toLowerCase(),
    );
    const hasCommission =
      rows.length > 0 && (rowModels.some((m) => m !== "rpm") || linkedCommission.length > 0);
    const hasRpm = rowModels.some((m) => m === "rpm") || linkedRpm.length > 0;
    const hasGifting = giftBrands.has(brandId);

    const models = MODEL_ORDER.filter(
      (m) =>
        (m === "commission" && hasCommission) ||
        (m === "rpm" && hasRpm) ||
        (m === "gifting" && hasGifting),
    );

    let commissionRate: number | null = null;
    if (hasCommission) {
      const campaignRates = [
        ...linkedCommission.filter((c) => c.active),
        ...linkedCommission.filter((c) => !c.active),
      ].map((c) => c.commissionRate);
      commissionRate =
        rows.map((r) => finiteNumberOrNull(r.commission_rate)).find((n) => n != null) ??
        campaignRates.find((n) => n != null) ??
        null;
    }

    let rpmRate: number | null = null;
    if (hasRpm) {
      rpmRate = resolveBrandRpmRate({
        rowRpmRates: rows.map((r) => payoutById.get(r.id)?.rpm_rate ?? null),
        linkedCampaignRates: linkedRpm.map((c) => c.rpmRate),
        brandCampaignRates: (input.campaigns ?? [])
          .filter((c) => c.brandId === brandId && c.isRpm && c.active)
          .map((c) => c.rpmRate),
      });
    }

    const commissionCampaignIds = new Set(linkedCommission.map((c) => c.id));
    const discountCode =
      rows.map((r) => cleanCode(r.discount_code)).find(Boolean) ??
      [...links.filter((l) => commissionCampaignIds.has(l.campaignId)), ...links]
        .map((l) => cleanCode(l.discountCode))
        .find(Boolean) ??
      null;

    return {
      brandId,
      models,
      primaryRowId: rowIds[0] ?? null,
      rowIds,
      commissionRate,
      rpmRate,
      discountCode,
    };
  });
}

export type CreatorCommissionBrandStats = {
  brandId: string;
  brandName: string;
  model: "commission" | "rpm";
  commissionRate: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned: number;
  salesCount: number;
};

/**
 * Commission figures per brand (brands with a creators row), same definitions as the global
 * stats payload: sales / commissions summed from attributed sales, balance from creators.balance,
 * totalEarned = max(commissions, creators.total_earned).
 */
export function aggregateCommissionByBrand(opts: {
  terms: CreatorBrandTerms[];
  rows: Pick<CreatorManagedRow, "id" | "user_id" | "balance" | "total_earned">[];
  sales: { brandId: string | null; orderAmount: number; commissionAmount: number }[];
  brandNameById: Map<string, string | null>;
}): CreatorCommissionBrandStats[] {
  return opts.terms
    .filter((t) => t.rowIds.length > 0)
    .map((t) => {
      const rowIds = new Set(t.rowIds);
      const rows = opts.rows.filter((r) => rowIds.has(r.id));
      const sales = opts.sales.filter((s) => s.brandId === t.brandId);
      const totalSales = sales.reduce((sum, s) => sum + (Number(s.orderAmount) || 0), 0);
      const totalCommissions = sales.reduce((sum, s) => sum + (Number(s.commissionAmount) || 0), 0);
      const balance = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
      const earnedFromRows = rows.reduce((sum, r) => sum + (Number(r.total_earned) || 0), 0);
      const model: CreatorCommissionBrandStats["model"] =
        !t.models.includes("commission") && t.models.includes("rpm") ? "rpm" : "commission";
      return {
        brandId: t.brandId,
        brandName: opts.brandNameById.get(t.brandId) || "Marque",
        model,
        commissionRate: t.commissionRate,
        totalSales,
        totalCommissions,
        balance,
        totalEarned: Math.max(totalCommissions, earnedFromRows),
        salesCount: sales.length,
      };
    });
}

/** Brand of a sale: sales.user_id, else the brand owning the creators row it is attributed to. */
export function saleBrandId(
  sale: { user_id?: string | null; creator_id?: string | null },
  brandByRowId: Map<string, string>,
): string | null {
  if (sale.user_id) return String(sale.user_id);
  if (sale.creator_id) return brandByRowId.get(String(sale.creator_id)) ?? null;
  return null;
}

export type CreatorRpmBrandStats = {
  brandId: string;
  brandName: string;
  views: number;
  accrued: number;
  pending: number;
  videos: number;
  rpmRate: number;
  /** True when the brand pays this creator per view (see resolveCreatorBrandTerms). */
  isRpm: boolean;
};

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Views / RPM earnings per brand from the per-video rows of /api/creator/rpm. */
export function aggregateRpmByBrand(opts: {
  brands: { brandId: string; brandName: string; rpmRate: number; isRpm: boolean }[];
  videos: { brandId: string; views: number; accrued: number; pending: number }[];
}): CreatorRpmBrandStats[] {
  const out = new Map<string, CreatorRpmBrandStats>();
  for (const b of opts.brands) {
    if (out.has(b.brandId)) continue;
    out.set(b.brandId, { ...b, views: 0, accrued: 0, pending: 0, videos: 0 });
  }
  for (const v of opts.videos) {
    let agg = out.get(v.brandId);
    if (!agg) {
      agg = { brandId: v.brandId, brandName: "", rpmRate: 0, isRpm: false, views: 0, accrued: 0, pending: 0, videos: 0 };
      out.set(v.brandId, agg);
    }
    agg.views += Math.max(0, Number(v.views) || 0);
    agg.accrued += Number(v.accrued) || 0;
    agg.pending += Number(v.pending) || 0;
    agg.videos += 1;
  }
  return [...out.values()].map((b) => ({
    ...b,
    accrued: roundCents(b.accrued),
    pending: roundCents(b.pending),
  }));
}

export function brandDisplayName(
  profile: { business_name?: string | null; full_name?: string | null; username?: string | null } | null | undefined,
): string | null {
  if (!profile) return null;
  return profile.business_name || profile.full_name || (profile.username ? `@${profile.username}` : null);
}

// ------------------------------- loaders -----------------------------------

/** payout_model / rpm_rate of creators rows; empty when the columns are not migrated yet. */
export async function loadCreatorRowPayoutTerms(
  supabase: SupabaseClient,
  rowIds: string[],
): Promise<CreatorRowPayoutTerms[]> {
  if (!rowIds.length) return [];
  const { data, error } = await supabase
    .from("creators")
    .select("id, payout_model, rpm_rate")
    .in("id", rowIds);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    payout_model: (r.payout_model as string | null) ?? null,
    rpm_rate: positiveNumber(r.rpm_rate),
  }));
}

type CampaignRowLite = {
  id: string;
  name?: string | null;
  user_id: string;
  rpm_rate?: number | null;
  commission_rate?: number | null;
  commission_type?: string | null;
  description?: string | null;
  status?: string | null;
};

/** Brand campaigns (for every brand of the rows) + the creator's campaign_creators memberships. */
export async function loadCreatorCampaignContext(
  supabase: SupabaseClient,
  rows: Pick<CreatorManagedRow, "id" | "user_id">[],
): Promise<{ campaigns: CreatorCampaignLite[]; links: CreatorCampaignLink[] }> {
  const brandIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const rowIds = rows.map((r) => r.id);
  if (!brandIds.length) return { campaigns: [], links: [] };

  let campaignRows: CampaignRowLite[] = [];
  const full = await supabase
    .from("campaigns")
    .select("id, name, user_id, rpm_rate, commission_rate, commission_type, description, status")
    .in("user_id", brandIds);
  if (!full.error) {
    campaignRows = (full.data ?? []) as CampaignRowLite[];
  } else {
    const basic = await supabase
      .from("campaigns")
      .select("id, name, user_id, commission_rate, commission_type, description, status")
      .in("user_id", brandIds);
    campaignRows = (basic.data ?? []) as CampaignRowLite[];
  }

  const campaigns: CreatorCampaignLite[] = campaignRows.map((c) => {
    const isRpm = isRpmCampaign(c);
    const status = String(c.status || "").toLowerCase();
    return {
      id: String(c.id),
      brandId: String(c.user_id),
      name: String(c.name || ""),
      isRpm,
      active: status !== "ended" && status !== "archived",
      commissionRate: isRpm ? null : finiteNumberOrNull(c.commission_rate),
      rpmRate: isRpm ? resolveRpmRate(c) : 0,
    };
  });

  let links: CreatorCampaignLink[] = [];
  if (rowIds.length) {
    const withCode = await supabase
      .from("campaign_creators")
      .select("creator_id, campaign_id, discount_code")
      .in("creator_id", rowIds);
    let linkRows = (withCode.data ?? []) as Record<string, unknown>[];
    if (withCode.error) {
      const basic = await supabase
        .from("campaign_creators")
        .select("creator_id, campaign_id")
        .in("creator_id", rowIds);
      linkRows = (basic.data ?? []) as Record<string, unknown>[];
    }
    links = linkRows.map((l) => ({
      creatorRowId: String(l.creator_id),
      campaignId: String(l.campaign_id),
      discountCode: cleanCode((l.discount_code as string | null | undefined) ?? null),
    }));
  }

  return { campaigns, links };
}

/** Brand ids of the creator's gift missions that were not declined (empty if gifting is not set up). */
export async function loadCreatorGiftBrandIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("gift_missions")
    .select("user_id, status")
    .eq("creator_user_id", userId);
  if (error || !data) return [];
  const ids: string[] = [];
  for (const m of data as { user_id: string | null; status: string | null }[]) {
    if (!m.user_id || isDeclinedGiftStatus(m.status)) continue;
    const id = String(m.user_id);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

type AffiliateByBrand = Map<string, { link: string | null; promoCode: string | null }>;

/**
 * Affiliate link + CRM promo code per brand, same precedence as /api/creator/affiliate-link:
 * creators.affiliate_ref, else CRM affiliateRef, else latest active affiliate_links slug.
 */
async function loadCreatorAffiliateByBrand(
  supabase: SupabaseClient,
  rows: Pick<CreatorManagedRow, "id" | "user_id" | "handle">[],
): Promise<AffiliateByBrand> {
  const out: AffiliateByBrand = new Map();
  if (!rows.length) return out;
  const brandIds = [...new Set(rows.map((r) => r.user_id))];
  const handles = [...new Set(rows.map((r) => normalizeCreatorHandle(r.handle)).filter(Boolean))];

  const refByRow = new Map<string, string>();
  const refs = await supabase
    .from("creators")
    .select("id, affiliate_ref")
    .in("id", rows.map((r) => r.id));
  if (!refs.error) {
    for (const r of (refs.data ?? []) as { id: string; affiliate_ref: string | null }[]) {
      const ref = (r.affiliate_ref || "").trim();
      if (ref) refByRow.set(String(r.id), ref);
    }
  }

  type LinkRow = {
    brand_id: string;
    slug: string | null;
    destination_url: string | null;
    creator_username: string | null;
  };
  type SavedRow = { user_id: string; creator_username: string | null; snapshot: unknown };
  let affiliateLinks: LinkRow[] = [];
  let saved: SavedRow[] = [];
  if (handles.length) {
    const [linksRes, savedRes] = await Promise.all([
      supabase
        .from("affiliate_links")
        .select("brand_id, slug, destination_url, creator_username")
        .in("brand_id", brandIds)
        .in("creator_username", handles)
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("discovery_saved")
        .select("user_id, creator_username, snapshot")
        .in("user_id", brandIds)
        .in("creator_username", [...handles, ...handles.map((h) => `@${h}`)]),
    ]);
    if (!linksRes.error) affiliateLinks = (linksRes.data ?? []) as LinkRow[];
    if (!savedRes.error) saved = (savedRes.data ?? []) as SavedRow[];
  }

  for (const brandId of brandIds) {
    let link: string | null = null;
    let promoCode: string | null = null;
    for (const row of rows.filter((r) => r.user_id === brandId)) {
      const handle = normalizeCreatorHandle(row.handle);
      const snap = handle
        ? (saved.find(
            (s) => s.user_id === brandId && normalizeCreatorHandle(s.creator_username) === handle,
          )?.snapshot as Record<string, unknown> | null | undefined)
        : null;
      const crm =
        snap && typeof snap === "object" && snap.crm && typeof snap.crm === "object"
          ? (snap.crm as Record<string, unknown>)
          : null;
      const latest = handle
        ? affiliateLinks.find(
            (l) => l.brand_id === brandId && normalizeCreatorHandle(l.creator_username) === handle,
          )
        : undefined;

      const ref =
        refByRow.get(row.id) ||
        (typeof crm?.affiliateRef === "string" ? crm.affiliateRef.trim() : "") ||
        (latest?.slug || "").trim();
      if (!promoCode && typeof crm?.promoCode === "string" && crm.promoCode.trim()) {
        promoCode = crm.promoCode.trim();
      }
      if (!link && ref) {
        link = buildTrackitShortLink(ref, (latest?.destination_url || "").trim() || null);
      }
    }
    out.set(brandId, { link, promoCode });
  }
  return out;
}

export type CreatorBrandSummary = {
  brandId: string;
  brandName: string;
  /** Brand profile avatar, if any. */
  logoUrl: string | null;
  models: CreatorBrandModel[];
  commissionRate: number | null;
  /** EUR per 1000 views. */
  rpmRate: number | null;
  discountCode: string | null;
  affiliateLink: string | null;
  /** Legacy membership fields (null / "gifting" for brands only known through gift missions). */
  creatorRowId: string | null;
  creatorHandle: string | null;
  linkStatus: CreatorBrandMembership["linkStatus"] | "gifting";
  handleMatched: boolean;
};

/** One entry per brand (commission / RPM / gifting) for the creator app brand switcher. */
export async function listCreatorBrandSummaries(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  profile: { username: string | null; full_name: string | null } | null;
  brands: CreatorBrandSummary[];
}> {
  const [{ profile, brands: memberships }, giftBrandIds] = await Promise.all([
    listCreatorBrandMemberships(supabase, userId),
    loadCreatorGiftBrandIds(supabase, userId),
  ]);

  const rowIds = memberships.map((m) => m.creatorRowId);
  const { data: rowData } = rowIds.length
    ? await supabase
        .from("creators")
        .select("id, commission_rate, discount_code")
        .in("id", rowIds)
    : { data: [] as Record<string, unknown>[] };
  const rowById = new Map(
    ((rowData ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]),
  );
  const rows = memberships.map((m) => {
    const r = rowById.get(m.creatorRowId);
    return {
      id: m.creatorRowId,
      user_id: m.brandId,
      commission_rate: finiteNumberOrNull(r?.commission_rate),
      discount_code: (r?.discount_code as string | null | undefined) ?? null,
      handle: m.creatorHandle,
    };
  });

  const [payoutTerms, context, affiliate] = await Promise.all([
    loadCreatorRowPayoutTerms(supabase, rowIds),
    loadCreatorCampaignContext(supabase, rows),
    loadCreatorAffiliateByBrand(supabase, rows),
  ]);

  const terms = resolveCreatorBrandTerms({
    rows,
    payoutTerms,
    campaigns: context.campaigns,
    campaignLinks: context.links,
    giftBrandIds,
  });

  const allBrandIds = terms.map((t) => t.brandId);
  type BrandProfile = {
    id: string;
    business_name: string | null;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  let brandProfiles: BrandProfile[] = [];
  if (allBrandIds.length) {
    const withAvatar = await supabase
      .from("profiles")
      .select("id, business_name, full_name, username, avatar_url")
      .in("id", allBrandIds);
    if (!withAvatar.error) {
      brandProfiles = (withAvatar.data ?? []) as BrandProfile[];
    } else {
      const basic = await supabase
        .from("profiles")
        .select("id, business_name, full_name, username")
        .in("id", allBrandIds);
      brandProfiles = ((basic.data ?? []) as Omit<BrandProfile, "avatar_url">[]).map((p) => ({
        ...p,
        avatar_url: null,
      }));
    }
  }
  const profileById = new Map(brandProfiles.map((p) => [String(p.id), p]));

  const brands = await Promise.all(
    terms.map(async (t): Promise<CreatorBrandSummary> => {
      const p = profileById.get(t.brandId);
      const membership = memberships.find((m) => m.brandId === t.brandId) ?? null;
      let logoUrl: string | null = null;
      if (p?.avatar_url) {
        try {
          logoUrl = await resolveAvatarUrl(supabase, t.brandId, p.avatar_url);
        } catch {
          logoUrl = p.avatar_url;
        }
      }
      const aff = affiliate.get(t.brandId);
      return {
        brandId: t.brandId,
        brandName: membership?.brandName || brandDisplayName(p) || "Marque",
        logoUrl,
        models: t.models,
        commissionRate: t.commissionRate,
        rpmRate: t.rpmRate,
        discountCode: t.discountCode ?? aff?.promoCode ?? null,
        affiliateLink: aff?.link ?? null,
        creatorRowId: membership?.creatorRowId ?? null,
        creatorHandle: membership?.creatorHandle ?? null,
        linkStatus: membership?.linkStatus ?? "gifting",
        handleMatched: membership?.handleMatched ?? false,
      };
    }),
  );

  return { profile, brands };
}
