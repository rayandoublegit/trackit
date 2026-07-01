import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

describe("dashboard-bootstrap-cache", () => {
  beforeEach(async () => {
    storage.clear();
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });

    const mod = await import("./dashboard-bootstrap-cache");
    mod.clearDashboardBootstrap();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips bootstrap data for the same user", async () => {
    const {
      buildBootstrapFromOnboarding,
      readDashboardBootstrap,
      writeDashboardBootstrap,
    } = await import("./dashboard-bootstrap-cache");

    const user = { id: "user-1", email: "a@b.com" } as const;
    const cache = buildBootstrapFromOnboarding(user as never, {
      fullName: "Ada",
      username: "ada",
      businessName: "Acme",
      businessType: "ecommerce",
      niche: "beauty",
      revenueRange: "1k-10k",
      avatarUrl: null,
    });

    writeDashboardBootstrap(cache);
    expect(readDashboardBootstrap("user-1")).toEqual(cache);
    expect(readDashboardBootstrap("other-user")).toBeNull();
  });

  it("clears stored bootstrap", async () => {
    const {
      clearDashboardBootstrap,
      readDashboardBootstrap,
      writeDashboardBootstrap,
    } = await import("./dashboard-bootstrap-cache");

    writeDashboardBootstrap({
      userId: "u1",
      email: null,
      full_name: null,
      username: null,
      avatar_url: null,
      business_name: null,
      shopify_store: null,
      plan: "free",
      account_type: null,
      isCreator: false,
      onboarding_completed: true,
    });
    clearDashboardBootstrap();
    expect(readDashboardBootstrap("u1")).toBeNull();
  });
});
