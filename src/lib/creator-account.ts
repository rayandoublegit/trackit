import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREATOR_DASHBOARD_ACCESS_STATUSES,
  CREATOR_LINK_STATUS,
  type CreatorLinkStatus,
} from "@/lib/creator-dashboard-access";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";

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
  };

  const select =
    "id, user_id, order_amount, commission_amount, created_at, discount_code_used, status";
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
  }[];
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
    })),
  };
}
