import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TRACKIT_STRIPE_DEFAULT_PRICE_IDS,
  buildClientStripeEnv,
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
} from "./stripe-config";

const ROOT = join(import.meta.dirname, "../..");

function readRepoFile(relPath: string): string {
  const abs = join(ROOT, relPath);
  expect(existsSync(abs), `missing file: ${relPath}`).toBe(true);
  return readFileSync(abs, "utf8");
}

describe("stripe config guard", () => {
  it("next.config.ts wires buildClientStripeEnv into env", () => {
    const config = readRepoFile("next.config.ts");
    expect(config).toContain("buildClientStripeEnv");
    expect(config).toContain("env:");
  });

  it("onboarding step 4 uses PricingPlans with stripe cancel URL", () => {
    const onboarding = readRepoFile("src/app/onboarding/page.tsx");
    expect(onboarding).toContain("PricingPlans");
    expect(onboarding).toContain("onBeforeCheckout={saveOnboardingProfile}");
    expect(onboarding).toContain("/onboarding");
  });

  it("PricingPlans loads prices via useStripePrices", () => {
    const pricing = readRepoFile("src/components/PricingPlans.tsx");
    expect(pricing).toContain("useStripePrices");
    expect(pricing).not.toMatch(/getGrowthPriceId|getProPriceId|getScalePriceId/);
  });

  it("stripe prices API route exists", () => {
    readRepoFile("src/app/api/stripe/prices/route.ts");
  });

  it("monthly USD fallbacks are the Trackit Stripe account prices", () => {
    expect(getGrowthPriceId("usd")).toBe(TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly);
    expect(getProPriceId("usd")).toBe(TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly);
    expect(getScalePriceId("usd")).toBe(TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly);
  });

  it("buildClientStripeEnv always exposes monthly USD price IDs", () => {
    const env = buildClientStripeEnv();
    expect(env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID).toBe(
      TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly
    );
    expect(env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID).toBe(
      TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly
    );
    expect(env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID).toBe(
      TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly
    );
  });
});
