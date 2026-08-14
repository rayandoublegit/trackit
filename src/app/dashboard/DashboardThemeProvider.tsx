"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyDashboardTheme,
  getDashboardTheme,
  setDashboardTheme,
  type DashboardTheme,
} from "@/lib/dashboard-theme";

type DashboardThemeContextValue = {
  theme: DashboardTheme;
  setTheme: (theme: DashboardTheme) => void;
  toggleTheme: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>("light");

  useEffect(() => {
    const initial = getDashboardTheme();
    setThemeState(initial);
    applyDashboardTheme(initial);
  }, []);

  const setTheme = useCallback((next: DashboardTheme) => {
    setThemeState(next);
    setDashboardTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    return {
      theme: "light" as DashboardTheme,
      setTheme: (_: DashboardTheme) => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
