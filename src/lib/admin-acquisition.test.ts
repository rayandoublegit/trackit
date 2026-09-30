import { describe, expect, it } from "vitest";
import { acquisitionFunnel, normalizeAcquisitionSource, type AcqProfile } from "./admin-acquisition";

describe("normalizeAcquisitionSource", () => {
  it("maps onboarding keys and legacy free text", () => {
    expect(normalizeAcquisitionSource("tiktok")).toBe("tiktok");
    expect(normalizeAcquisitionSource("TikTok")).toBe("tiktok");
    expect(normalizeAcquisitionSource("Instagram ads")).toBe("instagram");
    expect(normalizeAcquisitionSource("twitter")).toBe("twitter");
    expect(normalizeAcquisitionSource("Word of mouth")).toBe("friend");
    expect(normalizeAcquisitionSource("google")).toBe("google");
    expect(normalizeAcquisitionSource("podcast")).toBe("other");
  });

  it("treats empty values as unknown", () => {
    expect(normalizeAcquisitionSource(null)).toBe("unknown");
    expect(normalizeAcquisitionSource("  ")).toBe("unknown");
    expect(normalizeAcquisitionSource("(not specified)")).toBe("unknown");
  });

  it("refines other with its details", () => {
    expect(normalizeAcquisitionSource("other", "a YouTube video")).toBe("youtube");
    expect(normalizeAcquisitionSource("other", "a newsletter")).toBe("other");
  });
});

const base = { plan: "free", subscription_active: false, subscription_status: null, stripe_subscription_id: null, onboarding_completed: false, created_at: "2026-09-20T00:00:00Z" };
const p = (over: Partial<AcqProfile>): AcqProfile => ({ ...base, referral_source: null, ...over });

describe("acquisitionFunnel", () => {
  const now = Date.parse("2026-09-30T00:00:00Z");
  const rows: AcqProfile[] = [
    p({ referral_source: "tiktok" }),
    p({ referral_source: "tiktok", onboarding_completed: true }),
    p({ referral_source: "tiktok", onboarding_completed: true, plan: "pro", stripe_subscription_id: "sub_1" }),
    p({ referral_source: "instagram", onboarding_completed: true }),
    // Comped access is not paying; a payer is always onboarded.
    p({ referral_source: "instagram", plan: "pro", subscription_status: "comped" }),
    p({ referral_source: "instagram", plan: "scale", subscription_status: "whop:mem_1" }),
    p({ referral_source: null, created_at: "2026-01-01T00:00:00Z" }),
  ];

  it("counts each step overall and per source", () => {
    const f = acquisitionFunnel(rows, { now });
    expect(f.total).toMatchObject({ signups: 7, onboarded: 4, paying: 2 });
    expect(f.total.onboardRatePct).toBe(57.1);
    expect(f.total.payFromOnboardedPct).toBe(50);
    const tiktok = f.bySource.find((r) => r.key === "tiktok");
    expect(tiktok).toMatchObject({ signups: 3, onboarded: 2, paying: 1, payRatePct: 33.3 });
    const insta = f.bySource.find((r) => r.key === "instagram");
    expect(insta).toMatchObject({ signups: 3, onboarded: 2, paying: 1 });
    expect(f.bySource[f.bySource.length - 1].key).toBe("unknown");
  });

  it("keeps only recent signups with sinceMs", () => {
    const f = acquisitionFunnel(rows, { now, sinceMs: now - 30 * 86_400_000 });
    expect(f.total.signups).toBe(6);
    expect(f.bySource.some((r) => r.key === "unknown")).toBe(false);
  });

  it("returns null rates when a step is empty", () => {
    const f = acquisitionFunnel([], { now });
    expect(f.total).toMatchObject({ signups: 0, onboardRatePct: null, payFromOnboardedPct: null, payRatePct: null });
  });
});
