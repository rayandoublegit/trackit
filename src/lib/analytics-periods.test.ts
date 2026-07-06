import { describe, expect, it } from "vitest";
import { getPeriodBounds, isWithinPeriod, toDayKey } from "./analytics-periods";

describe("analytics period bounds", () => {
  const now = new Date("2026-07-06T15:30:00");

  it("limits today to the local calendar day only", () => {
    const { start, end } = getPeriodBounds("today", now);
    expect(isWithinPeriod("2026-07-06T08:00:00.000Z", start, end)).toBe(true);
    expect(isWithinPeriod("2026-07-05T23:00:00.000Z", start, end)).toBe(
      toDayKey(new Date("2026-07-05T23:00:00.000Z")) === toDayKey(start),
    );
    expect(isWithinPeriod("2026-07-04T12:00:00.000Z", start, end)).toBe(false);
    expect(isWithinPeriod("2026-07-01T12:00:00.000Z", start, end)).toBe(false);
  });

  it("limits 30d to the last 30 calendar days", () => {
    const { start, end } = getPeriodBounds("30d", now);
    expect(isWithinPeriod("2026-07-06T10:00:00.000Z", start, end)).toBe(true);
    expect(isWithinPeriod("2026-06-07T10:00:00.000Z", start, end)).toBe(true);
    expect(isWithinPeriod("2026-06-05T10:00:00.000Z", start, end)).toBe(false);
  });

  it("uses the client timezone for today when tzOffset is provided", () => {
    // Jul 7 02:00 UTC = Jul 6 22:00 in UTC-4 (offset 240)
    const eveningUtc = new Date("2026-07-07T02:00:00.000Z");
    const tzOffset = 240;
    const { start, end } = getPeriodBounds("today", eveningUtc, tzOffset);

    expect(toDayKey(start, tzOffset)).toBe("2026-07-06");
    expect(isWithinPeriod("2026-07-07T01:30:00.000Z", start, end, tzOffset)).toBe(true);
    expect(isWithinPeriod("2026-07-06T18:00:00.000Z", start, end, tzOffset)).toBe(true);
    expect(isWithinPeriod("2026-07-05T23:00:00.000Z", start, end, tzOffset)).toBe(false);
  });

  it("includes same-day sales on server UTC when client is behind UTC", () => {
    const tzOffset = 240;
    const now = new Date("2026-07-07T03:00:00.000Z");
    const { start, end } = getPeriodBounds("today", now, tzOffset);
    expect(isWithinPeriod("2026-07-06T22:00:00.000Z", start, end, tzOffset)).toBe(true);
    expect(isWithinPeriod("2026-07-07T02:30:00.000Z", start, end, tzOffset)).toBe(true);
    expect(isWithinPeriod("2026-07-06T02:00:00.000Z", start, end, tzOffset)).toBe(false);
  });
});
