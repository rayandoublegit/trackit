import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeHandoffHandle,
  queueCreatorForCampaign,
  queueCreatorForGift,
  requestCampaignsTab,
  takeCampaignsTab,
  takeCreatorForCampaign,
  takeCreatorForGift,
} from "./creator-handoff";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("creator hand-off", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands a creator to the next campaign screen exactly once", () => {
    queueCreatorForCampaign("  @Luna.Beauty ");
    expect(takeCreatorForCampaign()).toBe("luna.beauty");
    expect(takeCreatorForCampaign()).toBeNull();
  });

  it("keeps campaign and gift hand-offs apart", () => {
    queueCreatorForCampaign("sarah");
    queueCreatorForGift("nora");
    expect(takeCreatorForGift()).toBe("nora");
    expect(takeCreatorForCampaign()).toBe("sarah");
  });

  it("ignores empty handles", () => {
    queueCreatorForGift("@@  ");
    expect(takeCreatorForGift()).toBeNull();
  });

  it("only accepts known campaign tabs", () => {
    requestCampaignsTab("gifting");
    expect(takeCampaignsTab()).toBe("gifting");
    expect(takeCampaignsTab()).toBeNull();
    sessionStorage.setItem("trackit_handoff_campaigns_tab", "admin");
    expect(takeCampaignsTab()).toBeNull();
  });

  it("does nothing without storage", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => queueCreatorForCampaign("x")).not.toThrow();
    expect(takeCreatorForCampaign()).toBeNull();
    expect(normalizeHandoffHandle("@A")).toBe("a");
  });
});
