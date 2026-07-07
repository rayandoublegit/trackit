"use client";

import { useEffect } from "react";
import {
  CAMPAIGNS_UPDATED_EVENT,
  CONTENT_UPDATED_EVENT,
  OUTREACH_HISTORY_UPDATED_EVENT,
  PAYOUTS_UPDATED_EVENT,
  SALES_UPDATED_EVENT,
} from "@/lib/outreach-history-events";

const ANALYTICS_REFRESH_EVENTS = [
  SALES_UPDATED_EVENT,
  PAYOUTS_UPDATED_EVENT,
  CAMPAIGNS_UPDATED_EVENT,
  OUTREACH_HISTORY_UPDATED_EVENT,
  CONTENT_UPDATED_EVENT,
] as const;

export function useAnalyticsAutoRefresh(
  onRefresh: () => void | Promise<void>,
  options?: { enabled?: boolean; pollIntervalMs?: number },
) {
  const enabled = options?.enabled !== false;
  const pollIntervalMs = options?.pollIntervalMs ?? 30_000;

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      void onRefresh();
    };

    for (const event of ANALYTICS_REFRESH_EVENTS) {
      window.addEventListener(event, refresh);
    }

    const interval = window.setInterval(refresh, pollIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      for (const event of ANALYTICS_REFRESH_EVENTS) {
        window.removeEventListener(event, refresh);
      }
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, onRefresh, pollIntervalMs]);
}
