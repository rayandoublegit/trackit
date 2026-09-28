import { describe, expect, it } from "vitest";
import { billingOf, isOffered, isPaying } from "./admin-billing";

const base = { plan: "pro", subscription_active: false, subscription_status: null, stripe_subscription_id: null };
const now = Date.parse("2026-09-28T12:00:00Z");

describe("billingOf", () => {
  it("recognises each way an account can have access", () => {
    expect(billingOf({ ...base, stripe_subscription_id: "sub_1", subscription_active: true }, now).source).toBe("stripe");
    expect(billingOf({ ...base, subscription_status: "whop:mem_1", subscription_active: true }, now).source).toBe("whop");
    expect(billingOf({ ...base, subscription_status: "comped" }, now).source).toBe("comped");
    expect(billingOf({ ...base, subscription_status: "gifted:2026-10-10T00:00:00Z" }, now)).toEqual({
      source: "gifted",
      plan: "pro",
      until: "2026-10-10T00:00:00Z",
    });
  });

  it("drops an expired gift and a paid plan without any subscription back to free", () => {
    expect(billingOf({ ...base, subscription_status: "gifted:2026-09-01T00:00:00Z" }, now)).toEqual({ source: "free", plan: "free", until: null });
    expect(billingOf(base, now).source).toBe("free");
    expect(billingOf({ ...base, plan: "free", stripe_subscription_id: "sub_1" }, now).source).toBe("free");
  });

  it("separates paying from offered accounts", () => {
    expect(isPaying("stripe") && isPaying("whop")).toBe(true);
    expect(isPaying("gifted")).toBe(false);
    expect(isOffered("comped") && isOffered("gifted")).toBe(true);
    expect(isOffered("free")).toBe(false);
  });
});
