import { supabase } from "@/lib/supabase";
import { clientBrandScope } from "@/lib/brand-workspace";
import { isDemoPresetCampaign } from "@/lib/demo-preset-data";
import { hasReachedCampaignLimit, normalizePlan } from "@/lib/plan-limits";

function isActiveCampaignStatus(status: string | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "paused";
}

/** PostgREST / Postgres missing-column errors (migration not applied yet). */
function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  if (error.code === "42703") return (error.message || "").includes(column);
  return (error.message || "").toLowerCase().includes(`${column} does not exist`);
}

function formatSupabaseError(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined): string {
  if (!error) return "unknown";
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ") || "unknown";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCreatorUuid(id: string): boolean {
  return UUID_RE.test(id);
}

// CREATORS
export async function saveCreator(_userId: string, creator: {
  username: string;
  display_name: string;
  avatar_url: string;
  platform: string;
  followers_count: number;
  engagement_rate: number;
  avg_views: number;
  bio: string;
  niche: string;
}) {
  try {
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creator),
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
      console.error("saveCreator error:", payload.error ?? res.statusText);
      return null;
    }
    return payload;
  } catch (e) {
    console.error("saveCreator error:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getSavedCreators(_userId: string) {
  try {
    const res = await fetch("/api/creators", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("getSavedCreators error:", e instanceof Error ? e.message : e);
    return [];
  }
}

async function deleteCreatorViaApi(creatorId?: string, handle?: string): Promise<boolean> {
  const params = new URLSearchParams();
  const id = creatorId && isCreatorUuid(creatorId) ? creatorId : undefined;
  const h = handle?.trim().replace(/^@/, "");
  if (id) params.set("creatorId", id);
  else if (h) params.set("handle", h);
  else return false;

  try {
    const res = await fetch(`/api/creators?${params.toString()}`, { method: "DELETE" });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      console.error("deleteCreator error:", payload.error ?? res.statusText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("deleteCreator error:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Delete by handle (Discovery saved creators). */
export async function removeCreator(_userId: string, handle: string) {
  return deleteCreatorViaApi(undefined, handle);
}

/** Delete by row id (Creators tab); falls back to handle for client-only temp ids. */
export async function deleteCreatorById(_userId: string, creatorId: string, handle?: string) {
  const h = handle?.trim().replace(/^@/, "");
  if (creatorId && isCreatorUuid(creatorId)) {
    const ok = await deleteCreatorViaApi(creatorId);
    if (ok) return true;
  }
  if (h) return deleteCreatorViaApi(undefined, h);
  return false;
}

// CAMPAIGNS
export async function saveCampaign(userId: string, campaign: {
  name: string;
  description?: string;
  platform: string;
  start_date?: string;
  end_date?: string;
  commission_type: string;
  commission_rate: number;
  auto_payout: boolean;
  status: string;
}) {
  if (!supabase) return null;
  const { ownerId, spaceId } = clientBrandScope(userId);
  let existingQ = supabase
    .from("campaigns")
    .select("status, name, description")
    .eq("user_id", ownerId)
    .eq("workspace_id", spaceId);
  let [{ data: profile }, existingRes] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", ownerId).maybeSingle(),
    existingQ,
  ]);
  if (isMissingColumnError(existingRes.error, "workspace_id")) {
    existingRes = await supabase
      .from("campaigns")
      .select("status, name, description")
      .eq("user_id", ownerId);
  }
  const existingCampaigns = existingRes.data;
  const plan = normalizePlan(profile?.plan);
  const activeCampaignCount = (existingCampaigns ?? []).filter(
    (row) => isActiveCampaignStatus(row.status) && !isDemoPresetCampaign(row),
  ).length;
  const nextCampaignIsActive = isActiveCampaignStatus(campaign.status);
  if (nextCampaignIsActive && hasReachedCampaignLimit(plan, activeCampaignCount)) return null;
  let { data, error } = await supabase
    .from("campaigns")
    .insert({ user_id: ownerId, workspace_id: spaceId, ...campaign })
    .select()
    .single();
  if (isMissingColumnError(error, "workspace_id")) {
    ({ data, error } = await supabase
      .from("campaigns")
      .insert({ user_id: ownerId, ...campaign })
      .select()
      .single());
  }
  if (error) console.error("saveCampaign error:", error);
  else invalidateCampaignsCache(ownerId);
  return data;
}

const campaignsMemCache = new Map<string, { at: number; rows: Awaited<ReturnType<typeof fetchCampaignsUncached>> }>();
const CAMPAIGNS_TTL_MS = 30_000;

async function fetchCampaignsUncached(userId: string) {
  if (!supabase) return [];
  const { ownerId, spaceId } = clientBrandScope(userId);
  let query = supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false });
  let { data, error } = await query.eq("workspace_id", spaceId);
  if (isMissingColumnError(error, "workspace_id")) {
    ({ data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false }));
  }
  if (error) {
    console.error("getCampaigns error:", formatSupabaseError(error));
    return [];
  }
  return data || [];
}

export async function getCampaigns(userId: string) {
  const key = userId;
  const hit = campaignsMemCache.get(key);
  if (hit && Date.now() - hit.at < CAMPAIGNS_TTL_MS) return hit.rows;
  const rows = await fetchCampaignsUncached(userId);
  campaignsMemCache.set(key, { at: Date.now(), rows });
  return rows;
}

export function invalidateCampaignsCache(userId?: string) {
  if (!userId) {
    campaignsMemCache.clear();
    return;
  }
  campaignsMemCache.delete(userId);
}

export async function updateCampaignStatus(campaignId: string, status: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("campaigns")
    .update({ status })
    .eq("id", campaignId);
  if (error) {
    console.error("updateCampaignStatus error:", error);
    return false;
  }
  return true;
}

export async function updateCampaign(campaignId: string, campaign: {
  name: string;
  description?: string;
  platform: string;
  start_date?: string;
  end_date?: string;
  commission_type: string;
  commission_rate: number;
  auto_payout: boolean;
  status?: string;
}) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("campaigns")
    .update(campaign)
    .eq("id", campaignId)
    .select()
    .single();
  if (error) console.error("updateCampaign error:", error);
  return data;
}

export async function deleteCampaign(campaignId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/campaigns?campaignId=${encodeURIComponent(campaignId)}`, {
      method: "DELETE",
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("deleteCampaign error:", payload.error ?? res.statusText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("deleteCampaign error:", e instanceof Error ? e.message : e);
    return false;
  }
}

import {
  buildCampaignCreatorLinkMap,
  buildCreatorCountsFromLinks,
  type CampaignCreatorLinkMap,
} from "@/lib/campaign-sales-attribution";

export type CampaignCreatorLinkRow = {
  campaign_id: string;
  creator_id: string;
  historical_sales_attached: boolean;
  created_at: string;
};

export async function getCampaignCreatorLinks(userId: string): Promise<CampaignCreatorLinkRow[]> {
  if (!supabase) return [];
  const { ownerId, spaceId } = clientBrandScope(userId);
  const selectCols = "campaign_id, creator_id, historical_sales_attached, created_at";
  let { data, error } = await supabase
    .from("campaign_creators")
    .select(selectCols)
    .eq("user_id", ownerId)
    .eq("workspace_id", spaceId);
  // Brand-workspaces migration may not be applied yet on Trackit.
  if (isMissingColumnError(error, "workspace_id")) {
    ({ data, error } = await supabase
      .from("campaign_creators")
      .select(selectCols)
      .eq("user_id", ownerId));
  }
  if (error) {
    console.error("getCampaignCreatorLinks error:", formatSupabaseError(error));
    return [];
  }
  return (data || []).map((row) => ({
    campaign_id: String(row.campaign_id),
    creator_id: String(row.creator_id),
    historical_sales_attached: row.historical_sales_attached !== false,
    created_at: String(row.created_at || new Date(0).toISOString()),
  }));
}

export async function getCampaignCreatorAttribution(userId: string): Promise<{
  creatorCounts: Record<string, string[]>;
  linkMeta: CampaignCreatorLinkMap;
}> {
  const links = await getCampaignCreatorLinks(userId);
  return {
    creatorCounts: buildCreatorCountsFromLinks(links),
    linkMeta: buildCampaignCreatorLinkMap(links),
  };
}

export async function getCampaignCreatorCounts(userId: string): Promise<Record<string, string[]>> {
  const { creatorCounts } = await getCampaignCreatorAttribution(userId);
  return creatorCounts;
}

export async function attachCreatorSalesToCampaign(
  userId: string,
  campaignId: string,
  creatorId: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/campaign-creators/attach-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, campaignId, creatorId }),
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && Boolean(payload.ok);
  } catch {
    return false;
  }
}

export async function fetchCreatorBrandSalesSummary(
  userId: string,
  creatorIds: string[],
): Promise<Record<string, { count: number; revenue: number; commission: number }>> {
  if (creatorIds.length === 0) return {};
  try {
    const res = await fetch(
      `/api/campaign-creators/sales-summary?userId=${encodeURIComponent(userId)}&creatorIds=${encodeURIComponent(creatorIds.join(","))}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as {
      ok?: boolean;
      creators?: Record<string, { count: number; revenue: number; commission: number }>;
    };
    if (!res.ok || !data.ok) return {};
    return data.creators ?? {};
  } catch {
    return {};
  }
}

export async function syncCampaignCreators(
  userId: string,
  campaignId: string,
  creatorIds: string[],
  options?: {
    attachHistoricalSales?: boolean;
    creatorAttachments?: Record<string, boolean>;
  },
) {
  // Routed through a service-role API so the write isn't subject to browser-session RLS.
  try {
    const res = await fetch("/api/campaign-creators/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        campaignId,
        creatorIds,
        attachHistoricalSales: options?.attachHistoricalSales,
        creatorAttachments: options?.creatorAttachments,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("syncCampaignCreators error:", payload.error ?? res.statusText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("syncCampaignCreators error:", e instanceof Error ? e.message : e);
    return false;
  }
}

// OUTREACH
export async function saveOutreach(userId: string, outreach: {
  creator_username: string;
  creator_display_name: string;
  creator_avatar: string;
  platform: string;
  message: string;
  status: string;
  follow_up_date?: string | null;
}) {
  try {
    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...outreach }),
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; row?: unknown; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("saveOutreach error:", payload.error ?? res.statusText);
      return null;
    }
    return payload.row;
  } catch (e) {
    console.error("saveOutreach error:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getOutreachHistory(userId: string) {
  try {
    const res = await fetch(`/api/outreach?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("getOutreachHistory error:", payload.error ?? res.statusText);
      return [];
    }
    return Array.isArray(payload.rows) ? payload.rows : [];
  } catch (e) {
    console.error("getOutreachHistory error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function updateOutreachStatus(
  userId: string,
  outreachId: string,
  status: string,
  followUpDate?: string | null,
) {
  try {
    const res = await fetch("/api/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        outreachId,
        status,
        ...(followUpDate !== undefined ? { follow_up_date: followUpDate } : {}),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("updateOutreachStatus error:", payload.error ?? res.statusText);
    }
  } catch (e) {
    console.error("updateOutreachStatus error:", e instanceof Error ? e.message : e);
  }
}

export async function clearOutreachHistory(userId: string) {
  try {
    const res = await fetch(`/api/outreach?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      console.error("clearOutreachHistory error:", payload.error ?? res.statusText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("clearOutreachHistory error:", e instanceof Error ? e.message : e);
    return false;
  }
}
