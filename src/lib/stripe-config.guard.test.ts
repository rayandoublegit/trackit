import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TRACKIT_STRIPE_DEFAULT_PRICE_IDS,
  assertNonEmptyStripePriceId,
  buildClientStripeEnv,
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
  stripePriceEnvCandidates,
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
    expect(onboarding).toContain("getOnboardingPayload={buildOnboardingPayload}");
    expect(onboarding).toContain("/onboarding?step=4");
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

  it("assertNonEmptyStripePriceId throws with env var names", () => {
    expect(() =>
      assertNonEmptyStripePriceId("", stripePriceEnvCandidates("growth", "eur", true))
    ).toThrow(/STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID/);
  });

  it("check:stripe script is wired in package.json", () => {
    const pkg = JSON.parse(readRepoFile("package.json"));
    expect(pkg.scripts["check:stripe"]).toBe("tsx scripts/check-stripe-prices.ts");
  });

  it("create-checkout allows guest checkout without a session user", () => {
    const src = readRepoFile("src/app/api/create-checkout/route.ts");
    expect(src).toContain("Guest checkout is allowed");
    expect(src).not.toMatch(/else if \(!resolvedUserId\) \{\s*return NextResponse\.json\(\{ error: "Unauthorized" \}/);
  });

  it("client checkout sends cookies and falls back to Checkout on 401", () => {
    const src = readRepoFile("src/lib/checkout.ts");
    expect(src).toContain('credentials: "include"');
    expect(src).toContain("res.status === 401");
  });
});
