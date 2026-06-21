import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export async function findCreatorRowsForProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: { username: string | null; full_name: string | null; account_type: string | null } | null; rows: CreatorManagedRow[] }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.account_type !== "creator") {
    return { profile, rows: [] };
  }

  const select =
    "id, user_id, balance, total_earned, total_sales, commission_rate, discount_code, handle, full_name, linked_user_id";

  const found: CreatorManagedRow[] = [];

  const { data: linkedRows } = await supabase.from("creators").select(select).eq("linked_user_id", userId);
  if (linkedRows?.length) found.push(...(linkedRows as CreatorManagedRow[]));

  const { data: brandLinks } = await supabase
    .from("creator_links")
    .select("brand_id")
    .eq("creator_id", userId)
    .eq("status", "active");

  const brandIds = [...new Set((brandLinks || []).map((l) => String(l.brand_id)).filter(Boolean))];
  const handle = normalizeCreatorHandle(profile.username);

  if (brandIds.length > 0) {
    const { data: brandRows } = await supabase.from("creators").select(select).in("user_id", brandIds);
    const rowsByBrand = new Map<string, CreatorManagedRow[]>();
    for (const row of (brandRows || []) as CreatorManagedRow[]) {
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
    }
  }

  if (found.length === 0 && handle) {
    const { data: handleRows } = await supabase.from("creators").select(select).ilike("handle", handle);
    const exact = ((handleRows || []) as CreatorManagedRow[]).filter(
      (row) => normalizeCreatorHandle(row.handle) === handle,
    );
    for (const row of exact) {
      found.push(row);
      if (!row.linked_user_id) {
        await supabase.from("creators").update({ linked_user_id: userId }).eq("id", row.id);
      }
    }
  }

  return { profile, rows: dedupeCreatorRows(found) };
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
  creatorName: string | null;
  brandName: string | null;
  discountCode: string | null;
  commissionRate: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned: number;
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

  if (rows.length === 0) {
    return {
      ok: true,
      linked: false,
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
  const balanceFromLedger = Math.max(0, totalCommissions - totalPaidOut);
  const balance = sales.length > 0 ? balanceFromLedger : balanceFromRows;

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
    totalEarned: totalCommissions,
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
