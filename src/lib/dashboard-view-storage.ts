export const DASHBOARD_VIEWS = [
  "dashboard",
  "discovery",
  "creators",
  "campaigns",
  "affiliates",
  "outreach",
  "payouts",
  "invitations",
  "scripts",
  "analytics",
  "integrations",
  "notes",
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
    if (userId) {
      localStorage.setItem(viewStorageKey(), view);
    }
  } catch {
    /* storage unavailable */
  }
}

export function readViewFromUrl(search?: string): DashboardView | null {
  const qs = search ?? (typeof window !== "undefined" ? window.location.search : "");
  if (!qs) return null;
  const value = new URLSearchParams(qs).get("view");
  if (value && isDashboardView(value)) return value;
  return null;
}

export function writeViewToUrl(view: DashboardView) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (view === "dashboard") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", view);
  }
  const search = url.searchParams.toString();
  const next = search ? `${url.pathname}?${search}` : url.pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState({}, "", next);
  }
}

export function readInitialDashboardView(userId?: string | null): DashboardView {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  if (params.get("connect") === "return") return "payouts";
  const fromUrl = readViewFromUrl(window.location.search);
  if (fromUrl) return fromUrl;
  return loadDashboardView(userId) ?? loadDashboardView() ?? "dashboard";
}
