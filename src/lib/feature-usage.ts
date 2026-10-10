import type { SupabaseClient } from "@supabase/supabase-js";

// Usage of costly features per workspace owner (table feature_usage, migration
// 20261009_000052). Only the hourly anti-abuse limits read it today (Mino
// site/photo analysis); plans have no monthly quotas.
//
// Only billable uses are recorded (an analysis that reached Claude). Before the
// migration is applied, or when the database is unreachable, the count falls
// back to this server instance's memory: the limit still holds per instance and
// the feature keeps working.

export type UsageFeature = "mino-analysis";

const HOUR_MS = 3_600_000;
const memory = new Map<string, number[]>();

/** Tests only. */
export function resetUsageMemory(): void {
  memory.clear();
}

const memKey = (ownerId: string, feature: UsageFeature) => `${feature}:${ownerId}`;

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /feature_usage/.test(error.message ?? "") && /does not exist|not find|schema cache/i.test(error.message ?? "");
}

let warned = false;
function warnMissing(): void {
  if (warned) return;
  warned = true;
  console.warn("feature_usage table missing (migration 20261009_000052 not applied): hourly limits count in memory only.");
}

/** Uses since `sinceMs`, oldest first (timestamps in ms). Never throws. */
export async function usageSince(admin: SupabaseClient | null | undefined, ownerId: string, feature: UsageFeature, sinceMs: number): Promise<{ times: number[]; source: "db" | "memory" }> {
  const mem = (memory.get(memKey(ownerId, feature)) ?? []).filter((t) => t >= sinceMs);
  memory.set(memKey(ownerId, feature), mem);
  if (!admin) return { times: mem, source: "memory" };
  try {
    const { data, error } = await admin
      .from("feature_usage")
      .select("used_at")
      .eq("owner_id", ownerId)
      .eq("feature", feature)
      .gte("used_at", new Date(sinceMs).toISOString())
      .order("used_at", { ascending: true })
      .limit(1000);
    if (error) {
      if (isMissingTable(error)) warnMissing();
      return { times: mem, source: "memory" };
    }
    const db = (data ?? []).map((r: { used_at?: string }) => Date.parse(String(r.used_at))).filter(Number.isFinite);
    // The larger count wins: a write that failed in the database still counts here.
    return db.length >= mem.length ? { times: db, source: "db" } : { times: mem, source: "memory" };
  } catch {
    return { times: mem, source: "memory" };
  }
}

export async function countUsage(admin: SupabaseClient | null | undefined, ownerId: string, feature: UsageFeature, sinceMs: number): Promise<number> {
  return (await usageSince(admin, ownerId, feature, sinceMs)).times.length;
}

/** Records one billable use (memory always, database when available). Never throws. */
export async function recordUsage(
  admin: SupabaseClient | null | undefined,
  ownerId: string,
  feature: UsageFeature,
  meta: Record<string, unknown> = {},
  nowMs: number = Date.now(),
): Promise<void> {
  const key = memKey(ownerId, feature);
  memory.set(key, [...(memory.get(key) ?? []), nowMs]);
  if (!admin) return;
  try {
    const { error } = await admin.from("feature_usage").insert({ owner_id: ownerId, feature, used_at: new Date(nowMs).toISOString(), meta });
    if (error && isMissingTable(error)) warnMissing();
  } catch {
    // Counted in memory.
  }
}

export type HourlyCheck = { allowed: boolean; used: number; limit: number; retryAfterSec: number };

/** Hourly anti-abuse check. `limit` 0 = never allowed. */
export async function checkHourlyLimit(
  admin: SupabaseClient | null | undefined,
  ownerId: string,
  feature: UsageFeature,
  limit: number,
  nowMs: number = Date.now(),
): Promise<HourlyCheck> {
  if (limit <= 0) return { allowed: false, used: 0, limit, retryAfterSec: 3600 };
  const { times } = await usageSince(admin, ownerId, feature, nowMs - HOUR_MS);
  const used = times.length;
  if (used < limit) return { allowed: true, used, limit, retryAfterSec: 0 };
  const oldest = times.length ? Math.min(...times) : nowMs;
  return { allowed: false, used, limit, retryAfterSec: Math.max(60, Math.ceil((oldest + HOUR_MS - nowMs) / 1000)) };
}
