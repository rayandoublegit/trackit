import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/api-auth";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { getMaxManagedCreators, normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { commissionRateFromDiscountCode } from "@/lib/creator-crm";
import { commissionRateFromDiscoverySnapshot } from "@/lib/managed-creator-commission";
import { applyDiscountCodeToCreator, ensureCreatorForHandle } from "@/lib/creator-promo-codes";

export const dynamic = "force-dynamic";

async function planFor(admin: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<PlanTier> {
  if (DEV_BYPASS_PLAN) return normalizePlan(DEV_BYPASS_PLAN);
  const { data } = await admin!.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return normalizePlan(data?.plan);
}

export async function GET(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const status = new URL(request.url).searchParams.get("status");
  let q = admin.from("discovery_saved").select("*").eq("user_id", userId).order("saved_at", { ascending: false });
  if (status) q = q.eq("pipeline_status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { creator?: Record<string, unknown>; status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const c = body.creator;
  const username = String(c?.username ?? "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing creator" }, { status: 400 });

  // Free-tier save cap (shared with managed-creators limit).
  const max = getMaxManagedCreators(await planFor(admin, userId));
  if (max != null) {
    const { count } = await admin.from("discovery_saved").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const already = (await admin.from("discovery_saved").select("id", { head: true, count: "exact" }).eq("user_id", userId).eq("creator_username", username)).count ?? 0;
    if (already === 0 && (count ?? 0) >= max) {
      return NextResponse.json({ error: "limit", max }, { status: 402 });
    }
  }

  const row = {
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
  // ignoreDuplicates so re-saving never resets an existing pipeline_status/notes.
  const { error } = await admin.from("discovery_saved").upsert(row, { onConflict: "user_id,creator_username", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { username?: string; status?: string; notes?: string; crm?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const username = String(body.username ?? "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) patch.pipeline_status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes;

  if (body.crm !== undefined) {
    const { data: existing } = await admin
      .from("discovery_saved")
      .select("snapshot")
      .eq("user_id", userId)
      .eq("creator_username", username)
      .maybeSingle();
    const snapshot =
      existing?.snapshot && typeof existing.snapshot === "object"
        ? (existing.snapshot as Record<string, unknown>)
        : {};
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
        await admin
          .from("creators")
          .update(creatorPatch)
          .eq("user_id", userId)
          .ilike("handle", username);
      }
    }

    if (body.crm.promoCode !== undefined) {
      const promoRaw = String(body.crm.promoCode || "").trim();
      if (promoRaw) {
        const creatorRow =
          (await admin
            .from("creators")
            .select("id")
            .eq("user_id", userId)
            .ilike("handle", username)
            .maybeSingle()).data ??
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

  const { data, error } = await admin
    .from("discovery_saved")
    .update(patch)
    .eq("user_id", userId)
    .eq("creator_username", username)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const username = new URL(request.url).searchParams.get("username")?.trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });
  const { error } = await admin.from("discovery_saved").delete().eq("user_id", userId).eq("creator_username", username);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
