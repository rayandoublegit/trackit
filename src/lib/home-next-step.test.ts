import { describe, expect, it } from "vitest";
import { HOME_STEP_ORDER, homeStepDone, nextHomeStep, type HomeProgress } from "./home-next-step";

const empty: HomeProgress = { shopify: false, creatorsCount: 0, salesCount: 0, activeCampaigns: 0 };

describe("nextHomeStep", () => {
  it("walks a new brand through the product in order", () => {
    expect(nextHomeStep(empty).id).toBe("connect");
    expect(nextHomeStep({ ...empty, shopify: true }).id).toBe("creators");
    expect(nextHomeStep({ ...empty, shopify: true, creatorsCount: 3 }).id).toBe("campaign");
    expect(nextHomeStep({ ...empty, shopify: true, creatorsCount: 3, activeCampaigns: 1 }).id).toBe("sale");
    expect(nextHomeStep({ shopify: true, creatorsCount: 3, activeCampaigns: 1, salesCount: 4 }).id).toBe("grow");
  });

  it("does not ask to connect a store when sales are already tracked by hand", () => {
    expect(nextHomeStep({ ...empty, salesCount: 2 }).id).toBe("creators");
    expect(homeStepDone("connect", { ...empty, salesCount: 2 })).toBe(true);
  });

  it("marks each checklist step from the same progress", () => {
    const progress = { shopify: true, creatorsCount: 1, salesCount: 0, activeCampaigns: 0 };
    expect(HOME_STEP_ORDER.map((id) => homeStepDone(id, progress))).toEqual([true, true, false, false]);
    expect(nextHomeStep(progress).id).toBe(HOME_STEP_ORDER.find((id) => !homeStepDone(id, progress)));
  });
});
