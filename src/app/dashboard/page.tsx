"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { getSavedCreators, saveOutreach } from "@/lib/db";
import { dispatchOutreachHistoryUpdated, dispatchPayoutsUpdated, dispatchSalesUpdated, followUpIn3Days } from "@/lib/outreach-history-events";
import { appendStoredOutreachEntry } from "@/lib/outreach-history-storage";
import { avatarUrlForCreatorHandle, buildCreatorAvatarMap, normalizeCreatorHandle } from "@/lib/creator-avatar";
import { buildCreatorEmailMap } from "@/lib/creator-crm";
import {
  buildOutreachMailtoUrl,
  isValidEmailAddress,
  resolveCreatorEmail,
  resolveSelectedCreatorEmails,
  sendOutreachEmail,
} from "@/lib/outreach-email";
import type { FeedCreator } from "@/lib/discovery-feed";
import { listSaved } from "@/lib/workspace-client";
import {
  selectionCardStyle,
  selectionPillColors,
  selectionTextMuted,
  selectionTextPrimary,
  selectionTextSubtle,
  TRACKIT_SELECTION_BLUE,
} from "@/lib/selection-card-styles";
import { CreatorAvatar } from "./CreatorAvatar";
import { notifyOutreachSent } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { SettingsView } from "./SettingsView";
import { CreatorSettings } from "./CreatorSettings";
import { CreatorAffiliateReadPanel } from "./CreatorAffiliateReadPanel";
import { NewCreatorModal } from "./NewCreatorModal";
import { InvitationsView } from "./InvitationsView";
import { AnalyticsView } from "./AnalyticsView";
import { CreatorScripts } from "./CreatorScripts";
import { CreatorContent } from "./CreatorContent";
import { ScriptsManager } from "./ScriptsManager";
import { CampaignsView } from "./CampaignsView";
import { DiscoveryFeed } from "./DiscoveryFeed";
import { MyCreatorsView } from "./MyCreatorsView";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { CreatorsView } from "./CreatorsView";
import { SplitHeaderActions, type SplitMenuItem } from "./SplitHeaderActions";
import { OutreachHistorySection } from "./OutreachView";
import { UpgradeModal } from "./UpgradeModal";
import { runGateUpgrade, type GateFeatureKey } from "@/lib/plan-marketing";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade } from "@/lib/checkout";
import { checkoutCurrencyFromLang } from "@/lib/plan-marketing";
import {
  canAddAnotherShopifyStore,
  canBulkImportTemplatesCsv,
  canChangeShopifyStore,
  canCreateTemplates,
  canImportTemplates,
  canUseAutoFollowUp,
  canUseAffiliates,
  canUseAutomationWorkflows,
  canUseBalance,
  canUseFullAutomationAgent,
  canUseShopify,
  canUseScripts,
  isGrowthOrAbove,
  isScalePlan,
  maxShopifyStores,
  SCALE_MAX_SHOPIFY_STORES,
  normalizePlan,
  type PlanTier,
} from "@/lib/plan-limits";
import { BalanceView, LiveSalesFeed, PayoutsView, TransactionsView } from "./PayoutsView";
import { BillingView } from "./BillingView";
import { FeedbackView } from "./FeedbackView";
import { NotesView } from "./NotesView";
import { HomeOverviewView } from "./HomeOverviewView";
import { HelpCenterView } from "./HelpCenterView";
import { NotificationsPanel } from "./NotificationsView";
import {
  ensureNotificationsReset,
  getStoredUnreadCount,
  NOTIFICATIONS_UPDATED_EVENT,
  notifyFeedbackIfNeeded,
  notifyShopifyConnected,
  notifyWelcomeIfNeeded,
  playWelcomeSoundIfUnread,
  setNotificationsUserId,
} from "@/lib/notifications-storage";
import { installNotificationSoundUnlock, primeNotificationSound } from "@/lib/notification-sound";
import { PROFILE_UPDATED_EVENT, type ProfileUpdatedDetail } from "@/lib/locale-preferences";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";
import { recordLoginIp } from "@/lib/record-login";
import {
  buildBootstrapFromProfile,
  readDashboardBootstrap,
  writeDashboardBootstrap,
} from "@/lib/dashboard-bootstrap-cache";
import { useLang } from "@/lib/useLang";
import { useDisplayCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";
import { formatCreatorDeactivatedMessage } from "@/lib/creator-deactivation-message";
import { buildTrackitShortLink, createAffiliateShortLink } from "@/lib/affiliate-short-link";
import { loadAffiliates, persistAffiliateCodesToServer, removeAffiliate, saveAffiliates, type StoredAffiliate } from "@/lib/affiliates-storage";
import {
  readViewFromUrl,
  type DashboardView,
} from "@/lib/dashboard-view-storage";
import {
  DashboardNavigationProvider,
  useDashboardNavigationController,
} from "./DashboardNavigationProvider";

type View = DashboardView;

const CREATOR_ALLOWED_VIEWS: View[] = ["dashboard", "analytics", "scripts", "content", "notes", "payouts", "settings", "feedback"];

type SidebarNavSection = "main" | "tools" | "workspace" | "footer";

type SidebarNavChild = {
  id: string;
  label: string;
  view: View;
  keywords?: string[];
};

type SidebarNavEntry = {
  id: string;
  label: string;
  view: View;
  section: SidebarNavSection;
  keywords: string[];
  badge?: string;
  iconKey: string;
  children?: SidebarNavChild[];
};

function flattenSidebarNavEntries(entries: SidebarNavEntry[]): SidebarNavEntry[] {
  const out: SidebarNavEntry[] = [];
  for (const item of entries) {
    out.push({ ...item, children: undefined });
    if (item.children) {
      for (const child of item.children) {
        out.push({
          id: child.id,
          label: child.label,
          view: child.view,
          section: item.section,
          iconKey: item.iconKey,
          keywords: [...(child.keywords ?? []), ...item.keywords],
        });
      }
    }
  }
  return out;
}

function getSidebarSectionLabels(lang: "en" | "fr"): Record<Exclude<SidebarNavSection, "footer">, string> {
  return {
    main: lang === "fr" ? "MENU PRINCIPAL" : "MAIN MENU",
    tools: lang === "fr" ? "OUTILS" : "TOOLS",
    workspace: lang === "fr" ? "ESPACE DE TRAVAIL" : "WORKSPACE",
  };
}

function DashboardPageContent() {
  useDisplayCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; username: string | null; avatar_url: string | null; business_name: string | null; shopify_store: string | null; plan: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarGroupExpanded, setSidebarGroupExpanded] = useState<Record<string, boolean>>({
    discovery: true,
    campaigns: true,
    payouts: true,
  });
  const navigation = useDashboardNavigationController(user?.id);
  const view = navigation.navState.view;
  const setView = navigation.setView;
  const navigate = navigation.navigate;
  const [isCreator, setIsCreator] = useState(false);
  const { stats: creatorStats, loading: creatorStatsLoading } = useCreatorStats(isCreator ? user?.id : undefined);
  const creatorAccessRevoked =
    isCreator && !creatorStatsLoading && creatorStats?.accessRevoked === true;

  useEffect(() => {
    if (view === "notifications") {
      navigate({ view: "discovery" }, { replace: true });
    }
  }, [view, navigate]);

  // Créateur : accueil, outils essentiels et paramètres uniquement.
  useEffect(() => {
    if (isCreator && !CREATOR_ALLOWED_VIEWS.includes(view)) {
      navigate({ view: "dashboard" }, { replace: true });
    }
  }, [isCreator, view, navigate]);
  const [outreachSendRequest, setOutreachSendRequest] = useState<OutreachSendRequest | null>(null);
  const [shopifyStore, setShopifyStore] = useState<string | null>(null);
  const plan = normalizePlan(profile?.plan);
  const isFree = plan === "free";
  const isBasic = plan === "basic";
  const isPro = plan === "pro";
  const isScale = isScalePlan(plan);
  const canUseBasicFeatures = isGrowthOrAbove(plan);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [sidebarCounts, setSidebarCounts] = useState({ activeCampaigns: 0, savedCreators: 0 });
  const [avatarBroken, setAvatarBroken] = useState(false);
  const avatarRetryRef = useRef(false);
  const [gettingStarted, setGettingStarted] = useState({
    shopify: false,
    shopifyStore: null as string | null,
    creators: false,
    outreach: false,
    sales: false,
    creatorsCount: 0,
    outreachCount: 0,
    salesCount: 0,
  });

  const reloadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, username, avatar_url, business_name, plan, shopify_store, account_type, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    if (!profileData) return;
    setAvatarBroken(false);
    setProfile((prev) => ({
      full_name: profileData.full_name,
      username: profileData.username,
      avatar_url: profileData.avatar_url,
      business_name: profileData.business_name,
      shopify_store: profileData.shopify_store ?? prev?.shopify_store ?? null,
      plan: normalizePlan(profileData.plan),
    }));
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      writeDashboardBootstrap(buildBootstrapFromProfile(authUser, profileData));
    }
    void resolveAvatarUrl(supabase, userId, profileData.avatar_url).then((avatar_url) => {
      setProfile((prev) => (prev ? { ...prev, avatar_url } : prev));
    });
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setNotificationUnread(0);
      return;
    }
    setNotificationsUserId(user.id);
    ensureNotificationsReset();
    notifyWelcomeIfNeeded(user.id, lang);
    // Brands only — wait until profile role is known (loading false) so creators never get this.
    if (!loading && !isCreator) {
      notifyFeedbackIfNeeded(user.id, lang);
    }
    setNotificationUnread(getStoredUnreadCount());
    const refreshUnread = () => {
      setNotificationsUserId(user.id);
      setNotificationUnread(getStoredUnreadCount());
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshUnread);
    const removeSoundUnlock = installNotificationSoundUnlock();

    const retryWelcome = () => {
      primeNotificationSound();
      const created = notifyWelcomeIfNeeded(user.id, lang);
      if (!created) {
        playWelcomeSoundIfUnread(user.id);
      }
    };
    window.addEventListener("pointerdown", retryWelcome, { capture: true, passive: true, once: true });

    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshUnread);
      window.removeEventListener("pointerdown", retryWelcome, { capture: true });
      removeSoundUnlock();
    };
  }, [user?.id, lang, isCreator, loading]);

  const loadSidebarCounts = useCallback(async (userId: string) => {
    if (!supabase) return;
    const [{ count: activeCampaigns }, { count: savedCreators }] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["active", "Active"]),
      supabase
        .from("creators")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    setSidebarCounts({
      activeCampaigns: activeCampaigns ?? 0,
      savedCreators: savedCreators ?? 0,
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void loadSidebarCounts(user.id);
  }, [user?.id, view, loadSidebarCounts]);

  useEffect(() => {
    if (DEV_BYPASS_PLAN) {
      setUser({ id: "00000000-0000-0000-0000-000000000000" } as User);
      setProfile({ full_name: "Preview", username: "preview", avatar_url: null, business_name: null, shopify_store: null, plan: DEV_BYPASS_PLAN });
      setLoading(false);
      return;
    }
    if (!supabase) { setLoading(false); router.replace("/auth"); return; }

    let cancelled = false;

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const authUser = session?.user;
        if (!authUser) {
          router.replace("/auth");
          setLoading(false);
          return;
        }

        const cached = readDashboardBootstrap(authUser.id);
        if (cached?.onboarding_completed) {
          if (cached.isCreator) setIsCreator(true);
          setShopifyStore(cached.shopify_store);
          setUser(authUser);
          avatarRetryRef.current = false;
          setAvatarBroken(false);
          setProfile({
            full_name: cached.full_name,
            username: cached.username,
            avatar_url: cached.avatar_url,
            business_name: cached.business_name,
            shopify_store: cached.shopify_store,
            plan: normalizePlan(cached.plan),
          });
          setLoading(false);
        }

        const { data: profileData } = await supabase
          .from("profiles")
          .select("onboarding_completed, full_name, username, avatar_url, business_name, plan, subscription_status, shopify_store, account_type")
          .eq("id", authUser.id)
          .maybeSingle();

        if (cancelled) return;

        if (!profileData) {
          if (!cached) router.replace("/auth");
          setLoading(false);
          return;
        }

        if (profileData.account_type === "creator") {
          setIsCreator(true);
        } else if (profileData.onboarding_completed === false) {
          router.replace("/onboarding");
          setLoading(false);
          return;
        }

        setShopifyStore(profileData.shopify_store || null);
        setUser(authUser);
        avatarRetryRef.current = false;
        setAvatarBroken(false);
        setProfile({
          full_name: profileData.full_name,
          username: profileData.username,
          avatar_url: profileData.avatar_url,
          business_name: profileData.business_name,
          shopify_store: profileData.shopify_store ?? null,
          plan: normalizePlan(profileData.plan),
        });
        writeDashboardBootstrap(buildBootstrapFromProfile(authUser, profileData));
        setLoading(false);

        void resolveAvatarUrl(supabase, authUser.id, profileData.avatar_url).then((avatar_url) => {
          if (cancelled) return;
          setProfile((prev) => (prev ? { ...prev, avatar_url } : prev));
        });
        void recordLoginIp();
      } catch (e) {
        console.error("Dashboard load error:", e);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!user?.id || loading || searchParams.get("upgraded") !== "true") return;

    let cancelled = false;
    const sessionId = searchParams.get("session_id");

    const syncPlan = async () => {
      try {
        const res = await fetch("/api/billing/sync-plan", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId || undefined }),
        });
        const data = (await res.json()) as { plan?: string };
        if (cancelled || !res.ok || !data.plan) return;
        const nextPlan = normalizePlan(data.plan);
        setProfile((prev) => (prev ? { ...prev, plan: nextPlan } : prev));
        window.dispatchEvent(
          new CustomEvent("trackit-plan-updated", { detail: { plan: nextPlan } })
        );
      } catch {
        /* retry on next poll */
      }
    };

    void syncPlan();
    const t1 = window.setTimeout(() => void syncPlan(), 2000);
    const t2 = window.setTimeout(() => void syncPlan(), 5000);

    const url = new URL(window.location.href);
    url.searchParams.delete("upgraded");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [user?.id, loading, searchParams]);

  // After returning from Stripe Connect onboarding, land on Payouts so the
  // status route fires (syncs stripe_connect_status) and the card updates.
  useEffect(() => {
    if (!user?.id || loading || searchParams.get("connect") !== "return") return;
    navigate({ view: "payouts" }, { replace: true });
    const url = new URL(window.location.href);
    url.searchParams.delete("connect");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [user?.id, loading, searchParams, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    const check = async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("shopify_store, shopify_access_token")
        .eq("id", user.id)
        .single();
      const shopifyConnected = !!(profile?.shopify_store && profile?.shopify_access_token);

      const { count: creatorsCount } = await supabase
        .from("creators")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const { count: outreachCount } = await supabase
        .from("outreach_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const { count: salesCount } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      setGettingStarted({
        shopify: shopifyConnected,
        shopifyStore: profile?.shopify_store || null,
        creators: (creatorsCount || 0) > 0,
        outreach: (outreachCount || 0) > 0,
        sales: (salesCount || 0) > 0,
        creatorsCount: creatorsCount || 0,
        outreachCount: outreachCount || 0,
        salesCount: salesCount || 0,
      });
    };
    check();
  }, [user?.id]);

  const checkoutCurrency = checkoutCurrencyFromLang(lang);

  const handleUpgradeBasic = useCallback(async () => {
    try {
      await handleUpgrade(getGrowthPriceId(checkoutCurrency));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
  }, [checkoutCurrency]);

  const handleUpgradePro = useCallback(async () => {
    try {
      await handleUpgrade(getProPriceId(checkoutCurrency));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
  }, [checkoutCurrency]);

  const handleUpgradeScale = useCallback(async () => {
    try {
      await handleUpgrade(getScalePriceId(checkoutCurrency));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
  }, [checkoutCurrency]);

  const openWebsitePricing = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = "/pricing?returnTo=%2Fdashboard";
  }, []);

  const handleSidebarAvatarError = () => {
    if (!user || !supabase || avatarRetryRef.current) {
      setAvatarBroken(true);
      return;
    }
    avatarRetryRef.current = true;
    void reloadProfile(user.id);
  };

  useEffect(() => {
    avatarRetryRef.current = false;
    setAvatarBroken(false);
  }, [profile?.avatar_url, profile?.username]);

  useEffect(() => {
    if (!user?.id) return;
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      setAvatarBroken(false);
      if (detail) {
        setProfile((prev) => prev ? {
          ...prev,
          ...(detail.full_name !== undefined ? { full_name: detail.full_name } : {}),
          ...(detail.username !== undefined ? { username: detail.username } : {}),
          ...(detail.avatar_url !== undefined ? { avatar_url: detail.avatar_url } : {}),
        } : prev);
      }
      void reloadProfile(user.id);
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [user?.id, reloadProfile]);

  const sidebarNavEntries = useMemo(
    () => (isCreator ? buildCreatorSidebarNavEntries(lang) : buildSidebarNavEntries(lang, sidebarCounts)),
    [lang, sidebarCounts, isCreator],
  );

  const filteredSidebarNav = sidebarNavEntries;

  useEffect(() => {
    if (view === "discovery" || view === "creators") {
      setSidebarGroupExpanded((prev) => ({ ...prev, discovery: true }));
    }
    if (view === "campaigns" || view === "integrations" || view === "invitations") {
      setSidebarGroupExpanded((prev) => ({ ...prev, campaigns: true }));
    }
    if (view === "payouts" || view === "balance" || view === "transactions") {
      setSidebarGroupExpanded((prev) => ({ ...prev, payouts: true }));
    }
  }, [view]);

  const goToSidebarItem = (targetView: View) => {
    navigate({ view: targetView });
    if (isMobile) setMobileSidebarOpen(false);
  };

  const navigateToDiscovery = () => {
    goToSidebarItem("discovery");
  };

  const navigateToOutreachSend = (creator?: FeedCreator | { username: string; platform: string; email?: string | null }) => {
    const handle = creator ? creatorHandleForOutreach(creator.username) : undefined;
    const creatorEmail = creator?.email?.trim() || undefined;
    setOutreachSendRequest({
      key: Date.now(),
      creatorHandle: handle || undefined,
      creatorEmail,
      dmPlatform: creatorEmail ? "Email" : creator ? dmPlatformFromCreatorPlatform(creator.platform) : undefined,
    });
    navigate({ view: "outreach" });
    if (isMobile) setMobileSidebarOpen(false);
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#FAFAFA" }} />;
  }

  const sidebarWidth = sidebarCollapsed ? 48 : 128;

  const asideStyle: React.CSSProperties = isMobile
    ? {
        width: 280,
        minWidth: 280,
        background: "#FFFFFF",
        borderRight: "1px solid #EFEFEF",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 300,
        transform: mobileSidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        overflow: "hidden",
      }
    : {
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: "#FFFFFF",
        borderRight: "1px solid #EFEFEF",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        transition: "width 0.2s ease",
        overflow: "hidden",
      };

  const renderSidebarNavItems = (items: SidebarNavEntry[], showSectionGap?: boolean) => (
    <>
      {showSectionGap && sidebarCollapsed && items.length > 0 && <div style={{ height: 16 }} />}
      {items.map((item) => {
        if (item.children?.length) {
  return (
            <SidebarNavGroup
              key={item.id}
              collapsed={sidebarCollapsed}
              expanded={sidebarGroupExpanded[item.id] ?? false}
              active={view === item.view || item.children.some((c) => c.view === view)}
              icon={renderSidebarNavIcon(item.iconKey)}
              label={item.label}
              badge={item.badge}
              subItems={item.children}
              parentView={item.view}
              activeView={view}
              onParentClick={() => {
                goToSidebarItem(item.view);
                setSidebarGroupExpanded((prev) => ({ ...prev, [item.id]: true }));
              }}
              onToggleExpand={() => setSidebarGroupExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
              onChildClick={(childView) => goToSidebarItem(childView)}
            />
          );
        }
        return (
          <SidebarItem
            key={item.id}
            collapsed={sidebarCollapsed}
            icon={renderSidebarNavIcon(item.iconKey)}
            label={item.label}
            active={view === item.view}
            badge={item.badge}
            onClick={() => goToSidebarItem(item.view)}
          />
        );
      })}
    </>
  );

  const renderNavSection = (section: Exclude<SidebarNavSection, "footer">, extraTopPadding?: boolean) => {
    const items = filteredSidebarNav.filter((item) => item.section === section);
    if (items.length === 0) return null;
    return <>{renderSidebarNavItems(items, extraTopPadding)}</>;
  };

  return (
    <DashboardNavigationProvider value={navigation}>
    <div style={{ height: "100vh", minHeight: "100vh", background: "#FAFAFA", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", overflow: "hidden" }}>
      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 299 }}
        />
      )}
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          style={{ position: "fixed", top: 14, left: 14, zIndex: 200, background: "#fff", border: "1px solid #EFEFEF", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}
      <aside style={asideStyle}>
        <div
          style={{
            padding: sidebarCollapsed ? "8px 4px" : "8px 8px",
            borderBottom: "1px solid #F5F5F5",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarCollapsed ? "center" : "space-between",
            flexDirection: sidebarCollapsed ? "column" : "row",
            gap: sidebarCollapsed ? 6 : 0,
          }}
        >
          <img
            src={TRACKIT_LOGO_URL}
            alt="Trackit"
            style={{
              height: sidebarCollapsed ? 48 : 58,
              width: "auto",
              maxWidth: sidebarCollapsed ? 48 : 100,
              display: "block",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
          <button type="button" onClick={() => setSidebarCollapsed((c) => !c)} aria-label="Toggle sidebar" style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9A9A", display: "flex", padding: 4, flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d={sidebarCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <nav style={{ flex: 1, padding: "6px 6px", overflowY: "auto" }}>
          {renderNavSection("main")}
          {renderNavSection("tools", true)}
          {renderNavSection("workspace", true)}
        </nav>

        <div
          style={{
            flexShrink: 0,
            padding: sidebarCollapsed ? "8px 4px" : isMobile ? "14px 16px 18px" : "12px 8px 14px",
            borderTop: "1px solid #F5F5F5",
          }}
        >
          <TrackitTagline sidebar collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <main
        className="dashboard-main"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          alignSelf: "stretch",
          overflow: "hidden",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <DashboardTopBar
          lang={lang}
          profile={profile}
          avatarBroken={avatarBroken}
          onAvatarError={handleSidebarAvatarError}
          shopifyConnected={Boolean(shopifyStore ?? profile?.shopify_store)}
          isCreator={isCreator}
          isScale={isScale}
          isPro={isPro}
          isBasic={isBasic}
          userId={user?.id}
          notificationUnread={notificationUnread}
          onNotificationUnreadChange={setNotificationUnread}
          onNavigate={goToSidebarItem}
          onConnectShopify={() => goToSidebarItem("integrations")}
        />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: view === "discovery" ? "hidden" : "auto",
            display: view === "discovery" ? "flex" : "block",
            flexDirection: "column",
          }}
        >
        {creatorAccessRevoked ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isMobile ? "56px 24px 40px" : "48px 40px",
              background: "#FFFFFF",
            }}
          >
            <div style={{ maxWidth: 440, textAlign: "center" }}>
              <h1
                style={{
                  margin: "0 0 12px",
                  fontSize: isMobile ? 22 : 26,
                  fontWeight: 600,
                  color: "#1A1A1A",
                  letterSpacing: "-0.03em",
                }}
              >
                {lang === "fr" ? "Accès désactivé" : "Access deactivated"}
              </h1>
              <p style={{ margin: 0, fontSize: 15, color: "#6B7280", lineHeight: 1.6 }}>
                {formatCreatorDeactivatedMessage(
                  creatorStats?.revokedBrandName ?? creatorStats?.brandName ?? (lang === "fr" ? "La marque" : "The brand"),
                  lang,
                )}
              </p>
            </div>
              </div>
        ) : (
          <>
        {view === "dashboard" && (
          <HomeOverviewView
            isMobile={isMobile}
            isCreator={isCreator}
            fullName={profile?.full_name ?? null}
            username={profile?.username ?? null}
            businessName={profile?.business_name ?? null}
            userId={user?.id}
            gettingStarted={gettingStarted}
            activeCampaigns={sidebarCounts.activeCampaigns}
            onNavigate={goToSidebarItem}
          />
        )}
        {view === "discovery" && (
          <DiscoveryFeed
            isMobile={isMobile}
            plan={plan}
            onUpgrade={openWebsitePricing}
            onReachOut={(creator) => navigateToOutreachSend(creator)}
          />
        )}
        {view === "my-creators" && (
          <MyCreatorsView
            isMobile={isMobile}
            plan={plan}
            onUpgrade={() => {
              if (plan === "free") void handleUpgradeBasic();
              else if (plan === "basic") void handleUpgradePro();
              else void handleUpgradeScale();
            }}
            onReachOut={(creator) => navigateToOutreachSend(creator)}
          />
        )}
        {view === "creators" && (
          <CreatorsView
            isMobile={isMobile}
            plan={plan}
            onReachOut={(creator) => navigateToOutreachSend(creator)}
            onUpgrade={handleUpgradeBasic}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
            userId={user?.id}
          />
        )}
        {view === "campaigns" && user && (
            <CampaignsView
              isMobile={isMobile}
              plan={plan}
              onUpgrade={handleUpgradeBasic}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
              userId={user.id}
              shopifyStore={shopifyStore ?? profile?.shopify_store}
            />
        )}
        {view === "affiliates" && user && (
            <AffiliatesView
              userId={user.id}
              isMobile={isMobile}
              plan={plan}
              onUpgrade={handleUpgradeBasic}
            />
        )}
        {view === "outreach" && (
          <OutreachView
            isMobile={isMobile}
            plan={plan}
            onUpgrade={handleUpgradeBasic}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
            openSendRequest={outreachSendRequest}
            onOpenSendHandled={() => setOutreachSendRequest(null)}
            onNavigateToBilling={() => {
              if (plan === "free") void handleUpgradeBasic();
              else if (plan === "basic") void handleUpgradePro();
              else setView("settings");
            }}
          />
        )}
        {view === "payouts" && user && (
            <PayoutsView
              userId={user.id}
              isMobile={isMobile}
              plan={plan}
              isCreator={isCreator}
              shopifyStore={shopifyStore ?? profile?.shopify_store ?? undefined}
              onConnectShopify={() => setView("integrations")}
              onUpgrade={handleUpgradeBasic}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
            />
        )}
        {view === "balance" && user && (
            <BalanceView
              userId={user.id}
              isMobile={isMobile}
              isCreator={isCreator}
              plan={plan}
              onUpgrade={handleUpgradeScale}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
            />
        )}
        {view === "transactions" && user && (
            <TransactionsView
              userId={user.id}
              isMobile={isMobile}
              isCreator={isCreator}
              plan={plan}
              onUpgrade={handleUpgradeBasic}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
            />
        )}
        {view === "invitations" && user && (
            <InvitationsView
              userId={user.id}
              isMobile={isMobile}
              plan={plan}
              onUpgrade={handleUpgradePro}
            />
        )}
        {view === "scripts" && user && (
          isCreator ? (
            <CreatorScripts userId={user.id} isMobile={isMobile} />
          ) : (
            <div style={{ padding: isMobile ? "56px 16px 16px" : "40px", background: "#FFFFFF", minHeight: "100vh" }}>
              <ScriptsManager
                brandId={user.id}
                isMobile={isMobile}
                standalone
                plan={plan}
                onUpgrade={handleUpgradePro}
              />
        </div>
          )
        )}
        {view === "content" && user && isCreator && (
          <CreatorContent userId={user.id} isMobile={isMobile} />
        )}
        {view === "analytics" && user && (
            <AnalyticsView
              userId={user.id}
              isMobile={isMobile}
              plan={plan}
              isCreator={isCreator}
              shopifyStore={shopifyStore ?? profile?.shopify_store ?? undefined}
              onUpgradePro={handleUpgradePro}
              onConnectShopify={() => setView("integrations")}
            />
        )}
        {view === "integrations" && user && (
            <IntegrationsView
              isMobile={isMobile}
              user={user}
              plan={plan}
              shopifyStore={gettingStarted.shopify ? shopifyStore : null}
              onUpgrade={handleUpgradeBasic}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
            />
        )}
        {view === "notes" && user && (
          <NotesView isMobile={isMobile} userId={user.id} />
        )}
        {view === "automation" && (
            <AutomationView
              isMobile={isMobile}
              plan={plan}
              onUpgrade={handleUpgradeBasic}
              onUpgradePro={handleUpgradePro}
              onUpgradeScale={handleUpgradeScale}
            />
        )}
        {view === "settings" && user && (
          isCreator ? (
            <CreatorSettings userId={user.id} isMobile={isMobile} onSaved={() => void reloadProfile(user.id)} />
          ) : (
            <SettingsView isMobile={isMobile} onProfileUpdate={() => void reloadProfile(user.id)} />
          )
        )}
        {view === "billing" && user && (
          <BillingView isMobile={isMobile} plan={plan} />
        )}
        {view === "feedback" && <FeedbackView isMobile={isMobile} />}
        {view === "help" && <HelpCenterView isMobile={isMobile} plan={plan} />}
          </>
        )}
        </div>
      </main>
      {user && !isCreator && <NewCreatorModal brandId={user.id} />}
    </div>
    </DashboardNavigationProvider>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#FAFAFA" }} />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function PageHeader({ title, subtitle, right, isMobile, dense }: { title: string; subtitle?: string; right?: React.ReactNode; isMobile?: boolean; dense?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: dense ? (isMobile ? 8 : 12) : (isMobile ? 16 : 24), paddingLeft: isMobile ? 16 : 40, background: "#FFFFFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 30 : 32, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{subtitle}</p>}
        </div>
        {right && <div style={{ marginTop: 8, flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  );
}

function ShopifyConnectModal({ onClose, userId, lang }: { onClose: () => void; userId?: string; lang: "en" | "fr" }) {
  const [shopDomain, setShopDomain] = useState("");
  const [token, setToken] = useState("");
  const [shopError, setShopError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!shopDomain.trim()) {
      setShopError(lang === "fr" ? "Entrez le nom de votre boutique" : "Please enter your store name");
      return;
    }
    if (!token.trim()) {
      setShopError(lang === "fr" ? "Collez votre token d'API Admin" : "Paste your Admin API token");
      return;
    }
    setShopError("");
    let name = shopDomain.trim().toLowerCase();
    name = name.replace(/^https?:\/\//, "");
    name = name.replace(/\.myshopify\.com.*/, "");
    name = name.replace(/\..*/, "");
    name = name.replace(/[^a-z0-9-]/g, "");
    const domain = `${name}.myshopify.com`;

    setLoading(true);
    try {
      const res = await fetch("/api/shopify/connect-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId || "", shop: domain, accessToken: token.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; shopName?: string };
      if (!res.ok || !payload.ok) {
        setShopError(payload.error || (lang === "fr" ? "Connexion echouee" : "Connection failed"));
        setLoading(false);
        return;
      }
      setDone(payload.shopName || domain);
      setLoading(false);
      setTimeout(() => { window.location.reload(); }, 1200);
    } catch {
      setShopError(lang === "fr" ? "Erreur reseau" : "Network error");
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, maxWidth: 460, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <img src="/shopify-logo.svg" alt="Shopify" width={44} height={50} style={{ display: "block" }} />
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontFamily: "inherit", fontSize: 18, color: "#7A7A7A", lineHeight: 1 }}>×</button>
          </div>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {lang === "fr" ? "Connecter Shopify" : "Connect Shopify"}
        </h3>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
          {lang === "fr"
            ? "Creez une app personnalisee dans Shopify Admin (Parametres - Applications et canaux de vente - Developper des apps), activez l'API Admin avec read_orders, et collez le domaine + le token ci-dessous."
            : "Create a custom app in Shopify Admin (Settings - Apps and sales channels - Develop apps), enable the Admin API with read_orders, then paste the domain + token below."}
        </p>
        {done ? (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#15803D", margin: 0, fontWeight: 600 }}>
              {lang === "fr" ? `Connecte a ${done}` : `Connected to ${done}`}
            </p>
          </div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6, letterSpacing: "-0.01em" }}>
              {lang === "fr" ? "Domaine de la boutique" : "Store domain"}
            </label>
            <input
              type="text"
              value={shopDomain}
              onChange={(e) => { setShopDomain(e.target.value); setShopError(""); }}
              placeholder="votreboutique.myshopify.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", color: "#1A1A1A", marginBottom: 14 }}
              autoFocus
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6, letterSpacing: "-0.01em" }}>
              {lang === "fr" ? "Token d'API Admin" : "Admin API token"}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setShopError(""); }}
              placeholder="shpat_..."
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", color: "#1A1A1A", marginBottom: 16 }}
            />
            {shopError && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 12px" }}>{shopError}</p>}
            <button type="button" className="hero-cta-shopify-dark" onClick={handleConnect} disabled={loading} style={{ width: "100%", justifyContent: "center", opacity: loading ? 0.6 : 1 }}>
            <img src="/shopify-logo.svg" alt="" width={20} height={23} style={{ display: "block", flexShrink: 0 }} />
              {loading ? (lang === "fr" ? "Verification..." : "Verifying...") : (lang === "fr" ? "Connecter Shopify" : "Connect Shopify")}
          </button>
          </>
        )}
        </div>
    </div>
  );
}

type OutreachPanel = "import" | "importCsv" | "create" | "send" | "seeTemplates" | null;

type OutreachTemplate = {
  id: string;
  name: string;
  subject: string;
  opening: string;
  body: string;
  cta: string;
  imported?: boolean;
};

const OUTREACH_DM_PLATFORMS = ["Instagram", "TikTok", "Twitter", "Email"] as const;

type OutreachSendRequest = {
  key: number;
  creatorHandle?: string;
  creatorEmail?: string;
  dmPlatform?: (typeof OUTREACH_DM_PLATFORMS)[number];
};

function dmPlatformFromCreatorPlatform(platform: string): (typeof OUTREACH_DM_PLATFORMS)[number] {
  const p = platform.toLowerCase();
  if (p.includes("tiktok")) return "TikTok";
  if (p.includes("twitter") || p === "x") return "Twitter";
  if (p.includes("email")) return "Email";
  return "Instagram";
}

function creatorHandleForOutreach(username: string): string {
  const clean = username.replace(/^@/, "").trim();
  return clean ? `@${clean}` : "";
}

function defaultOutreachDraftMessage(lang: "en" | "fr"): string {
  return lang === "fr"
    ? "Salut {{name}} 👋\n\nJe suis tombé sur ton contenu et j'aimerais te proposer une collaboration. Tu serais partant pour en discuter ?"
    : "Hey {{name}} 👋\n\nI came across your content and would love to explore a collaboration. Open to chatting?";
}

function defaultEmailOutreachFields(lang: "en" | "fr"): OutreachMessageFields {
  return {
    subject: lang === "fr" ? "Partenariat avec {{brand}}" : "Partnership with {{brand}}",
    opening: "",
    body:
      lang === "fr"
        ? "Bonjour {{name}},\n\nJe suis tombé sur ton contenu et j'aimerais te proposer une collaboration. Tu serais partante pour en discuter ?"
        : "Hi {{name}},\n\nI came across your content and would love to explore a collaboration. Open to chatting?",
    cta: "",
  };
}

function emailBodyFromFields(fields: OutreachMessageFields, name = "there") {
  const main = messageFromTemplate(fields);
  return buildOutreachPreview(main, fields.cta, name);
}

function outreachProfileUrl(
  platform: (typeof OUTREACH_DM_PLATFORMS)[number],
  handle: string,
  options?: { subject?: string; body?: string },
): string | null {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return null;

  if (platform === "Instagram") {
    return `https://www.instagram.com/direct/new/?username=${encodeURIComponent(clean)}`;
  }
  if (platform === "TikTok") {
    return `https://www.tiktok.com/@${encodeURIComponent(clean)}`;
  }
  if (platform === "Twitter") {
    return `https://twitter.com/${encodeURIComponent(clean)}`;
  }
  if (platform === "Email") {
    const subject = options?.subject ?? "";
    const body = options?.body ?? "";
    return buildOutreachMailtoUrl({ recipients: [clean], subject, body });
  }
  return null;
}

const INITIAL_OUTREACH_TEMPLATES: OutreachTemplate[] = [];

function messageFromTemplate(t: Pick<OutreachTemplate, "subject" | "opening" | "body">) {
  const parts = [t.opening, t.body].map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0) return parts.join("\n\n");
  return t.subject.trim();
}

type OutreachMessageFields = Pick<OutreachTemplate, "subject" | "opening" | "body" | "cta">;

function outreachFieldsFromMessage(message: string, cta = ""): OutreachMessageFields {
  return { subject: "", opening: "", body: message.trim(), cta: cta.trim() };
}

function templateHasStructuredFields(fields: OutreachMessageFields) {
  return !!(fields.subject.trim() || fields.cta.trim() || (fields.opening.trim() && fields.body.trim()));
}

function previewFromFields(fields: OutreachMessageFields, name = "there") {
  const main = messageFromTemplate(fields);
  return buildOutreachPreview(main, fields.cta, name);
}

function buildOutreachPreview(message: string, cta: string, name = "there") {
  const personalized = (text: string) => personalizeOutreachText(text, name).replace(/\{\{brand\}\}/gi, "your brand");
  return [personalized(message.trim()), personalized(cta.trim())].filter(Boolean).join("\n\n");
}

function outreachCreatorName(handle?: string) {
  return handle?.replace(/^@/, "").trim() || "";
}

function personalizeOutreachText(text: string, creatorName: string) {
  if (!creatorName) return text;
  return text.replace(/\{\{name\}\}/gi, creatorName);
}

function depersonalizeOutreachText(text: string, creatorName: string) {
  if (!creatorName) return text;
  const escaped = creatorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "{{name}}");
}

function personalizeOutreachFields(fields: OutreachMessageFields, creatorName: string): OutreachMessageFields {
  if (!creatorName) return fields;
  return {
    subject: personalizeOutreachText(fields.subject, creatorName),
    opening: personalizeOutreachText(fields.opening, creatorName),
    body: personalizeOutreachText(fields.body, creatorName),
    cta: personalizeOutreachText(fields.cta, creatorName),
  };
}

function depersonalizeOutreachFields(fields: OutreachMessageFields, creatorName: string): OutreachMessageFields {
  if (!creatorName) return fields;
  return {
    subject: depersonalizeOutreachText(fields.subject, creatorName),
    opening: depersonalizeOutreachText(fields.opening, creatorName),
    body: depersonalizeOutreachText(fields.body, creatorName),
    cta: depersonalizeOutreachText(fields.cta, creatorName),
  };
}

function OutreachMessageEditor({
  lang,
  value,
  onChange,
  creatorName = "",
  layout = "panel",
}: {
  lang: "en" | "fr";
  value: OutreachMessageFields;
  onChange: (next: OutreachMessageFields) => void;
  creatorName?: string;
  layout?: OutreachFormLayout;
}) {
  const styles = outreachFormStyles(layout);
  const [detailed, setDetailed] = useState(() => templateHasStructuredFields(value));
  const display = personalizeOutreachFields(value, creatorName);

  const updateFields = (next: OutreachMessageFields) => {
    onChange(depersonalizeOutreachFields(next, creatorName));
  };

  const toggleDetailed = () => {
    if (detailed) {
      const merged = [messageFromTemplate(display), display.cta].filter(Boolean).join("\n\n");
      updateFields({ subject: "", opening: "", body: merged, cta: "" });
      setDetailed(false);
      return;
    }
    const body = value.body.trim();
    const opening = value.opening.trim() || (body ? body.split("\n\n")[0] ?? "" : "Hey {{name}},");
    const rest = value.opening.trim()
      ? body
      : body.includes("\n\n")
        ? body.split("\n\n").slice(1).join("\n\n")
        : "";
    updateFields({ subject: value.subject, opening, body: rest, cta: value.cta });
    setDetailed(true);
  };

  const setField = <K extends keyof OutreachMessageFields>(key: K, next: OutreachMessageFields[K]) => {
    updateFields({ ...display, [key]: next });
  };

  return (
    <div style={{ marginBottom: layout === "page" ? styles.sectionGap : 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: layout === "page" ? 10 : 6 }}>
        <label style={{ ...styles.fieldLabel, margin: 0 }}>{lang === "fr" ? "Outreach" : "Outreach"}</label>
        <button
          type="button"
          className={layout === "page" ? "hero-cta-shopify-light hero-cta-compact" : "hero-cta-shopify-light hero-cta-compact-sm"}
          onClick={toggleDetailed}
          style={{ flexShrink: 0 }}
        >
          {detailed
            ? lang === "fr"
              ? "Mode simple"
              : "Simple mode"
            : lang === "fr"
              ? "Structure avancée"
              : "Advanced structure"}
        </button>
              </div>

      {creatorName ? (
        <p style={{ fontSize: layout === "page" ? 13 : 11, color: "#6B7280", margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? `Personnalisé pour @${creatorName}` : `Personalized for @${creatorName}`}
        </p>
      ) : null}

      {!detailed ? (
        <textarea
          value={[messageFromTemplate(display), display.cta].filter(Boolean).join("\n\n")}
          onChange={(e) => updateFields(outreachFieldsFromMessage(e.target.value))}
          rows={layout === "page" ? 14 : 12}
          placeholder={lang === "fr" ? "Écrivez votre outreach ici…" : "Write your outreach here…"}
          style={styles.message}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: layout === "page" ? 18 : 14 }}>
          <div>
            <label style={{ display: "block", ...styles.fieldLabel }}>{lang === "fr" ? "Sujet" : "Subject"}</label>
            <input
              type="text"
              value={display.subject}
              onChange={(e) => setField("subject", e.target.value)}
              placeholder={lang === "fr" ? "Partenariat avec {{brand}}" : "Partnership with {{brand}}"}
              style={styles.input}
            />
            </div>
          <div>
            <label style={{ display: "block", ...styles.fieldLabel }}>{lang === "fr" ? "Introduction" : "Opening"}</label>
            <textarea
              value={display.opening}
              onChange={(e) => setField("opening", e.target.value)}
              rows={3}
              placeholder="Hey {{name}},"
              style={{ ...styles.input, resize: "vertical", lineHeight: 1.5 }}
            />
        </div>
          <div>
            <label style={{ display: "block", ...styles.fieldLabel }}>{lang === "fr" ? "Corps principal" : "Main body"}</label>
            <textarea
              value={display.body}
              onChange={(e) => setField("body", e.target.value)}
              rows={layout === "page" ? 8 : 6}
              placeholder={lang === "fr" ? "Votre pitch…" : "Your pitch…"}
              style={{ ...styles.input, resize: "vertical", lineHeight: 1.5 }}
            />
      </div>
          <div>
            <label style={{ display: "block", ...styles.fieldLabel }}>{lang === "fr" ? "Appel à l'action" : "Call to action"}</label>
            <input
              type="text"
              value={display.cta}
              onChange={(e) => setField("cta", e.target.value)}
              placeholder={lang === "fr" ? "Seriez-vous ouvert à un échange rapide ?" : "Would you be open to a quick chat?"}
              style={styles.input}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OutreachEmailEditor({
  lang,
  value,
  onChange,
  creatorName = "",
  layout = "panel",
}: {
  lang: "en" | "fr";
  value: OutreachMessageFields;
  onChange: (next: OutreachMessageFields) => void;
  creatorName?: string;
  layout?: OutreachFormLayout;
}) {
  const styles = outreachFormStyles(layout);
  const display = personalizeOutreachFields(value, creatorName);

  const updateFields = (next: OutreachMessageFields) => {
    onChange(depersonalizeOutreachFields(next, creatorName));
  };

  const setField = <K extends keyof OutreachMessageFields>(key: K, next: OutreachMessageFields[K]) => {
    updateFields({ ...display, [key]: next });
  };

  return (
    <div style={{ marginBottom: layout === "page" ? styles.sectionGap : 16 }}>
      <label style={{ display: "block", ...styles.fieldLabel }}>
        {lang === "fr" ? "Objet" : "Subject"}
      </label>
      <input
        type="text"
        value={display.subject}
        onChange={(e) => setField("subject", e.target.value)}
        placeholder={lang === "fr" ? "Partenariat avec {{brand}}" : "Partnership with {{brand}}"}
        style={{ ...styles.input, fontWeight: 500, marginBottom: 16 }}
      />

      {creatorName ? (
        <p style={{ fontSize: layout === "page" ? 13 : 11, color: "#6B7280", margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? `Personnalisé pour @${creatorName}` : `Personalized for @${creatorName}`}
        </p>
      ) : null}

      <label style={{ display: "block", ...styles.fieldLabel }}>
        {lang === "fr" ? "Message" : "Message"}
      </label>
      <textarea
        value={display.body}
        onChange={(e) => setField("body", e.target.value)}
        rows={layout === "page" ? 16 : 14}
        placeholder={lang === "fr" ? "Rédigez votre email ici…" : "Write your email here…"}
        style={styles.message}
      />
    </div>
  );
}

const panelInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
};

const panelMessageStyle: React.CSSProperties = {
  ...panelInputStyle,
  resize: "vertical",
  minHeight: 240,
  lineHeight: 1.55,
};

const btnPrimary: React.CSSProperties = { background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };
const btnSecondary: React.CSSProperties = { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };

const outreachFieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  fontSize: 15,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFF",
  outline: "none",
};

const outreachMessageStyle: React.CSSProperties = {
  ...outreachFieldInput,
  resize: "vertical",
  minHeight: 200,
  lineHeight: 1.55,
};

const outreachPagePrimaryBtn: React.CSSProperties = {
  ...btnPrimary,
  padding: "12px 20px",
  fontSize: 15,
  borderRadius: 10,
};

const outreachPageSecondaryBtn: React.CSSProperties = {
  ...btnSecondary,
  padding: "12px 20px",
  fontSize: 15,
  borderRadius: 10,
};

type OutreachFormLayout = "panel" | "page";

function outreachFormStyles(layout: OutreachFormLayout) {
  if (layout === "page") {
    return {
      sectionTitle: { fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 } as React.CSSProperties,
      sectionHint: { fontSize: 14, color: "#6B7280", margin: "0 0 12px", lineHeight: 1.5, letterSpacing: "-0.01em" } as React.CSSProperties,
      fieldLabel: { fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 } as React.CSSProperties,
      subtleLabel: { fontSize: 13, fontWeight: 500, color: "#6B7280", marginBottom: 8 } as React.CSSProperties,
      input: outreachFieldInput,
      message: outreachMessageStyle,
      sectionGap: 32,
      pill: {
        ...btnSecondary,
        padding: "11px 18px",
        fontSize: 14,
        minHeight: 42,
        lineHeight: 1.25,
      } as React.CSSProperties,
    };
  }
  return {
    sectionTitle: { fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 } as React.CSSProperties,
    sectionHint: { fontSize: 13, color: "#7A7A7A", margin: "0 0 8px", lineHeight: 1.45 } as React.CSSProperties,
    fieldLabel: { fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 } as React.CSSProperties,
    subtleLabel: { fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 } as React.CSSProperties,
    input: panelInputStyle,
    message: panelMessageStyle,
    sectionGap: 20,
    pill: { ...btnSecondary, padding: "6px 12px", fontSize: 12 } as React.CSSProperties,
  };
}

function newTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function OutreachPanelShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000 }} onClick={onClose} aria-hidden />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "#FFFFFF",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.1)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid #EFEFEF", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>{title}</h2>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.45 }}>{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} style={{ ...iconBtn, flexShrink: 0 }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
          </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #EFEFEF" }}>{footer}</div>}
      </aside>
    </>
  );
}


function OutreachHeaderActions({
  lang,
  onSend,
  onSeeTemplates,
  onImportTemplate,
  onImportCsv,
  onCreateTemplate,
}: {
  lang: "en" | "fr";
  onSend: () => void;
  onSeeTemplates: () => void;
  onImportTemplate: () => void;
  onImportCsv: () => void;
  onCreateTemplate: () => void;
}) {
  return (
    <SplitHeaderActions
      variant="white"
      primaryLabel={lang === "fr" ? "Contacter" : "Contact"}
      onPrimaryClick={onSend}
      sectionLabel={lang === "fr" ? "Modèles" : "Templates"}
      menuAriaLabel={lang === "fr" ? "Plus d'actions" : "More actions"}
      menuItems={[
        {
          label: lang === "fr" ? "Voir les modèles" : "See templates",
          onClick: onSeeTemplates,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M4 8l8 5 8-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          ),
        },
        {
          label: lang === "fr" ? "Importer un modèle" : "Import template",
          onClick: onImportTemplate,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 16V4M12 4l4 4M12 4L8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ),
        },
        {
          label: lang === "fr" ? "Import CSV" : "Import CSV",
          onClick: onImportCsv,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ),
        },
        {
          label: lang === "fr" ? "Créer un modèle" : "Create template",
          onClick: onCreateTemplate,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ),
        },
      ]}
    />
  );
}


function OutreachView({
  plan,
  onNavigateToBilling,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  openSendRequest,
  onOpenSendHandled,
}: {
  plan: PlanTier;
  onNavigateToBilling: () => void;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  openSendRequest?: OutreachSendRequest | null;
  onOpenSendHandled?: () => void;
}) {
  const lang = useLang();
  const [templates, setTemplates] = useState<OutreachTemplate[]>(INITIAL_OUTREACH_TEMPLATES);
  const [panel, setPanel] = useState<OutreachPanel>(null);
  const [sendTemplateId, setSendTemplateId] = useState<string | null>(null);
  const [sendPrefill, setSendPrefill] = useState<{
    creatorHandle?: string;
    creatorEmail?: string;
    dmPlatform?: (typeof OUTREACH_DM_PLATFORMS)[number];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const runFeatureUpgrade = (key: GateFeatureKey) => {
    runGateUpgrade(key, lang, { onUpgrade, onUpgradePro, onUpgradeScale });
  };

  const closePanel = () => {
    setPanel(null);
    setSendPrefill(null);
  };

  useEffect(() => {
    if (!openSendRequest) return;
    const platformRaw = openSendRequest.dmPlatform as string | undefined;
    const platform =
      platformRaw === "YouTube"
        ? "TikTok"
        : (openSendRequest.dmPlatform as (typeof OUTREACH_DM_PLATFORMS)[number] | undefined);
    setSendTemplateId(null);
    setSendPrefill({
      creatorHandle: openSendRequest.creatorHandle,
      creatorEmail: openSendRequest.creatorEmail,
      dmPlatform: platform,
    });
    setPanel("send");
    onOpenSendHandled?.();
  }, [openSendRequest, onOpenSendHandled]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const addTemplate = (t: Omit<OutreachTemplate, "id"> & { id?: string }) => {
    setTemplates((list) => [...list, { ...t, id: t.id ?? newTemplateId() }]);
  };

  const openSendWithTemplate = (templateId: string) => {
    setSendTemplateId(templateId);
    setPanel("send");
  };

  return (
    <>
      <PageHeader isMobile={isMobile} dense title="Outreach" subtitle={lang === "fr" ? "Rédigez des outreach personnalisés et gérez les relances automatiquement" : "Send personalized outreach and manage follow-ups automatically"} right={
        <OutreachHeaderActions
          lang={lang}
          onSend={() => { setSendTemplateId(null); setPanel("send"); }}
          onSeeTemplates={() => {
            if (!canImportTemplates(plan)) {
              setUpgradeFeature("templates");
              return;
            }
            setPanel("seeTemplates");
          }}
          onImportTemplate={() => {
            if (!canImportTemplates(plan)) {
              setUpgradeFeature("templates");
              return;
            }
            setPanel("import");
          }}
          onImportCsv={() => {
            if (!canBulkImportTemplatesCsv(plan)) {
              setUpgradeFeature("bulk-import");
              return;
            }
            setPanel("importCsv");
          }}
          onCreateTemplate={() => {
            if (!canCreateTemplates(plan)) {
              setUpgradeFeature("templates");
              return;
            }
            setPanel("create");
          }}
        />
      } />
      <div style={{ padding: isMobile ? "0 16px 16px" : "0 40px 40px" }}>
        {toast && (
          <div style={{ background: "rgba(0,71,255,0.08)", border: "1px solid rgba(0,71,255,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
            {toast}
        </div>
        )}

        <OutreachHistorySection
          isMobile={isMobile}
          plan={plan}
          onNavigateToBilling={onNavigateToBilling}
          onUpgrade={onUpgrade}
          onUpgradePro={onUpgradePro}
          onUpgradeScale={onUpgradeScale}
          refreshKey={historyRefreshKey}
        />
          </div>

      {panel === "import" && (
        <ImportTemplatePanel
          onClose={closePanel}
          onImport={(t) => {
            addTemplate({ ...t, imported: true });
            showToast(`Imported template "${t.name}"`);
            closePanel();
          }}
        />
      )}
      {panel === "importCsv" && (
        <BulkImportTemplatesPanel
          onClose={closePanel}
          onImportMany={(items) => {
            items.forEach((t) => addTemplate({ ...t, imported: true }));
            showToast(lang === "fr" ? `${items.length} modèles importés ✓` : `${items.length} templates imported ✓`);
            closePanel();
          }}
        />
      )}
      {panel === "create" && (
        <CreateTemplatePanel
          onClose={closePanel}
          onSave={(t) => {
            addTemplate(t);
            showToast(`Template "${t.name}" saved`);
            closePanel();
          }}
        />
      )}
      {panel === "seeTemplates" && (
        <SeeTemplatesPanel
          templates={templates}
          onClose={closePanel}
          onUse={(id) => openSendWithTemplate(id)}
          onCreate={() => setPanel("create")}
        />
      )}
      <SendOutreachPanel
        open={panel === "send"}
        templates={templates}
        plan={plan}
        isMobile={isMobile}
        initialTemplateId={sendTemplateId}
        initialCreatorHandle={sendPrefill?.creatorHandle}
        initialCreatorEmail={sendPrefill?.creatorEmail}
        initialDmPlatform={sendPrefill?.dmPlatform}
        onClose={closePanel}
        onSent={() => {
          setHistoryRefreshKey((k) => k + 1);
          closePanel();
          showToast(
            lang === "fr" ? "Outreach enregistré dans l'historique" : "Outreach saved to history",
          );
        }}
      />
      {upgradeFeature && (
        <UpgradeModal
          lang={lang}
          featureKey={upgradeFeature}
          onClose={() => setUpgradeFeature(null)}
          onPrimary={() => {
            runFeatureUpgrade(upgradeFeature);
            setUpgradeFeature(null);
          }}
        />
      )}
    </>
  );
}

function ImportTemplatePanel({ onClose, onImport }: { onClose: () => void; onImport: (t: Omit<OutreachTemplate, "id" | "imported">) => void }) {
  const lang = useLang();
  const [raw, setRaw] = useState("");
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteHint("Clipboard is empty");
        setTimeout(() => setPasteHint(null), 2500);
        return;
      }
      setRaw(text);
      setPasteHint("Pasted from clipboard");
      setTimeout(() => setPasteHint(null), 2500);
    } catch {
      setPasteHint("Allow clipboard access to paste");
      setTimeout(() => setPasteHint(null), 2500);
    }
  };

  const parseAndImport = () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    let subject = "";
    let opening = "";
    let body = trimmed;
    let cta = "";
    const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/im);
    if (subjectMatch) subject = subjectMatch[1].trim();
    const blocks = trimmed.split(/\n\n+/);
    if (blocks.length >= 3) {
      opening = blocks[0].replace(/^Subject:.*\n?/im, "").trim();
      body = blocks.slice(1, -1).join("\n\n").trim();
      cta = blocks[blocks.length - 1].trim();
    } else if (blocks.length === 2) {
      opening = blocks[0].replace(/^Subject:.*\n?/im, "").trim();
      cta = blocks[1].trim();
      body = "";
    }
    const firstLine = trimmed.split("\n").find((l) => l.trim() && !/^Subject:/i.test(l))?.trim() ?? trimmed.split("\n")[0]?.trim();
    const name = (subject || firstLine || "Imported template").slice(0, 48);
    onImport({ name, subject, opening, body, cta });
  };

  return (
    <OutreachPanelShell
      title={lang === "fr" ? "Importer un modèle" : "Import template"}
      subtitle={lang === "fr" ? "Collez votre outreach depuis n'importe où — nous le transformerons en modèle réutilisable." : "Paste your outreach from anywhere — we'll turn it into a reusable template."}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: raw.trim() ? 1 : 0.45 }} disabled={!raw.trim()} onClick={parseAndImport}>{lang === "fr" ? "Importer le modèle" : "Import template"}</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A" }}>{lang === "fr" ? "Outreach" : "Outreach"}</label>
        <button type="button" onClick={() => void handlePaste()} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.7"/></svg>
          {lang === "fr" ? "Coller" : "Paste"}
        </button>
      </div>
      {pasteHint && <div style={{ fontSize: 11, color: pasteHint.includes("Pasted") ? "#1FB567" : "#7A7A7A", marginBottom: 8 }}>{pasteHint}</div>}
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Click Paste to add your template from the clipboard…"
        rows={16}
        readOnly={!raw}
        style={{ ...panelInputStyle, resize: "vertical", minHeight: 280, lineHeight: 1.5, background: raw ? "#FFFFFF" : "#FAFAFA" }}
      />
    </OutreachPanelShell>
  );
}

function BulkImportTemplatesPanel({
  onClose,
  onImportMany,
}: {
  onClose: () => void;
  onImportMany: (items: Omit<OutreachTemplate, "id" | "imported">[]) => void;
}) {
  const lang = useLang();
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseCsv = (text: string): Omit<OutreachTemplate, "id" | "imported">[] => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (key: string) => headers.indexOf(key);
    const nameI = idx("name");
    const subjectI = idx("subject");
    const openingI = idx("opening");
    const bodyI = idx("body");
    const ctaI = idx("cta");
    if (bodyI === -1 && openingI === -1) return [];
    return lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const name = nameI >= 0 ? cols[nameI] : "";
      const subject = subjectI >= 0 ? cols[subjectI] : "";
      const opening = openingI >= 0 ? cols[openingI] : "";
      const body = bodyI >= 0 ? cols[bodyI] : "";
      const cta = ctaI >= 0 ? cols[ctaI] : "";
      const fallbackName = name || subject || opening || body.slice(0, 40) || "Imported template";
      return { name: fallbackName.slice(0, 48), subject, opening, body, cta };
    }).filter((t) => t.opening.trim() || t.body.trim());
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const items = parseCsv(text);
      if (items.length === 0) {
        setError(lang === "fr" ? "CSV invalide. Colonnes requises : name, subject, opening, body, cta" : "Invalid CSV. Required columns: name, subject, opening, body, cta");
        return;
      }
      onImportMany(items);
    };
    reader.readAsText(file);
  };

  return (
    <OutreachPanelShell
      title={lang === "fr" ? "Import CSV en masse" : "Bulk CSV import"}
      subtitle={lang === "fr" ? "Importez plusieurs modèles depuis un fichier CSV." : "Import multiple templates from a CSV file."}
      onClose={onClose}
    >
      <div
        style={{ border: "2px dashed #E5E5E5", borderRadius: 12, padding: 32, textAlign: "center", background: "#FAFAFA", marginBottom: 12 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <p style={{ fontSize: 14, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Glissez votre CSV ici" : "Drag and drop your CSV"}</p>
        <label style={{ fontSize: 13, color: "#0047FF", cursor: "pointer" }}>
          {lang === "fr" ? "ou parcourir" : "or browse"}
          <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        </label>
        {fileName && <p style={{ fontSize: 12, color: "#7A7A7A", marginTop: 12 }}>{fileName}</p>}
        </div>
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: 0 }}>Columns: name, subject, opening, body, cta</p>
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>{error}</p>}
    </OutreachPanelShell>
  );
}

function CreateTemplatePanel({ onClose, onSave }: { onClose: () => void; onSave: (t: Omit<OutreachTemplate, "id" | "imported">) => void }) {
  const lang = useLang();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<OutreachMessageFields>(outreachFieldsFromMessage("Hey {{name}},\n\n"));
  const hasMessage = !!(fields.opening.trim() || fields.body.trim() || fields.subject.trim());

  return (
    <OutreachPanelShell
      title={lang === "fr" ? "Créer un modèle" : "Create template"}
      subtitle={lang === "fr" ? "Écrivez votre outreach en un bloc, ou utilisez la structure avancée pour détailler chaque section." : "Write your outreach in one block, or use advanced structure to split each section."}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            style={{ ...btnPrimary, width: "100%", opacity: name.trim() && hasMessage ? 1 : 0.45 }}
            disabled={!name.trim() || !hasMessage}
            onClick={() => onSave({ name: name.trim(), ...fields })}
          >
            {lang === "fr" ? "Sauvegarder le modèle" : "Save template"}
          </button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
            </div>
      }
    >
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Nom du modèle" : "Template name"}</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "fr" ? "Intro collaboration" : "Collab intro"} style={{ ...panelInputStyle, marginBottom: 16 }} />
      <OutreachMessageEditor key="create-template" lang={lang} value={fields} onChange={setFields} />
    </OutreachPanelShell>
  );
}

function SeeTemplatesPanel({
  templates,
  onClose,
  onUse,
  onCreate,
}: {
  templates: OutreachTemplate[];
  onClose: () => void;
  onUse: (id: string) => void;
  onCreate: () => void;
}) {
  const lang = useLang();
  const templateDisplayName = (name: string) =>
    name === "Collab intro" ? (lang === "fr" ? "Intro collaboration" : "Collab intro") : name;

  return (
    <OutreachPanelShell title={lang === "fr" ? "Modèles" : "Templates"} subtitle={lang === "fr" ? "Vos modèles d'outreach sauvegardés et importés." : "Your saved and imported outreach templates."} onClose={onClose}>
      {templates.length === 0 ? (
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>
          {lang === "fr"
            ? "Aucun modèle pour le moment. Créez-en un ou importez-en un pour commencer."
            : "No templates yet. Create or import one to get started."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 14, background: "#FAFAFA" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{templateDisplayName(t.name)}</div>
                  {t.imported && (
                    <span style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2, display: "block" }}>
                      {lang === "fr" ? "Importé" : "Imported"}
                    </span>
                  )}
            </div>
                <button type="button" style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }} onClick={() => onUse(t.id)}>{lang === "fr" ? "Utiliser" : "Use"}</button>
            </div>
              <div style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.45, maxHeight: 72, overflow: "hidden", whiteSpace: "pre-wrap" }}>
                {buildOutreachPreview(messageFromTemplate(t), t.cta)}
          </div>
              </div>
            ))}
          </div>
          )}
      <button type="button" style={{ ...btnSecondary, width: "100%", marginTop: 20 }} onClick={onCreate}>{lang === "fr" ? "+ Créer un modèle" : "+ Create template"}</button>
    </OutreachPanelShell>
  );
}

function InfluencerPicker({
  selected,
  onChange,
  layout = "panel",
  emailMode = false,
  emailMap = {},
  avatarMap = {},
}: {
  selected: string[];
  onChange: (handles: string[]) => void;
  layout?: OutreachFormLayout;
  emailMode?: boolean;
  emailMap?: Record<string, string>;
  avatarMap?: Record<string, string>;
}) {
  const lang = useLang();
  const styles = outreachFormStyles(layout);
  const [influencers, setInfluencers] = useState<{ handle: string; platform: string; avatarUrl: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await getSavedCreators(user.id);
      setInfluencers(
        data.map((c) => ({
          handle: `@${String(c.handle ?? c.username ?? "").replace(/^@/, "")}`,
          platform: String(c.platform ?? ""),
          avatarUrl: String(c.avatar_url ?? "").trim(),
        }))
      );
    };
    void load();
  }, []);

  const toggle = (handle: string) => {
    onChange(selected.includes(handle) ? selected.filter((h) => h !== handle) : [...selected, handle]);
  };

  const creatorsWithEmail = influencers.filter((inf) => resolveCreatorEmail(inf.handle, emailMap));
  const selectableInfluencers = emailMode ? creatorsWithEmail : influencers;

  if (influencers.length === 0 && selected.length === 0) {
    return (
      <div style={{ padding: layout === "page" ? 20 : 16, borderRadius: 10, border: "1px dashed #E5E5E5", fontSize: layout === "page" ? 14 : 13, color: "#6B7280", textAlign: "center", lineHeight: 1.5 }}>
        {lang === "fr" ? "Aucun créateur sauvegardé. Ajoutez-en depuis Découverte ou Créateurs." : "No saved creators yet. Add creators from Discovery or Creators."}
        </div>
    );
  }

  const extraSelected = selected.filter((handle) => !influencers.some((inf) => inf.handle === handle));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: layout === "page" ? 10 : 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={styles.subtleLabel}>{lang === "fr" ? "Influenceurs" : "Influencers"}</span>
        {selectableInfluencers.length > 0 && (
          <button
            type="button"
            style={{ fontSize: layout === "page" ? 13 : 11, color: "#0047FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onClick={() =>
              onChange(
                selected.length === selectableInfluencers.length
                  ? []
                  : selectableInfluencers.map((i) => i.handle),
              )
            }
          >
            {selected.length === selectableInfluencers.length
              ? lang === "fr"
                ? "Tout désélectionner"
                : "Clear all"
              : emailMode
                ? lang === "fr"
                  ? "Sélectionner avec email"
                  : "Select with email"
                : lang === "fr"
                  ? "Tout sélectionner"
                  : "Select all"}
          </button>
        )}
          </div>
      {extraSelected.map((handle) => (
        <div
          key={handle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: layout === "page" ? "14px 16px" : "12px 14px",
            borderRadius: 10,
            ...selectionCardStyle(true),
          }}
        >
          <CreatorAvatar
            username={handle}
            displayName={handle}
            src={avatarUrlForCreatorHandle(handle, avatarMap)}
            size={layout === "page" ? 40 : 32}
            alt={handle}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: layout === "page" ? 14 : 13, fontWeight: 500, color: "#FFFFFF" }}>{handle}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{lang === "fr" ? "Sélectionné" : "Selected"}</div>
        </div>
          <button
            type="button"
            onClick={() => onChange(selected.filter((h) => h !== handle))}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
          >
            {lang === "fr" ? "Retirer" : "Remove"}
          </button>
          </div>
      ))}
      {influencers.map((inf) => {
        const on = selected.includes(inf.handle);
        const email = resolveCreatorEmail(inf.handle, emailMap);
        const missingEmail = emailMode && !email;
        return (
          <button
            key={inf.handle}
            type="button"
            onClick={() => !missingEmail && toggle(inf.handle)}
            disabled={missingEmail}
                  style={{
                    display: "flex",
                    alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              ...selectionCardStyle(on, { unselectedBackground: "#FFFFFF" }),
              cursor: missingEmail ? "not-allowed" : "pointer",
              opacity: missingEmail ? 0.55 : 1,
              fontFamily: "inherit",
              textAlign: "left",
              width: "100%",
            }}
          >
            <CreatorAvatar username={inf.handle} displayName={inf.handle} src={inf.avatarUrl} size={layout === "page" ? 40 : 32} alt={inf.handle} />
                  <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: layout === "page" ? 14 : 13, fontWeight: 500, color: selectionTextPrimary(on) }}>{inf.handle}</div>
              <div style={{ fontSize: layout === "page" ? 12 : 11, color: selectionTextMuted(on) }}>
                {emailMode
                  ? email || (lang === "fr" ? "Aucun email" : "No email")
                  : inf.platform}
        </div>
      </div>
            {!missingEmail && (
            <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${on ? "#FFFFFF" : "#D0D0D0"}`, background: on ? "#FFFFFF" : "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={TRACKIT_SELECTION_BLUE} strokeWidth="2.5" strokeLinecap="round"/></svg>}
            </div>
            )}
                  </button>
        );
      })}
                </div>
  );
}

function TemplateSelect({
  templates,
  value,
  onChange,
  onCreateNew,
  layout = "panel",
}: {
  templates: OutreachTemplate[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew?: () => void;
  layout?: OutreachFormLayout;
}) {
  const lang = useLang();
  const styles = outreachFormStyles(layout);
  const applyTemplate = (id: string) => onChange(id);
  const templateDisplayName = (name: string) =>
    name === "Collab intro" ? (lang === "fr" ? "Intro collaboration" : "Collab intro") : name;

  return (
    <div style={{ marginBottom: layout === "page" ? styles.sectionGap : 20 }}>
      <label style={{ display: "block", ...styles.fieldLabel }}>{lang === "fr" ? "Modèle" : "Template"}</label>
      <select
        value={value}
        onChange={(e) => applyTemplate(e.target.value)}
        style={{ ...styles.input, cursor: "pointer", marginBottom: 8 }}
      >
        <option value="">{lang === "fr" ? "Aucun modèle — écrire depuis zéro" : "No template — write from scratch"}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{templateDisplayName(t.name)}</option>
        ))}
      </select>
      {onCreateNew && (
        <button type="button" style={{ fontSize: 12, color: "#0047FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }} onClick={onCreateNew}>
          + Create new template
        </button>
      )}
          </div>
  );
}

function SendOutreachPanel({
  open,
  templates,
  plan,
  initialTemplateId,
  initialCreatorHandle,
  initialCreatorEmail,
  initialDmPlatform,
  isMobile,
  onClose,
  onSent,
}: {
  open: boolean;
  templates: OutreachTemplate[];
  plan: PlanTier;
  initialTemplateId: string | null;
  initialCreatorHandle?: string;
  initialCreatorEmail?: string;
  initialDmPlatform?: (typeof OUTREACH_DM_PLATFORMS)[number];
  isMobile?: boolean;
  onClose: () => void;
  onSent: (mode: "email" | "dm") => void;
}) {
  const lang = useLang();
  const pageStyles = outreachFormStyles("page");
  const [shown, setShown] = useState(false);
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>(() =>
    initialCreatorHandle ? [initialCreatorHandle.startsWith("@") ? initialCreatorHandle : `@${initialCreatorHandle}`] : []
  );
  const initialPlatform =
    (initialDmPlatform as string | undefined) === "YouTube" ? "TikTok" : initialDmPlatform;
  const [dmPlatform, setDmPlatform] = useState<(typeof OUTREACH_DM_PLATFORMS)[number]>(
    initialPlatform ?? "Instagram",
  );
  const isEmail = dmPlatform === "Email";
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [fields, setFields] = useState<OutreachMessageFields>(() => {
    if (initialDmPlatform === "Email") return defaultEmailOutreachFields(lang);
    return outreachFieldsFromMessage(initialCreatorHandle ? defaultOutreachDraftMessage(lang) : "");
  });
  const [senderEmail, setSenderEmail] = useState("");
  const [creatorEmailOverrides, setCreatorEmailOverrides] = useState<Record<string, string>>({});
  const [creatorAvatarMap, setCreatorAvatarMap] = useState<Record<string, string>>({});
  const [creatorEmailMap, setCreatorEmailMap] = useState<Record<string, string>>({});
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const loadCreators = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.email) setSenderEmail(user.email);
      const [savedRows, legacyCreators] = await Promise.all([
        listSaved(),
        getSavedCreators(user.id),
      ]);
      setCreatorAvatarMap(buildCreatorAvatarMap(legacyCreators));
      setCreatorEmailMap({
        ...buildCreatorEmailMap(legacyCreators),
        ...buildCreatorEmailMap(savedRows),
      });
    };
    void loadCreators();
  }, []);

  const applyTemplateById = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (t) {
      setFields({ subject: t.subject, opening: t.opening, body: t.body, cta: t.cta });
    }
  };

  useEffect(() => {
    if (initialTemplateId) applyTemplateById(initialTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId]);

  useEffect(() => {
    if (initialCreatorHandle) {
      setSelectedInfluencers([
        initialCreatorHandle.startsWith("@") ? initialCreatorHandle : `@${initialCreatorHandle}`,
      ]);
      setFields((prev) => {
        if (messageFromTemplate(prev).trim() || prev.subject.trim()) return prev;
        return initialDmPlatform === "Email"
          ? defaultEmailOutreachFields(lang)
          : outreachFieldsFromMessage(defaultOutreachDraftMessage(lang));
      });
    }
    if (initialPlatform) setDmPlatform(initialPlatform);
    if (initialCreatorEmail?.trim() && initialCreatorHandle) {
      const key = normalizeCreatorHandle(initialCreatorHandle);
      if (key) {
        setCreatorEmailOverrides((prev) => ({ ...prev, [key]: initialCreatorEmail.trim() }));
      }
    }
  }, [initialCreatorHandle, initialCreatorEmail, initialDmPlatform, lang]);

  useEffect(() => {
    if (dmPlatform !== "Email") return;
    setFields((prev) => {
      if (prev.subject.trim() || messageFromTemplate(prev).trim()) return prev;
      return defaultEmailOutreachFields(lang);
    });
  }, [dmPlatform, lang]);

  useEffect(() => {
    if (!isEmail) return;
    setCreatorEmailOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const handle of selectedInfluencers) {
        const key = normalizeCreatorHandle(handle);
        if (!key || next[key]?.trim()) continue;
        const fromMap = creatorEmailMap[key] || (key === normalizeCreatorHandle(initialCreatorHandle) ? initialCreatorEmail?.trim() : "");
        if (fromMap) {
          next[key] = fromMap;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedInfluencers, creatorEmailMap, initialCreatorEmail, initialCreatorHandle, isEmail]);

  const resolvedRecipients = useMemo(
    () => resolveSelectedCreatorEmails(selectedInfluencers, creatorEmailMap, creatorEmailOverrides),
    [selectedInfluencers, creatorEmailMap, creatorEmailOverrides],
  );

  const missingEmailHandles = useMemo(
    () =>
      selectedInfluencers.filter(
        (handle) => !resolveCreatorEmail(handle, creatorEmailMap, creatorEmailOverrides),
      ),
    [selectedInfluencers, creatorEmailMap, creatorEmailOverrides],
  );

  const isBatchEmail = resolvedRecipients.length > 1;
  const creatorName = isBatchEmail ? "" : outreachCreatorName(selectedInfluencers[0]);
  const previewName = isBatchEmail ? "there" : creatorName || "there";
  const emailSubjectPreview =
    personalizeOutreachText(fields.subject, previewName).trim() ||
    (lang === "fr" ? "Partenariat" : "Partnership");
  const emailBodyPreview = emailBodyFromFields(fields, previewName);
  const fullPreview = isEmail ? emailBodyPreview : previewFromFields(fields, previewName);

  const persistOutreachHistory = async () => {
    let userId: string | null = null;
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    if (!userId) return;

    const followUpDate = canUseAutoFollowUp(plan) ? followUpIn3Days() : null;

    for (const influencerHandle of selectedInfluencers) {
      const name = outreachCreatorName(influencerHandle);
      const copiedMessage = isEmail
        ? `${lang === "fr" ? "Objet" : "Subject"}: ${personalizeOutreachText(fields.subject, name || "there").trim() || emailSubjectPreview}\n\n${emailBodyFromFields(fields, name || "there")}`
        : previewFromFields(fields, name || "there");
      const handleClean = influencerHandle.replace(/^@/, "");
      const payload = {
        creator_username: name || handleClean,
        creator_display_name: influencerHandle,
        creator_avatar: avatarUrlForCreatorHandle(influencerHandle, creatorAvatarMap),
        platform: dmPlatform,
        message: copiedMessage,
        status: "sent",
        follow_up_date: followUpDate,
      };
      const saved = await saveOutreach(userId, payload);
      if (!saved) {
        appendStoredOutreachEntry(userId, payload);
      }
      notifyOutreachSent(lang, influencerHandle, userId);
    }
    dispatchOutreachHistoryUpdated();
  };

  const canSend = isEmail
    ? resolvedRecipients.length > 0 &&
      isValidEmailAddress(senderEmail) &&
      emailSubjectPreview.trim() &&
      emailBodyPreview.trim() &&
      !sendingEmail
    : selectedInfluencers.length > 0 && messageFromTemplate(fields).trim();

  const handleSend = () => {
    if (!canSend) return;

    if (isEmail) {
      setSendingEmail(true);
      setSendError(null);
      void (async () => {
        const recipients = resolvedRecipients.map((r) => r.email);
        const result = await sendOutreachEmail({
          fromEmail: senderEmail.trim(),
          subject: emailSubjectPreview,
          body: emailBodyPreview,
          recipients,
        });

        if (!result.ok) {
          setSendError(result.error);
          setSendingEmail(false);
          return;
        }

        if (result.mode !== "api" && result.composeUrl) {
          window.open(result.composeUrl, "_blank", "noopener,noreferrer");
        }

        await persistOutreachHistory();
        setSendingEmail(false);
        onSent("email");
      })();
      return;
    }

    const handle = selectedInfluencers[0].replace(/^@/, "").trim();
    if (!handle) return;

    const messageText = fullPreview;
    const profileUrl = outreachProfileUrl(dmPlatform, handle, {
      subject: emailSubjectPreview,
      body: messageText,
    });
    if (profileUrl) {
      window.open(profileUrl, "_blank", "noopener,noreferrer");
    }

    void (async () => {
      try {
        await navigator.clipboard.writeText(messageText);
      } catch {
        /* clipboard may be unavailable */
      }
      await persistOutreachHistory();
      onSent("dm");
    })();
  };

  const sendViaLabel =
    dmPlatform === "Instagram"
      ? lang === "fr"
        ? "Envoyer via Instagram"
        : "Send via Instagram"
      : dmPlatform === "TikTok"
        ? lang === "fr"
          ? "Envoyer via TikTok"
          : "Send via TikTok"
        : dmPlatform === "Twitter"
          ? lang === "fr"
            ? "Envoyer via Twitter"
            : "Send via Twitter"
          : dmPlatform === "Email"
            ? sendingEmail
              ? lang === "fr"
                ? "Envoi en cours…"
                : "Sending…"
              : isBatchEmail
                ? lang === "fr"
                  ? `Envoyer à ${resolvedRecipients.length} créateurs`
                  : `Send to ${resolvedRecipients.length} creators`
                : lang === "fr"
                  ? "Envoyer par email"
                  : "Send via Email"
            : lang === "fr"
              ? `Envoyer via ${dmPlatform}`
              : `Send via ${dmPlatform}`;

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={() => {
        if (!sendingEmail) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1200,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#FFF",
          overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)",
          opacity: shown ? 1 : 0,
          transition: "transform .18s ease, opacity .18s ease",
          padding: isMobile ? "24px 20px 48px" : "28px 28px 56px",
          boxSizing: "border-box",
          fontFamily: "'InterDisplay', 'Inter Display', sans-serif",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={sendingEmail}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 500,
            color: "#6B7280",
            cursor: sendingEmail ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.02em",
          }}
        >
          ← {lang === "fr" ? "Retourner sur outreach" : "Back to outreach"}
        </button>

        <h1 style={{ fontSize: isMobile ? 24 : 26, fontWeight: 600, color: "#1A1A1A", margin: "0 0 12px", letterSpacing: "-0.03em" }}>
          {isEmail ? (lang === "fr" ? "Envoyer un email" : "Send email") : lang === "fr" ? "Envoyer un outreach" : "Send outreach"}
        </h1>
        <p style={{ ...pageStyles.sectionHint, marginBottom: 36 }}>
          {isEmail
            ? lang === "fr"
              ? "Utilisez l'email de votre marque, sélectionnez un ou plusieurs créateurs avec email, puis rédigez votre message."
              : "Use your brand email, select one or more creators with an email, then write your message."
            : lang === "fr"
              ? "Choisissez où envoyer le DM, sélectionnez des influenceurs, puis modifiez votre outreach."
              : "Choose where to send the DM, pick influencers, then edit your outreach."}
        </p>

        <div style={{ marginBottom: pageStyles.sectionGap }}>
          <div style={pageStyles.fieldLabel}>
            {isEmail ? (lang === "fr" ? "Canal" : "Channel") : lang === "fr" ? "Envoyer un DM sur" : "Send DM on"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OUTREACH_DM_PLATFORMS.map((p) => {
              const on = dmPlatform === p;
              const pill = selectionPillColors(on);
  return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDmPlatform(p)}
                  style={{
                    ...pageStyles.pill,
                    background: pill.background,
                    color: pill.color,
                    borderColor: pill.borderColor,
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {isEmail && (
          <div style={{ marginBottom: pageStyles.sectionGap }}>
            <label style={{ display: "block", ...pageStyles.fieldLabel }}>
              {lang === "fr" ? "Email de la marque" : "Brand email"}
            </label>
              <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="vous@marque.com"
              style={pageStyles.input}
              autoComplete="email"
            />
            <p style={{ fontSize: 13, color: "#6B7280", margin: "8px 0 0", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "L'envoi se fait depuis cette adresse. Connectez-vous à Gmail ou Outlook avec ce compte si une fenêtre s'ouvre."
                : "Sending happens from this address. Sign in to Gmail or Outlook with this account if a window opens."}
            </p>
            </div>
        )}

        <div style={{ marginBottom: pageStyles.sectionGap }}>
          <div style={pageStyles.fieldLabel}>{lang === "fr" ? "Créateurs" : "Creators"}</div>
          <InfluencerPicker
            layout="page"
            emailMode={isEmail}
            emailMap={{ ...creatorEmailMap, ...creatorEmailOverrides }}
            avatarMap={creatorAvatarMap}
            selected={selectedInfluencers}
            onChange={setSelectedInfluencers}
          />
            </div>

        {isEmail && resolvedRecipients.length > 0 && (
          <div style={{ marginBottom: pageStyles.sectionGap }}>
            <div style={pageStyles.fieldLabel}>
              {isBatchEmail
                ? lang === "fr"
                  ? `Destinataires (${resolvedRecipients.length})`
                  : `Recipients (${resolvedRecipients.length})`
                : lang === "fr"
                  ? "Destinataire"
                  : "Recipient"}
              </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resolvedRecipients.map((row, index) => (
                <div
                  key={row.handle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #EFEFEF",
                    background: "#FAFAFA",
                  }}
                >
                  <CreatorAvatar
                    username={row.handle}
                    displayName={row.handle}
                    src={avatarUrlForCreatorHandle(row.handle, creatorAvatarMap)}
                    size={36}
                    alt={row.handle}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>{row.handle}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      {index === 0
                        ? lang === "fr"
                          ? "À"
                          : "To"
                        : lang === "fr"
                          ? "Cc"
                          : "Cc"}
              </div>
              </div>
              <input
                    type="email"
                    value={creatorEmailOverrides[normalizeCreatorHandle(row.handle)] ?? row.email}
                    onChange={(e) => {
                      const key = normalizeCreatorHandle(row.handle);
                      setCreatorEmailOverrides((prev) => ({ ...prev, [key]: e.target.value }));
                    }}
                    style={{ ...pageStyles.input, flex: 1, minWidth: 0, maxWidth: 280 }}
                    autoComplete="off"
                  />
              </div>
              ))}
            </div>
            {isBatchEmail && (
              <p style={{ fontSize: 13, color: "#6B7280", margin: "10px 0 0", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                {lang === "fr"
                  ? "Envoi groupé : le premier créateur en destinataire principal, les autres en copie (Cc)."
                  : "Batch send: first creator as primary recipient, others in Cc."}
              </p>
            )}
            </div>
          )}

        {isEmail && missingEmailHandles.length > 0 && (
          <p style={{ margin: `0 0 ${pageStyles.sectionGap}px`, fontSize: 13, color: "#1A1A1A", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? `${missingEmailHandles.length} créateur${missingEmailHandles.length > 1 ? "s" : ""} sélectionné${missingEmailHandles.length > 1 ? "s" : ""} sans email — non inclus dans l'envoi.`
              : `${missingEmailHandles.length} selected creator${missingEmailHandles.length > 1 ? "s" : ""} without email — excluded from send.`}
          </p>
        )}

        <TemplateSelect layout="page" templates={templates} value={templateId} onChange={applyTemplateById} />

        {isEmail ? (
          <OutreachEmailEditor key={templateId || "send-email"} layout="page" lang={lang} value={fields} onChange={setFields} creatorName={creatorName} />
        ) : (
          <OutreachMessageEditor key={templateId || "send-scratch"} layout="page" lang={lang} value={fields} onChange={setFields} creatorName={creatorName} />
        )}

        {fullPreview && (
          <div style={{ padding: 18, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, marginBottom: pageStyles.sectionGap }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              {lang === "fr" ? "Aperçu" : "Preview"} · {dmPlatform}
            </div>
            {isEmail ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 12, letterSpacing: "-0.02em" }}>
                  {emailSubjectPreview}
                </div>
                <div style={{ fontSize: 14, color: "#1A1A1A", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{emailBodyPreview}</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "#1A1A1A", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{fullPreview}</div>
            )}
          </div>
        )}

        {isBatchEmail && isEmail && (
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Mode lot : le message utilise une formule générique ({{name}} → there) pour tous les destinataires."
              : "Batch mode: the message uses a generic greeting ({{name}} → there) for all recipients."}
          </p>
        )}

        <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
          {isEmail
            ? lang === "fr"
              ? "En cliquant sur Envoyer, votre messagerie s'ouvre (Gmail, Outlook ou Mail) avec les destinataires et le message pré-remplis — l'email part bien depuis l'adresse de la marque ci-dessus."
              : "When you click Send, your mail app opens (Gmail, Outlook, or Mail) with recipients and message pre-filled — the email is sent from your brand address above."
            : lang === "fr"
              ? "En cliquant sur Envoyer, l'outreach est copié — il ne reste plus qu'à le coller dans le DM du créateur."
              : "When you click Send, your outreach is copied to the clipboard — just paste it into their DMs."}
        </p>

        {sendError && (
          <p style={{ fontSize: 13, color: "#DC2626", margin: "0 0 16px", lineHeight: 1.5 }}>{sendError}</p>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" style={{ ...outreachPagePrimaryBtn, opacity: canSend ? 1 : 0.45 }} disabled={!canSend} onClick={handleSend}>{sendViaLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}


const shopifyConnectFieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  fontSize: 15,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFF",
  outline: "none",
};

const shopifyConnectPrimaryBtn: React.CSSProperties = {
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const shopifyConnectSecondaryBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const SHOPIFY_CONNECT_DEMO_VIDEO =
  "https://res.cloudinary.com/dqsk5btgz/video/upload/v1782785668/shopify_ydkzyy.mp4";

function ShopifyConnectPage({
  lang,
  isMobile,
  shopDomain,
  shopToken,
  shopError,
  connecting,
  changingStore,
  onShopDomainChange,
  onShopTokenChange,
  onConnect,
  onClose,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  shopDomain: string;
  shopToken: string;
  shopError: string;
  connecting: boolean;
  changingStore?: boolean;
  onShopDomainChange: (value: string) => void;
  onShopTokenChange: (value: string) => void;
  onConnect: () => void;
  onClose: () => void;
}) {
  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";

  const steps =
    lang === "fr"
      ? [
          {
            title: "Créer une app personnalisée",
            description:
              "Dans Shopify Admin, ouvrez Paramètres → Applications et canaux de vente → Développer des apps, puis créez une app dédiée à Trackit.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Activer l'API Admin",
            description:
              "Activez l'API Admin avec la permission read_orders pour autoriser Trackit à lire vos commandes.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Coller vos identifiants",
            description:
              "Copiez le domaine .myshopify.com et le token d'accès de votre app, puis collez-les dans le formulaire à gauche.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
        ]
      : [
          {
            title: "Create a custom app",
            description:
              "In Shopify Admin, go to Settings → Apps and sales channels → Develop apps, then create an app for Trackit.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Enable the Admin API",
            description:
              "Enable the Admin API with the read_orders permission so Trackit can read your orders.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Paste your credentials",
            description:
              "Copy your .myshopify.com domain and access token, then paste them into the form on the left.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
        ];

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: pagePad }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
                  style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 48 : 64,
            alignItems: "start",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <h1
              style={{
                fontSize: isMobile ? 28 : 32,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: "0 0 8px",
                letterSpacing: "-0.03em",
              }}
            >
              {changingStore
                ? lang === "fr"
                  ? "Changer de boutique"
                  : "Change store"
                : lang === "fr"
                  ? "Connecter Shopify"
                  : "Connect Shopify"}
            </h1>
            <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 36px", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Liez votre boutique Shopify pour synchroniser automatiquement vos ventes dans Trackit."
                : "Link your Shopify store to automatically sync sales into Trackit."}
            </p>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Domaine de la boutique" : "Store domain"}
              </label>
              <div
                style={{
                  border: "1px solid #0047FF",
                  borderRadius: 10,
                  padding: "4px 14px",
                  boxShadow: "0 0 0 1px rgba(0,71,255,0.08)",
                }}
              >
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => onShopDomainChange(e.target.value)}
                  placeholder="votreboutique.myshopify.com"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    fontSize: 15,
                    fontFamily: "inherit",
                    padding: "12px 0",
                    background: "transparent",
                    boxSizing: "border-box",
                    color: "#1A1A1A",
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && onConnect()}
                />
                  </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Token d'API Admin" : "Admin API token"}
              </label>
              <input
                type="password"
                value={shopToken}
                onChange={(e) => onShopTokenChange(e.target.value)}
                placeholder={lang === "fr" ? "Token d'API Admin (shpat_...)" : "Admin API token (shpat_...)"}
                style={shopifyConnectFieldInput}
                onKeyDown={(e) => e.key === "Enter" && onConnect()}
              />
            </div>

            {shopError && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 20px", lineHeight: 1.45 }}>{shopError}</p>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                className="hero-cta-shopify-dark"
                onClick={onConnect}
                disabled={connecting}
                style={{ ...shopifyConnectPrimaryBtn, display: "inline-flex", alignItems: "center", gap: 8, opacity: connecting ? 0.6 : 1 }}
              >
                <img src="/shopify-logo.svg" alt="" width={18} height={20} style={{ display: "block", flexShrink: 0 }} />
                {connecting
                  ? lang === "fr"
                    ? "Vérification..."
                    : "Verifying..."
                  : lang === "fr"
                    ? "Connecter Shopify"
                    : "Connect Shopify"}
              </button>
              <button type="button" style={shopifyConnectSecondaryBtn} onClick={onClose} disabled={connecting}>
                {lang === "fr" ? "Annuler" : "Cancel"}
                  </button>
        </div>

            <div
              style={{
                marginTop: 28,
                width: "100%",
                maxWidth: isMobile ? 280 : 380,
                aspectRatio: "16 / 9",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <video
                src={SHOPIFY_CONNECT_DEMO_VIDEO}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "#F7F8FA",
                  display: "block",
                }}
                aria-label={lang === "fr" ? "Tutoriel connexion Shopify" : "Shopify connect tutorial"}
              />
          </div>
        </div>

          <div
            style={{
              position: "relative",
              borderRadius: 28,
              background: "linear-gradient(145deg, #95BF47 0%, #5E8E3E 55%, #3D6B2A 100%)",
              padding: isMobile ? "32px 20px" : "40px 32px",
              minHeight: isMobile ? 360 : 480,
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 24,
                right: 32,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.14)",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 32,
                left: 24,
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
              }}
            />

            <div
              style={{
                position: "relative",
                background: "#FFFFFF",
                borderRadius: 20,
                boxShadow: "0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                padding: isMobile ? "24px 20px" : "32px 28px",
                border: "1px solid rgba(255,255,255,0.8)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <img src="/shopify-logo.svg" alt="Shopify" width={40} height={46} style={{ display: "block", flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                    {lang === "fr" ? "Comment connecter Shopify" : "How to connect Shopify"}
                  </p>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                    {lang === "fr"
                      ? "Créez une app personnalisée dans Shopify Admin (Paramètres → Applications et canaux de vente → Développer des apps), activez l'API Admin avec la permission read_orders, puis collez le domaine .myshopify.com et le token d'accès ci-dessus."
                      : "Create a custom app in Shopify Admin (Settings → Apps and sales channels → Develop apps), enable the Admin API with read_orders, then paste your .myshopify.com domain and access token above."}
                  </p>
                </div>
                </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {steps.map((step, index) => (
                  <div key={step.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: "#F9FAFB",
                          border: "1px solid #F0F0F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {step.icon}
                      </div>
                      {index < steps.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 16, background: "#E5E7EB", marginTop: 8, borderRadius: 999 }} />
                      )}
          </div>
                    <div style={{ paddingTop: 2 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#0047FF", margin: "0 0 4px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        {lang === "fr" ? `Étape ${index + 1}` : `Step ${index + 1}`}
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                        {step.title}
                      </p>
                      <p style={{ fontSize: 14, color: "#6B7280", margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                        {step.description}
                      </p>
        </div>
              </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function IntegrationsView({
  isMobile,
  user,
  shopifyStore,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  isMobile?: boolean;
  user?: User | null;
  shopifyStore?: string | null;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const lang = useLang();
  const [shopDomain, setShopDomain] = useState("");
  const [shopToken, setShopToken] = useState("");
  const [shopError, setShopError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [togglingSync, setTogglingSync] = useState(false);
  const [connectedShop, setConnectedShop] = useState<string | null>(null);
  const [changingStore, setChangingStore] = useState(false);
  const [connectedStores, setConnectedStores] = useState<string[]>([]);
  const [connectPageOpen, setConnectPageOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const activeShop = connectedShop || shopifyStore || null;
  const isShopifyConnected = !!activeShop && !changingStore;
  const storeLimit = maxShopifyStores(plan);
  const isMultiStore = isScalePlan(plan);

  useEffect(() => {
    if (!user?.id || !supabase) return;
    void supabase
      .from("shopify_stores")
      .select("shop_domain")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const domains = (data ?? [])
          .map((r) => r.shop_domain as string)
          .filter(Boolean);
        if (domains.length > 0) setConnectedStores(domains);
      });
  }, [user?.id, connectedShop, shopifyStore]);

  useEffect(() => {
    if (!user?.id || !supabase) return;
    void supabase
      .from("shopify_stores")
      .select("sync_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSyncEnabled(!!data.sync_enabled);
      });
  }, [user?.id, connectedShop, shopifyStore]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify") === "connected") {
      const shop = params.get("shop") || "";
      setConnectedShop(shop);
      setChangingStore(false);
      window.history.replaceState({}, "", "/dashboard");
      if (user?.id) {
        notifyShopifyConnected(lang, shop || (lang === "fr" ? "votre boutique" : "your store"), user.id);
        void fetch("/api/shopify/sync-toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, enabled: true }),
        }).catch(() => {});
        void runShopifyOrderSync(user.id)
          .then(() => {
            dispatchSalesUpdated();
            dispatchPayoutsUpdated();
          })
          .catch(() => {});
      }
    }
    if (params.get("shopify") === "error") {
      setShopError(lang === "fr" ? "La connexion a échoué. Réessayez." : "Connection failed. Please try again.");
      setConnectPageOpen(true);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [lang, user?.id]);

  const openConnectPage = (prefillDomain = "", changing = false) => {
    if (!canUseShopify(plan)) {
      setUpgradeModalOpen(true);
      return;
    }
    setChangingStore(changing);
    setShopDomain(prefillDomain);
    setShopToken("");
    setShopError("");
    setConnectPageOpen(true);
  };

  const closeConnectPage = () => {
    setConnectPageOpen(false);
    setChangingStore(false);
    setShopError("");
  };

  const handleShopifyConnect = () => {
    const storeCount = Math.max(
      connectedStores.length,
      activeShop ? 1 : 0
    );
    if (!canAddAnotherShopifyStore(plan, storeCount) && !changingStore) {
      setShopError(
        lang === "fr"
          ? `Limite de ${storeLimit} boutique(s) atteinte. Passez à Business pour jusqu'à 3 boutiques.`
          : `Store limit of ${storeLimit} reached. Upgrade to Business for up to 3 stores.`
      );
      if (plan === "pro") void onUpgradeScale?.();
      else if (plan === "basic") void onUpgradePro?.();
      return;
    }
    if (!shopDomain.trim()) {
      setShopError(lang === "fr" ? "Entrez le domaine de votre boutique" : "Please enter your store name");
      return;
    }
    if (!shopToken.trim()) {
      setShopError(lang === "fr" ? "Collez votre token d'API Admin Shopify" : "Paste your Shopify Admin API token");
      return;
    }
    setShopError("");
    let name = shopDomain.trim().toLowerCase();
    name = name.replace(/^https?:\/\//, "");
    name = name.replace(/\.myshopify\.com.*/, "");
    name = name.replace(/\..*/, "");
    name = name.replace(/[^a-z0-9-]/g, "");
    const domain = `${name}.myshopify.com`;

    setConnecting(true);
    void (async () => {
      try {
        const res = await fetch("/api/shopify/connect-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.id || "", shop: domain, accessToken: shopToken.trim() }),
        });
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; shop?: string; shopName?: string };
        if (!res.ok || !payload.ok) {
          setShopError(payload.error || (lang === "fr" ? "Connexion echouee" : "Connection failed"));
          setConnecting(false);
          return;
        }
        setConnectedShop(payload.shop || domain);
        setChangingStore(false);
        setShopToken("");
        setConnectPageOpen(false);
        setConnecting(false);
        notifyShopifyConnected(lang, payload.shopName || domain, user?.id);
        // Active la sync auto par defaut des la connexion (enregistre le webhook).
        setSyncEnabled(true);
        void fetch("/api/shopify/sync-toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.id || "", enabled: true }),
        }).catch(() => { /* silencieux : l'utilisateur peut toggler a la main */ });
        void runShopifyOrderSync(user?.id || "")
          .then(() => {
            dispatchSalesUpdated();
            dispatchPayoutsUpdated();
          })
          .catch(() => { /* backfill optionnel */ });
      } catch {
        setShopError(lang === "fr" ? "Erreur reseau" : "Network error");
        setConnecting(false);
      }
    })();
  };

  const apps = [
    { name: "Shopify", desc: "Connect your store to track sales", logo: "/shopify-logo.svg", logoH: 39 },
    { name: "Zapier", desc: "Automate workflows with 5000+ apps", logo: "/zapier-logo.svg", logoH: 34 },
    { name: "Notion", desc: "Sync your workspace and docs", logo: "/notion-logo.svg", logoH: 34 },
    { name: "Make", desc: "Advanced visual automation", logo: "/make-logo.svg", logoH: 34 },
  ];

  if (connectPageOpen) {
    return (
      <ShopifyConnectPage
        lang={lang}
        isMobile={isMobile}
        shopDomain={shopDomain}
        shopToken={shopToken}
        shopError={shopError}
        connecting={connecting}
        changingStore={changingStore}
        onShopDomainChange={(value) => {
          setShopDomain(value);
          setShopError("");
        }}
        onShopTokenChange={(value) => {
          setShopToken(value);
          setShopError("");
        }}
        onConnect={handleShopifyConnect}
        onClose={closeConnectPage}
      />
    );
  }

  return (
    <>
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          featureKey="integrations"
          onClose={() => setUpgradeModalOpen(false)}
          onPrimary={() => {
            setUpgradeModalOpen(false);
            void onUpgradePro?.();
          }}
        />
      )}
      <PageHeader isMobile={isMobile} title={lang === "fr" ? "Intégrations" : "Integrations"} subtitle={lang === "fr" ? "Connectez Trackit aux outils que vous utilisez déjà" : "Connect Trackit to the tools you already use"} />
      {connectedShop && (
        <div style={{ margin: isMobile ? "0 16px 16px" : "0 40px 16px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#15803d", fontSize: 14, fontWeight: 500 }}>
          ✓ {connectedShop} connected successfully
        </div>
      )}
      <div style={{ padding: isMobile ? "12px 16px 16px" : "24px 40px 40px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          {apps.map((app) => (
            <div key={app.name} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, display: "flex", alignItems: app.name === "Shopify" && !isShopifyConnected ? "center" : "flex-start", gap: 16, width: "100%", boxSizing: "border-box" }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: "#FFFFFF", border: "1px solid #EFEFEF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <img src={app.logo} alt={app.name} width={34} height={app.logoH} style={{ display: "block", objectFit: "contain" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>{app.name}</div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                  {app.name === "Shopify"
                    ? isShopifyConnected
                      ? lang === "fr"
                        ? "Shopify est déjà connecté. Vos ventes sont synchronisées."
                        : "Shopify is already connected. Your sales are synced."
                      : lang === "fr"
                        ? "Connectez votre boutique pour suivre les ventes"
                        : "Connect your store to track sales"
                    : app.name === "Zapier"
                      ? lang === "fr"
                        ? "Automatisez vos workflows avec 5000+ applications"
                        : "Automate workflows with 5000+ apps"
                      : app.name === "Notion"
                        ? lang === "fr"
                          ? "Synchronisez votre espace de travail et vos documents"
                          : "Sync your workspace and docs"
                        : lang === "fr"
                          ? "Automatisation visuelle avancée"
                          : "Advanced visual automation"}
              </div>
                {app.name === "Shopify" && (
                  <div style={{ marginTop: 10 }}>
                    {isShopifyConnected ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#22C55E", marginBottom: 4, letterSpacing: "-0.01em" }}>
                          {lang === "fr" ? "Boutique connectée ✓" : "Store connected ✓"}
                        </div>
                        <div style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 500, marginBottom: 10, letterSpacing: "-0.01em" }}>{activeShop}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "1px solid #EFEFEF", borderRadius: 12, marginBottom: 10, background: "#FFFFFF" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.01em" }}>
                              {lang === "fr" ? "Synchronisation automatique" : "Automatic sync"}
                            </div>
                            <div style={{ fontSize: 12, color: "#7A7A7A", marginTop: 2, letterSpacing: "-0.01em" }}>
                              {lang === "fr" ? "Chaque nouvelle vente Shopify remonte automatiquement dans Trackit." : "Every new Shopify sale flows into Trackit automatically."}
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={syncEnabled}
                            disabled={togglingSync || !user?.id}
                            onClick={() => {
                              if (togglingSync || !user?.id) return;
                              const next = !syncEnabled;
                              setSyncEnabled(next);
                              setTogglingSync(true);
                              setSyncMsg("");
                              void (async () => {
                                try {
                                  const res = await fetch("/api/shopify/sync-toggle", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ userId: user?.id || "", enabled: next }),
                                  });
                                  const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                                  if (!res.ok || !payload.ok) {
                                    setSyncEnabled(!next);
                                    setSyncMsg(payload.error || (lang === "fr" ? "Echec de la mise a jour" : "Update failed"));
                                  }
                                } catch {
                                  setSyncEnabled(!next);
                                  setSyncMsg(lang === "fr" ? "Erreur reseau" : "Network error");
                                } finally {
                                  setTogglingSync(false);
                                }
                              })();
                            }}
                            style={{ position: "relative", width: 44, height: 26, borderRadius: 999, border: "none", flexShrink: 0, cursor: togglingSync ? "default" : "pointer", background: syncEnabled ? "#0047FF" : "#D4D4D8", opacity: togglingSync ? 0.6 : 1, transition: "background 0.15s", padding: 0 }}
                          >
                            <span style={{ position: "absolute", top: 3, left: syncEnabled ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.15s" }} />
                          </button>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (syncing || !user?.id) return;
                              setSyncing(true);
                              setSyncMsg("");
                              void (async () => {
                                try {
                                  const res = await runShopifyOrderSync(user.id);
                                  const payload = (await res.json().catch(() => ({}))) as {
                                    synced?: number;
                                    created?: number;
                                    error?: string;
                                    message?: string;
                                    messageEn?: string;
                                    ordersWithCodes?: number;
                                    registeredCodes?: string[];
                                    skipped?: Record<string, number>;
                                    dbErrors?: string[];
                                  };
                                  if (!res.ok) {
                                    setSyncMsg(
                                      (lang === "fr" ? payload.message : payload.messageEn) ||
                                        payload.error ||
                                        (lang === "fr" ? "La synchronisation a échoué" : "Sync failed")
                                    );
                                  } else if (payload.error === "no_creator_codes") {
                                    setSyncMsg(
                                      lang === "fr"
                                        ? payload.message || "Générez d'abord un code promo (Affiliation) pour vos créateurs."
                                        : payload.messageEn || "Generate affiliate promo codes for your creators first."
                                    );
                                  } else {
                                    const n = payload.created ?? 0;
                                    const synced = payload.synced ?? 0;
                                    const withCodes = payload.ordersWithCodes ?? 0;
                                    if (n > 0) {
                                      setSyncMsg(
                                        lang === "fr"
                                          ? `${n} nouvelle(s) vente(s) importée(s) (${synced} attribuée(s))`
                                          : `${n} new sale(s) imported (${synced} attributed)`
                                      );
                                      dispatchSalesUpdated();
                                      dispatchPayoutsUpdated();
                                    } else if (synced > 0) {
                                      setSyncMsg(
                                        lang === "fr"
                                          ? `${synced} vente(s) déjà enregistrée(s) — rien de nouveau`
                                          : `${synced} sale(s) already recorded — nothing new`
                                      );
                                    } else if (withCodes === 0) {
                                      setSyncMsg(
                                        lang === "fr"
                                          ? "Aucune commande Shopify avec code promo trouvée sur les 250 dernières commandes."
                                          : "No Shopify orders with a promo code in the last 250 orders."
                                      );
                                    } else {
                                      const skip = payload.skipped || {};
                                      setSyncMsg(
                                        lang === "fr"
                                          ? `${withCodes} commande(s) avec code, mais aucune ne correspond à vos créateurs. Codes enregistrés : ${(payload.registeredCodes || []).join(", ") || "—"}`
                                          : `${withCodes} order(s) with codes but none match your creators. Registered: ${(payload.registeredCodes || []).join(", ") || "—"}`
                                      );
                                      if ((skip.no_commission || 0) > 0) {
                                        setSyncMsg(
                                          lang === "fr"
                                            ? "Créateur trouvé mais commission manquante — définissez-la dans Gérer ou régénérez le lien d'affiliation."
                                            : "Creator matched but commission missing — set it in Manage or regenerate the affiliate link."
                                        );
                                      }
                                    }
                                    if (payload.dbErrors?.length) {
                                      setSyncMsg(`DB: ${payload.dbErrors[0]}`);
                                    }
                                  }
                                } catch {
                                  setSyncMsg(lang === "fr" ? "Erreur reseau" : "Network error");
                                } finally {
                                  setSyncing(false);
                                }
                              })();
                            }}
                            disabled={syncing}
                            className="hero-cta-shopify hero-cta-compact-sm"
                            style={{ opacity: syncing ? 0.6 : 1 }}
                          >
                            {syncing ? (lang === "fr" ? "Synchronisation..." : "Syncing...") : (lang === "fr" ? "Re-synchroniser maintenant" : "Re-sync now")}
                          </button>
                          {syncMsg && <div style={{ fontSize: 12, color: "#15803d", marginTop: 6 }}>{syncMsg}</div>}
                        </div>
                        {isMultiStore && connectedStores.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, color: "#7A7A7A", marginBottom: 6 }}>
                              {lang === "fr"
                                ? `${connectedStores.length}/${storeLimit} boutiques connectées`
                                : `${connectedStores.length}/${storeLimit} stores connected`}
                            </div>
                            {connectedStores.map((domain) => (
                              <div key={domain} style={{ fontSize: 13, color: "#1A1A1A", marginBottom: 4 }}>
                                {domain}
            </div>
          ))}
        </div>
                        )}
                        {canAddAnotherShopifyStore(
                          plan,
                          Math.max(connectedStores.length, activeShop ? 1 : 0)
                        ) ? (
                          <button
                            type="button"
                            onClick={() => openConnectPage("", true)}
                            style={{ ...btnSecondary, padding: "8px 14px", fontSize: 12, marginRight: 8 }}
                          >
                            {isMultiStore
                              ? lang === "fr"
                                ? "Ajouter une boutique"
                                : "Add another store"
                              : lang === "fr"
                                ? "Changer de boutique"
                                : "Change my store"}
                          </button>
                        ) : (
                          <>
                            {canChangeShopifyStore(plan) && (
                              <button
                                type="button"
                                onClick={() => openConnectPage(activeShop?.replace(/\.myshopify\.com$/, "") || "", true)}
                                style={{ ...btnSecondary, padding: "8px 14px", fontSize: 12, marginRight: 8 }}
                              >
                                {lang === "fr" ? "Changer de boutique" : "Change my store"}
                              </button>
                            )}
                            {plan === "free" ? (
                              <p style={{ fontSize: 12, color: "#7A7A7A", margin: 0 }}>
                                {lang === "fr" ? "Shopify nécessite le plan Starter. " : "Shopify requires the Starter plan. "}
                                <button type="button" onClick={() => void onUpgrade?.()} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                                  {lang === "fr" ? "Passer à Starter →" : "Upgrade to Starter →"}
                                </button>
                              </p>
                            ) : (plan === "basic" || plan === "pro") ? (
                              <p style={{ fontSize: 12, color: "#7A7A7A", margin: 0 }}>
                                {lang === "fr"
                                  ? `Jusqu'à ${SCALE_MAX_SHOPIFY_STORES} boutiques sur Business. `
                                  : `Up to ${SCALE_MAX_SHOPIFY_STORES} stores on Business. `}
                                <button type="button" onClick={() => void onUpgradeScale?.()} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                                  {lang === "fr" ? "Passer à Business →" : "Upgrade to Business →"}
                                </button>
                              </p>
                            ) : null}
                          </>
                        )}
                      </>
                    ) : (
                      shopError ? <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{shopError}</div> : null
                    )}
                  </div>
                )}
              </div>
              {app.name === "Shopify" ? (
                !isShopifyConnected ? (
                  <button
                    type="button"
                    onClick={() => openConnectPage("")}
                    className="hero-cta-shopify hero-cta-compact"
                    style={{ flexShrink: 0, alignSelf: "center", opacity: connecting ? 0.6 : 1 }}
                  >
                    {lang === "fr" ? "Connecter →" : "Connect →"}
                  </button>
                ) : null
              ) : (
                <button type="button" style={{ ...btnSecondary, alignSelf: "center" }}>{lang === "fr" ? "Bientôt disponible" : "Coming soon"}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AutomationView({
  isMobile,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const lang = useLang();
  const fullAgent = canUseFullAutomationAgent(plan);
  const workflows = canUseAutomationWorkflows(plan);
  const showComingSoon = !workflows;
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  return (
    <>
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          featureKey="automation"
          onClose={() => setUpgradeModalOpen(false)}
          onPrimary={() => {
            setUpgradeModalOpen(false);
            void onUpgradePro?.();
          }}
        />
      )}
      <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 24, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6, display: "flex", alignItems: "center" }}>
            {lang === "fr" ? "Automatisation" : "Automation"}
            {showComingSoon && (
              <span style={{ fontSize: 13, fontWeight: 600, background: "#F0F4FF", color: "#0047FF", padding: "4px 12px", borderRadius: 20, marginLeft: 10 }}>
                {lang === "fr" ? "Bientôt disponible" : "Coming soon"}
              </span>
            )}
            {fullAgent && (
              <span style={{ fontSize: 13, fontWeight: 600, background: "#ECFDF5", color: "#15803D", padding: "4px 12px", borderRadius: 20, marginLeft: 10 }}>
                {lang === "fr" ? "Agent complet" : "Full agent"}
              </span>
            )}
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{lang === "fr" ? "Créez des agents qui gèrent votre marketing créateur en automatique" : "Build agents that run your creator marketing on autopilot"}</p>
        </div>
      </div>
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div style={{ background: "linear-gradient(135deg, #0047FF 0%, #003BD6 100%)", color: "#FFFFFF", borderRadius: 18, padding: 32, marginBottom: 20, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>{lang === "fr" ? "Créer un agent d'automatisation" : "Make an automation agent"}</h2>
            <p style={{ fontSize: 14, opacity: 0.9, letterSpacing: "-0.01em", margin: 0, marginBottom: 18 }}>{lang === "fr" ? "Assemblez des déclencheurs, des actions et des conditions comme des pièces de puzzle. Aucun code requis." : "Assemble triggers, actions, and conditions like puzzle pieces. No code required."}</p>
            <button
              type="button"
              className="hero-cta-inverse hero-cta-compact"
              onClick={() => {
                if (!canUseAutomationWorkflows(plan)) {
                  setUpgradeModalOpen(true);
                  return;
                }
                if (fullAgent) {
                  alert(lang === "fr" ? "Agent d'automatisation — configuration bientôt disponible." : "Automation agent — setup coming soon.");
                  return;
                }
                void onUpgradeScale?.();
              }}
            >
              {fullAgent
                ? lang === "fr"
                  ? "Créer un agent"
                  : "Build an agent"
                : workflows
                  ? lang === "fr"
                    ? "Débloquer l'agent complet (Business)"
                    : "Unlock full agent (Business)"
                  : lang === "fr"
                    ? "Créer un agent"
                    : "Build an agent"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 36px)", gap: 6, flexShrink: 0 }}>
            {[0,1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255," + (0.08 + (i % 3) * 0.12) + ")" }} />
            ))}
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 14 }}>{lang === "fr" ? "Automatisations préconstruites" : "Pre-built automations"}</h3>
          {[
            lang === "fr" ? "Quand un créateur publie → me notifier" : "When creator posts → notify me",
            lang === "fr" ? "Quand une vente est détectée → ajouter au suivi des commissions" : "When sale detected → add to commission tracker",
            lang === "fr" ? "Quand le seuil de commission est atteint → paiement automatique" : "When commission threshold reached → auto payout",
            lang === "fr" ? "Quand pas de réponse après 3 jours → envoyer une relance" : "When no reply after 3 days → send follow-up",
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < 3 ? "1px solid #F5F5F5" : "none" }}>
              <span style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{row}</span>
              <Toggle
                on={false}
                onChange={() => {
                  if (workflows) {
                    alert(lang === "fr" ? "Workflow activé — configuration bientôt disponible." : "Workflow enabled — setup coming soon.");
                    return;
                  }
                  alert(lang === "fr" ? "Bientôt disponible" : "Coming soon");
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>{lang === "fr" ? "Importer depuis le code" : "Import from code"}</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Collez une URL webhook ou importez une automatisation depuis JSON" : "Paste a webhook URL or import an automation from JSON"}</div>
          </div>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}>Import</button>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}>Test</button>
        </div>
      </div>
    </>
  );
}

function LockedView({ title, subtitle, isMobile }: { title: string; subtitle: string; isMobile?: boolean }) {
  return (
    <>
      <PageHeader isMobile={isMobile} title={title} subtitle={subtitle} />
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: isMobile ? 48 : 80, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#F5F5F5", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#9A9A9A" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#9A9A9A" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>Coming soon</h3>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 22, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>This area is not created yet. You&apos;ll be notified when it&apos;s ready.</p>
          <button type="button" style={btnPrimary}>Notify me</button>
        </div>
      </div>
    </>
  );
}

type AffiliateRow = StoredAffiliate;

function codeFromHandle(handle: string, discount: string) {
  const base = handle.replace(/^@/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CREATOR";
  const pct = discount.replace(/\D/g, "") || "15";
  return `${base}${pct}`;
}

function affiliateReferralLink(slug: string) {
  return buildTrackitShortLink(slug);
}

async function runShopifyOrderSync(userId: string): Promise<Response> {
  await persistAffiliateCodesToServer(userId);
  const affiliates = loadAffiliates(userId);
  return fetch("/api/shopify/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      entries: affiliates.map((a) => ({ creator: a.creator, code: a.code })),
    }),
  });
}

const affiliateInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
};

function affiliateStatusLabel(status: string, lang: "en" | "fr"): string {
  const labels: Record<string, { en: string; fr: string }> = {
    Active: { en: "Active", fr: "Actif" },
    Paused: { en: "Paused", fr: "En pause" },
  };
  return labels[status]?.[lang] ?? labels[status]?.en ?? status;
}

function AffiliateRowActions({
  lang,
  linkCopied,
  codeCopied,
  onCopyLink,
  onCopyCode,
  onRemove,
}: {
  lang: "en" | "fr";
  linkCopied: boolean;
  codeCopied: boolean;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onRemove: () => void;
}) {
  const menuItems: SplitMenuItem[] = [
    {
      label: codeCopied
        ? lang === "fr"
          ? "Code copié"
          : "Code copied"
        : lang === "fr"
          ? "Copier le code"
          : "Copy code",
      onClick: onCopyCode,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      label: lang === "fr" ? "Supprimer" : "Remove",
      onClick: onRemove,
      danger: true,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <SplitHeaderActions
      variant="white"
      size="sm"
      primaryLabel={
        linkCopied
          ? lang === "fr"
            ? "Lien copié"
            : "Link copied"
          : lang === "fr"
            ? "Copier le lien"
            : "Copy link"
      }
      onPrimaryClick={onCopyLink}
      menuAriaLabel={lang === "fr" ? "Actions affilié" : "Affiliate actions"}
      menuOffsetLeft={0}
      menuItems={menuItems}
    />
  );
}

function AffiliatesView({
  userId,
  isMobile,
  plan = "free",
  onUpgrade,
}: {
  userId: string;
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
}) {
  const lang = useLang();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [affiliatesLoaded, setAffiliatesLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [copiedRow, setCopiedRow] = useState<{ ref: string; kind: "link" | "code" } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [creatorAvatarMap, setCreatorAvatarMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setAffiliates(loadAffiliates(userId));
    setAffiliatesLoaded(true);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const loadCreators = async () => {
      const data = await getSavedCreators(userId);
      if (!cancelled) setCreatorAvatarMap(buildCreatorAvatarMap(data));
    };
    void loadCreators();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!affiliatesLoaded) return;
    saveAffiliates(userId, affiliates);
    if (affiliates.length === 0) return;
    void fetch("/api/affiliates/sync-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        entries: affiliates.map((a) => ({ creator: a.creator, code: a.code })),
      }),
    }).catch(() => {});
  }, [affiliates, userId, affiliatesLoaded]);

  const handleAddAffiliate = (row: Pick<AffiliateRow, "creator" | "platform" | "ref" | "code">) => {
    setAffiliates((list) => [
      { ...row, clicks: 0, conversions: 0, sales: 0, commission: 0, status: "Active" },
      ...list,
    ]);
    setPanelOpen(false);
  };

  const copyAffiliateText = async (text: string, ref: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRow({ ref, kind });
      setTimeout(() => setCopiedRow(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleRemoveAffiliate = (affiliate: AffiliateRow) => {
    const confirmed = window.confirm(
      lang === "fr"
        ? `Supprimer ${affiliate.creator} et son lien d'affiliation (/l/${affiliate.ref}) ?\n\nCette action est définitive.`
        : `Remove ${affiliate.creator} and their affiliate link (/l/${affiliate.ref})?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    const next = removeAffiliate(userId, affiliate.ref);
    setAffiliates(next);
    setActionMessage(
      lang === "fr"
        ? `${affiliate.creator} supprimé de vos affiliés.`
        : `${affiliate.creator} removed from your affiliates.`
    );
    setTimeout(() => setActionMessage(null), 4000);
  };

  return (
    <>
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          featureKey="affiliates"
          onClose={() => setUpgradeModalOpen(false)}
          onPrimary={() => {
            setUpgradeModalOpen(false);
            void onUpgrade?.();
          }}
        />
      )}
      <PageHeader isMobile={isMobile} title={lang === "fr" ? "Affiliés" : "Affiliates"} subtitle={lang === "fr" ? "Chaque créateur reçoit un lien de parrainage et un code promo uniques. Les ventes sont suivies automatiquement." : "Every creator gets a unique referral link and discount code. Sales tracked automatically."} right={
        <button
          type="button"
          className="hero-cta-shopify-light hero-cta-compact"
          onClick={() => {
            if (!canUseAffiliates(plan)) {
              setUpgradeModalOpen(true);
              return;
            }
            setPanelOpen(true);
          }}
        >
          {lang === "fr" ? "+ Ajouter un affilié" : "+ Add affiliate"}
        </button>
      } />
        <div style={{ padding: isMobile ? 16 : 40 }}>
        {actionMessage && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em" }}>
            {actionMessage}
          </div>
        )}

        <div style={{ marginTop: isMobile ? 8 : 24, background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16 }}>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 1fr 0.9fr 1.4fr", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EFEFEF", background: "#FAFAFA", minWidth: isMobile ? 520 : undefined }}>
            {[
              lang === "fr" ? "Créateur" : "Creator",
              lang === "fr" ? "Lien de parrainage" : "Referral link",
              lang === "fr" ? "Réduction" : "Discount",
              lang === "fr" ? "Statut" : "Status",
              lang === "fr" ? "Action" : "Action",
            ].map((h) => (
              <div key={h} style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{h}</div>
            ))}
          </div>
          {affiliates.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
              {lang === "fr" ? "Aucun affilié pour le moment." : "No affiliates yet."}
            </div>
          ) : affiliates.map((a, i) => {
            const linkCopied = copiedRow?.ref === a.ref && copiedRow.kind === "link";
            const codeCopied = copiedRow?.ref === a.ref && copiedRow.kind === "code";
            return (
              <div key={a.ref} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 1fr 0.9fr 1.4fr", gap: 12, padding: "16px 20px", borderBottom: i < affiliates.length - 1 ? "1px solid #F5F5F5" : "none", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CreatorAvatar
                    src={avatarUrlForCreatorHandle(a.creator, creatorAvatarMap)}
                    username={a.creator}
                    displayName={a.creator}
                    size={32}
                    alt={a.creator}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.creator}</div>
                    <div style={{ fontSize: 11, color: "#9A9A9A" }}>{a.platform}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#0047FF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buildTrackitShortLink(a.ref)}</div>
                <div style={{ fontSize: 12, color: "#1A1A1A", fontFamily: "monospace", fontWeight: 600 }}>{a.code}</div>
                <div><span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", textTransform: "capitalize", letterSpacing: "-0.01em" }}>{affiliateStatusLabel(a.status, lang)}</span></div>
                <div style={{ marginLeft: -14 }}>
                  <AffiliateRowActions
                    lang={lang}
                    linkCopied={linkCopied}
                    codeCopied={codeCopied}
                    onCopyLink={() => void copyAffiliateText(affiliateReferralLink(a.ref), a.ref, "link")}
                    onCopyCode={() => void copyAffiliateText(a.code, a.ref, "code")}
                    onRemove={() => handleRemoveAffiliate(a)}
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {panelOpen && (
        <AddAffiliatePanel
          userId={userId}
          existingAffiliates={affiliates}
          onClose={() => setPanelOpen(false)}
          onAdd={handleAddAffiliate}
        />
      )}
    </>
  );
}

function affiliateHandlesMatch(affiliateCreator: string, creatorHandle: string) {
  const a = affiliateCreator.replace(/^@/, "").toLowerCase();
  const b = creatorHandle.replace(/^@/, "").toLowerCase();
  return a === b;
}

function mapAffiliatePlatform(platform?: string) {
  const value = (platform || "").toLowerCase();
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("instagram")) return "Instagram";
  if (value.includes("youtube")) return "YouTube";
  if (value.includes("twitter") || value === "x") return "Twitter";
  return "Other";
}

type SavedCreatorPick = {
  id: string;
  handle: string;
  full_name?: string;
  platform?: string;
  avatar_url?: string;
  discount_code?: string;
};

function mapSavedCreatorPick(row: Record<string, unknown>): SavedCreatorPick {
  return {
    id: String(row.id ?? ""),
    handle: String(row.handle ?? row.username ?? ""),
    full_name: typeof row.full_name === "string" ? row.full_name : undefined,
    platform: typeof row.platform === "string" ? row.platform : undefined,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
    discount_code: typeof row.discount_code === "string" ? row.discount_code : undefined,
  };
}

function AddAffiliatePanel({
  userId,
  existingAffiliates,
  onClose,
  onAdd,
}: {
  userId: string;
  existingAffiliates: AffiliateRow[];
  onClose: () => void;
  onAdd: (row: Pick<AffiliateRow, "creator" | "platform" | "ref" | "code">) => void;
}) {
  const lang = useLang();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [discount, setDiscount] = useState("15");
  const [generated, setGenerated] = useState<{ ref: string; code: string; link: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [savedCreators, setSavedCreators] = useState<SavedCreatorPick[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCreators(true);
      const data = await getSavedCreators(userId);
      if (!cancelled) {
        setSavedCreators(data.map((row) => mapSavedCreatorPick(row as Record<string, unknown>)));
        setLoadingCreators(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase || cancelled) return;
      const { data } = await supabase.from("profiles").select("shopify_store_url").eq("id", userId).maybeSingle();
      if (!cancelled && data?.shopify_store_url) setDestinationUrl(String(data.shopify_store_url));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const availableCreators = savedCreators.filter(
    (creator) => !existingAffiliates.some((affiliate) => affiliateHandlesMatch(affiliate.creator, creator.handle)),
  );

  const normalizedHandle = handle.trim().startsWith("@") ? handle.trim() : handle.trim() ? `@${handle.trim()}` : "";

  const selectSavedCreator = (creator: SavedCreatorPick) => {
    const normalized = creator.handle.replace(/^@/, "");
    setSelectedCreatorId(creator.id);
    setHandle(normalized ? `@${normalized}` : "");
    setPlatform(mapAffiliatePlatform(creator.platform));
    setGenerated(null);
    setCopied(null);
    if (creator.discount_code) {
      const match = creator.discount_code.match(/(\d{1,2})$/);
      if (match) setDiscount(match[1]);
    }
  };

  const handleGenerate = async () => {
    if (!normalizedHandle || !destinationUrl.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const selected = savedCreators.find((creator) => creator.id === selectedCreatorId);
      const code = selected?.discount_code || codeFromHandle(normalizedHandle, discount);

      const created = await createAffiliateShortLink({
        brandId: userId,
        creatorUsername: normalizedHandle,
        destinationUrl: destinationUrl.trim(),
      });
      if (!created.ok || !created.slug) {
        setGenError(
          (lang === "fr" ? created.errorFr : undefined) ||
            created.error ||
            (lang === "fr" ? "Impossible de créer le lien." : "Could not create link."),
        );
        return;
      }

      const ref = created.slug;
      const link = created.link || affiliateReferralLink(ref);
      setGenerated({ ref, code, link });
      setCopied(null);

      if (selected?.id && userId && code) {
        void fetch("/api/affiliates/set-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, creatorId: selected.id, code, ref }),
        }).catch(() => {});
      } else if (userId && code && normalizedHandle) {
        void fetch("/api/affiliates/set-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, handle: normalizedHandle, code, ref }),
        }).catch(() => {});
      }
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const canGenerate = normalizedHandle.length > 1 && destinationUrl.trim().length > 0;
  const canAdd = !!generated && normalizedHandle;

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000 }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100vw)",
          background: "#FFFFFF",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.1)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid #EFEFEF", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>{lang === "fr" ? "Nouvel affilié" : "New affiliate"}</h2>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.45 }}>
              {lang === "fr"
                ? "Choisissez un créateur sauvegardé ou saisissez un pseudo, puis générez son lien et son code."
                : "Pick a saved creator or enter a handle, then generate their link and discount code."}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ ...iconBtn, flexShrink: 0 }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 10 }}>
              {lang === "fr" ? "Créateurs sauvegardés" : "Saved creators"}
            </label>
            {loadingCreators ? (
              <div style={{ fontSize: 13, color: "#9A9A9A", padding: "12px 0" }}>
                {lang === "fr" ? "Chargement…" : "Loading…"}
              </div>
            ) : availableCreators.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9A9A9A", padding: "12px 14px", background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12 }}>
                {savedCreators.length === 0
                  ? lang === "fr"
                    ? "Aucun créateur sauvegardé. Ajoutez-en depuis l’onglet Créateurs."
                    : "No saved creators yet. Add creators from the Creators tab."
                  : lang === "fr"
                    ? "Tous vos créateurs sauvegardés sont déjà des affiliés."
                    : "All your saved creators are already affiliates."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {availableCreators.map((creator) => {
                  const isSelected = selectedCreatorId === creator.id;
                  const displayName = creator.full_name || creator.handle;
                  const handleLabel = `@${creator.handle.replace(/^@/, "")}`;
                  return (
                    <button
                      key={creator.id}
                      type="button"
                      onClick={() => selectSavedCreator(creator)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 12,
                        ...selectionCardStyle(isSelected),
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <CreatorAvatar src={creator.avatar_url} username={creator.handle} displayName={displayName} size={36} alt={displayName} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selectionTextPrimary(isSelected), letterSpacing: "-0.02em" }}>{displayName}</div>
                        <div style={{ fontSize: 12, color: selectionTextSubtle(isSelected) }}>{handleLabel}</div>
                      </div>
                      {creator.platform && (
                        <span style={{ fontSize: 11, color: selectionTextMuted(isSelected), flexShrink: 0 }}>{mapAffiliatePlatform(creator.platform)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            {lang === "fr" ? "Ou saisir manuellement" : "Or enter manually"}
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "Pseudo de l'influenceur" : "Influencer handle"}</label>
          <input
            type="text"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setGenerated(null); setSelectedCreatorId(null); }}
            placeholder={lang === "fr" ? "Pseudo de l'influenceur" : "Influencer handle"}
            style={{ ...affiliateInputStyle, marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "Plateforme" : "Platform"}</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            style={{ ...affiliateInputStyle, marginBottom: 16, cursor: "pointer" }}
          >
            {["Instagram", "TikTok", "YouTube", "Twitter", "Other"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "Remise sur le code (%)" : "Discount on code (%)"}</label>
          <input
            type="text"
            inputMode="numeric"
            value={discount}
            onChange={(e) => { setDiscount(e.target.value.replace(/\D/g, "").slice(0, 2) || ""); setGenerated(null); }}
            placeholder="15"
            style={{ ...affiliateInputStyle, marginBottom: 20 }}
          />

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "URL de destination" : "Destination URL"}</label>
          <input
            type="url"
            value={destinationUrl}
            onChange={(e) => { setDestinationUrl(e.target.value); setGenerated(null); }}
            placeholder="https://votre-boutique.com"
            style={{ ...affiliateInputStyle, marginBottom: 20 }}
          />

          {genError ? <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{genError}</p> : null}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
            style={{ ...btnPrimary, width: "100%", opacity: canGenerate && !generating ? 1 : 0.45 }}
          >
            {generating
              ? lang === "fr"
                ? "Génération…"
                : "Generating…"
              : lang === "fr"
                ? "Générer"
                : "Generate"}
          </button>

          {generated && (
            <div style={{ marginTop: 24, padding: 16, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Generated</div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Referral link</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#0047FF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "10px 12px" }}>
                    {generated.link}
                  </div>
                  <button type="button" style={iconBtn} title="Copy link" onClick={() => void copyText(generated.link, "link")}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="#7A7A7A" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="#7A7A7A" strokeWidth="1.7"/></svg>
                  </button>
                </div>
                {copied === "link" && <div style={{ fontSize: 11, color: "#1FB567", marginTop: 4 }}>Copied</div>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Chemin court" : "Short path"}</div>
                <div style={{ fontSize: 13, color: "#1A1A1A", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", letterSpacing: "-0.02em" }}>/l/{generated.ref}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Discount code</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1A1A1A", fontFamily: "monospace", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "10px 12px" }}>
                    {generated.code}
                  </div>
                  <button type="button" style={iconBtn} title="Copy code" onClick={() => void copyText(generated.code, "code")}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="#7A7A7A" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="#7A7A7A" strokeWidth="1.7"/></svg>
                  </button>
                </div>
                {copied === "code" && <div style={{ fontSize: 11, color: "#1FB567", marginTop: 4 }}>Copied</div>}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #EFEFEF", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => {
              if (!generated || !normalizedHandle) return;
              const persistCode = () => {
                if (!userId || !generated.code) return;
                if (selectedCreatorId) {
                  void fetch("/api/affiliates/set-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, creatorId: selectedCreatorId, code: generated.code }),
                  }).catch(() => {});
                  return;
                }
                void fetch("/api/affiliates/set-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId, handle: normalizedHandle, code: generated.code }),
                }).catch(() => {});
              };
              persistCode();
              onAdd({ creator: normalizedHandle, platform, ref: generated.ref, code: generated.code });
            }}
            style={{ ...btnPrimary, width: "100%", opacity: canAdd ? 1 : 0.45 }}
          >
            {lang === "fr" ? "Ajouter aux affiliés" : "Add to affiliates"}
          </button>
          <button type="button" onClick={onClose} style={{ ...btnSecondary, width: "100%" }}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
        </div>
      </aside>
    </>
  );
}

function FilterDropdown({ label, value }: { label: string; value: string }) {
  return (
    <button type="button" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", color: "#1A1A1A", cursor: "pointer", letterSpacing: "-0.01em", minWidth: 0 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: "#9A9A9A" }}>{label}: </span>
        <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{value}</span>
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange?: () => void }) {
  const track = (
    <div style={{ position: "relative", width: 40, height: 22, background: on ? "#0047FF" : "#E5E5E5", borderRadius: 999, cursor: "pointer", transition: "background 0.2s" }}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#FFFFFF", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }} />
    </div>
  );
  if (onChange) {
    return (
      <label style={{ cursor: "pointer", display: "inline-flex" }}>
        <input type="checkbox" checked={on} onChange={onChange} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
        {track}
      </label>
    );
  }
  return track;
}

const iconBtn: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

function buildCreatorSidebarNavEntries(lang: "en" | "fr"): SidebarNavEntry[] {
  return [
    {
      id: "home",
      label: lang === "fr" ? "Accueil" : "Home",
      view: "dashboard",
      section: "main",
      iconKey: "home",
      keywords: ["home", "accueil", "overview", "dashboard"],
    },
    {
      id: "analytics",
      label: lang === "fr" ? "Analytiques" : "Analytics",
      view: "analytics",
      section: "main",
      iconKey: "analytics",
      keywords: ["analytics", "sales", "ventes", "commissions", "performance", "stats"],
    },
    {
      id: "scripts",
      label: "Scripts",
      view: "scripts",
      section: "main",
      iconKey: "scripts",
      keywords: ["scripts", "brief", "briefs", "video"],
    },
    {
      id: "content",
      label: "Content",
      view: "content",
      section: "main",
      iconKey: "content",
      keywords: ["content", "upload", "video", "files", "livrables", "ugc"],
    },
    {
      id: "payouts",
      label: "Pay it",
      view: "payouts",
      section: "main",
      iconKey: "payouts",
      keywords: ["payments", "pay", "payouts", "commissions", "iban", "paiements"],
    },
    {
      id: "notes",
      label: lang === "fr" ? "Notes" : "Notes",
      view: "notes",
      section: "main",
      iconKey: "notes",
      keywords: ["notes", "notepad", "memo"],
    },
    {
      id: "settings",
      label: lang === "fr" ? "Paramètres" : "Settings",
      view: "settings",
      section: "footer",
      iconKey: "settings",
      keywords: ["account", "profile", "settings", "paramètres"],
    },
  ];
}

function buildSidebarNavEntries(
  lang: "en" | "fr",
  counts: { activeCampaigns: number; savedCreators: number }
): SidebarNavEntry[] {
  return [
    {
      id: "discovery",
      label: "Find it",
      view: "discovery",
      section: "main",
      iconKey: "search",
      keywords: ["find", "find it", "creators", "search", "tiktok", "instagram", "recherche", "discovery"],
      children: [
        {
          id: "creators",
          label: lang === "fr" ? "Gérer" : "Manage",
          view: "creators",
          keywords: ["influencers", "profiles", "saved", "manage", "gérer"],
        },
      ],
    },
    {
      id: "campaigns",
      label: "Track it",
      view: "campaigns",
      section: "main",
      iconKey: "campaigns",
      keywords: ["campaign", "collaborations", "track it", "trackit"],
      children: [
        {
          id: "invitations",
          label: lang === "fr" ? "Invitations" : "Invitations",
          view: "invitations",
          keywords: ["invite", "creator", "inviter", "lien", "link", "invitation"],
        },
      ],
    },
    // Outreach ("Messages") — hidden from sidebar for now; view + OutreachView kept in codebase
    // { id: "outreach", label: "Outreach", view: "outreach", section: "main", iconKey: "outreach", keywords: ["outreach", "dm", "email", "follow up"] },
    {
      id: "payouts",
      label: "Pay it",
      view: "payouts",
      section: "main",
      iconKey: "payouts",
      keywords: ["payments", "pay", "commissions", "sales", "paiements", "payouts", "balance", "wallet", "solde", "transactions"],
      children: [
        {
          id: "balance",
          label: lang === "fr" ? "Solde" : "Balance",
          view: "balance",
          keywords: ["balance", "wallet", "funds", "solde", "fonds"],
        },
        {
          id: "transactions",
          label: lang === "fr" ? "Paiements" : "Payments",
          view: "transactions",
          keywords: ["payments", "transactions", "history", "ledger", "paiements", "commissions", "historique"],
        },
      ],
    },
    { id: "help", label: lang === "fr" ? "Centre d'aide" : "Help Center", view: "help", section: "footer", iconKey: "help", keywords: ["support", "guides", "docs", "faq"] },
    { id: "feedback", label: lang === "fr" ? "Avis" : "Feedback", view: "feedback", section: "footer", iconKey: "feedback", keywords: ["suggest", "bug", "feature request"] },
    { id: "settings", label: lang === "fr" ? "Paramètres" : "Settings", view: "settings", section: "footer", iconKey: "settings", keywords: ["account", "profile", "billing", "team", "preferences"] },
  ];
}

function renderSidebarNavIcon(iconKey: string) {
  switch (iconKey) {
    case "home":
      return <HomeIcon />;
    case "search":
      return <SearchIcon />;
    case "creators":
      return <CreatorsIcon />;
    case "campaigns":
      return <CampaignIcon />;
    case "affiliates":
      return <AffiliateIcon />;
    case "outreach":
      return <MessageIcon />;
    case "payouts":
      return <PayoutIcon />;
    case "invite":
      return <InviteIcon />;
    case "scripts":
      return <ScriptsIcon />;
    case "content":
      return <ContentIcon />;
    case "analytics":
      return <AnalyticsIcon />;
    case "integrations":
      return <IntegrationIcon />;
    case "notes":
      return <NotesIcon />;
    case "automation":
      return <AutomationIcon />;
    case "notifications":
      return <NotificationIcon />;
    case "dot-blue":
      return <DotIcon color="#0047FF" />;
    case "dot-pink":
      return <DotIcon color="#FF3D8B" />;
    case "help":
      return <HelpIcon />;
    case "feedback":
      return <FeedbackIcon />;
    case "settings":
      return <SettingsIcon />;
    default:
      return <HomeIcon />;
  }
}

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

function TrackitTagline({ sidebar, collapsed }: { sidebar?: boolean; collapsed?: boolean }) {
  if (sidebar && collapsed) return null;

  return (
    <span
      style={{
        fontSize: sidebar ? 11 : 14,
        fontWeight: 600,
        color: "#000000",
        letterSpacing: "-0.02em",
        lineHeight: sidebar ? 1.45 : 1.35,
        fontFamily: "inherit",
        whiteSpace: sidebar ? "normal" : "nowrap",
        display: sidebar ? "block" : "inline",
        textAlign: sidebar ? "center" : undefined,
      }}
    >
      Find it, <span style={{ color: "#0047FF" }}>Track it</span>, Pay it
      <span style={{ color: "#0047FF", fontSize: sidebar ? 18 : 28, lineHeight: 1 }}>.</span>
    </span>
  );
}

function planLabel(lang: "en" | "fr", isCreator: boolean, isScale: boolean, isPro: boolean, isBasic: boolean): string {
  if (isCreator) return lang === "fr" ? "Créateur" : "Creator";
  if (lang === "fr") {
    if (isScale) return "Plan Business";
    if (isPro) return "Plan Pro";
    if (isBasic) return "Plan Starter";
    return "Plan gratuit";
  }
  if (isScale) return "Business Plan";
  if (isPro) return "Pro Plan";
  if (isBasic) return "Starter Plan";
  return "Free Plan";
}

function DashboardTopBar({
  lang,
  profile,
  avatarBroken,
  onAvatarError,
  shopifyConnected,
  isCreator,
  isScale,
  isPro,
  isBasic,
  userId,
  notificationUnread,
  onNotificationUnreadChange,
  onNavigate,
  onConnectShopify,
}: {
  lang: "en" | "fr";
  profile: { full_name: string | null; username: string | null; avatar_url: string | null; business_name: string | null; shopify_store: string | null; plan: string } | null;
  avatarBroken: boolean;
  onAvatarError: () => void;
  shopifyConnected: boolean;
  isCreator: boolean;
  isScale: boolean;
  isPro: boolean;
  isBasic: boolean;
  userId?: string;
  notificationUnread: number;
  onNotificationUnreadChange: (count: number) => void;
  onNavigate: (view: View) => void;
  onConnectShopify: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [affiliatePanelOpen, setAffiliatePanelOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen && !notificationsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (accountRef.current?.contains(target) || notificationsRef.current?.contains(target)) return;
      setAccountOpen(false);
      setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [accountOpen, notificationsOpen]);

  const initials = (profile?.full_name?.[0] || profile?.username?.[0] || "?").toUpperCase();
  const username = profile?.username ? `@${profile.username}` : initials;
  const storeName = profile?.business_name?.trim() || profile?.shopify_store?.trim() || null;
  const plan = planLabel(lang, isCreator, isScale, isPro, isBasic);

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: "#1A1A1A",
    fontFamily: "inherit",
    textAlign: "left",
    letterSpacing: "-0.02em",
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: 240,
    background: "#FFFFFF",
    border: "1px solid #EFEFEF",
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
    padding: 6,
    zIndex: 1000,
  };

  const navAndClose = (view: View) => {
    onNavigate(view);
    setAccountOpen(false);
  };

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 16,
        padding: "0 24px",
        borderBottom: "1px solid #EFEFEF",
        background: "#FFFFFF",
        position: "relative",
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: "auto" }}>
        <div ref={notificationsRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              primeNotificationSound();
              setAccountOpen(false);
              setNotificationsOpen((v) => !v);
            }}
            aria-expanded={notificationsOpen}
            aria-label={lang === "fr" ? "Notifications" : "Notifications"}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              border: "1px solid #EFEFEF",
              borderRadius: 10,
              background: notificationsOpen ? "#F5F5F5" : "#FFFFFF",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "#5A5A5A",
            }}
          >
            <NotificationIcon />
            {notificationUnread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: "#0047FF",
                  color: "#FFFFFF",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  boxShadow: "0 0 0 2px #FFFFFF",
                }}
              >
                {notificationUnread > 9 ? "9+" : notificationUnread}
              </span>
            )}
          </button>
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 380,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: 12,
              boxShadow: notificationsOpen ? "0 12px 32px rgba(0,0,0,0.1)" : "none",
              overflow: "hidden",
              zIndex: 1000,
              visibility: notificationsOpen ? "visible" : "hidden",
              opacity: notificationsOpen ? 1 : 0,
              pointerEvents: notificationsOpen ? "auto" : "none",
            }}
          >
            <NotificationsPanel
              userId={userId}
              onUnreadChange={onNotificationUnreadChange}
              onOpenAction={(action) => {
                if (action === "feedback") {
                  onNavigate("feedback");
                  setNotificationsOpen(false);
                }
              }}
            />
          </div>
        </div>

      <div ref={accountRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setNotificationsOpen(false);
            setAccountOpen((v) => !v);
          }}
          aria-expanded={accountOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px 4px 4px",
            border: "1px solid #EFEFEF",
            borderRadius: 999,
            background: accountOpen ? "#F5F5F5" : "#FFFFFF",
            cursor: "pointer",
            fontFamily: "inherit",
            maxWidth: 220,
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8EEFC", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            {profile?.avatar_url && !avatarBroken ? (
              <img key={profile.avatar_url} src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={onAvatarError} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0047FF" }}>{initials}</span>
            )}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {username}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#9A9A9A", flexShrink: 0, transform: accountOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {accountOpen && (
          <div style={dropdownStyle}>
            <div style={{ padding: "10px 12px 8px" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 2px", letterSpacing: "-0.02em" }}>{username}</p>
              <p style={{ fontSize: 12, color: "#9A9A9A", margin: 0, letterSpacing: "-0.01em" }}>{plan}</p>
              {storeName && !isCreator && (
                <p style={{ fontSize: 12, color: "#0047FF", margin: "4px 0 0", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {storeName}
                </p>
              )}
            </div>
            <div style={{ height: 1, background: "#F0F0F0", margin: "0 4px 4px" }} />
            <button type="button" style={menuItemStyle} onClick={() => navAndClose("settings")}>
              <SettingsIcon />
              {lang === "fr" ? "Paramètres" : "Settings"}
            </button>
            {isCreator && (
              <button
                type="button"
                style={menuItemStyle}
                onClick={() => {
                  setAccountOpen(false);
                  setAffiliatePanelOpen(true);
                }}
              >
                <AffiliateIcon />
                {lang === "fr" ? "Lien d'affiliation" : "Affiliate link"}
              </button>
            )}
            {!isCreator && (
              <button type="button" style={menuItemStyle} onClick={() => navAndClose("billing")}>
                <BillingIcon />
                {lang === "fr" ? "Facturation" : "Billing"}
              </button>
            )}
            <button type="button" style={menuItemStyle} onClick={() => navAndClose("feedback")}>
              <FeedbackIcon />
              {lang === "fr" ? "Avis" : "Feedback"}
            </button>
            {!isCreator && (
              <button type="button" style={menuItemStyle} onClick={() => navAndClose("help")}>
                <HelpIcon />
                {lang === "fr" ? "Centre d'aide" : "Help Center"}
              </button>
            )}
            {!isCreator && (
              <>
                <div style={{ height: 1, background: "#F0F0F0", margin: "6px 4px" }} />
                <div style={{ padding: "4px" }}>
                  <button
                    type="button"
                    className="hero-cta-shopify"
                    onClick={() => {
                      onConnectShopify();
                      setAccountOpen(false);
                    }}
                    style={{ width: "100%", justifyContent: "center", gap: 8, padding: "11px 16px", fontSize: 15 }}
                  >
                    <img src="/shopify-logo.svg" alt="" width={20} height={20} style={{ display: "block" }} />
                    {shopifyConnected
                      ? lang === "fr"
                        ? "Gérer Shopify"
                        : "Manage Shopify"
                      : lang === "fr"
                        ? "Connecter Shopify"
                        : "Connect Shopify"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
      {isCreator && affiliatePanelOpen && userId && (
        <CreatorAffiliateReadPanel
          lang={lang}
          userId={userId}
          onClose={() => setAffiliatePanelOpen(false)}
        />
      )}
    </header>
  );
}

function SidebarNavGroup({
  collapsed,
  expanded,
  active,
  icon,
  label,
  badge,
  subItems,
  parentView,
  activeView,
  onParentClick,
  onToggleExpand,
  onChildClick,
}: {
  collapsed: boolean;
  expanded: boolean;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  subItems: SidebarNavChild[];
  parentView: View;
  activeView: View;
  onParentClick: () => void;
  onToggleExpand: () => void;
  onChildClick: (view: View) => void;
}) {
  if (collapsed) {
    return (
      <SidebarItem collapsed icon={icon} label={label} active={active} badge={badge} onClick={onParentClick} />
    );
  }

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
        {active && <span style={{ position: "absolute", left: -8, top: 7, bottom: 7, width: 3, borderRadius: 2, background: "#0047FF" }} />}
        <button
          type="button"
          onClick={onParentClick}
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 10,
            padding: "8px 8px",
            borderRadius: 9,
            border: "none",
            background: activeView === parentView ? "#F5F5F5" : "transparent",
            color: active ? "#1A1A1A" : "#5A5A5A",
            fontSize: 13,
            fontWeight: active ? 500 : 400,
            letterSpacing: "-0.02em",
            fontFamily: "inherit",
            cursor: "pointer",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: active ? "#0047FF" : "#9A9A9A", flexShrink: 0 }}>{icon}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {badge && <span style={{ fontSize: 11, color: "#9A9A9A", background: "#F5F5F5", padding: "2px 8px", borderRadius: 6 }}>{badge}</span>}
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 34,
            border: "none",
            background: "transparent",
            color: "#9A9A9A",
            cursor: "pointer",
            borderRadius: 8,
            flexShrink: 0,
            fontFamily: "inherit",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20, marginTop: 2 }}>
          {subItems.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onChildClick(child.view)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 10,
                padding: "7px 8px 7px 12px",
                borderRadius: 8,
                border: "none",
                background: activeView === child.view ? "#F5F5F5" : "transparent",
                color: activeView === child.view ? "#1A1A1A" : "#5A5A5A",
                fontSize: 13,
                fontWeight: activeView === child.view ? 500 : 400,
                letterSpacing: "-0.02em",
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                marginBottom: 2,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeView === child.view ? "#0047FF" : "#D0D0D0", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarItem({ collapsed, icon, label, active, badge, onClick }: { collapsed: boolean; icon: React.ReactNode; label: string; active?: boolean; badge?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: collapsed ? "8px 0" : "8px 8px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 9, border: "none", background: active ? "#F5F5F5" : "transparent", color: active ? "#1A1A1A" : "#5A5A5A", fontSize: 13, fontWeight: active ? 500 : 400, letterSpacing: "-0.02em", marginBottom: 2, position: "relative", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
      {active && !collapsed && <span style={{ position: "absolute", left: -8, top: 7, bottom: 7, width: 3, borderRadius: 2, background: "#0047FF" }} />}
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: active ? "#0047FF" : "#9A9A9A", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
      {!collapsed && badge && <span style={{ fontSize: 11, color: "#9A9A9A", background: "#F5F5F5", padding: "2px 8px", borderRadius: 6 }}>{badge}</span>}
    </button>
  );
}


function HomeIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function SearchIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function CreatorsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function AffiliateIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 17l6-10M7 8a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function CampaignIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 11l16-6v14L3 13v-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M7 13v5l4 1v-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function MessageIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function PayoutIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M2 11h20" stroke="currentColor" strokeWidth="1.7"/><circle cx="17" cy="15" r="1.2" fill="currentColor"/></svg>; }
function InviteIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M2 7l10 6 10-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ScriptsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 2v6h6M8 13h8M8 17h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ContentIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M10 10l5 3-5 3V10z" fill="currentColor"/><path d="M3 9h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function AnalyticsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 3a9 9 0 019 9h-9V3z" fill="currentColor" opacity="0.25"/></svg>; }
function IntegrationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3v6H3v6h6v6h6v-6h6V9h-6V3H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function NotesIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function AutomationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function NotificationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function HelpIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>; }
function FeedbackIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function BillingIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M2 10h20" stroke="currentColor" strokeWidth="1.7"/><path d="M6 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>; }
function DotIcon({ color }: { color: string }) { return <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />; }
