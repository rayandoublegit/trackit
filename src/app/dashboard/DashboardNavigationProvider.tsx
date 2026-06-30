"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type DashboardNavState,
  navigateDashboardHistory,
  navStatesEqual,
  normalizeNavState,
  parseDashboardNavState,
  readNavStateFromHistoryEvent,
} from "@/lib/dashboard-navigation";
import {
  loadDashboardView,
  readInitialDashboardView,
  readViewFromUrl,
  saveDashboardView,
  type DashboardView,
} from "@/lib/dashboard-view-storage";

export type DashboardNavigationContextValue = {
  navState: DashboardNavState;
  ready: boolean;
  navigate: (state: DashboardNavState, options?: { replace?: boolean }) => void;
  goBack: () => void;
  setView: (view: DashboardView) => void;
};

const DashboardNavigationContext = createContext<DashboardNavigationContextValue | null>(null);

export function useDashboardNavigationController(userId?: string | null): DashboardNavigationContextValue {
  const [navState, setNavState] = useState<DashboardNavState>({ view: "discovery" });
  const [ready, setReady] = useState(false);
  const navStateRef = useRef(navState);
  navStateRef.current = navState;

  const navigate = useCallback(
    (next: DashboardNavState, options?: { replace?: boolean }) => {
      const normalized = normalizeNavState(next);
      const campaignsScreenChanged =
        normalized.view === "campaigns" &&
        JSON.stringify(navStateRef.current.campaign ?? null) !== JSON.stringify(normalized.campaign ?? null);
      if (!options?.replace && !campaignsScreenChanged && navStatesEqual(navStateRef.current, normalized)) return;
      navStateRef.current = normalized;
      setNavState(normalized);
      saveDashboardView(normalized.view, userId ?? undefined);
      navigateDashboardHistory(normalized, options);
    },
    [userId],
  );

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  const setView = useCallback(
    (view: DashboardView) => {
      navigate({ view });
    },
    [navigate],
  );

  useEffect(() => {
    const initial = normalizeNavState(
      parseDashboardNavState(window.location.search, window.history.state, readInitialDashboardView(userId ?? undefined)),
    );
    navStateRef.current = initial;
    setNavState(initial);
    navigateDashboardHistory(initial, { replace: true });
    setReady(true);
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    if (readViewFromUrl()) return;
    const saved = loadDashboardView(userId);
    if (saved && saved !== "dashboard" && saved !== navStateRef.current.view) {
      navigate({ view: saved }, { replace: true });
    }
  }, [ready, userId, navigate]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const fromEvent = readNavStateFromHistoryEvent(event.state);
      const next = normalizeNavState(fromEvent ?? parseDashboardNavState(window.location.search));
      navStateRef.current = next;
      setNavState(next);
      saveDashboardView(next.view, userId ?? undefined);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [userId]);

  return { navState, ready, navigate, goBack, setView };
}

export function DashboardNavigationProvider({
  value,
  children,
}: {
  value: DashboardNavigationContextValue;
  children: ReactNode;
}) {
  return <DashboardNavigationContext.Provider value={value}>{children}</DashboardNavigationContext.Provider>;
}

export function useDashboardNavigation() {
  const ctx = useContext(DashboardNavigationContext);
  if (!ctx) {
    throw new Error("useDashboardNavigation must be used within DashboardNavigationProvider");
  }
  return ctx;
}

export function useDashboardNavigationOptional() {
  return useContext(DashboardNavigationContext);
}
