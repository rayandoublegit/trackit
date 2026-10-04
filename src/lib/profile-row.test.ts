import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listProfileRows } from "@/lib/profile-row";

// Mimics PostgREST: every response is capped at 1000 rows, `range` picks the window.
function fakeClient(total: number, missing: string[] = []): SupabaseClient {
  const all = Array.from({ length: total }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.test` }));
  return {
    from: () => ({
      select: (cols: string) => {
        let window: [number, number] = [0, 999];
        const query = {
          range(from: number, to: number) {
            window = [from, to];
            return query;
          },
          order: () => query,
          then(resolve: (r: unknown) => void) {
            const bad = missing.find((c) => cols.split(",").includes(c));
            if (bad) return resolve({ data: null, error: { message: `column profiles.${bad} does not exist` } });
            const [from, to] = window;
            resolve({ data: all.slice(from, Math.min(to, from + 999) + 1), error: null });
          },
        };
        return query;
      },
    }),
  } as unknown as SupabaseClient;
}

describe("listProfileRows", () => {
  it("reads past the 1000-row cap", async () => {
    const { rows, error } = await listProfileRows(fakeClient(2345), ["id", "email"]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2345);
  });

  it("drops a missing column and still reads every page", async () => {
    const { rows, error } = await listProfileRows(fakeClient(1500, ["role"]), ["id", "email", "role"]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1500);
  });
});
