import {
  type DashboardView,
  isDashboardView,
  readInitialDashboardView,
} from "@/lib/dashboard-view-storage";

export const DASHBOARD_HISTORY_KEY = "trackit_dashboard";

export type CampaignsScreen =
  | { type: "list" }
  | { type: "new" }
  | { type: "detail"; id: string; tab?: string }
  | { type: "addCreators"; id: string }
  | { type: "addSale"; id: string }
  | { type: "edit"; id: string };

export type PayoutsScreen =
  | { type: "list" }
  | { type: "creator"; id: string };

export type ContentScreen = { type: "list" } | { type: "add" };

export type DashboardNavState = {
  view: DashboardView;
  campaign?: CampaignsScreen;
  payout?: PayoutsScreen;
  contentScreen?: ContentScreen;
  creator?: string;
  list?: string;
  helpGuide?: string;
  settingsTab?: string;
};

export function isDetailTab(value: string | undefined): value is "creators" | "analytics" | "content" | "links" {
  return value === "creators" || value === "analytics" || value === "content" || value === "links";
}

export function normalizeNavState(state: DashboardNavState): DashboardNavState {
  const next: DashboardNavState = { view: state.view };

  if (state.view === "campaigns" && state.campaign) {
    next.campaign = state.campaign;
  }
  if (state.view === "payouts" && state.payout) {
    next.payout = state.payout;
  }
  if (state.view === "content" && state.contentScreen) {
    next.contentScreen = state.contentScreen;
  }
  if ((state.view === "discovery" || state.view === "my-creators" || state.view === "creators") && state.creator) {
    next.creator = state.creator;
  }
  if (state.view === "creators" && state.list) {
    next.list = state.list;
  }
  if (state.view === "help" && state.helpGuide) {
    next.helpGuide = state.helpGuide;
  }
  if (state.view === "settings" && state.settingsTab) {
    next.settingsTab = state.settingsTab;
  }

  return next;
}

export function navStatesEqual(a: DashboardNavState, b: DashboardNavState): boolean {
  return JSON.stringify(normalizeNavState(a)) === JSON.stringify(normalizeNavState(b));
}

export function readNavStateFromHistoryEvent(state: unknown): DashboardNavState | null {
  if (!state || typeof state !== "object" || !(DASHBOARD_HISTORY_KEY in state)) return null;
  const nav = (state as Record<string, unknown>)[DASHBOARD_HISTORY_KEY];
  if (!nav || typeof nav !== "object" || !("view" in nav)) return null;
  const view = (nav as DashboardNavState).view;
  if (!isDashboardView(view)) return null;
  return normalizeNavState(nav as DashboardNavState);
}

export function parseDashboardNavState(
  search?: string,
  historyState?: unknown,
  fallbackView?: DashboardView,
): DashboardNavState {
  const fromHistory = readNavStateFromHistoryEvent(historyState);
  if (fromHistory) return fromHistory;

  const qs = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(qs);
  const viewParam = params.get("view");
  const view =
    viewParam && isDashboardView(viewParam)
      ? viewParam
      : fallbackView ?? readInitialDashboardView();

  const state: DashboardNavState = { view };

  const campaign = params.get("campaign");
  if (campaign === "new") {
    state.campaign = { type: "new" };
  } else if (campaign === "addCreators") {
    const campaignId = params.get("campaignId");
    if (campaignId) state.campaign = { type: "addCreators", id: campaignId };
  } else if (campaign === "addSale") {
    const campaignId = params.get("campaignId");
    if (campaignId) state.campaign = { type: "addSale", id: campaignId };
  } else if (campaign === "edit") {
    const campaignId = params.get("campaignId");
    if (campaignId) state.campaign = { type: "edit", id: campaignId };
  } else if (campaign) {
    state.campaign = { type: "detail", id: campaign, tab: params.get("campaignTab") ?? undefined };
  }

  const creator = params.get("creator");
  if (creator) state.creator = creator;

  const list = params.get("list");
  if (list) state.list = list;

  const helpGuide = params.get("helpGuide");
  if (helpGuide) state.helpGuide = helpGuide;

  const settingsTab = params.get("settingsTab");
  if (settingsTab) state.settingsTab = settingsTab;

  const payoutCreator = params.get("payoutCreator");
  if (payoutCreator) state.payout = { type: "creator", id: payoutCreator };

  const contentParam = params.get("content");
  if (contentParam === "add") state.contentScreen = { type: "add" };

  return normalizeNavState(state);
}

export function buildDashboardUrl(state: DashboardNavState): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL("/dashboard", origin);

  if (state.view === "dashboard") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", state.view);
  }

  url.searchParams.delete("campaign");
  url.searchParams.delete("campaignId");
  url.searchParams.delete("campaignTab");
  url.searchParams.delete("creator");
  url.searchParams.delete("list");
  url.searchParams.delete("helpGuide");
  url.searchParams.delete("settingsTab");
  url.searchParams.delete("payoutCreator");
  url.searchParams.delete("content");

  if (state.view === "campaigns" && state.campaign) {
    if (state.campaign.type === "new") {
      url.searchParams.set("campaign", "new");
    } else if (state.campaign.type === "addCreators") {
      url.searchParams.set("campaign", "addCreators");
      url.searchParams.set("campaignId", state.campaign.id);
    } else if (state.campaign.type === "addSale") {
      url.searchParams.set("campaign", "addSale");
      url.searchParams.set("campaignId", state.campaign.id);
    } else if (state.campaign.type === "edit") {
      url.searchParams.set("campaign", "edit");
      url.searchParams.set("campaignId", state.campaign.id);
    } else if (state.campaign.type === "detail") {
      url.searchParams.set("campaign", state.campaign.id);
      if (state.campaign.tab) url.searchParams.set("campaignTab", state.campaign.tab);
    }
  }

  if (state.view === "payouts" && state.payout?.type === "creator") {
    url.searchParams.set("payoutCreator", state.payout.id);
  }

  if (state.view === "content" && state.contentScreen?.type === "add") {
    url.searchParams.set("content", "add");
  }

  if (state.creator) url.searchParams.set("creator", state.creator);
  if (state.list) url.searchParams.set("list", state.list);
  if (state.helpGuide) url.searchParams.set("helpGuide", state.helpGuide);
  if (state.settingsTab) url.searchParams.set("settingsTab", state.settingsTab);

  const search = url.searchParams.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

export function buildHistoryPayload(state: DashboardNavState) {
  return { [DASHBOARD_HISTORY_KEY]: normalizeNavState(state) };
}

export function navigateDashboardHistory(state: DashboardNavState, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const normalized = normalizeNavState(state);
  const url = buildDashboardUrl(normalized);
  const payload = buildHistoryPayload(normalized);
  const current = `${window.location.pathname}${window.location.search}`;

  if (options?.replace || current === url) {
    window.history.replaceState(payload, "", url);
    return;
  }

  window.history.pushState(payload, "", url);
}
