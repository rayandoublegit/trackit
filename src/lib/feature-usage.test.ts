import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkHourlyLimit, countUsage, recordUsage, resetUsageMemory } from "@/lib/feature-usage";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const MIN = 60_000;

/** A fake Supabase client over an in-memory feature_usage table (or a missing one). */
function fakeAdmin(opts: { missing?: boolean } = {}) {
  const rows: { owner_id: string; feature: string; used_at: string; meta: unknown }[] = [];
  const missingError = { code: "PGRST205", message: "Could not find the table 'public.feature_usage' in the schema cache" };
  const from = (table: string) => {
    expect(table).toBe("feature_usage");
    const filters: ((r: (typeof rows)[number]) => boolean)[] = [];
    const chain = {
      select: () => chain,
      eq: (col: "owner_id" | "feature", v: string) => (filters.push((r) => r[col] === v), chain),
      gte: (_col: string, v: string) => (filters.push((r) => r.used_at >= v), chain),
      order: () => chain,
      limit: async () => (opts.missing ? { data: null, error: missingError } : { data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
      insert: async (row: (typeof rows)[number]) => {
        if (opts.missing) return { error: missingError };
        rows.push(row);
        return { error: null };
      },
    };
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, rows };
}

beforeEach(() => {
  resetUsageMemory();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("hourly anti-abuse limit (feature_usage)", () => {
  it("counts only this owner's uses of this feature in the last hour", async () => {
    const { admin } = fakeAdmin();
    await recordUsage(admin, "owner-a", "mino-analysis", {}, NOW - 70 * MIN);
    await recordUsage(admin, "owner-a", "mino-analysis", {}, NOW - 30 * MIN);
    await recordUsage(admin, "owner-a", "mino-analysis", {}, NOW - 5 * MIN);
    await recordUsage(admin, "owner-b", "mino-analysis", {}, NOW - 5 * MIN);
    expect(await countUsage(admin, "owner-a", "mino-analysis", NOW - 60 * MIN)).toBe(2);
    const check = await checkHourlyLimit(admin, "owner-a", "mino-analysis", 3, NOW);
    expect(check).toEqual({ allowed: true, used: 2, limit: 3, retryAfterSec: 0 });
  });

  it("at the limit: refused, retry when the oldest use leaves the hour", async () => {
    const { admin } = fakeAdmin();
    await recordUsage(admin, "o", "mino-analysis", {}, NOW - 50 * MIN);
    await recordUsage(admin, "o", "mino-analysis", {}, NOW - 10 * MIN);
    const check = await checkHourlyLimit(admin, "o", "mino-analysis", 2, NOW);
    expect(check.allowed).toBe(false);
    expect(check.used).toBe(2);
    expect(check.retryAfterSec).toBe(10 * 60);
  });

  it("limit 0 (Free) is never allowed", async () => {
    const { admin } = fakeAdmin();
    expect((await checkHourlyLimit(admin, "o", "mino-analysis", 0, NOW)).allowed).toBe(false);
  });

  it("table missing (migration not applied): counts in memory, still enforces, warns once", async () => {
    const { admin } = fakeAdmin({ missing: true });
    await recordUsage(admin, "o", "mino-analysis", {}, NOW - 2 * MIN);
    await recordUsage(admin, "o", "mino-analysis", {}, NOW - 1 * MIN);
    const check = await checkHourlyLimit(admin, "o", "mino-analysis", 2, NOW);
    expect(check.allowed).toBe(false);
    expect((await checkHourlyLimit(admin, "o", "mino-analysis", 3, NOW)).allowed).toBe(true);
  });

  it("no database at all: memory only", async () => {
    await recordUsage(null, "o", "mino-analysis", {}, NOW - MIN);
    expect(await countUsage(null, "o", "mino-analysis", NOW - 60 * MIN)).toBe(1);
  });
});
