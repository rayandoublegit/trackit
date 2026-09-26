import { describe, expect, it } from "vitest";
import { GIFT_STATUSES } from "./gifting";
import {
  GIFT_BOARD_COLUMNS,
  friendlyGiftError,
  giftColumnFor,
  giftNextStep,
  giftStats,
  giftStatusLabel,
  isGiftSetupError,
} from "./gifting-board";

describe("gifting board", () => {
  it("places every status except declined in exactly one column", () => {
    for (const status of GIFT_STATUSES) {
      const columns = GIFT_BOARD_COLUMNS.filter((c) => c.statuses.includes(status));
      expect(columns.length).toBe(status === "declined" ? 0 : 1);
    }
    expect(giftColumnFor("accepted")).toBe("invited");
    expect(giftColumnFor("declined")).toBeNull();
  });

  it("labels every status in both languages", () => {
    for (const status of GIFT_STATUSES) {
      expect(giftStatusLabel(status, "fr")).not.toBe(status);
      expect(giftStatusLabel(status, "en").length).toBeGreaterThan(0);
      expect(giftNextStep(status, true, "fr").length).toBeGreaterThan(0);
      expect(giftNextStep(status, false, "en").length).toBeGreaterThan(0);
    }
    expect(giftStatusLabel("mystery", "fr")).toBe("mystery");
  });

  it("counts missions by what needs attention", () => {
    const stats = giftStats([
      { status: "invited" },
      { status: "shipped" },
      { status: "shipped" },
      { status: "submitted" },
      { status: "approved" },
      { status: "declined" },
    ]);
    expect(stats).toEqual({ active: 4, shipping: 2, toReview: 1, approved: 1, declined: 1 });
  });

  it("turns server errors into plain sentences and keeps unknown ones", () => {
    expect(friendlyGiftError("Server misconfigured", "fr")).toMatch(/pas encore activé/);
    expect(isGiftSetupError('relation "public.gift_campaigns" does not exist')).toBe(true);
    expect(isGiftSetupError("column gift_missions.revision does not exist")).toBe(true);
    expect(friendlyGiftError("Creator must join this brand before a gift mission can be sent.", "en")).toMatch(/not connected/);
    expect(friendlyGiftError("Something odd", "en")).toBe("Something odd");
    expect(isGiftSetupError("Unauthorized")).toBe(false);
  });
});
