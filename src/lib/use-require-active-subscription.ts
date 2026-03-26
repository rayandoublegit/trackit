"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const EXEMPT_PREFIXES = ["/pricing", "/auth", "/analyze", "/verdict"];

/**
 * Redirects logged-in users without an active subscription to /pricing.
 * Skips /pricing and /auth so users can subscribe or sign in.
 */
export function useRequireActiveSubscription() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;

    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("useRequireActiveSubscription:", error);
        return;
      }

      if (!profile) return;

      const status =
        (profile.subscription_status as string | undefined)?.toLowerCase() ??
        "inactive";
      if (status !== "active") {
        window.location.href = "/pricing";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);
}
