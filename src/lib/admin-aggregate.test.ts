import { describe, expect, it } from "vitest";
import { activeUsers, countBy, dailySeries, emptyDays, followerTier, groupRequests, pctChange, sumSeries } from "./admin-aggregate";

const now = new Date("2026-09-28T15:00:00Z");

describe("admin aggregation", () => {
  it("builds one point per day, oldest first, ending today", () => {
    const days = emptyDays(3, now);
    expect(days.map((d) => d.day)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
  });

  it("counts and sums rows per day and ignores rows outside the window", () => {
    const rows = [
      { at: "2026-09-28T01:00:00Z", amount: 10 },
      { at: "2026-09-28T23:00:00Z", amount: 5 },
      { at: "2026-09-27T12:00:00Z", amount: 7 },
      { at: "2026-08-01T12:00:00Z", amount: 999 },
      { at: null, amount: 3 },
      { at: "not a date", amount: 3 },
    ];
    const counts = dailySeries(rows, (r) => r.at, 7, now);
    expect(counts).toHaveLength(7);
    expect(counts.at(-1)?.value).toBe(2);
    expect(counts.at(-2)?.value).toBe(1);
    expect(sumSeries(counts)).toBe(3);
    const sums = dailySeries(rows, (r) => r.at, 7, now, (r) => r.amount);
    expect(sumSeries(sums)).toBe(22);
    expect(sumSeries(sums, 1)).toBe(15);
  });

  it("reports change only when there is something to compare with", () => {
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 10)).toBe(-50);
    expect(pctChange(5, 0)).toBeNull();
  });

  it("groups by key, most frequent first, with a label for empty keys", () => {
    const out = countBy([{ s: "active" }, { s: "draft" }, { s: "active" }, { s: null }], (r) => r.s);
    expect(out).toEqual([
      { key: "active", count: 2 },
      { key: "—", count: 1 },
      { key: "draft", count: 1 },
    ]);
  });

  it("uses the product follower tiers and keeps a missing metric apart", () => {
    expect(followerTier(9_999)).toBe("nano");
    expect(followerTier(10_000)).toBe("micro");
    expect(followerTier(99_999)).toBe("micro");
    expect(followerTier(100_000)).toBe("influencer");
    expect(followerTier(null)).toBe("unknown");
    expect(followerTier(0)).toBe("nano");
  });

  it("counts distinct active users per window", () => {
    const sessions = [
      { user_id: "a", last_active_at: "2026-09-28T10:00:00Z" },
      { user_id: "a", last_active_at: "2026-09-27T10:00:00Z" },
      { user_id: "b", last_active_at: "2026-09-24T10:00:00Z" },
      { user_id: "c", last_active_at: "2026-08-01T10:00:00Z" },
      { user_id: "d", last_active_at: null },
    ];
    expect(activeUsers(sessions, 1, now)).toBe(1);
    expect(activeUsers(sessions, 7, now)).toBe(2);
    expect(activeUsers(sessions, 90, now)).toBe(3);
  });

  it("groups free-text requests by normalized key and keeps the latest date", () => {
    const rows = [
      { n: "skincare", raw: "Skincare", at: "2026-09-20" },
      { n: "skincare", raw: "skin care", at: "2026-09-25" },
      { n: null, raw: "Padel", at: "2026-09-21" },
      { n: "", raw: "", at: "2026-09-21" },
    ];
    const out = groupRequests(rows, (r) => r.n, (r) => r.raw, (r) => r.at);
    expect(out[0]).toEqual({ key: "skincare", label: "Skincare", count: 2, last: "2026-09-25" });
    expect(out[1].key).toBe("padel");
    expect(out).toHaveLength(2);
  });
});
