/**
 * Single source of truth for Stripe price IDs.
 * Server routes read STRIPE_* ; client reads NEXT_PUBLIC_* (injected via next.config env).
 * Monthly USD fallbacks match the Trackit Stripe account (suffix FC3qsxzaqx).
 */

function pick(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Canonical monthly USD prices on the Trackit Stripe account. */
export const TRACKIT_STRIPE_DEFAULT_PRICE_IDS = {
  growthUsdMonthly: "price_1Tc60RFC3qsxzaqxCgGq0ksL",
  proUsdMonthly: "price_1Tc62BFC3qsxzaqxxsk8mIyO",
  scaleUsdMonthly: "price_1Tc64lFC3qsxzaqxTxhKyCpf",
} as const;

/** Map server env keys → client env keys for next.config `env`. */
export const STRIPE_PRICE_ENV_ALIASES: Record<string, string> = {
  STRIPE_GROWTH_PRICE_ID: "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID",
  STRIPE_GROWTH_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID",
  STRIPE_GROWTH_ANNUAL_PRICE_ID: "NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID",
  STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID",
  STRIPE_BASIC_PRICE_ID: "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID",
  STRIPE_PRO2_PRICE_ID: "NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID",
  STRIPE_PRO2_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID",
  STRIPE_PRO2_ANNUAL_PRICE_ID: "NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID",
  STRIPE_PRO2_ANNUAL_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID",
  STRIPE_PRO_PRICE_ID: "NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID",
  STRIPE_SCALE_PRICE_ID: "NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID",
  STRIPE_SCALE_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID",
  STRIPE_SCALE_ANNUAL_PRICE_ID: "NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID",
  STRIPE_SCALE_ANNUAL_EUR_PRICE_ID: "NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID",
};

export function buildClientStripeEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [serverKey, clientKey] of Object.entries(STRIPE_PRICE_ENV_ALIASES)) {
    const value = pick(process.env[serverKey], process.env[clientKey]);
    if (value && !out[clientKey]) out[clientKey] = value;
  }

  if (!out.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID) {
    out.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID = TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly;
  }
  if (!out.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID) {
    out.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID = TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly;
  }
  if (!out.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID) {
    out.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID = TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly;
  }

  return out;
}

export type StripePriceMatrix = {
  growth: { usd: { month: string; year: string }; eur: { month: string; year: string } };
  pro: { usd: { month: string; year: string }; eur: { month: string; year: string } };
  scale: { usd: { month: string; year: string }; eur: { month: string; year: string } };
};

export function getGrowthPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? pick(
          process.env.STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID
        );
  }
  const id =
    currency === "eur"
      ? pick(
          process.env.STRIPE_GROWTH_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_GROWTH_PRICE_ID,
          process.env.STRIPE_BASIC_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
          TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly
        );
  return id;
}

export function getProPriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? pick(
          process.env.STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_PRO2_ANNUAL_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID
        );
  }
  const id =
    currency === "eur"
      ? pick(
          process.env.STRIPE_PRO2_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_PRO2_PRICE_ID,
          process.env.STRIPE_PRO_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
          TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly
        );
  return id;
}

export function getScalePriceId(currency: "usd" | "eur" = "usd", annual = false): string {
  if (annual) {
    return currency === "eur"
      ? pick(
          process.env.STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID
        );
  }
  const id =
    currency === "eur"
      ? pick(
          process.env.STRIPE_SCALE_EUR_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID
        )
      : pick(
          process.env.STRIPE_SCALE_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
          TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly
        );
  return id;
}

export function getStripePriceMatrix(): StripePriceMatrix {
  return {
    growth: {
      usd: { month: getGrowthPriceId("usd"), year: getGrowthPriceId("usd", true) },
      eur: { month: getGrowthPriceId("eur"), year: getGrowthPriceId("eur", true) },
    },
    pro: {
      usd: { month: getProPriceId("usd"), year: getProPriceId("usd", true) },
      eur: { month: getProPriceId("eur"), year: getProPriceId("eur", true) },
    },
    scale: {
      usd: { month: getScalePriceId("usd"), year: getScalePriceId("usd", true) },
      eur: { month: getScalePriceId("eur"), year: getScalePriceId("eur", true) },
    },
  };
}

function priceIds(...keys: (string | undefined)[]): string[] {
  return keys.filter((id): id is string => !!id && id.trim().length > 0);
}

export const growthPriceIds = (): string[] =>
  priceIds(
    process.env.STRIPE_GROWTH_PRICE_ID,
    process.env.STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_BASIC_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly
  );

export const proPriceIds = (): string[] =>
  priceIds(
    process.env.STRIPE_PRO2_PRICE_ID,
    process.env.STRIPE_PRO2_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_PRO_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly
  );

export const scalePriceIds = (): string[] =>
  priceIds(
    process.env.STRIPE_SCALE_PRICE_ID,
    process.env.STRIPE_SCALE_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly
  );

export const annualPriceIds = (): string[] =>
  priceIds(
    process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID
  );

export const monthlyPriceIds = (): string[] =>
  priceIds(
    process.env.STRIPE_GROWTH_PRICE_ID,
    process.env.STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.STRIPE_PRO2_PRICE_ID,
    process.env.STRIPE_PRO2_EUR_PRICE_ID,
    process.env.STRIPE_SCALE_PRICE_ID,
    process.env.STRIPE_SCALE_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.growthUsdMonthly,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.proUsdMonthly,
    TRACKIT_STRIPE_DEFAULT_PRICE_IDS.scaleUsdMonthly
  );

export function isStripeCheckoutConfigured(): boolean {
  return Boolean(
    pick(process.env.STRIPE_SECRET_KEY) &&
      getGrowthPriceId("usd") &&
      getProPriceId("usd") &&
      getScalePriceId("usd")
  );
}
