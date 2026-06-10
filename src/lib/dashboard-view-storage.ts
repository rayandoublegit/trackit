export const DASHBOARD_VIEWS = [
  "dashboard",
  "discovery",
  "creators",
  "campaigns",
  "affiliates",
  "outreach",
  "payouts",
  "analytics",
  "integrations",
  "automation",
  "settings",
  "feedback",
  "notifications",
  "help",
] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

function viewStorageKey(userId?: string | null) {
  return userId ? `trackit_dashboard_view_${userId}` : "trackit_dashboard_view";
}

export function isDashboardView(value: string): value is DashboardView {
  return (DASHBOARD_VIEWS as readonly string[]).includes(value);
}

export function loadDashboardView(userId?: string | null): DashboardView | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(viewStorageKey(userId));
    if (saved && isDashboardView(saved)) return saved;
    return null;
  } catch {
    return null;
  }
}

export function saveDashboardView(view: DashboardView, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(viewStorageKey(userId), view);
  } catch {
    /* storage unavailable */
  }
}

export function readInitialDashboardView(): DashboardView {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  if (params.get("connect") === "return") return "payouts";
  return loadDashboardView() ?? "dashboard";
}
