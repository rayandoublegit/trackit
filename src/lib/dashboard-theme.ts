export type DashboardTheme = "light" | "dark";

const THEME_KEY = "trackit_dashboard_theme";

export function getDashboardTheme(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return "light";
}

export function setDashboardTheme(theme: DashboardTheme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute("data-dashboard-theme", theme);
  document.body.setAttribute("data-dashboard-theme", theme);
}

export function applyDashboardTheme(theme: DashboardTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-dashboard-theme", theme);
  document.body.setAttribute("data-dashboard-theme", theme);
}
