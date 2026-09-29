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
  createMinoChat,
  createMinoFolder,
  deleteMinoChat,
  getActiveMinoChatId,
  loadMinoChats,
  loadMinoFolders,
  MINO_ACTIVE_EVENT,
  MINO_CHATS_EVENT,
  moveMinoChatToFolder,
  renameMinoChat,
  setActiveMinoChatId,
  type MinoChat,
  type MinoFolder,
} from "@/lib/mino-chats-storage";
import { getLastCampaignId, rememberLastCampaignId } from "@/lib/last-campaign-storage";
import { getLastCommunityId, rememberLastCommunityId } from "@/lib/last-community-storage";
import {
  buildDashboardSearchCatalog,
  highlightSearchMatch,
  searchDashboardCatalog,
  type DashboardSearchHit,
} from "@/lib/dashboard-search";
import { useDashboardTheme } from "../DashboardThemeProvider";
import { useDashboardNavigationOptional } from "../DashboardNavigationProvider";
import { PersonGlyph, WorkspaceGlyph } from "@/components/FallbackGlyphs";
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
  const [minoFolders, setMinoFolders] = useState<MinoFolder[]>([]);
  const [activeMinoId, setActiveMinoId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [campaignsNavOpen, setCampaignsNavOpen] = useState(true);
  const [communities, setCommunities] = useState<Array<{ id: string; name: string; avatar_url?: string | null }>>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
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
          .filter((r: { commission_type?: string }) => String(r.commission_type || "").toLowerCase() !== "rpm")
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
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      const url = isCreator
        ? `/api/creator/communities?userId=${encodeURIComponent(userId)}`
        : `/api/communities?brandId=${encodeURIComponent(userId)}`;
      void fetch(url, { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const rows = ((d.communities || []) as { id: string; name: string; avatar_url?: string | null }[]).map(
            (c) => ({ id: c.id, name: c.name, avatar_url: c.avatar_url }),
          );
          setCommunities(rows);
          const remembered = getLastCommunityId(userId);
          const next =
            (remembered && rows.some((c) => c.id === remembered) ? remembered : null) ||
            (view === "community" ? rows[0]?.id || null : null);
          if (view === "community") setActiveCommunityId(next);
        })
        .catch(() => {
          if (!cancelled) setCommunities([]);
        });
    };
    load();
    window.addEventListener("trackit:communities-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:communities-updated", load);
    };
  }, [userId, isCreator, view]);

  useEffect(() => {
    if (!userId || !activeCommunityId) return;
    rememberLastCommunityId(userId, activeCommunityId);
  }, [userId, activeCommunityId]);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setActiveCommunityId(id);
    };
    window.addEventListener("trackit:community-select", onSelect);
    return () => window.removeEventListener("trackit:community-select", onSelect);
  }, []);

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
      setMinoFolders(loadMinoFolders(userId));
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
        { space: "home", label: lang === "fr" ? "Accueil" : "Home", icon: "home" },
        { space: "infos", label: "Infos", icon: "list" },
        { space: "content", label: lang === "fr" ? "Contenu" : "Content", icon: "camera" },
        { space: "payit", label: lang === "fr" ? "Paiements" : "Payouts", icon: "payit" },
      ];
    }
    return [
      { space: "home", label: lang === "fr" ? "Accueil" : "Home", icon: "home" },
      { space: "findit", label: lang === "fr" ? "Créateurs" : "Creators", icon: "findit" },
      { space: "trackit", label: lang === "fr" ? "Campagnes" : "Campaigns", icon: "trackit" },
      { space: "payit", label: lang === "fr" ? "Paiements" : "Payouts", icon: "payit" },
    ];
  }, [isCreator, lang]);

  const sideTitle = useMemo(() => {
    const map: Record<WorkspaceSpace, string> = {
      home: lang === "fr" ? "Accueil" : "Home",
      findit: lang === "fr" ? "Créateurs" : "Creators",
      trackit: lang === "fr" ? "Campagnes" : "Campaigns",
      payit: lang === "fr" ? "Paiements" : "Payouts",
      planner: lang === "fr" ? "Planner" : "Planner",
      notes: "Notes",
      whiteboard: "Whiteboard",
      integrations: lang === "fr" ? "Intégrations" : "Integrations",
      analytics: lang === "fr" ? "Tracking" : "Tracking",
      ai: "Mino",
      scripts: "Scripts",
      content: lang === "fr" ? "Contenu" : "Content",
      hooks: "Hooks",
      infos: "Infos",
      community: lang === "fr" ? "Communauté" : "Community",
    };
    return map[activeSpace];
  }, [activeSpace, lang]);

  const sideLinks: SideLink[] = useMemo(() => {
    if (isCreator) {
      if (activeSpace === "home") {
        return [
          { id: "home", label: lang === "fr" ? "Aujourd’hui" : "Today", view: "dashboard", icon: "home" },
          { id: "infos", label: "Infos", view: "infos", icon: "list" },
          { id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "content", icon: "camera" },
        ];
      }
      if (activeSpace === "payit") {
        return [
          { id: "payouts", label: lang === "fr" ? "Mes gains" : "My earnings", view: "payouts", icon: "payit" },
          { id: "balance", label: lang === "fr" ? "Solde" : "Balance", view: "balance", icon: "billing" },
        ];
      }
      if (activeSpace === "analytics") {
        return [
          {
            id: "analytics",
            label: lang === "fr" ? "Analytiques" : "Analytics",
            view: "analytics",
            icon: "analytics",
          },
        ];
      }
      if (activeSpace === "infos") {
        return [
          { id: "infos-rules", label: lang === "fr" ? "Règles" : "Rules", view: "infos", icon: "list" },
          {
            id: "infos-howto",
            label: lang === "fr" ? "Comment ça marche" : "How it works",
            view: "infos-howto",
            icon: "list",
          },
          {
            id: "infos-pricing",
            label: lang === "fr" ? "Modèle de pricing" : "Pricing model",
            view: "infos-pricing",
            icon: "list",
          },
        ];
      }
      if (activeSpace === "hooks") {
        return [{ id: "hooks", label: "Hooks", view: "hooks", icon: "list" }];
      }
      if (activeSpace === "community") {
        return [{ id: "community", label: lang === "fr" ? "Communauté" : "Community", view: "community", icon: "users" }];
      }
      if (activeSpace === "content") {
        return [{ id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "content", icon: "camera" }];
      }
      if (activeSpace === "trackit") {
        return [
          { id: "today", label: lang === "fr" ? "Aujourd’hui" : "Today", view: "dashboard", icon: "home" },
          { id: "gifting", label: "Gifting", view: "gifting", icon: "invite" },
        ];
      }
      return [{ id: "home", label: lang === "fr" ? "Accueil" : "Home", view: "dashboard", icon: "home" }];
    }

    switch (activeSpace) {
      case "home":
        return [
          { id: "overview", label: lang === "fr" ? "Vue d’ensemble" : "Overview", view: "dashboard", icon: "home" },
          { id: "inbox", label: "Notifications", view: "notifications", icon: "inbox" },
          { id: "outreach", label: lang === "fr" ? "Prospection" : "Outreach", view: "outreach", icon: "invite" },
          { id: "tasks", label: lang === "fr" ? "Tâches" : "Tasks", view: "tasks", icon: "tasks" },
        ];
      case "findit":
        return [
          { id: "discovery", label: lang === "fr" ? "Rechercher" : "Search", view: "discovery", icon: "findit" },
          { id: "findit-inbox", label: lang === "fr" ? "Réception" : "Inbox", view: "findit-inbox", icon: "inbox" },
          { id: "creators", label: lang === "fr" ? "Mes listes" : "My lists", view: "creators", icon: "users" },
          { id: "outreach", label: lang === "fr" ? "Prospection" : "Outreach", view: "outreach", icon: "invite" },
        ];
      case "community":
        return [
          { id: "community", label: lang === "fr" ? "Communauté" : "Community", view: "community", icon: "users" },
        ];
      case "trackit":
        return [
          { id: "campaigns", label: lang === "fr" ? "Campagnes" : "Campaigns", view: "campaigns", icon: "grid" },
          { id: "invitations", label: lang === "fr" ? "Invitations" : "Invitations", view: "invitations", icon: "invite" },
        ];
      case "payit":
        return [
          { id: "payouts", label: lang === "fr" ? "À payer" : "To pay", view: "payouts", icon: "payit" },
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
      case "infos":
        return [
          { id: "infos", label: lang === "fr" ? "Informations" : "Information", view: "infos", icon: "list" },
        ];
      case "hooks":
        return [{ id: "hooks", label: "Hooks", view: "hooks", icon: "list" }];
      case "content":
        return [{ id: "content", label: lang === "fr" ? "Contenu" : "Content", view: "brand-content", icon: "camera" }];
      default:
        return [
          { id: "inbox", label: "Notifications", view: "notifications", icon: "inbox" },
          { id: "outreach", label: lang === "fr" ? "Prospection" : "Outreach", view: "outreach", icon: "invite" },
          { id: "tasks", label: lang === "fr" ? "Tâches" : "Tasks", view: "tasks", icon: "tasks" },
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

  const activeWorkspaceAvatar =
    brandSpaces.find((space) => space.id === (activeSpaceId || userId))?.avatar_url || "";

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

  // Non-delegated (creators / owners): prefer live `profile` so Settings edits apply immediately.
  // Delegated admins: show the actor's own identity, not the workspace owner's.
  const accountProfile =
    workspaceDelegated && actorProfile ? actorProfile : profile ?? actorProfile;

  const displayName =
    accountProfile?.full_name ||
    accountProfile?.username ||
    "You";

  const avatarUrl = !avatarBroken ? accountProfile?.avatar_url || "" : "";

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

  const openMinoChat = (chatId: string) => {
    setActiveMinoChatId(userId, chatId);
    onNavigate("ai");
    if (isMobile) setSidebarOpen(false);
  };

  const renderMinoChat = (chat: MinoChat) => {
    const active = view === "ai" && activeMinoId === chat.id;
    return (
      <div
        key={chat.id}
        className={`ws-chat-row${active ? " is-active" : ""}`}
        draggable={minoRenamingId !== chat.id}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/mino-chat", chat.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMinoMenuId(chat.id);
        }}
      >
        {minoRenamingId === chat.id ? (
          <input
            className="ws-chat-rename"
            value={minoRenameDraft}
            autoFocus
            onChange={(e) => setMinoRenameDraft(e.target.value)}
            onBlur={() => {
              renameMinoChat(userId, chat.id, minoRenameDraft);
              setMinoRenamingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameMinoChat(userId, chat.id, minoRenameDraft);
                setMinoRenamingId(null);
              }
              if (e.key === "Escape") setMinoRenamingId(null);
            }}
          />
        ) : (
          <button type="button" className="ws-sidebar__link" onClick={() => openMinoChat(chat.id)}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title}</span>
          </button>
        )}
        {minoMenuId === chat.id ? (
          <div className="ws-chat-menu" ref={minoMenuRef}>
            <button
              type="button"
              onClick={() => {
                setMinoRenamingId(chat.id);
                setMinoRenameDraft(chat.title);
                setMinoMenuId(null);
              }}
            >
              {lang === "fr" ? "Renommer" : "Rename"}
            </button>
            <button
              type="button"
              onClick={() => {
                deleteMinoChat(userId, chat.id);
                setMinoMenuId(null);
              }}
            >
              {lang === "fr" ? "Supprimer" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const flushContent = view === "discovery" || view === "whiteboard" || view === "community" || view === "ai";
  const homeBrand = activeSpace === "home" && !isCreator;

  return (
    <div className={`ws-shell${sidebarOpen ? " is-sidebar-open" : ""}${isMobile ? " is-mobile" : ""}${isCreator ? " is-creator" : ""}${homeBrand ? " is-home" : ""}`}>
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
              onOpenSettings={() => onNavigate("settings")}
              onOpenBilling={() => onNavigate("billing")}
              onSignOut={onSignOut}
            />
          ) : (
            <button
              type="button"
              className="ws-workspace-btn"
              onClick={() => onNavigate("settings")}
              title={lang === "fr" ? "Renommer dans Paramètres" : "Rename in Settings"}
            >
              {activeWorkspaceAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ws-workspace-mark is-photo" src={activeWorkspaceAvatar} alt="" aria-hidden />
              ) : (
                <span className="ws-workspace-mark" aria-hidden>
                  <WorkspaceGlyph size={13} color="#fff" />
                </span>
              )}
              <span className="label">{workspaceName}</span>
              <WsIcon name="chevron" size={14} />
            </button>
          )}

          <div className="ws-search-cluster">
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
                <span>{lang === "fr" ? "Demander à Mino" : "Ask Mino"}</span>
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
          </div>


          {isCreator ? (
          <div className="ws-top-actions">
            <button
              type="button"
              className="ws-icon-btn ws-top-actions__desk"
              data-tip="Analytics"
              aria-label="Analytics"
              onClick={openRecentCampaignAnalytics}
            >
              <WsIcon name="analytics" size={17} />
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
                    }}
                  >
                    <PersonGlyph size={17} color="var(--ws-text-dim)" />
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
                          flexShrink: 0,
                        }}
                      >
                        <PersonGlyph size={21} color="var(--ws-text-dim)" />
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
          ) : null}
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
                className={`ws-rail__item${
                  activeSpace === item.space ||
                  (!isCreator &&
                    item.space === "trackit" &&
                    (activeSpace === "hooks" || activeSpace === "infos"))
                    ? " is-active"
                    : ""
                }`}
                onClick={() => goSpace(item.space)}
                title={item.label}
              >
                <WsIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            {!isCreator && (
              <button
                type="button"
                className={`ws-rail__item${activeSpace === "integrations" ? " is-active" : ""}`}
                onClick={() => goSpace("integrations")}
                title={lang === "fr" ? "Intégrations" : "Integrations"}
              >
                <WsIcon name="integrations" size={18} />
                <span>{lang === "fr" ? "Intégrations" : "Integrations"}</span>
              </button>
            )}
          </div>
        </aside>

        <div className="ws-stage">
          <div className={`ws-stage__body${view === "discovery" && !isCreator ? " is-full" : ""}`}>
            <aside className="ws-sidebar" aria-label="Secondary">
              <div className="ws-sidebar__head">
                <h2 className="ws-sidebar__title">{sideTitle}</h2>
              </div>
              <div className={`ws-sidebar__body${homeBrand ? " is-docked" : ""}`}>
                <div className="ws-sidebar__scroll">
                {activeSpace === "findit" && !isCreator ? (
                  <>
                    <div className="ws-sidebar__section">
                      <div className="ws-sidebar__section-label">{lang === "fr" ? "Trouver" : "Find"}</div>
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
                        .filter((link) => link.id === "findit-inbox" || link.id === "creators" || link.id === "outreach")
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
                    <button
                      type="button"
                      className="ws-sidebar__link"
                      onClick={() => {
                        dashNav?.navigate({ view: "campaigns", campaign: { type: "new" } });
                        if (isMobile) setSidebarOpen(false);
                      }}
                      style={{
                        marginBottom: 14,
                        background: "var(--ws-text)",
                        color: "var(--ws-bg)",
                        borderRadius: 999,
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      <WsIcon name="plus" size={15} />
                      <span>{lang === "fr" ? "Créer une campagne" : "Create a campaign"}</span>
                    </button>
                    <div className="ws-sidebar__section">
                      <button
                        type="button"
                        className={`ws-sidebar__link ws-sidebar__link--toggle${campaignsNavOpen ? " is-expanded" : ""}${activeCampaignId ? " is-active" : ""}`}
                        aria-expanded={campaignsNavOpen}
                        onClick={() => {
                          setCampaignsNavOpen((open) => !open);
                          dashNav?.navigate({ view: "campaigns" });
                        }}
                      >
                        <WsIcon name="campaign" size={15} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {lang === "fr" ? "Campagnes" : "Campaigns"}
                        </span>
                        <span className="ws-sidebar__chev" aria-hidden>
                          <WsIcon name="chevron" size={12} />
                        </span>
                      </button>
                      <div className={`ws-sidebar__fold${campaignsNavOpen ? " is-open" : ""}`}>
                        <div className="ws-sidebar__fold-inner">
                          <div className="ws-sidebar__nest">
                            {campaigns.length === 0 ? (
                              <p style={{ margin: "8px 12px", color: "var(--ws-text-muted)", fontSize: 13 }}>
                                {lang === "fr" ? "Aucune campagne" : "No campaigns"}
                              </p>
                            ) : (
                              campaigns.map((c) => (
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
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="ws-sidebar__section" style={{ marginTop: 14 }}>
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
                ) : isCreator && activeSpace === "community" ? (
                  <div className="ws-sidebar__section">
                    <div className="ws-sidebar__section-label">
                      {lang === "fr" ? "Communautés" : "Communities"}
                    </div>
                    {communities.length === 0 ? (
                      <p
                        style={{
                          margin: "8px 10px 0",
                          fontSize: 12.5,
                          lineHeight: 1.4,
                          color: "var(--ws-text-muted)",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {lang === "fr"
                          ? "Aucune communauté pour l’instant."
                          : "No communities yet."}
                      </p>
                    ) : (
                      communities.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`ws-sidebar__link${
                            view === "community" && activeCommunityId === c.id ? " is-active" : ""
                          }`}
                          onClick={() => {
                            rememberLastCommunityId(userId, c.id);
                            setActiveCommunityId(c.id);
                            onNavigate("community");
                            window.dispatchEvent(
                              new CustomEvent("trackit:community-select", { detail: { id: c.id } }),
                            );
                            if (isMobile) setSidebarOpen(false);
                          }}
                        >
                          <WsIcon name="users" size={15} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : activeSpace === "home" ? null : (
                <div className="ws-sidebar__section">
                  {activeSpace === "infos" ? (
                    <div className="ws-sidebar__section-label">
                      {lang === "fr" ? "Informations" : "Information"}
                    </div>
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

                {activeSpace === "home" && !isCreator ? (
                  <div className="ws-sidebar__section">
                    <button
                      type="button"
                      className="ws-sidebar__link"
                      onClick={() => {
                        createMinoChat(userId, lang === "fr");
                        onNavigate("ai");
                        if (isMobile) setSidebarOpen(false);
                      }}
                    >
                      <WsIcon name="plus" size={15} />
                      <span>{lang === "fr" ? "Nouveau chat" : "New chat"}</span>
                    </button>
                    <div className="ws-sidebar__section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
                      <span>{lang === "fr" ? "Dossiers" : "Folders"}</span>
                      <button
                        type="button"
                        className="ws-spaces-add"
                        title={lang === "fr" ? "Nouveau dossier" : "New folder"}
                        onClick={() => {
                          setCreateFolderOpen((v) => !v);
                          setNewFolderName("");
                        }}
                      >
                        +
                      </button>
                    </div>
                    {createFolderOpen ? (
                      <div className="ws-spaces-create">
                        <input
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder={lang === "fr" ? "Nom du dossier" : "Folder name"}
                          autoFocus
                          maxLength={40}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              createMinoFolder(userId, newFolderName);
                              setCreateFolderOpen(false);
                              setNewFolderName("");
                            }
                            if (e.key === "Escape") setCreateFolderOpen(false);
                          }}
                        />
                        <div className="ws-spaces-create__actions">
                          <button type="button" onClick={() => setCreateFolderOpen(false)}>
                            {lang === "fr" ? "Annuler" : "Cancel"}
                          </button>
                          <button
                            type="button"
                            className="is-primary"
                            disabled={!newFolderName.trim()}
                            onClick={() => {
                              createMinoFolder(userId, newFolderName);
                              setCreateFolderOpen(false);
                              setNewFolderName("");
                            }}
                          >
                            {lang === "fr" ? "Créer" : "Create"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {minoFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className={`ws-chat-folder${dropTarget === folder.id ? " is-drop" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTarget(folder.id);
                        }}
                        onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
                        onDrop={(e) => {
                          e.preventDefault();
                          const chatId = e.dataTransfer.getData("text/mino-chat");
                          if (chatId) moveMinoChatToFolder(userId, chatId, folder.id);
                          setDropTarget(null);
                        }}
                      >
                        <div className="ws-chat-folder__name">{folder.name}</div>
                        {minoChats.filter((chat) => chat.folderId === folder.id).map(renderMinoChat)}
                      </div>
                    ))}
                    <div
                      className={`ws-chat-loose${dropTarget === "loose" ? " is-drop" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDropTarget("loose");
                      }}
                      onDragLeave={() => setDropTarget((current) => (current === "loose" ? null : current))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const chatId = e.dataTransfer.getData("text/mino-chat");
                        if (chatId) moveMinoChatToFolder(userId, chatId, null);
                        setDropTarget(null);
                      }}
                    >
                      <div className="ws-sidebar__section-label" style={{ marginTop: 14 }}>
                        {lang === "fr" ? "Chats" : "Chats"}
                      </div>
                      {minoChats.filter((chat) => !chat.folderId).length === 0 ? (
                        <p className="ws-chat-empty">{lang === "fr" ? "Aucun chat" : "No chats yet"}</p>
                      ) : (
                        minoChats.filter((chat) => !chat.folderId).map(renderMinoChat)
                      )}
                    </div>
                  </div>
                ) : null}
                </div>
                {homeBrand ? (
                  <div className="ws-sidebar__dock">
                    <button
                      type="button"
                      className={`ws-sidebar__dock-item${view === "outreach" ? " is-active" : ""}`}
                      onClick={() => {
                        onNavigate("outreach");
                        if (isMobile) setSidebarOpen(false);
                      }}
                    >
                      <WsIcon name="invite" size={14} />
                      <span>{lang === "fr" ? "Prospection" : "Outreach"}</span>
                    </button>
                  </div>
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
                <WorkspaceGlyph size={19} color="#fff" />
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
                <WorkspaceGlyph size={29} color="#fff" />
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
