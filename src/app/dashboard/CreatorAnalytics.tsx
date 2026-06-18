"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const BLUE = "#0047FF";

type CreatorStats = {
  linked: boolean;
  brandName?: string | null;
  discountCode?: string | null;
  commissionRate?: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned?: number;
  salesCount: number;
  sales: { orderAmount: number; commissionAmount: number; date: string; discountCode: string | null }[];
};

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160, background: accent ? BLUE : "#FFFFFF", border: accent ? "none" : "1px solid #EFEFEF", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.8)" : "#9A9A9A", marginBottom: 8, letterSpacing: "-0.01em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/creator/stats?userId=${userId}`);
        const data = await res.json();
        if (!cancelled && data?.ok) setStats(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);
