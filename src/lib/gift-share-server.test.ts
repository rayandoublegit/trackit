import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandCanPublish } from "@/lib/gift-share-server";
import { giftCampaignAvailability } from "@/lib/gift-share";

// The public gift link stays closed below Pro: creators see "closed", never the brand's plan.

function adminWithPlan(plan: string | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan === null ? null : { plan }, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

describe("brandCanPublish (gifting share links are Pro and above)", () => {
  it.each([
    [null, false],
    ["free", false],
    ["basic", false],
    ["growth", false],
    ["pro", true],
    ["scale", true],
  ])("plan %s → %s", async (plan, expected) => {
    expect(await brandCanPublish(adminWithPlan(plan), "owner")).toBe(expected);
  });

  it("a Growth brand's open campaign reads as disabled to creators (neutral reason)", async () => {
    const canPublish = await brandCanPublish(adminWithPlan("basic"), "owner");
    const availability = giftCampaignAvailability(
      { status: "active", share_enabled: canPublish ? true : false, deadline: "2999-01-01", spots: 10 },
      0,
      "2026-10-09",
    );
    expect(availability).toMatchObject({ open: false, reason: "disabled" });
  });
});
