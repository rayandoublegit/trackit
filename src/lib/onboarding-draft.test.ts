import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const storage = new Map<string, string>();

describe("onboarding-draft", () => {
  beforeEach(async () => {
    storage.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal("window", {
      history: { replaceState: vi.fn() },
      location: { search: "" },
    });

    const mod = await import("./onboarding-draft");
    mod.clearOnboardingDraft();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists and restores draft for the same user", async () => {
    const { writeOnboardingDraft, readOnboardingDraft } = await import("./onboarding-draft");
    writeOnboardingDraft({
      userId: "user-1",
      step: 4,
      fullName: "Jane",
      username: "jane",
      avatarPreviewUrl: null,
      businessName: "Acme",
      businessType: "ecommerce",
      niche: "beauty",
      revenue: "1k-10k",
      source: "tiktok",
      sourceHandle: "@jane",
      sourceDetails: "",
      shopifyUrl: "",
    });

    const draft = readOnboardingDraft("user-1");
    expect(draft?.step).toBe(4);
    expect(draft?.fullName).toBe("Jane");
    expect(readOnboardingDraft("user-2")).toBeNull();
  });

  it("reads step from URL", async () => {
    vi.stubGlobal("window", {
      history: { replaceState: vi.fn() },
      location: { search: "?step=4" },
    });
    const { onboardingStepFromUrl } = await import("./onboarding-draft");
    expect(onboardingStepFromUrl()).toBe(4);
  });
});
