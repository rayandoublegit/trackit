"use client";

import { useEffect, useState } from "react";
import type { StripePriceMatrix } from "@/lib/stripe-config";
import { getGrowthPriceId, getProPriceId, getScalePriceId } from "@/lib/stripe-config";

function matrixFromEnv(): StripePriceMatrix {
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

function matrixHasMonthlyUsd(prices: StripePriceMatrix): boolean {
  return Boolean(prices.growth.usd.month && prices.pro.usd.month && prices.scale.usd.month);
}

export function useStripePrices() {
  const [prices, setPrices] = useState<StripePriceMatrix>(() => matrixFromEnv());
  const [loading, setLoading] = useState(() => !matrixHasMonthlyUsd(matrixFromEnv()));
  const [configured, setConfigured] = useState(() => matrixHasMonthlyUsd(matrixFromEnv()));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stripe/prices", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as {
          prices?: StripePriceMatrix;
          configured?: boolean;
        };
        if (cancelled || !payload.prices) return;
        setPrices(payload.prices);
        setConfigured(Boolean(payload.configured ?? matrixHasMonthlyUsd(payload.prices)));
      } catch {
        if (!cancelled) {
          const fallback = matrixFromEnv();
          setPrices(fallback);
          setConfigured(matrixHasMonthlyUsd(fallback));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { prices, loading, configured };
}
