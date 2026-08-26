export const DASHBOARD_VIEWS = [
  "dashboard",
  "discovery",
  "findit-inbox",
  "my-creators",
  "creators",
  "campaigns",
  "brand-content",
  "rpm",
  "hooks",
  "infos",
  "infos-howto",
  "infos-pricing",
  "community",
  "links",
  "affiliates",
  "outreach",
  "payouts",
  "balance",
  "transactions",
  "invitations",
  "scripts",
  "content",
  "analytics",
  "integrations",
  "notes",
  "workspace",
  "automation",
  "settings",
  "billing",
  "feedback",
  "notifications",
  "help",
  "planner",
  "planner-notes",
  "whiteboard",
  "ai",
  "meetings",
  "tasks",
] as const;

/** Primary icon-rail spaces in the ClickUp-style workspace shell. */
export const WORKSPACE_SPACES = [
  "home",
  "findit",
  "trackit",
  "payit",
  "planner",
  "notes",
  "whiteboard",
  "integrations",
  "analytics",
  "ai",
  "scripts",
  "content",
  "hooks",
  "infos",
  "community",
] as const;

export type WorkspaceSpace = (typeof WORKSPACE_SPACES)[number];

export function spaceForView(view: DashboardView): WorkspaceSpace {
  switch (view) {
    case "dashboard":
    case "notifications":
    case "outreach":
    case "tasks":
    case "ai":
    case "workspace":
      return "home";
    case "discovery":
    case "findit-inbox":
    case "creators":
    case "my-creators":
      return "findit";
    case "campaigns":
    case "brand-content":
    case "rpm":
    case "links":
    case "affiliates":
    case "invitations":
    case "automation":
      return "trackit";
    case "payouts":
    case "balance":
    case "transactions":
      return "payit";
    case "planner":
    case "meetings":
    case "planner-notes":
      return "planner";
    case "notes":
      return "notes";
    case "whiteboard":
      return "whiteboard";
    case "integrations":
      return "integrations";
    case "analytics":
      return "analytics";
    case "scripts":
      return "scripts";
    case "content":
      return "content";
    case "infos":
    case "infos-howto":
    case "infos-pricing":
      return "infos";
    case "hooks":
      return "hooks";
    case "community":
      return "community";
    case "settings":
    case "billing":
    case "help":
    case "feedback":
      return "home";
    default:
      return "home";
  }
}

export function defaultViewForSpace(space: WorkspaceSpace): DashboardView {
  switch (space) {
    case "home":
      return "notifications";
    case "findit":
      return "discovery";
    case "trackit":
      return "campaigns";
    case "payit":
      return "payouts";
    case "planner":
      return "planner";
    case "notes":
      return "notes";
    case "whiteboard":
      return "whiteboard";
    case "integrations":
      return "integrations";
    case "analytics":
      return "analytics";
    case "ai":
      return "ai";
    case "scripts":
      return "scripts";
    case "content":
      return "content";
    case "infos":
      return "infos";
    case "hooks":
      return "hooks";
    case "community":
      return "community";
    default:
      return "discovery";
  }
}

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
    if (saved === "rules") return "infos";
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
  if (value === "rules") return "infos";
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
  if (typeof window === "undefined") return "discovery";
  const params = new URLSearchParams(window.location.search);
  if (params.get("connect") === "return") return "payouts";
  const fromUrl = readViewFromUrl(window.location.search);
  if (fromUrl && fromUrl !== "dashboard") return fromUrl;
  const saved = loadDashboardView(userId) ?? loadDashboardView();
  if (saved && saved !== "dashboard") return saved;
  return "discovery";
}
