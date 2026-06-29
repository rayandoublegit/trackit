import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDailyDiscoveryLimit,
  hasDiscoveryDailyCap,
  type PlanTier,
} from "@/lib/plan-limits";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type DiscoveryQuotaState = {
  used: number;
  resetAt: Date | null;
  limit: number;
  blocked: boolean;
};

export function isMonthlyDiscoveryPlan(plan: PlanTier): boolean {
  return plan === "basic" || plan === "pro";
}

export async function syncDiscoveryQuota(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanTier
): Promise<DiscoveryQuotaState | null> {
  const limit = getDailyDiscoveryLimit(plan);
  if (!hasDiscoveryDailyCap(plan) || limit == null) return null;

  const { data } = await supabase
    .from("profiles")
    .select("discoveries_used, discoveries_reset_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return { used: 0, resetAt: null, limit, blocked: false };

  let used = data.discoveries_used || 0;
  let resetAt = data.discoveries_reset_at ? new Date(data.discoveries_reset_at) : null;

  if (isMonthlyDiscoveryPlan(plan)) {
    const resetMs = resetAt?.getTime() ?? 0;
    if (!resetMs || Date.now() - resetMs >= THIRTY_DAYS_MS) {
      used = 0;
      resetAt = new Date();
      await supabase
        .from("profiles")
        .update({
          discoveries_used: 0,
          discoveries_reset_at: resetAt.toISOString(),
        })
        .eq("id", userId);
    }
  }

  return {
    used,
    resetAt,
    limit,
    blocked: used >= limit,
  };
}

export async function incrementDiscoveryQuota(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanTier,
  currentUsed: number
): Promise<number> {
  const limit = getDailyDiscoveryLimit(plan);
  if (!hasDiscoveryDailyCap(plan) || limit == null) return currentUsed;

  const next = currentUsed + 1;
  const patch: Record<string, unknown> = { discoveries_used: next };
  if (isMonthlyDiscoveryPlan(plan) && currentUsed === 0) {
    patch.discoveries_reset_at = new Date().toISOString();
  }
  await supabase.from("profiles").update(patch).eq("id", userId);
  return next;
}

export function discoveryResetRemainingMs(resetAt: Date | null, plan: PlanTier): number | null {
  if (!isMonthlyDiscoveryPlan(plan) || !resetAt) return null;
  const remaining = resetAt.getTime() + THIRTY_DAYS_MS - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function formatDiscoveryResetCountdown(ms: number, lang: "fr" | "en"): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (lang === "fr") {
    if (days > 0) return `${days} j ${hours} h`;
    if (hours > 0) return `${hours} h ${minutes} min`;
    return `${minutes} min`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
