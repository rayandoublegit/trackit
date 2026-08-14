import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { isDemoPresetSavedCreator } from "@/lib/demo-preset-data";
import { getMaxManagedCreators, normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { commissionRateFromDiscountCode } from "@/lib/creator-crm";
import { commissionRateFromDiscoverySnapshot } from "@/lib/managed-creator-commission";
import { applyDiscountCodeToCreator, ensureCreatorForHandle } from "@/lib/creator-promo-codes";
import {
  enrichSavedRowsWithAccountEmails,
  fetchLinkedCreatorEmailsByHandle,
} from "@/lib/linked-creator-emails";
import { CREATOR_ROW_SYNC_SELECT } from "@/lib/creator-account";
import { syncCreatorToDiscoverySaved, type BrandCreatorSyncRow } from "@/lib/creator-discovery-sync";
import { brandTablesHaveWorkspaceId } from "@/lib/workspace-db";

export const dynamic = "force-dynamic";

async function planFor(admin: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<PlanTier> {
  if (DEV_BYPASS_PLAN) return normalizePlan(DEV_BYPASS_PLAN);
  const { data } = await admin!.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return normalizePlan(data?.plan);
}

export async function GET(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId: userId, spaceId } = access;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const useWs = await brandTablesHaveWorkspaceId(admin);
  const status = new URL(request.url).searchParams.get("status");

  const loadSaved = async () => {
    let q = admin.from("discovery_saved").select("*").eq("user_id", userId);
    if (useWs) q = q.eq("workspace_id", spaceId);
    if (status) q = q.eq("pipeline_status", status);
    return q.order("saved_at", { ascending: false });
  };

  let { data, error } = await loadSaved();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let creatorsQ = admin
    .from("creators")
    .select(CREATOR_ROW_SYNC_SELECT)
    .eq("user_id", userId)
    .not("linked_user_id", "is", null);
  if (useWs) creatorsQ = creatorsQ.eq("workspace_id", spaceId);
  const { data: linkedCreators } = await creatorsQ;

  const savedHandles = new Set((data ?? []).map((row) => String(row.creator_username || "").toLowerCase()));
  let syncedLinked = false;
  for (const creator of linkedCreators ?? []) {
    const username = String(creator.handle || "").trim().replace(/^@+/, "").toLowerCase();
    if (!username || savedHandles.has(username)) continue;
    const syncErr = await syncCreatorToDiscoverySaved(admin, userId, creator as BrandCreatorSyncRow, {
      pipelineStatus: "signed",
    });
    if (!syncErr) syncedLinked = true;
  }

  if (syncedLinked) {
    const refreshed = await loadSaved();
    if (refreshed.error) return NextResponse.json({ error: refreshed.error.message }, { status: 500 });
    data = refreshed.data;
  }

  const rows = data ?? [];
  const emailByHandle = await fetchLinkedCreatorEmailsByHandle(admin, userId);
  return NextResponse.json({ rows: enrichSavedRowsWithAccountEmails(rows, emailByHandle) });
}

export async function POST(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId: userId, spaceId } = access;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { creator?: Record<string, unknown>; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const c = body.creator;
  const username = String(c?.username ?? "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing creator" }, { status: 400 });

  const useWs = await brandTablesHaveWorkspaceId(admin);

  // Free-tier save cap — demo Trackit creators are hors quota.
  const max = getMaxManagedCreators(await planFor(admin, userId));
  if (max != null) {
    let savedQ = admin
      .from("discovery_saved")
      .select("creator_username, notes, snapshot")
      .eq("user_id", userId);
    if (useWs) savedQ = savedQ.eq("workspace_id", spaceId);
    const { data: savedRows } = await savedQ;
    const already = (savedRows ?? []).some(
      (row) => String(row.creator_username || "").toLowerCase() === username.toLowerCase(),
    );
    const billableCount = (savedRows ?? []).filter((row) => !isDemoPresetSavedCreator(row)).length;
    if (!already && billableCount >= max) {
      return NextResponse.json({ error: "limit", max, used: billableCount }, { status: 402 });
    }
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    creator_username: username,
    platform: String(c?.platform ?? "tiktok"),
    display_name: String(c?.displayName ?? username),
    avatar_url: String(c?.avatarUrl ?? ""),
    followers: Number(c?.followersCount ?? 0) || 0,
    engagement_rate: Number(c?.engagementRate ?? 0) || 0,
    primary_niche: String(c?.primaryNiche ?? c?.niche ?? ""),
    country_code: (c?.countryCode as string) ?? null,
    value_score: Number(c?.valueScore ?? 0) || 0,
    snapshot: c ?? {},
    ...(body.status ? { pipeline_status: body.status } : {}),
  };
  if (useWs) row.workspace_id = spaceId;

  // ignoreDuplicates so re-saving never resets an existing pipeline_status/notes.
  const { error } = await admin.from("discovery_saved").upsert(row, {
    onConflict: useWs ? "workspace_id,creator_username" : "user_id,creator_username",
    ignoreDuplicates: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId: userId, spaceId } = access;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { username?: string; status?: string; notes?: string; crm?: Record<string, unknown>; avatarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const username = String(body.username ?? "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

  const useWs = await brandTablesHaveWorkspaceId(admin);
  // Loosely typed on purpose: constraining T to the Supabase builder type
  // makes tsc blow up ("type instantiation is excessively deep").
  type Chainable = { eq: (c: string, v: string) => unknown; ilike: (c: string, v: string) => unknown };
  const scopeSaved = <T,>(q: T): T => {
    let next = (q as Chainable).eq("user_id", userId) as Chainable;
    next = next.eq("creator_username", username) as Chainable;
    if (useWs) next = next.eq("workspace_id", spaceId) as Chainable;
    return next as T;
  };
  const scopeCreators = <T,>(q: T): T => {
    let next = (q as Chainable).eq("user_id", userId) as Chainable;
    next = next.ilike("handle", username) as Chainable;
    if (useWs) next = next.eq("workspace_id", spaceId) as Chainable;
    return next as T;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) patch.pipeline_status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes;

  if (body.avatarUrl !== undefined) {
    const avatarUrl = String(body.avatarUrl ?? "").trim();
    const { data: existing } = await scopeSaved(
      admin.from("discovery_saved").select("snapshot"),
    ).maybeSingle();
    const snapshot =
      existing?.snapshot && typeof existing.snapshot === "object"
        ? (existing.snapshot as Record<string, unknown>)
        : {};
    patch.avatar_url = avatarUrl;
    patch.snapshot = { ...snapshot, avatarUrl };
    await scopeCreators(admin.from("creators").update({ avatar_url: avatarUrl || null }));
  }

  if (body.crm !== undefined) {
    const { data: existing } = await scopeSaved(
      admin.from("discovery_saved").select("snapshot"),
    ).maybeSingle();
    const snapshotFromDb =
      existing?.snapshot && typeof existing.snapshot === "object"
        ? (existing.snapshot as Record<string, unknown>)
        : {};
    const snapshot =
      patch.snapshot && typeof patch.snapshot === "object"
        ? { ...snapshotFromDb, ...(patch.snapshot as Record<string, unknown>) }
        : snapshotFromDb;
    const prevCrm =
      snapshot.crm && typeof snapshot.crm === "object"
        ? (snapshot.crm as Record<string, unknown>)
        : {};
    patch.snapshot = {
      ...snapshot,
      ...(body.crm.commissionRate !== undefined ? { commissionRate: body.crm.commissionRate } : {}),
      crm: { ...prevCrm, ...body.crm },
    };

    if (body.crm.commissionRate !== undefined) {
      const rate = body.crm.commissionRate;
      const creatorPatch =
        typeof rate === "number" && Number.isFinite(rate)
          ? { commission_rate: rate }
          : rate === null
            ? { commission_rate: null }
            : null;
      if (creatorPatch) {
        await scopeCreators(admin.from("creators").update(creatorPatch));
      }
    }

    if (body.crm.promoCode !== undefined) {
      const promoRaw = String(body.crm.promoCode || "").trim();
      if (promoRaw) {
        const creatorRow =
          (await scopeCreators(admin.from("creators").select("id")).maybeSingle()).data ??
          (await ensureCreatorForHandle(admin, userId, username));
        if (creatorRow?.id) {
          const rate =
            commissionRateFromDiscoverySnapshot(patch.snapshot) ??
            commissionRateFromDiscountCode(promoRaw) ??
            null;
          await applyDiscountCodeToCreator(admin, userId, String(creatorRow.id), promoRaw, rate);
        }
      }
    }
  }

  const { data, error } = await scopeSaved(admin.from("discovery_saved").update(patch)).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId: userId, spaceId } = access;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const username = new URL(request.url).searchParams.get("username")?.trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

  const useWs = await brandTablesHaveWorkspaceId(admin);
  let q = admin.from("discovery_saved").delete().eq("user_id", userId).eq("creator_username", username);
  if (useWs) q = q.eq("workspace_id", spaceId);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
