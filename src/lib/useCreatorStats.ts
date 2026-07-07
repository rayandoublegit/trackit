"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnalyticsAutoRefresh } from "@/lib/analytics-auto-refresh";

export type CreatorStatsData = {
  linked: boolean;
  accessRevoked?: boolean;
  revokedBrandName?: string | null;
  creatorName?: string | null;
  brandName?: string | null;
  discountCode?: string | null;
  commissionRate?: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned?: number;
  salesCount: number;
  sales: {
    id: string;
    orderAmount: number;
    commissionAmount: number;
    date: string;
    discountCode?: string | null;
    status?: string | null;
    brandName?: string | null;
  }[];
};

export function useCreatorStats(userId?: string) {
  const [stats, setStats] = useState<CreatorStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setStats(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator/stats?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Failed to load stats");
        setStats(null);
        return;
      }
      setStats(data as CreatorStatsData);
    } catch {
      setError("Failed to load stats");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useAnalyticsAutoRefresh(reload, { enabled: !!userId });

  return { stats, loading, error, reload };
}
