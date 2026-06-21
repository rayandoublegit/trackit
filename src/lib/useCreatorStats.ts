"use client";

import { useCallback, useEffect, useState } from "react";
import { PAYOUTS_UPDATED_EVENT, SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";

export type CreatorStatsData = {
  linked: boolean;
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

  useEffect(() => {
    if (!userId) return;
    const onRefresh = () => {
      void reload();
    };
    window.addEventListener(SALES_UPDATED_EVENT, onRefresh);
    window.addEventListener(PAYOUTS_UPDATED_EVENT, onRefresh);
    const interval = window.setInterval(onRefresh, 30000);
    return () => {
      window.removeEventListener(SALES_UPDATED_EVENT, onRefresh);
      window.removeEventListener(PAYOUTS_UPDATED_EVENT, onRefresh);
      window.clearInterval(interval);
    };
  }, [userId, reload]);

  return { stats, loading, error, reload };
}
