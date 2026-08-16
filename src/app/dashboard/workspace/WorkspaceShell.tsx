"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCampaigns, invalidateCampaignsCache } from "@/lib/db";
import { CAMPAIGNS_UPDATED_EVENT } from "@/lib/outreach-history-events";
import { prefetchDashboardData } from "@/lib/dashboard-fetch-cache";
import {
  defaultViewForSpace,
  spaceForView,
  type DashboardView,
  type WorkspaceSpace,
} from "@/lib/dashboard-view-storage";
import { beginWorkspaceSwitch } from "@/lib/workspace-switch";
import { applyDashboardTabTitle, type BrandWorkspace } from "@/lib/workspaces";
import {
  createWbBoard,
  deleteWbBoard,
  getActiveWbBoardId,
  loadWbBoards,
  setActiveWbBoardId,
  WB_ACTIVE_EVENT,
  WB_BOARDS_EVENT,
  type WbBoardMeta,
} from "@/lib/whiteboard-storage";
import { getWorkspaceEditId, setWorkspaceEditId } from "@/lib/workspace-edit";
import {
  deleteMinoChat,
  getActiveMinoChatId,
  loadMinoChats,
  MINO_ACTIVE_EVENT,
  MINO_CHATS_EVENT,
  renameMinoChat,
  setActiveMinoChatId,
  type MinoChat,
} from "@/lib/mino-chats-storage";
import { getLastCampaignId, rememberLastCampaignId } from "@/lib/last-campaign-storage";
import {
  buildDashboardSearchCatalog,
  highlightSearchMatch,
  searchDashboardCatalog,
  type DashboardSearchHit,
} from "@/lib/dashboard-search";
import { useDashboardTheme } from "../DashboardThemeProvider";
import { useDashboardNavigationOptional } from "../DashboardNavigationProvider";
import { WsIcon } from "./WorkspaceIcons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import "./workspace.css";

type ProfileLite = {
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  business_name?: string | null;
};

type WorkspaceShellProps = {
  lang: "en" | "fr";
  view: DashboardView;
  isCreator?: boolean;
  isMobile?: boolean;
  userId?: string;
  actorId?: string;
  profile?: ProfileLite | null;
  actorProfile?: ProfileLite | null;
  workspaceDelegated?: boolean;
  notificationUnread?: number;
  avatarBroken?: boolean;
  onAvatarError?: () => void;
  onNavigate: (view: DashboardView) => void;
  onSignOut?: () => void;
  children: ReactNode;
};

type RailItem = {
  space: WorkspaceSpace;
  label: string;
  icon: Parameters<typeof WsIcon>[0]["name"];
};

type SideLink = {
  id: string;
  label: string;
  view: DashboardView;
  icon?: Parameters<typeof WsIcon>[0]["name"];
  badge?: number;
};

export function WorkspaceShell({
  lang,
  view,
  isCreator,
  isMobile,
  userId,
  actorId,
  profile,
  actorProfile,
  workspaceDelegated,
  notificationUnread = 0,
  avatarBroken,
  onAvatarError,
  onNavigate,
  onSignOut,
  children,
}: WorkspaceShellProps) {
  const { theme, setTheme } = useDashboardTheme();
  const dashNav = useDashboardNavigationOptional();
  const activeSpace = spaceForView(view);
  const activeCampaignId =
    dashNav?.navState.view === "campaigns" && dashNav.navState.campaign?.type === "detail"
      ? dashNav.navState.campaign.id
      : null;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [stripeConnectActive, setStripeConnectActive] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [brandSpaces, setBrandSpaces] = useState<BrandWorkspace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spacesBusy, setSpacesBusy] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [createSpaceError, setCreateSpaceError] = useState("");
  const [spaceHover, setSpaceHover] = useState<{
    space: BrandWorkspace;
    top: number;
    left: number;
  } | null>(null);
  const spaceHoverTimer = useRef<number | null>(null);
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<BrandWorkspace | null>(null);
  const [deleteSpaceBusy, setDeleteSpaceBusy] = useState(false);
  const [deleteSpaceError, setDeleteSpaceError] = useState("");
  const [wbBoards, setWbBoards] = useState<WbBoardMeta[]>([]);
  const [activeWbId, setActiveWbId] = useState<string | null>(null);
  const [createWbOpen, setCreateWbOpen] = useState(false);
  const [newWbName, setNewWbName] = useState("");
  const [minoChats, setMinoChats] = useState<MinoChat[]>([]);
  const [activeMinoId, setActiveMinoId] = useState<string | null>(null);
  const [aiChatsOpen, setAiChatsOpen] = useState(false);
  const [campaignsNavOpen, setCampaignsNavOpen] = useState(true);
  const [minoMenuId, setMinoMenuId] = useState<string | null>(null);
  const [minoRenamingId, setMinoRenamingId] = useState<string | null>(null);
  const [minoRenameDraft, setMinoRenameDraft] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const minoMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
    else setSidebarOpen(true);
  }, [isMobile]);

  useEffect(() => {
    if (!userId || isCreator) return;
    let cancelled = false;
    const load = () => {
      invalidateCampaignsCache(userId);
      void getCampaigns(userId).then((rows) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list = (rows || [])
          .map((r: { id?: string; name?: string; status?: string }) => ({
            id: String(r.id || ""),
            name: String(r.name || "Campaign"),
            status: String(r.status || ""),
          }))
          .filter((r) => {
            if (!r.id || seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          })
          .slice(0, 24);
        setCampaigns(list);
      });
    };
    load();
    window.addEventListener(CAMPAIGNS_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CAMPAIGNS_UPDATED_EVENT, load);
    };
  }, [userId, isCreator]);

  useEffect(() => {
    if (!userId || isCreator) {
      setStripeConnectActive(false);
      return;
    }
    let cancelled = false;
    fetch("/api/stripe/connect/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStripeConnectActive(d?.status === "active" || d?.connected === true);
      })
      .catch(() => {
        if (!cancelled) setStripeConnectActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isCreator]);

  useEffect(() => {
    if (!userId || !activeCampaignId) return;
    rememberLastCampaignId(userId, activeCampaignId);
  }, [userId, activeCampaignId]);

  useEffect(() => {
    if (activeCampaignId) setCampaignsNavOpen(true);
  }, [activeCampaignId]);

  const openRecentCampaignAnalytics = () => {
    const openable = campaigns.filter((c) => c.status !== "Draft");
    const remembered = getLastCampaignId(userId);
    const targetId =
      (remembered && openable.some((c) => c.id === remembered) ? remembered : null) ||
      (activeCampaignId && openable.some((c) => c.id === activeCampaignId) ? activeCampaignId : null) ||
      openable[0]?.id ||
      null;
    if (targetId && dashNav) {
      rememberLastCampaignId(userId, targetId);
      dashNav.navigate({
        view: "campaigns",
        campaign: { type: "detail", id: targetId, tab: "analytics" },
      });
      return;
    }
    onNavigate("campaigns");
  };

  useEffect(() => {
    const refresh = () => {
      const boards = loadWbBoards(userId);
      setWbBoards(boards);
      setActiveWbId(getActiveWbBoardId(userId));
    };
    refresh();
    window.addEventListener(WB_BOARDS_EVENT, refresh);
    window.addEventListener(WB_ACTIVE_EVENT, refresh);
    return () => {
      window.removeEventListener(WB_BOARDS_EVENT, refresh);
      window.removeEventListener(WB_ACTIVE_EVENT, refresh);
    };
  }, [userId]);

  useEffect(() => {
    const refresh = () => {
      setMinoChats(loadMinoChats(userId));
      setActiveMinoId(getActiveMinoChatId(userId));
    };
    refresh();
    window.addEventListener(MINO_CHATS_EVENT, refresh);
    window.addEventListener(MINO_ACTIVE_EVENT, refresh);
    return () => {
      window.removeEventListener(MINO_CHATS_EVENT, refresh);
      window.removeEventListener(MINO_ACTIVE_EVENT, refresh);
    };
  }, [userId]);

  useEffect(() => {
    if (!minoMenuId) return;
    const onDoc = (e: MouseEvent) => {
      if (minoMenuRef.current && !minoMenuRef.current.contains(e.target as Node)) {
        setMinoMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [minoMenuId]);

  useEffect(() => {
    if (!userId || isCreator) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          workspaces?: BrandWorkspace[];
          activeWorkspaceId?: string;
        };
        if (cancelled || !res.ok || !data.ok) return;
        setBrandSpaces(data.workspaces || []);
        setActiveSpaceId(data.activeWorkspaceId || userId);
      } catch {
        /* ignore until migration */
      }
    };
    void refresh();
    const onUpdated = () => void refresh();
    window.addEventListener("trackit:workspaces-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:workspaces-updated", onUpdated);
    };
  }, [userId, isCreator]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setProfileOpen(false);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearch("");
        setProfileOpen(false);
        setCreateWbOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(t)) setProfileOpen(false);
      if (searchRef.current && !searchRef.current.contains(t)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const railItems: RailItem[] = useMemo(() => {
    if (isCreator) {
      return [
        { space: "home", label: "Home", icon: "home" },
        { space: "scripts", label: "Scripts", icon: "list" },
        { space: "content", label: lang === "fr" ? "Contenu" : "Content", icon: "camera" },
        { space: "analytics", label: lang === "fr" ? "Stats" : "Stats", icon: "analytics" },
        { space: "payit", label: "Pay it", icon: "payit" },
        { space: "whiteboard", label: "Board", icon: "whiteboard" },
      ];
    }
    return [
      { space: "home", label: "Home", icon: "home" },
      { space: "findit", label: "Discover", icon: "findit" },
      { space: "trackit", label: "Track", icon: "trackit" },
      { space: "payit", label: "Pay it", icon: "payit" },
      { space: "planner", label: "Planner", icon: "planner" },
      { space: "whiteboard", label: lang === "fr" ? "Board" : "Board", icon: "whiteboard" },
      { space: "integrations", label: lang === "fr" ? "Integrations" : "Integrations", icon: "integrations" },
      { space: "ai", label: "Mino", icon: "ai" },
    ];
  }, [isCreator, lang]);

  const sideTitle = useMemo(() => {
    const map: Record<WorkspaceSpace, string> = {
      home: "Home",
      findit: "Discover",
      trackit: "Track It",
      payit: "Pay it",
      planner: lang === "fr" ? "Planner" : "Planner",
      notes: "Notes",
      whiteboard: "Whiteboard",
      integrations: lang === "fr" ? "Intégrations" : "Integrations",
      analytics: "Analytics",
      ai: "Mino",
      scripts: "Scripts",
      content: lang === "fr" ? "Contenu" : "Content",
    };
    return map[activeSpace];
  }, [activeSpace, lang]);

  const sideLinks: SideLink[] = useMemo(() => {
    if (isCreator) {
      if (activeSpace === "payit") {
        return [
          { id: "payouts", label: "Pay it", view: "payouts", icon: "payit" },
          { id: "balance", label: lang === "fr" ? "Solde" : "Balance", view: "balance", icon: "billing" },
        ];
      }
      if (activeSpace === "scripts") {
        return [{ id: "scripts", label: "Scripts", view: "scripts", icon: "list" }];
      }
      if (activeSpace === "content") {
        return [{ id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "content", icon: "camera" }];
      }
      return [
        { id: "home", label: "Home", view: "dashboard", icon: "home" },
        { id: "scripts", label: "Scripts", view: "scripts", icon: "list" },
        { id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "content", icon: "camera" },
      ];
    }

    switch (activeSpace) {
      case "home":
        return [
          {
            id: "inbox",
            label: "Inbox",
            view: "notifications",
            icon: "inbox",
          },
          { id: "outreach", label: "Outreach", view: "outreach", icon: "invite" },
          { id: "tasks", label: "Tasks", view: "tasks", icon: "tasks" },
        ];
      case "findit":
        return [
          { id: "discovery", label: "Discovery", view: "discovery", icon: "findit" },
          { id: "findit-inbox", label: "Inbox", view: "findit-inbox", icon: "inbox" },
          { id: "creators", label: lang === "fr" ? "Gérer" : "Manage", view: "creators", icon: "users" },
        ];
      case "trackit":
        return [
          { id: "campaigns", label: lang === "fr" ? "Toutes les campagnes" : "All campaigns", view: "campaigns", icon: "grid" },
          { id: "invitations", label: lang === "fr" ? "Invitations" : "Invitations", view: "invitations", icon: "invite" },
        ];
      case "payit":
        return [
          { id: "payouts", label: "Pay it", view: "payouts", icon: "payit" },
          ...(stripeConnectActive
            ? [{ id: "balance", label: lang === "fr" ? "Solde" : "Balance", view: "balance" as const, icon: "billing" as const }]
            : []),
          { id: "transactions", label: lang === "fr" ? "Paiements" : "Payments", view: "transactions", icon: "list" },
        ];
      case "planner":
        return [
          {
            id: "planner",
            label: lang === "fr" ? "Planner" : "Planner",
            view: "planner",
            icon: "planner",
          },
          {
            id: "planner-notes",
            label: "Notes",
            view: "planner-notes",
            icon: "notes",
          },
        ];
      case "notes":
        return [{ id: "notes", label: lang === "fr" ? "Bloc-notes" : "Notepad", view: "notes", icon: "notes" }];
      case "whiteboard":
        return [];
      case "integrations":
        return [
          {
            id: "integrations",
            label: lang === "fr" ? "Intégrations" : "Integrations",
            view: "integrations",
            icon: "integrations",
          },
        ];
      case "analytics":
        return [{ id: "analytics", label: "Analytics", view: "analytics", icon: "analytics" }];
      case "ai":
        return [{ id: "ai", label: "Mino", view: "ai", icon: "ai" }];
      case "scripts":
        return [{ id: "scripts", label: "Scripts", view: "scripts", icon: "list" }];
      case "content":
        return [{ id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "brand-content", icon: "camera" }];
      default:
        return [
          { id: "inbox", label: "Inbox", view: "notifications", icon: "inbox" },
          { id: "outreach", label: "Outreach", view: "outreach", icon: "invite" },
          { id: "tasks", label: "Tasks", view: "tasks", icon: "tasks" },
        ];
    }
  }, [activeSpace, campaigns, isCreator, lang, notificationUnread, stripeConnectActive]);

  const switchBrandSpace = (space: BrandWorkspace) => {
    if (!userId || space.id === (activeSpaceId || userId) || spacesBusy) return;
    setSpacesBusy(true);
    setSpaceHover(null);
    beginWorkspaceSwitch({
      workspaceId: space.id,
      ownerId: userId,
      actorId,
      name: space.name,
      avatarUrl: space.avatar_url,
    });
  };

  const openSpaceHover = (space: BrandWorkspace, el: HTMLElement) => {
    if (isMobile) return;
    if (spaceHoverTimer.current) window.clearTimeout(spaceHoverTimer.current);
    const rect = el.getBoundingClientRect();
    setSpaceHover({
      space,
      top: Math.max(12, Math.min(rect.top - 8, window.innerHeight - 230)),
      left: rect.right + 10,
    });
  };

  const scheduleSpaceHoverClose = () => {
    if (spaceHoverTimer.current) window.clearTimeout(spaceHoverTimer.current);
    spaceHoverTimer.current = window.setTimeout(() => setSpaceHover(null), 160);
  };

  const cancelSpaceHoverClose = () => {
    if (spaceHoverTimer.current) window.clearTimeout(spaceHoverTimer.current);
  };

  const deleteBrandSpace = async () => {
    const ws = deleteSpaceTarget;
    if (!ws || !userId || deleteSpaceBusy) return;
    setDeleteSpaceBusy(true);
    setDeleteSpaceError("");
    try {
      const res = await fetch(`/api/workspaces/${ws.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDeleteSpaceError(
          data.error || (lang === "fr" ? "Suppression impossible" : "Could not delete"),
        );
        setDeleteSpaceBusy(false);
        return;
      }
      if ((activeSpaceId || userId) === ws.id) {
        // Deleted the active space: land on the default workspace.
        const fallback = brandSpaces.find((s) => s.id === userId);
        beginWorkspaceSwitch({
          workspaceId: userId,
          ownerId: userId,
          actorId,
          name: fallback?.name || workspaceName,
          avatarUrl: fallback?.avatar_url ?? null,
        });
        return;
      }
      setBrandSpaces((prev) => prev.filter((s) => s.id !== ws.id));
      setDeleteSpaceTarget(null);
      setDeleteSpaceBusy(false);
      window.dispatchEvent(new Event("trackit:workspaces-updated"));
    } catch {
      setDeleteSpaceError(lang === "fr" ? "Erreur réseau" : "Network error");
      setDeleteSpaceBusy(false);
    }
  };

  const createBrandSpace = async () => {
    if (!userId || workspaceDelegated || spacesBusy) return;
    const name = newSpaceName.trim();
    if (!name) {
      setCreateSpaceError(lang === "fr" ? "Nom requis" : "Name required");
      return;
    }
    setSpacesBusy(true);
    setCreateSpaceError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        workspace?: BrandWorkspace;
      };
      if (!res.ok || !data.ok || !data.workspace) {
        setCreateSpaceError(data.error || (lang === "fr" ? "Création impossible" : "Could not create"));
        setSpacesBusy(false);
        return;
      }
      beginWorkspaceSwitch({
        workspaceId: data.workspace.id,
        ownerId: userId,
        actorId,
        name: data.workspace.name || name,
        avatarUrl: data.workspace.avatar_url,
        // The create endpoint already set this workspace active server-side.
        skipActivate: true,
      });
    } catch {
      setCreateSpaceError(lang === "fr" ? "Erreur réseau" : "Network error");
      setSpacesBusy(false);
    }
  };

  const workspaceName =
    profile?.business_name ||
    profile?.full_name ||
    (profile?.username ? `@${profile.username}` : "Trackit");

  const tabWorkspaceName = (() => {
    if (isCreator) return "Dashboard";
    const active = brandSpaces.find((space) => space.id === (activeSpaceId || userId));
    const named = (active?.name || "").trim();
    if (named) return named;
    if (brandSpaces.length > 0) return (brandSpaces[0]?.name || "").trim() || "Dashboard";
    return "";
  })();

  useEffect(() => {
    if (isCreator) {
      applyDashboardTabTitle("Dashboard");
      return;
    }
    if (tabWorkspaceName) applyDashboardTabTitle(tabWorkspaceName);
  }, [isCreator, tabWorkspaceName]);

  const displayName =
    actorProfile?.full_name ||
    profile?.full_name ||
    actorProfile?.username ||
    profile?.username ||
    "You";

  const avatarUrl = !avatarBroken
    ? actorProfile?.avatar_url || profile?.avatar_url || ""
    : "";

  const searchResults = useMemo(() => {
    const catalog = buildDashboardSearchCatalog({
      lang,
      isCreator,
      campaigns: isCreator ? [] : campaigns,
      boards: wbBoards,
      chats: minoChats.map((c) => ({ id: c.id, title: c.title })),
    });
    return searchDashboardCatalog(catalog, search);
  }, [campaigns, isCreator, lang, minoChats, search, wbBoards]);

  useEffect(() => {
    setSearchIndex(0);
  }, [search]);

  const goToSearchHit = (item: DashboardSearchHit) => {
    if (item.campaignId) {
      rememberLastCampaignId(userId, item.campaignId);
      dashNav?.navigate({
        view: "campaigns",
        campaign: { type: "detail", id: item.campaignId, tab: "analytics" },
      });
    } else if (item.boardId) {
      setActiveWbBoardId(userId, item.boardId);
      onNavigate("whiteboard");
    } else if (item.chatId) {
      setActiveMinoChatId(userId, item.chatId);
      onNavigate("ai");
    } else {
      onNavigate(item.view);
    }
    setSearch("");
    setSearchOpen(false);
    if (isMobile) setSidebarOpen(false);
  };

  const goSpace = (space: WorkspaceSpace) => {
    onNavigate(defaultViewForSpace(space));
    if (isMobile) setSidebarOpen(false);
  };

  const flushContent = view === "discovery" || view === "whiteboard";

  return (
    <div className={`ws-shell${sidebarOpen ? " is-sidebar-open" : ""}${isMobile ? " is-mobile" : ""}`}>
      <header className="ws-topbar">
          <button
            type="button"
            className="ws-icon-btn ws-mobile-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <WsIcon name="list" size={18} />
          </button>

          {userId && !isCreator ? (
            <WorkspaceSwitcher
              lang={lang}
              ownerId={userId}
              actorId={actorId || userId}
              delegated={workspaceDelegated}
              fallbackName={workspaceName}
            />
          ) : (
            <button
              type="button"
              className="ws-workspace-btn"
              onClick={() => onNavigate("settings")}
              title={lang === "fr" ? "Renommer dans Paramètres" : "Rename in Settings"}
            >
              <span className="ws-workspace-mark" aria-hidden>
                {String(workspaceName).slice(0, 1).toUpperCase()}
              </span>
              <span className="label">{workspaceName}</span>
              <WsIcon name="chevron" size={14} />
            </button>
          )}

          <div className="ws-search-wrap" ref={searchRef}>
            <div className="ws-search-wrap__led" aria-hidden>
              <span className="ws-search-wrap__led-spin" />
            </div>
            <div className="ws-search-wrap__glow" aria-hidden>
              <span className="ws-search-wrap__led-spin" />
            </div>
            <div className="ws-search-wrap__inner">
              <WsIcon name="search" size={16} />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearch(next);
                  setSearchOpen(next.trim().length > 0);
                }}
                onFocus={() => {
                  if (search.trim()) setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (!search.trim()) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchOpen(true);
                    setSearchIndex((i) => (searchResults.length ? (i + 1) % searchResults.length : 0));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchOpen(true);
                    setSearchIndex((i) =>
                      searchResults.length ? (i - 1 + searchResults.length) % searchResults.length : 0,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = searchResults[searchIndex] ?? searchResults[0];
                    if (hit) goToSearchHit(hit);
                  }
                }}
                placeholder={lang === "fr" ? "Rechercher" : "Search"}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="ws-search-kbd">⌘K</span>
              <button
                type="button"
                className="ws-ai-pill"
                data-tip={lang === "fr" ? "Parler à Mino" : "Chat with Mino"}
                aria-label={lang === "fr" ? "Parler à Mino" : "Chat with Mino"}
                onClick={() => onNavigate("ai")}
              >
                <WsIcon name="sparkle" size={16} />
                <span>Ask Mino</span>
              </button>
            </div>
            {searchOpen && search.trim() ? (
              <div className="ws-search-panel">
                {searchResults.map((item, i) => {
                  const parts = highlightSearchMatch(item.label, search);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ws-search-panel__item${i === searchIndex ? " is-active" : ""}`}
                      onMouseEnter={() => setSearchIndex(i)}
                      onClick={() => goToSearchHit(item)}
                    >
                      <span>
                        {parts.match ? (
                          <>
                            {parts.before}
                            <mark className="ws-search-panel__mark">{parts.match}</mark>
                            {parts.after}
                          </>
                        ) : (
                          item.label
                        )}
                      </span>
                      <span className="ws-search-panel__meta">{item.group}</span>
                    </button>
                  );
                })}
                {searchResults.length === 0 && (
                  <div style={{ padding: 14, color: "var(--ws-text-muted)", fontSize: 13 }}>
                    {lang === "fr" ? "Aucun résultat" : "No results"}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="ws-top-actions">
            <button
              type="button"
              className="ws-icon-btn ws-top-actions__desk"
              data-tip={lang === "fr" ? "Planifier" : "Planner"}
              aria-label={lang === "fr" ? "Planifier" : "Planner"}
              onClick={() => onNavigate("planner")}
            >
              <WsIcon name="call" size={17} />
            </button>
            <button
              type="button"
              className="ws-icon-btn ws-top-actions__desk"
              data-tip={lang === "fr" ? "Notes" : "Notes"}
              aria-label={lang === "fr" ? "Notes" : "Notes"}
              onClick={() => onNavigate("planner-notes")}
            >
              <WsIcon name="mic" size={17} />
            </button>
            <button
              type="button"
              className="ws-icon-btn"
              data-tip="Notifications"
              aria-label="Notifications"
              onClick={() => onNavigate("notifications")}
              style={isCreator ? { display: "none" } : undefined}
            >
              <WsIcon name="bell" size={17} />
              {notificationUnread > 0 ? <span className="ws-dot" /> : null}
            </button>
            <button
              type="button"
              className="ws-icon-btn ws-top-actions__desk"
              data-tip="Analytics"
              aria-label="Analytics"
              onClick={openRecentCampaignAnalytics}
            >
              <WsIcon name="analytics" size={17} />
            </button>
            <button
              type="button"
              className="ws-icon-btn ws-top-actions__desk"
              data-tip="Whiteboard"
              aria-label="Whiteboard"
              onClick={() => onNavigate("whiteboard")}
            >
              <WsIcon name="whiteboard" size={17} />
            </button>

            <div
              ref={profileRef}
              className="ws-top-tip"
              data-tip={lang === "fr" ? "Profil" : "Profile"}
              style={{ position: "relative" }}
            >
              <button
                type="button"
                className="ws-avatar-btn"
                aria-label={lang === "fr" ? "Profil" : "Profile"}
                onClick={() => setProfileOpen((v) => !v)}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" onError={onAvatarError} />
                ) : (
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: "100%",
                      height: "100%",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--ws-text)",
                    }}
                  >
                    {String(displayName).slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
              {profileOpen && (
                <div className="ws-menu">
                  <div className="ws-menu__user">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" />
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: "var(--ws-pill)",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 700,
                        }}
                      >
                        {String(displayName).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="ws-menu__name">{displayName}</div>
                      <div className="ws-menu__meta">
                        {workspaceDelegated
                          ? lang === "fr"
                            ? "Admin workspace"
                            : "Workspace admin"
                          : "Online"}
                      </div>
                    </div>
                  </div>
                  <div className="ws-menu__sep" />
                  <button type="button" className="ws-menu__item" onClick={() => { onNavigate("settings"); setProfileOpen(false); }}>
                    <WsIcon name="settings" size={16} />
                    {lang === "fr" ? "Paramètres" : "Settings"}
                  </button>
                  <button
                    type="button"
                    className="ws-menu__item"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <WsIcon name="theme" size={16} />
                    {lang === "fr" ? "Thème" : "Themes"}
                    <span className="muted">{theme === "dark" ? "Dark" : "Light"}</span>
                  </button>
                  <button type="button" className="ws-menu__item" onClick={() => { onNavigate("help"); setProfileOpen(false); }}>
                    <WsIcon name="help" size={16} />
                    Help
                  </button>
                  <div className="ws-menu__sep" />
                  <div className="ws-menu__label">{lang === "fr" ? "Outils" : "Personal Tools"}</div>
                  <button type="button" className="ws-menu__item" onClick={() => { onNavigate("whiteboard"); setProfileOpen(false); }}>
                    <WsIcon name="whiteboard" size={16} />
                    Whiteboard
                  </button>
                  <button type="button" className="ws-menu__item" onClick={() => { onNavigate("ai"); setProfileOpen(false); }}>
                    <WsIcon name="ai" size={16} />
                    Mino
                  </button>
                  {!isCreator && (
                    <button type="button" className="ws-menu__item" onClick={() => { onNavigate("billing"); setProfileOpen(false); }}>
                      <WsIcon name="billing" size={16} />
                      {lang === "fr" ? "Facturation" : "Billing"}
                    </button>
                  )}
                  {onSignOut && (
                    <>
                      <div className="ws-menu__sep" />
                      <button type="button" className="ws-menu__item" onClick={() => { setProfileOpen(false); onSignOut(); }}>
                        <WsIcon name="logout" size={16} />
                        {lang === "fr" ? "Déconnexion" : "Log out"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
      </header>

      {isMobile && sidebarOpen ? (
        <button
          type="button"
          className="ws-sidebar-backdrop"
          aria-label={lang === "fr" ? "Fermer le menu" : "Close menu"}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="ws-shell__body">
        <aside className="ws-rail" aria-label="Primary">
          <div className="ws-rail__items">
            {railItems.map((item) => (
              <button
                key={item.space}
                type="button"
                className={`ws-rail__item${activeSpace === item.space ? " is-active" : ""}`}
                onClick={() => goSpace(item.space)}
                title={item.label}
              >
                <WsIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="ws-rail__foot">
            <button
              type="button"
              className={`ws-rail__item${view === "help" ? " is-active" : ""}`}
              onClick={() => onNavigate("help")}
              title="Help"
            >
              <WsIcon name="help" size={18} />
              <span>Help</span>
            </button>
          </div>
        </aside>

        <div className="ws-stage">
          <div className="ws-stage__body">
            <aside className="ws-sidebar" aria-label="Secondary">
              <div className="ws-sidebar__head">
                <h2 className="ws-sidebar__title">{sideTitle}</h2>
              </div>
              <div className="ws-sidebar__body">
                {activeSpace === "findit" && !isCreator ? (
                  <>
                    <div className="ws-sidebar__section">
                      <div className="ws-sidebar__section-label">Navigation</div>
                      {sideLinks
                        .filter((link) => link.id === "discovery")
                        .map((link) => (
                          <button
                            key={link.id}
                            type="button"
                            className={`ws-sidebar__link${view === link.view ? " is-active" : ""}`}
                            onMouseEnter={() => prefetchDashboardData(link.view)}
                            onFocus={() => prefetchDashboardData(link.view)}
                            onClick={() => {
                              onNavigate(link.view);
                              if (isMobile) setSidebarOpen(false);
                            }}
                          >
                            {link.icon ? <WsIcon name={link.icon} size={15} /> : null}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {link.label}
                            </span>
                          </button>
                        ))}
                    </div>
                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
                      <div className="ws-sidebar__section-label">
                        {lang === "fr" ? "Gestion" : "Manage"}
                      </div>
                      {sideLinks
                        .filter((link) => link.id === "findit-inbox" || link.id === "creators")
                        .map((link) => (
                          <button
                            key={link.id}
                            type="button"
                            className={`ws-sidebar__link${view === link.view ? " is-active" : ""}`}
                            onMouseEnter={() => prefetchDashboardData(link.view)}
                            onFocus={() => prefetchDashboardData(link.view)}
                            onClick={() => {
                              onNavigate(link.view);
                              if (isMobile) setSidebarOpen(false);
                            }}
                          >
                            {link.icon ? <WsIcon name={link.icon} size={15} /> : null}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {link.label}
                            </span>
                          </button>
                        ))}
                    </div>
                  </>
                ) : activeSpace === "trackit" && !isCreator ? (
                  <>
                    {(
                      [
                        {
                          id: "home",
                          label: "Home",
                          linkIds: ["campaigns"] as const,
                        },
                        {
                          id: "creators",
                          label: lang === "fr" ? "Créateurs" : "Creators",
                          linkIds: ["invitations"] as const,
                        },
                      ] as const
                    ).map((section, sectionIndex) => (
                      <div
                        key={section.id}
                        className="ws-sidebar__section"
                        style={sectionIndex > 0 ? { marginTop: 14 } : undefined}
                      >
                        <div className="ws-sidebar__section-label">{section.label}</div>
                        {sideLinks
                          .filter((link) => (section.linkIds as readonly string[]).includes(link.id))
                          .map((link) => (
                            <button
                              key={link.id}
                              type="button"
                              className={`ws-sidebar__link${
                                link.view === "campaigns"
                                  ? view === "campaigns" && !activeCampaignId
                                    ? " is-active"
                                    : ""
                                  : view === link.view
                                    ? " is-active"
                                    : ""
                              }`}
                              onMouseEnter={() => prefetchDashboardData(link.view)}
                              onFocus={() => prefetchDashboardData(link.view)}
                              onClick={() => {
                                if (link.view === "campaigns") {
                                  dashNav?.navigate({ view: "campaigns" });
                                } else {
                                  onNavigate(link.view);
                                }
                                if (isMobile) setSidebarOpen(false);
                              }}
                            >
                              {link.icon ? <WsIcon name={link.icon} size={15} /> : null}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {link.label}
                              </span>
                            </button>
                          ))}
                      </div>
                    ))}
                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
                      <div className="ws-sidebar__section-label">
                        {lang === "fr" ? "Gestion" : "Manage"}
                      </div>
                      <button
                        type="button"
                        className={`ws-sidebar__link${view === "brand-content" ? " is-active" : ""}`}
                        onMouseEnter={() => prefetchDashboardData("brand-content")}
                        onFocus={() => prefetchDashboardData("brand-content")}
                        onClick={() => {
                          onNavigate("brand-content");
                          if (isMobile) setSidebarOpen(false);
                        }}
                      >
                        <WsIcon name="camera" size={15} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lang === "fr" ? "Contenu" : "Content"}
                        </span>
                      </button>
                    </div>
                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
                      <div className="ws-sidebar__section-label">Tracking</div>
                      <button
                        type="button"
                        className={`ws-sidebar__link ws-sidebar__link--toggle${
                          campaignsNavOpen ? " is-expanded" : ""
                        }${activeCampaignId ? " is-active" : ""}`}
                        aria-expanded={campaignsNavOpen}
                        onClick={() => setCampaignsNavOpen((open) => !open)}
                      >
                        <WsIcon name="campaign" size={15} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {lang === "fr" ? "Campagnes" : "Campaigns"}
                        </span>
                        <span className="ws-sidebar__chev" aria-hidden>
                          <WsIcon name="chevron" size={12} />
                        </span>
                      </button>
                      {campaignsNavOpen ? (
                        <div className="ws-sidebar__nest">
                          {campaigns.length === 0 ? (
                            <button
                              type="button"
                              className="ws-sidebar__link"
                              onClick={() => {
                                dashNav?.navigate({ view: "campaigns", campaign: { type: "new" } });
                                if (isMobile) setSidebarOpen(false);
                              }}
                            >
                              <WsIcon name="plus" size={15} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {lang === "fr" ? "Créer une campagne" : "Create a campaign"}
                              </span>
                            </button>
                          ) : (
                            <>
                              {campaigns.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`ws-sidebar__link${activeCampaignId === c.id ? " is-active" : ""}`}
                                  onClick={() => {
                                    rememberLastCampaignId(userId, c.id);
                                    dashNav?.navigate({
                                      view: "campaigns",
                                      campaign: { type: "detail", id: c.id, tab: "analytics" },
                                    });
                                    if (isMobile) setSidebarOpen(false);
                                  }}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {c.name}
                                  </span>
                                </button>
                              ))}
                              <button
                                type="button"
                                className="ws-sidebar__link ws-spaces-new"
                                onClick={() => {
                                  dashNav?.navigate({ view: "campaigns", campaign: { type: "new" } });
                                  if (isMobile) setSidebarOpen(false);
                                }}
                              >
                                <WsIcon name="plus" size={15} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {lang === "fr" ? "Nouvelle campagne" : "New campaign"}
                                </span>
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={`ws-sidebar__link${view === "links" ? " is-active" : ""}`}
                        onMouseEnter={() => prefetchDashboardData("links")}
                        onFocus={() => prefetchDashboardData("links")}
                        onClick={() => {
                          onNavigate("links");
                          if (isMobile) setSidebarOpen(false);
                        }}
                      >
                        <WsIcon name="list" size={15} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lang === "fr" ? "Liens" : "Links"}
                        </span>
                      </button>
                    </div>
                  </>
                ) : activeSpace === "whiteboard" ? (
                  <>
                    <div className="ws-sidebar__section">
                      <div
                        className="ws-sidebar__section-label"
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      >
                        <span>Whiteboards</span>
                        <button
                          type="button"
                          className="ws-spaces-add"
                          title={lang === "fr" ? "Nouveau whiteboard" : "New whiteboard"}
                          onClick={() => {
                            setCreateWbOpen((v) => !v);
                            setNewWbName("");
                          }}
                        >
                          +
                        </button>
                      </div>
                      {wbBoards.map((b) => {
                        const active = view === "whiteboard" && activeWbId === b.id;
                        return (
                          <div
                            key={b.id}
                            className={`ws-sidebar__link-row${active ? " is-active" : ""}`}
                          >
                            <button
                              type="button"
                              className={`ws-sidebar__link${active ? " is-active" : ""}`}
                              onClick={() => {
                                setActiveWbBoardId(userId, b.id);
                                onNavigate("whiteboard");
                                if (isMobile) setSidebarOpen(false);
                              }}
                            >
                              <span
                                className="wb-sidebar-swatch"
                                style={{ background: b.color || "#F5D76E" }}
                                aria-hidden
                              />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b.name}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="wb-sidebar-trash"
                              title={lang === "fr" ? "Supprimer" : "Delete"}
                              onClick={(e) => {
                                e.stopPropagation();
                                const ok = window.confirm(
                                  lang === "fr"
                                    ? `Supprimer « ${b.name} » ?`
                                    : `Delete “${b.name}”?`,
                                );
                                if (!ok) return;
                                deleteWbBoard(userId, b.id);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path
                                  d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                      {createWbOpen ? (
                        <div className="ws-spaces-create">
                          <input
                            value={newWbName}
                            onChange={(e) => setNewWbName(e.target.value)}
                            placeholder={lang === "fr" ? "Nom du whiteboard" : "Whiteboard name"}
                            autoFocus
                            maxLength={60}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newWbName.trim()) {
                                createWbBoard(userId, newWbName.trim());
                                setCreateWbOpen(false);
                                setNewWbName("");
                                onNavigate("whiteboard");
                                if (isMobile) setSidebarOpen(false);
                              }
                              if (e.key === "Escape") setCreateWbOpen(false);
                            }}
                          />
                          <div className="ws-spaces-create__actions">
                            <button type="button" onClick={() => setCreateWbOpen(false)}>
                              {lang === "fr" ? "Annuler" : "Cancel"}
                            </button>
                            <button
                              type="button"
                              className="is-primary"
                              disabled={!newWbName.trim()}
                              onClick={() => {
                                createWbBoard(userId, newWbName.trim());
                                setCreateWbOpen(false);
                                setNewWbName("");
                                onNavigate("whiteboard");
                                if (isMobile) setSidebarOpen(false);
                              }}
                            >
                              {lang === "fr" ? "Créer" : "Create"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ws-sidebar__link ws-spaces-new"
                          onClick={() => {
                            setCreateWbOpen(true);
                            setNewWbName("");
                          }}
                        >
                          <WsIcon name="plus" size={15} />
                          <span>
                            {lang === "fr" ? "Créer un nouveau whiteboard" : "Create new whiteboard"}
                          </span>
                        </button>
                      )}
                    </div>
                  </>
                ) : activeSpace === "planner" ? (
                  <>
                    {(
                      [
                        {
                          id: "planify",
                          label: "Planify",
                          linkIds: ["planner"] as const,
                        },
                        {
                          id: "take-notes",
                          label: "Take Notes",
                          linkIds: ["planner-notes"] as const,
                        },
                      ] as const
                    ).map((section, sectionIndex) => (
                      <div
                        key={section.id}
                        className="ws-sidebar__section"
                        style={sectionIndex > 0 ? { marginTop: 14 } : undefined}
                      >
                        <div className="ws-sidebar__section-label">{section.label}</div>
                        {sideLinks
                          .filter((link) => (section.linkIds as readonly string[]).includes(link.id))
                          .map((link) => {
                            const isActive =
                              view === link.view ||
                              (link.view === "planner" && view === "meetings");
                            return (
                              <button
                                key={link.id}
                                type="button"
                                className={`ws-sidebar__link${isActive ? " is-active" : ""}`}
                                onClick={() => {
                                  onNavigate(link.view);
                                  if (isMobile) setSidebarOpen(false);
                                }}
                              >
                                {link.icon ? <WsIcon name={link.icon} size={15} /> : null}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {link.label}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    ))}
                  </>
                ) : (
                <div className="ws-sidebar__section">
                  {activeSpace === "home" ? (
                    <div className="ws-sidebar__section-label">Home</div>
                  ) : null}
                  {sideLinks.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      className={`ws-sidebar__link${view === link.view ? " is-active" : ""}`}
                      onClick={() => {
                        onNavigate(link.view);
                        if (isMobile) setSidebarOpen(false);
                      }}
                    >
                      {link.icon ? <WsIcon name={link.icon} size={15} /> : null}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.label}</span>
                      {link.badge ? <span className="ws-sidebar__link-badge">{link.badge}</span> : null}
                    </button>
                  ))}
                </div>
                )}

                {activeSpace === "home" ? (
                  <>
                    {!isCreator ? (
                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
                      <div className="ws-sidebar__section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span>Spaces</span>
                        {!workspaceDelegated ? (
                          <button
                            type="button"
                            className="ws-spaces-add"
                            title={lang === "fr" ? "Nouveau workspace" : "New workspace"}
                            onClick={() => {
                              setCreateSpaceOpen((v) => !v);
                              setCreateSpaceError("");
                              setNewSpaceName("");
                            }}
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                      {(brandSpaces.length
                        ? brandSpaces
                        : [
                            {
                              id: userId || "default",
                              owner_id: userId || "",
                              name: workspaceName,
                              avatar_url: null,
                            },
                          ]
                      ).map((space) => {
                        const isCurrent = (activeSpaceId || userId) === space.id;
                        const editingThis =
                          view === "workspace" &&
                          (getWorkspaceEditId() || activeSpaceId || userId) === space.id;
                        const letter = String(space.name || "W").slice(0, 1).toUpperCase();
                        return (
                          <button
                            key={space.id}
                            type="button"
                            className={`ws-sidebar__link${
                              editingThis || (view !== "workspace" && isCurrent) ? " is-active" : ""
                            }`}
                            disabled={spacesBusy}
                            onClick={() => {
                              setWorkspaceEditId(space.id);
                              onNavigate("workspace");
                              if (isMobile) setSidebarOpen(false);
                            }}
                            onMouseEnter={(e) => openSpaceHover(space, e.currentTarget)}
                            onMouseLeave={scheduleSpaceHoverClose}
                            onFocus={(e) => openSpaceHover(space, e.currentTarget)}
                            onBlur={scheduleSpaceHoverClose}
                          >
                            {space.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={space.avatar_url}
                                alt=""
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 4,
                                  objectFit: "cover",
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <span
                                className="ws-workspace-mark"
                                style={{ width: 16, height: 16, fontSize: 9, borderRadius: 4 }}
                                aria-hidden
                              >
                                {letter}
                              </span>
                            )}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {space.name}
                            </span>
                          </button>
                        );
                      })}
                      {!workspaceDelegated ? (
                        createSpaceOpen ? (
                          <div className="ws-spaces-create">
                            <input
                              value={newSpaceName}
                              onChange={(e) => setNewSpaceName(e.target.value)}
                              placeholder={lang === "fr" ? "Nom du workspace" : "Workspace name"}
                              autoFocus
                              maxLength={60}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void createBrandSpace();
                                if (e.key === "Escape") setCreateSpaceOpen(false);
                              }}
                            />
                            <div className="ws-spaces-create__actions">
                              <button type="button" onClick={() => setCreateSpaceOpen(false)}>
                                {lang === "fr" ? "Annuler" : "Cancel"}
                              </button>
                              <button
                                type="button"
                                className="is-primary"
                                disabled={!newSpaceName.trim() || spacesBusy}
                                onClick={() => void createBrandSpace()}
                              >
                                {spacesBusy ? "…" : lang === "fr" ? "Créer" : "Create"}
                              </button>
                            </div>
                            {createSpaceError ? <p className="ws-spaces-create__error">{createSpaceError}</p> : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="ws-sidebar__link ws-spaces-new"
                            onClick={() => {
                              setCreateSpaceOpen(true);
                              setCreateSpaceError("");
                              setNewSpaceName("");
                            }}
                          >
                            <WsIcon name="plus" size={15} />
                            <span>{lang === "fr" ? "New Space" : "New Space"}</span>
                          </button>
                        )
                      ) : null}
                    </div>
                    ) : null}

                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
                      <div className="ws-sidebar__section-label">Mino</div>
                      <button
                        type="button"
                        className={`ws-sidebar__link${view === "ai" ? " is-active" : ""}`}
                        onClick={() => {
                          setAiChatsOpen((v) => !v);
                          if (activeMinoId) {
                            setActiveMinoChatId(userId, activeMinoId);
                          }
                          onNavigate("ai");
                          if (isMobile) setSidebarOpen(false);
                        }}
                      >
                        <WsIcon name="ai" size={15} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {minoChats.find((c) => c.id === activeMinoId)?.title || "Ask, Build, Create"}
                        </span>
                        <span style={{ opacity: 0.55, fontSize: 11 }}>{aiChatsOpen || view === "ai" ? "▴" : "▾"}</span>
                      </button>
                      {aiChatsOpen || view === "ai" ? (
                        <>
                          <button
                            type="button"
                            className="ws-sidebar__link ws-spaces-new"
                            onClick={() => {
                              setActiveMinoChatId(userId, null);
                              setAiChatsOpen(true);
                              onNavigate("ai");
                              if (isMobile) setSidebarOpen(false);
                            }}
                          >
                            <WsIcon name="plus" size={15} />
                            <span>{lang === "fr" ? "Nouvelle conversation" : "New chat"}</span>
                          </button>
                          {minoChats.map((c) => {
                            const active = view === "ai" && activeMinoId === c.id;
                            const renaming = minoRenamingId === c.id;
                            return (
                              <div
                                key={c.id}
                                className={`ws-sidebar__link-row${active ? " is-active" : ""}`}
                                ref={minoMenuId === c.id ? minoMenuRef : undefined}
                              >
                                {renaming ? (
                                  <form
                                    className="mino-sidebar-rename"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const next = renameMinoChat(userId, c.id, minoRenameDraft);
                                      if (next) {
                                        setMinoRenamingId(null);
                                        setMinoRenameDraft("");
                                      }
                                    }}
                                  >
                                    <input
                                      value={minoRenameDraft}
                                      onChange={(e) => setMinoRenameDraft(e.target.value)}
                                      autoFocus
                                      maxLength={60}
                                      aria-label={lang === "fr" ? "Renommer le chat" : "Rename chat"}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          setMinoRenamingId(null);
                                          setMinoRenameDraft("");
                                        }
                                      }}
                                      onBlur={() => {
                                        renameMinoChat(userId, c.id, minoRenameDraft);
                                        setMinoRenamingId(null);
                                        setMinoRenameDraft("");
                                      }}
                                    />
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    className={`ws-sidebar__link${active ? " is-active" : ""}`}
                                    onClick={() => {
                                      setActiveMinoChatId(userId, c.id);
                                      setAiChatsOpen(true);
                                      setMinoMenuId(null);
                                      onNavigate("ai");
                                      if (isMobile) setSidebarOpen(false);
                                    }}
                                  >
                                    <WsIcon name="ai" size={15} />
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {c.title}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`mino-sidebar-more${minoMenuId === c.id ? " is-open" : ""}`}
                                  title={lang === "fr" ? "Options" : "Options"}
                                  aria-haspopup="menu"
                                  aria-expanded={minoMenuId === c.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMinoMenuId((id) => (id === c.id ? null : c.id));
                                  }}
                                >
                                  <WsIcon name="more" size={14} />
                                </button>
                                {minoMenuId === c.id ? (
                                  <div className="mino-sidebar-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMinoMenuId(null);
                                        setMinoRenamingId(c.id);
                                        setMinoRenameDraft(c.title);
                                      }}
                                    >
                                      {lang === "fr" ? "Renommer" : "Rename"}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="is-danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMinoMenuId(null);
                                        const ok = window.confirm(
                                          lang === "fr"
                                            ? `Supprimer « ${c.title} » ?`
                                            : `Delete “${c.title}”?`,
                                        );
                                        if (!ok) return;
                                        if (minoRenamingId === c.id) {
                                          setMinoRenamingId(null);
                                          setMinoRenameDraft("");
                                        }
                                        deleteMinoChat(userId, c.id);
                                      }}
                                    >
                                      {lang === "fr" ? "Supprimer" : "Delete"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </aside>

            <div className="ws-main">
              <div className={`ws-content${flushContent ? " is-flush" : ""}`}>{children}</div>
            </div>
          </div>
        </div>
      </div>

      {spaceHover && !isMobile ? (
        <div
          className="ws-space-hovercard"
          style={{ top: spaceHover.top, left: spaceHover.left }}
          onMouseEnter={cancelSpaceHoverClose}
          onMouseLeave={scheduleSpaceHoverClose}
        >
          <div className="ws-space-hovercard__head">
            {spaceHover.space.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ws-space-hovercard__mark is-photo" src={spaceHover.space.avatar_url} alt="" />
            ) : (
              <span className="ws-space-hovercard__mark" aria-hidden>
                {String(spaceHover.space.name || "W").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="ws-space-hovercard__meta">
              <span className="ws-space-hovercard__name">{spaceHover.space.name}</span>
              <span className="ws-space-hovercard__sub">
                {(activeSpaceId || userId) === spaceHover.space.id ? (
                  <em className="ws-space-hovercard__active-dot" />
                ) : null}
                {(activeSpaceId || userId) === spaceHover.space.id
                  ? lang === "fr"
                    ? "Workspace actif"
                    : "Active workspace"
                  : spaceHover.space.created_at
                    ? `${lang === "fr" ? "Créé le" : "Created"} ${new Date(spaceHover.space.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}`
                    : lang === "fr"
                      ? "Workspace"
                      : "Workspace"}
              </span>
            </div>
          </div>
          <div className="ws-space-hovercard__actions">
            {(activeSpaceId || userId) !== spaceHover.space.id ? (
              <button
                type="button"
                className="ws-space-hovercard__btn is-primary"
                disabled={spacesBusy}
                onClick={() => switchBrandSpace(spaceHover.space)}
              >
                {lang === "fr" ? "Activer" : "Activate"}
              </button>
            ) : null}
            <button
              type="button"
              className="ws-space-hovercard__btn"
              onClick={() => {
                setSpaceHover(null);
                setWorkspaceEditId(spaceHover.space.id);
                onNavigate("workspace");
              }}
            >
              {lang === "fr" ? "Infos" : "Info"}
            </button>
            {!workspaceDelegated && spaceHover.space.id !== userId ? (
              <button
                type="button"
                className="ws-space-hovercard__btn is-danger"
                onClick={() => {
                  setSpaceHover(null);
                  setDeleteSpaceError("");
                  setDeleteSpaceTarget(spaceHover.space);
                }}
              >
                {lang === "fr" ? "Supprimer" : "Delete"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteSpaceTarget ? (
        <div
          className="ws-workspace-panel ws-switch-confirm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSpaceBusy) setDeleteSpaceTarget(null);
          }}
        >
          <div className="ws-workspace-panel__card ws-switch-confirm__card">
            {deleteSpaceTarget.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ws-switch-confirm__mark is-photo is-danger" src={deleteSpaceTarget.avatar_url} alt="" />
            ) : (
              <span className="ws-switch-confirm__mark is-danger" aria-hidden>
                {String(deleteSpaceTarget.name || "W").slice(0, 1).toUpperCase()}
              </span>
            )}
            <h2 className="ws-switch-confirm__title">
              {lang === "fr"
                ? `Supprimer « ${deleteSpaceTarget.name} » ?`
                : `Delete “${deleteSpaceTarget.name}”?`}
            </h2>
            <p className="ws-switch-confirm__hint">
              {lang === "fr"
                ? "Toutes les données de ce workspace (campagnes, créateurs, ventes, contenus…) seront supprimées définitivement."
                : "All data in this workspace (campaigns, creators, sales, content…) will be permanently deleted."}
            </p>
            {deleteSpaceError ? (
              <p className="ws-workspace-menu__error" style={{ margin: "0 0 12px" }}>
                {deleteSpaceError}
              </p>
            ) : null}
            <div className="ws-workspace-panel__actions ws-switch-confirm__actions">
              <button
                type="button"
                className="ws-workspace-btn-ghost"
                disabled={deleteSpaceBusy}
                onClick={() => setDeleteSpaceTarget(null)}
              >
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                className="ws-workspace-btn-danger"
                disabled={deleteSpaceBusy}
                onClick={() => void deleteBrandSpace()}
              >
                {deleteSpaceBusy
                  ? lang === "fr"
                    ? "Suppression…"
                    : "Deleting…"
                  : lang === "fr"
                    ? "Supprimer définitivement"
                    : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
