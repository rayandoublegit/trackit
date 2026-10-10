import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { paywallBody, type PaywallBody, type PaywallFeature } from "@/lib/plan-paywall";

// Server side of the paywalls: the workspace owner's plan and the 402 answer.

/**
 * Plan of a workspace owner (profiles.plan through normalizePlan). The local
 * dev bypass plan wins when set (never in production). No database or no row: free.
 */
export async function resolveOwnerPlan(admin: SupabaseClient | null | undefined, ownerId: string | null | undefined): Promise<PlanTier> {
  if (DEV_BYPASS_PLAN) return normalizePlan(DEV_BYPASS_PLAN);
  if (!admin || !ownerId) return "free";
  try {
    const { data } = await admin.from("profiles").select("plan").eq("id", ownerId).maybeSingle();
    return normalizePlan((data as { plan?: string | null } | null)?.plan);
  } catch {
    return "free";
  }
}

/** HTTP 402 with the shared paywall payload. */
export function paywallResponse(
  feature: PaywallFeature,
  requiredTier: PlanTier,
  extra: Partial<Pick<PaywallBody, "error" | "used" | "limit" | "resetsAt" | "message">> & Record<string, unknown> = {},
): NextResponse {
  const { error, used, limit, resetsAt, message, ...rest } = extra;
  return NextResponse.json({ ...rest, ...paywallBody(feature, requiredTier, { error, used, limit, resetsAt, message }) }, { status: 402, headers: { "cache-control": "no-store" } });
}

/** HTTP 429 for an hourly anti-abuse limit (not an upgrade reason). */
export function hourlyLimitResponse(feature: PaywallFeature, used: number, limit: number, retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: "rate_limited", feature, used, limit, retryAfterSec },
    { status: 429, headers: { "retry-after": String(retryAfterSec), "cache-control": "no-store" } },
  );
}
