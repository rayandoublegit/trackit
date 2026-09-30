"use client";

import { useCallback, useEffect, useState } from "react";
import { SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";

const SETUP_STARTED_KEY = "payit_setup_started";

type TrackedSale = { id: string };
type CompletedPayout = { id: string };
type CreatorRow = { balance?: number | string | null };

function walletBalanceStorageKey(userId: string) {
  return `trackit_wallet_balance_${userId}`;
}

function loadWalletBalance(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(walletBalanceStorageKey(userId));
    if (!raw) return 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function fetchTrackedSales(userId: string): Promise<TrackedSale[]> {
  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return [];
  const { data, error } = await supabase.from("sales").select("id").eq("user_id", userId).limit(1);
  if (error) return [];
  return (data || []) as TrackedSale[];
}

export function hasPayItActivity(args: {
  sales: TrackedSale[];
  payouts: CompletedPayout[];
  creators: CreatorRow[];
  walletBalance?: number;
}): boolean {
  if ((args.walletBalance ?? 0) > 0) return true;
  if (args.sales.length > 0) return true;
  if (args.payouts.length > 0) return true;
  if (args.creators.some((c) => (Number(c.balance) || 0) > 0)) return true;
  return false;
}

export function markPayItSetupStarted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SETUP_STARTED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function hasPayItSetupStarted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SETUP_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function usePayItActivity(userId?: string) {
  const [loading, setLoading] = useState(true);
  const [hasActivity, setHasActivity] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setHasActivity(false);
      setLoading(false);
      return;
    }
    try {
      const { cachedJsonFetch, peekDashboardCache } = await import("@/lib/dashboard-fetch-cache");
      const cachedPayouts = peekDashboardCache<{ payouts?: CompletedPayout[] }>("GET:/api/payouts/history");
      const cachedCreators = peekDashboardCache<CreatorRow[]>(`GET:/api/creators-list?userId=${userId}`);
      if (cachedPayouts || cachedCreators) {
        const payouts = cachedPayouts?.payouts ?? [];
        const creators = Array.isArray(cachedCreators) ? cachedCreators : [];
        const walletBalance = loadWalletBalance(userId);
        if (hasPayItActivity({ sales: [], payouts, creators, walletBalance })) {
          setHasActivity(true);
          setLoading(false);
        }
      }

      const [sales, payoutRes, creatorsRes] = await Promise.all([
        fetchTrackedSales(userId),
        cachedJsonFetch<{ payouts?: CompletedPayout[] }>(
          "/api/payouts/history",
          { credentials: "include" },
          { preferCache: true, ttlMs: 20_000 },
        ),
        cachedJsonFetch<CreatorRow[]>(
          `/api/creators-list?userId=${userId}`,
          { credentials: "include" },
          { preferCache: true, ttlMs: 30_000 },
        ),
      ]);
      const payouts = payoutRes.payouts ?? [];
      const creators = Array.isArray(creatorsRes) ? creatorsRes : [];
      const walletBalance = loadWalletBalance(userId);
      setHasActivity(hasPayItActivity({ sales, payouts, creators, walletBalance }));
    } catch {
      setHasActivity(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
  }, [refresh]);

  const showWelcome = !loading && !hasActivity;

  return { loading, hasActivity, showWelcome, refresh };
}

export function PayItWelcomeLoading({ isMobile }: { isMobile?: boolean }) {
  const pad = isMobile ? "16px 16px 48px" : "48px 48px 64px";
  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", padding: pad }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", opacity: 0.5 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 56,
          }}
        >
          <div style={{ height: 420, borderRadius: 16, background: "var(--ws-surface)" }} />
          <div style={{ height: 440, borderRadius: 28, background: "var(--ws-surface)" }} />
        </div>
      </div>
    </div>
  );
}
