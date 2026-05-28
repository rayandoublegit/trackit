"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSavedCreators } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { SettingsView } from "./SettingsView";
import { AnalyticsView } from "./AnalyticsView";
import { CampaignsView } from "./CampaignsView";
import { DiscoveryView } from "./DiscoveryView";
import { CreatorsView } from "./CreatorsView";
import { OutreachHistorySection } from "./OutreachView";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade } from "@/lib/checkout";
import {
  canAddAnotherShopifyStore,
  canBulkImportTemplatesCsv,
  canChangeShopifyStore,
  canCreateTemplates,
  canImportTemplates,
  canUseAutoFollowUp,
  canUseAutomationWorkflows,
  canUseFullAutomationAgent,
  canUseShopify,
  canUseWhiteLabelOutreach,
  isGrowthOrAbove,
  isScalePlan,
  maxShopifyStores,
  normalizePlan,
  type PlanTier,
} from "@/lib/plan-limits";
import { AddPaymentMethodModal, LiveSalesFeed, PayoutsView, PayoutsWorkspacePaymentCard } from "./PayoutsView";
import { getDefaultPaymentMethod, usePaymentMethods } from "./usePaymentMethods";
import { FeedbackView } from "./FeedbackView";
import { HelpCenterView } from "./HelpCenterView";
import { NotificationsView, getInitialUnreadCount } from "./NotificationsView";
import {
  ensureNotificationsReset,
  getStoredUnreadCount,
  NOTIFICATIONS_UPDATED_EVENT,
  notifyShopifyConnected,
  notifyWelcomeIfNeeded,
} from "@/lib/notifications-storage";
import { installNotificationSoundUnlock, primeNotificationSound } from "@/lib/notification-sound";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";
import { recordLoginIp } from "@/lib/record-login";
import { useLang } from "@/lib/useLang";

type View = "dashboard" | "discovery" | "creators" | "campaigns" | "affiliates" | "outreach" | "payouts" | "analytics" | "integrations" | "automation" | "settings" | "feedback" | "notifications" | "help";

type SidebarNavSection = "main" | "tools" | "workspace" | "footer";

type SidebarNavEntry = {
  id: string;
  label: string;
  view: View;
  section: SidebarNavSection;
  keywords: string[];
  badge?: string;
  iconKey: string;
};

function getSidebarSectionLabels(lang: "en" | "fr"): Record<Exclude<SidebarNavSection, "footer">, string> {
  return {
    main: lang === "fr" ? "MENU PRINCIPAL" : "MAIN MENU",
    tools: lang === "fr" ? "OUTILS" : "TOOLS",
    workspace: lang === "fr" ? "ESPACE DE TRAVAIL" : "WORKSPACE",
  };
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; username: string | null; avatar_url: string | null; business_name: string | null; shopify_store: string | null; plan: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("dashboard");
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
  });

  const reloadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, username, avatar_url, business_name")
      .eq("id", userId)
      .maybeSingle();
    if (!profileData) return;
    const avatar_url = await resolveAvatarUrl(supabase, userId, profileData.avatar_url);
    setAvatarBroken(false);
    setProfile((prev) => ({
      full_name: profileData.full_name,
      username: profileData.username,
      avatar_url,
      business_name: profileData.business_name,
      shopify_store: prev?.shopify_store ?? null,
      plan: prev?.plan ?? "free",
    }));
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    ensureNotificationsReset();
    setNotificationUnread(getInitialUnreadCount());
    const refreshUnread = () => setNotificationUnread(getStoredUnreadCount());
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshUnread);
    const removeSoundUnlock = installNotificationSoundUnlock();
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshUnread);
      removeSoundUnlock();
    };
  }, []);

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

  // Welcome notification once per user (persisted — not on every refresh).
  useEffect(() => {
    if (loading || !user?.id) return;
    const timer = window.setTimeout(() => {
      primeNotificationSound();
      notifyWelcomeIfNeeded(user.id, lang);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading, user?.id, lang]);

  useEffect(() => {
    if (!supabase) { setLoading(false); router.replace("/auth"); return; }
    void supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      try {
        if (!authUser) { router.replace("/auth"); setLoading(false); return; }

        const loadProfile = async () => {
          const { data } = await supabase!
            .from("profiles")
            .select("onboarding_completed, full_name, username, avatar_url, business_name, plan, subscription_status, shopify_store")
            .eq("id", authUser.id)
            .maybeSingle();
          return data;
        };

        const profileData = await loadProfile();
        if (!profileData) {
          router.replace("/auth");
          return;
        }
        setShopifyStore(profileData.shopify_store || null);
        setUser(authUser);
        const avatar_url = await resolveAvatarUrl(supabase!, authUser.id, profileData.avatar_url);
        avatarRetryRef.current = false;
        setAvatarBroken(false);
        setProfile({
          full_name: profileData.full_name,
          username: profileData.username,
          avatar_url,
          business_name: profileData.business_name,
          shopify_store: profileData.shopify_store ?? null,
          plan: normalizePlan(profileData.plan),
        });
        void recordLoginIp();
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  useEffect(() => {
    if (!user?.id || loading || searchParams.get("upgraded") !== "true") return;
    const client = supabase;
    if (!client) return;

    let cancelled = false;
    const refreshPlan = async () => {
      const { data } = await client
        .from("profiles")
        .select("plan, subscription_status")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setProfile((prev) =>
        prev ? { ...prev, plan: normalizePlan(data.plan) } : prev
      );
    };

    void refreshPlan();
    const t1 = window.setTimeout(() => void refreshPlan(), 2000);
    const t2 = window.setTimeout(() => void refreshPlan(), 5000);

    const url = new URL(window.location.href);
    url.searchParams.delete("upgraded");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [user?.id, loading, searchParams]);

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
      });
    };
    check();
  }, [user?.id]);

  const checkoutCurrency = lang === "fr" ? "eur" : "usd";

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
  }, [profile?.avatar_url]);

  const sidebarNavEntries = useMemo(
    () => buildSidebarNavEntries(notificationUnread, lang, sidebarCounts),
    [notificationUnread, lang, sidebarCounts]
  );

  const sidebarSectionLabels = useMemo(() => getSidebarSectionLabels(lang), [lang]);

  const filteredSidebarNav = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return sidebarNavEntries;
    return sidebarNavEntries.filter((item) => {
      const haystack = [
        item.label,
        item.section,
        sidebarSectionLabels[item.section as Exclude<SidebarNavSection, "footer">] ?? "",
        ...item.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sidebarSearch, sidebarNavEntries, sidebarSectionLabels]);

  const isSidebarSearching = sidebarSearch.trim().length > 0;

  const goToSidebarItem = (targetView: View) => {
    setView(targetView);
    setSidebarSearch("");
    sidebarSearchRef.current?.blur();
    if (isMobile) setMobileSidebarOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarCollapsed(false);
        sidebarSearchRef.current?.focus();
        sidebarSearchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#FAFAFA" }} />;
  }

  const sidebarWidth = sidebarCollapsed ? 72 : 264;

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

  const storeName = profile?.business_name?.trim() || null;

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "#9A9A9A",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "12px 12px 8px 12px",
  };

  const renderSidebarNavItems = (items: SidebarNavEntry[], showSectionGap?: boolean) => (
    <>
      {showSectionGap && sidebarCollapsed && items.length > 0 && <div style={{ height: 16 }} />}
      {items.map((item) => (
        <SidebarItem
          key={item.id}
          collapsed={sidebarCollapsed}
          icon={renderSidebarNavIcon(item.iconKey)}
          label={item.label}
          active={view === item.view}
          badge={item.badge}
          onClick={() => goToSidebarItem(item.view)}
        />
      ))}
    </>
  );

  const renderNavSection = (section: Exclude<SidebarNavSection, "footer">, extraTopPadding?: boolean) => {
    const items = filteredSidebarNav.filter((item) => item.section === section);
    if (items.length === 0) return null;
    return (
      <>
        {!sidebarCollapsed && (
          <div
            style={{
              ...sectionHeaderStyle,
              padding: extraTopPadding ? "20px 12px 8px 12px" : sectionHeaderStyle.padding,
            }}
          >
            {sidebarSectionLabels[section]}
          </div>
        )}
        {renderSidebarNavItems(items, extraTopPadding)}
      </>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex" }}>
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
        <div style={{ padding: sidebarCollapsed ? "12px 8px" : "12px 16px", borderBottom: "1px solid #F5F5F5", display: "flex", justifyContent: sidebarCollapsed ? "center" : "flex-start", alignItems: "center", gap: 10 }}>
          <img
            src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
            alt="Trackit"
            style={{
              height: sidebarCollapsed ? 52 : 72,
              width: "auto",
              maxWidth: sidebarCollapsed ? 56 : undefined,
              display: "block",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
          {!sidebarCollapsed && (
            <span style={{ fontSize: 14, fontWeight: 600, color: "#000000", letterSpacing: "-0.02em", lineHeight: 1.35, fontFamily: "inherit" }}>
              Find it, Track it, Pay it
              <span style={{ color: "#0047FF", fontSize: 28, lineHeight: 1 }}>.</span>
            </span>
          )}
        </div>
        <div style={{ padding: "16px 16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #F5F5F5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#E8EEFC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {profile?.avatar_url && !avatarBroken ? (
                <img
                  key={profile.avatar_url}
                  src={profile.avatar_url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={handleSidebarAvatarError}
                />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 600, color: "#0047FF", letterSpacing: "-0.02em" }}>
                  {(profile?.full_name?.[0] || profile?.username?.[0] || "?").toUpperCase()}
                </span>
              )}
            </div>
            {!sidebarCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile?.username ? `@${profile.username}` : "Account"}
                </span>
                <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                  {lang === "fr"
                    ? isScale
                      ? "Plan Scale"
                      : plan === "pro"
                        ? "Plan Pro"
                        : plan === "basic"
                          ? "Plan Growth"
                          : "Plan gratuit"
                    : isScale
                      ? "Scale Plan"
                      : plan === "pro"
                        ? "Pro Plan"
                        : plan === "basic"
                          ? "Growth Plan"
                          : "Free Plan"}
                </span>
                {storeName && (
                  <span style={{ fontSize: 12, color: "#0047FF", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {storeName}
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setSidebarCollapsed((c) => !c)} aria-label="Toggle sidebar" style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9A9A", display: "flex", padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d={sidebarCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {!sidebarCollapsed && (
          <div style={{ padding: "14px 12px 6px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", borderRadius: 10, padding: "8px 12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                ref={sidebarSearchRef}
                type="search"
                placeholder="Search menu..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredSidebarNav.length > 0) {
                    e.preventDefault();
                    goToSidebarItem(filteredSidebarNav[0].view);
                  }
                  if (e.key === "Escape") {
                    setSidebarSearch("");
                    sidebarSearchRef.current?.blur();
                  }
                }}
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", fontFamily: "inherit", flex: 1, minWidth: 0, letterSpacing: "-0.01em" }}
              />
              <button
                type="button"
                onClick={() => {
                  setSidebarCollapsed(false);
                  sidebarSearchRef.current?.focus();
                }}
                style={{ fontSize: 11, color: "#9A9A9A", background: "#FFFFFF", padding: "2px 6px", borderRadius: 5, border: "1px solid #E5E5E5", cursor: "pointer", fontFamily: "inherit" }}
              >
                ⌘K
              </button>
            </div>
          </div>
        )}

        <nav style={{ flex: 1, padding: "10px 12px", overflowY: "auto" }}>
          {isSidebarSearching ? (
            <>
              {!sidebarCollapsed && <div style={sectionHeaderStyle}>Results</div>}
              {filteredSidebarNav.length === 0 ? (
                !sidebarCollapsed && (
                  <div style={{ padding: "8px 12px", fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                    No menu items found
                  </div>
                )
              ) : (
                renderSidebarNavItems(filteredSidebarNav)
              )}
            </>
          ) : (
            <>
              {renderNavSection("main")}
              {renderNavSection("tools", true)}
              {renderNavSection("workspace", true)}
            </>
          )}
        </nav>

        {!isSidebarSearching && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid #F5F5F5" }}>
            {renderSidebarNavItems(sidebarNavEntries.filter((item) => item.section === "footer"))}
          </div>
        )}

        <div style={{ padding: "12px 12px 16px 12px" }}>
          <button
            type="button"
            onClick={() => {
              if (isScale) setView("settings");
              else if (plan === "pro") void handleUpgradeScale();
              else if (plan === "basic") void handleUpgradePro();
              else void handleUpgradeBasic();
            }}
            style={{ width: "100%", background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 14, padding: sidebarCollapsed ? "12px 0" : "14px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 14h7v8l8-12h-7V2z" fill="#FFFFFF"/></svg>
            </div>
            {!sidebarCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em" }}>Upgrade & unlock</span>
                <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, letterSpacing: "-0.01em" }}>all features</span>
              </div>
            )}
          </button>
        </div>
      </aside>

      <main className="dashboard-main" style={{ flex: 1, overflow: "auto", background: "#FAFAFA" }}>
        {view === "dashboard" && <HomeView isMobile={isMobile} fullName={profile?.full_name ?? null} username={profile?.username ?? null} gettingStarted={gettingStarted} user={user} />}
        {view === "discovery" && (
          <DiscoveryView
            isMobile={isMobile}
            plan={plan}
            onUpgrade={handleUpgradeBasic}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
          />
        )}
        {view === "creators" && (
          <CreatorsView
            isMobile={isMobile}
            plan={plan}
            onUpgrade={handleUpgradeBasic}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
          />
        )}
        {view === "campaigns" && (
          <CampaignsView
            isMobile={isMobile}
            plan={plan}
            onUpgrade={handleUpgradeBasic}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
          />
        )}
        {view === "affiliates" && (
          canUseBasicFeatures ? (
            <AffiliatesView isMobile={isMobile} />
          ) : (
            <UpgradeGate feature="Affiliates" requiredPlan="Basic" onUpgrade={handleUpgradeBasic} isMobile={isMobile} />
          )
        )}
        {view === "outreach" && (
          <OutreachView
            isMobile={isMobile}
            plan={plan}
            onUpgradePro={handleUpgradePro}
            onUpgradeScale={handleUpgradeScale}
            onNavigateToBilling={() => {
              if (plan === "free") void handleUpgradeBasic();
              else if (plan === "basic") void handleUpgradePro();
              else setView("settings");
            }}
          />
        )}
        {view === "payouts" && user && (
          canUseBasicFeatures ? (
            <PayoutsView userId={user.id} isMobile={isMobile} plan={plan} onUpgrade={handleUpgradeBasic} onUpgradePro={handleUpgradePro} onUpgradeScale={handleUpgradeScale} />
          ) : (
            <UpgradeGate feature="Payouts" requiredPlan="Basic" onUpgrade={handleUpgradeBasic} isMobile={isMobile} />
          )
        )}
        {view === "analytics" && user && (
          canUseBasicFeatures ? (
            <AnalyticsView userId={user.id} isMobile={isMobile} plan={plan} shopifyStore={shopifyStore ?? profile?.shopify_store ?? undefined} onUpgradePro={handleUpgradePro} onConnectShopify={() => setView("integrations")} />
          ) : (
            <UpgradeGate feature="Analytics" requiredPlan="Basic" onUpgrade={handleUpgradeBasic} isMobile={isMobile} />
          )
        )}
        {view === "integrations" && (
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
        {view === "automation" && (
          canUseAutomationWorkflows(plan) ? (
            <AutomationView isMobile={isMobile} plan={plan} onUpgradeScale={handleUpgradeScale} />
          ) : (
            <UpgradeGate feature="Automation" requiredPlan="Pro" onUpgrade={handleUpgradePro} isMobile={isMobile} />
          )
        )}
        {view === "settings" && user && (
          <SettingsView isMobile={isMobile} onProfileUpdate={() => void reloadProfile(user.id)} />
        )}
        {view === "feedback" && <FeedbackView isMobile={isMobile} />}
        {view === "help" && <HelpCenterView isMobile={isMobile} plan={plan} />}
        {view === "notifications" && <NotificationsView isMobile={isMobile} onUnreadChange={setNotificationUnread} />}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#FAFAFA" }} />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function PageHeader({ title, subtitle, right, isMobile }: { title: string; subtitle?: string; right?: React.ReactNode; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 24, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{subtitle}</p>}
        </div>
        {right && <div style={{ marginTop: 8, flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  );
}

function ShopifyConnectModal({ onClose, userId, lang }: { onClose: () => void; userId?: string; lang: "en" | "fr" }) {
  const [shopDomain, setShopDomain] = useState("");
  const [shopError, setShopError] = useState("");

  const handleConnect = () => {
    if (!shopDomain.trim()) {
      setShopError(lang === "fr" ? "Entrez le nom de votre boutique" : "Please enter your store name");
      return;
    }
    setShopError("");
    let name = shopDomain.trim().toLowerCase();
    name = name.replace(/^https?:\/\//, "");
    name = name.replace(/\.myshopify\.com.*/, "");
    name = name.replace(/\..*/, "");
    name = name.replace(/[^a-z0-9-]/g, "");
    const domain = `${name}.myshopify.com`;
    window.location.href = `/api/shopify/install?shop=${domain}&user_id=${userId || ""}`;
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}
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
            ? "Entrez l'URL de votre boutique .myshopify.com pour autoriser Trackit."
            : "Enter your .myshopify.com store URL to authorize Trackit."}
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6, letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "URL de la boutique" : "Store URL"}
        </label>
        <input
          type="text"
          value={shopDomain}
          onChange={(e) => { setShopDomain(e.target.value); setShopError(""); }}
          placeholder="yourstore.myshopify.com"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", color: "#1A1A1A", marginBottom: 8 }}
          autoFocus
        />
        <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 16px", lineHeight: 1.45 }}>
          {lang === "fr"
            ? "Trouvez-la dans Shopify Admin → Paramètres → Domaines."
            : "Find it in Shopify Admin → Settings → Domains."}
        </p>
        {shopError && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 12px" }}>{shopError}</p>}
        <button type="button" className="hero-cta-shopify-dark" onClick={handleConnect} style={{ width: "100%", justifyContent: "center" }}>
          <img src="/shopify-logo.svg" alt="" width={20} height={23} style={{ display: "block", flexShrink: 0 }} />
          {lang === "fr" ? "Connecter Shopify" : "Connect Shopify"}
        </button>
      </div>
    </div>
  );
}

function HomeView({ fullName, username, isMobile, gettingStarted, user }: { fullName: string | null; username: string | null; isMobile?: boolean; gettingStarted: { shopify: boolean; shopifyStore: string | null; creators: boolean; outreach: boolean; sales: boolean }; user?: User | null }) {
  const lang = useLang();
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const displayName = fullName?.split(" ")[0] || (username ? `@${username}` : "");
  const welcomeGreeting = lang === "fr" ? "Bon retour" : "Welcome back";
  const checklistSteps = [
    { label: lang === "fr" ? "Connecter la boutique Shopify" : "Connect Shopify store", completed: gettingStarted.shopify },
    { label: lang === "fr" ? "Trouver vos premiers créateurs" : "Find your first creators", completed: gettingStarted.creators },
    { label: lang === "fr" ? "Envoyer votre premier message" : "Send first outreach", completed: gettingStarted.outreach },
    { label: lang === "fr" ? "Suivre votre première vente" : "Track first sale", completed: gettingStarted.sales },
  ];
  return (
    <>
      <PageHeader isMobile={isMobile} title={`${welcomeGreeting}${displayName ? ", " + displayName : ""}.`} subtitle={lang === "fr" ? "Connectez votre boutique Shopify pour commencer." : "Connect your Shopify store to get started."} />
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 18, padding: isMobile ? 32 : 60, textAlign: "center", marginBottom: 24 }}>
          <div style={{ margin: "0 auto 20px", display: "flex", justifyContent: "center" }}>
            <img src="/shopify-logo.svg" alt="Shopify" width={56} height={64} style={{ display: "block" }} />
          </div>
          {gettingStarted.shopify ? (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: "#22C55E", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>{lang === "fr" ? "Boutique Shopify connectée ✓" : "Shopify store connected ✓"}</h2>
              <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>{lang === "fr" ? "Vos commandes sont synchronisées. Les ventes de vos créateurs sont suivies automatiquement." : "Your orders are synced. Creator sales are tracked automatically."}</p>
              {gettingStarted.shopifyStore && (
                <p style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 500, marginTop: 16, marginBottom: 0, letterSpacing: "-0.01em" }}>{gettingStarted.shopifyStore}</p>
              )}
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>{lang === "fr" ? "Connectez votre boutique Shopify" : "Connect your Shopify store"}</h2>
              <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 24, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>{lang === "fr" ? "Synchronisez vos produits, commandes et clients en temps réel. Nous suivrons automatiquement chaque vente générée par vos créateurs." : "Sync products, orders, and customers in real time. We'll automatically track every sale your creators drive."}</p>
              <button type="button" className="hero-cta-shopify-dark" onClick={() => setShopifyModalOpen(true)}>
                <img src="/shopify-logo.svg" alt="" width={20} height={23} style={{ display: "block", flexShrink: 0 }} />
                {lang === "fr" ? "Connecter Shopify" : "Connect Shopify"}
              </button>
              <p style={{ fontSize: 12, color: "#9A9A9A", marginTop: 14 }}>{lang === "fr" ? "Intégration Shopify non connectée" : "Shopify integration not connected yet"}</p>
            </>
          )}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 16 }}>{lang === "fr" ? "Pour commencer" : "Getting started"}</h3>
          {checklistSteps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: i < checklistSteps.length - 1 ? "1px solid #F5F5F5" : "none" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: step.completed ? "#0047FF" : "transparent",
                border: step.completed ? "none" : "2px solid #DCDCDC",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease"
              }}>
                {step.completed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ fontSize: 14, color: step.completed ? "#9A9A9A" : "#1A1A1A", textDecoration: step.completed ? "line-through" : "none", opacity: step.completed ? 0.6 : 1, transition: "all 0.2s ease" }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      {shopifyModalOpen && (
        <ShopifyConnectModal lang={lang} userId={user?.id} onClose={() => setShopifyModalOpen(false)} />
      )}
    </>
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

const OUTREACH_DM_PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitter", "Email"] as const;


const INITIAL_OUTREACH_TEMPLATES: OutreachTemplate[] = [];

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

function UpgradeModal({ lang, message, onClose }: { lang: "fr" | "en"; message: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 56, width: "auto", marginBottom: 16 }} />
        <p style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.6, margin: "0 0 24px", whiteSpace: "pre-line" }}>{message}</p>
        <button type="button" onClick={() => { window.location.href = "/#pricing"; }} style={{ width: "100%", background: "#0047FF", color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.02em" }}>
          {lang === "fr" ? "Voir les plans →" : "View plans →"}
        </button>
      </div>
    </div>
  );
}

function OutreachView({
  plan,
  onNavigateToBilling,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
}: {
  plan: PlanTier;
  onNavigateToBilling: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
}) {
  const lang = useLang();
  const [templates, setTemplates] = useState<OutreachTemplate[]>(INITIAL_OUTREACH_TEMPLATES);
  const [panel, setPanel] = useState<OutreachPanel>(null);
  const [sendTemplateId, setSendTemplateId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [whiteLabel, setWhiteLabel] = useState(false);

  const closePanel = () => setPanel(null);

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
      <PageHeader isMobile={isMobile} title={lang === "fr" ? "Messages" : "Outreach"} subtitle={lang === "fr" ? "Envoyez des messages personnalisés et gérez les relances automatiquement" : "Send personalized messages and manage follow-ups automatically"} right={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => {
            if (!canImportTemplates(plan)) {
              setUpgradeMsg(lang === "fr"
                ? "🔒 Modèles — Plan Growth requis.\n\nAccédez à vos meilleurs templates et réutilisez-les sur tous vos créateurs.\n\nPassez à Growth →"
                : "🔒 Templates — Growth plan required.\n\nAccess your best templates and reuse them across all your creators.\n\nUpgrade to Growth →");
              return;
            }
            setPanel("seeTemplates");
          }}>{lang === "fr" ? "Voir les modèles" : "See templates"}</button>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => {
            if (!canImportTemplates(plan)) {
              setUpgradeMsg(lang === "fr"
                ? "🔒 Import de modèles — Plan Growth requis.\n\nImportez vos meilleurs templates en un clic.\n\nPassez à Growth →"
                : "🔒 Template import — Growth plan required.\n\nImport your best-performing templates in one click.\n\nUpgrade to Growth →");
              return;
            }
            setPanel("import");
          }}>{lang === "fr" ? "Importer un modèle" : "Import template"}</button>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => {
            if (!canBulkImportTemplatesCsv(plan)) {
              setUpgradeMsg(lang === "fr"
                ? "🔒 Import CSV en masse — Plan Pro requis.\n\nImportez tous vos modèles d'un coup.\n\nPassez à Pro →"
                : "🔒 Bulk CSV import — Pro plan required.\n\nImport all your templates at once.\n\nUpgrade to Pro →");
              return;
            }
            setPanel("importCsv");
          }}>{lang === "fr" ? "Import CSV" : "Import CSV"}</button>
          <button type="button" className="hero-cta-shopify-light hero-cta-compact" onClick={() => {
            if (!canCreateTemplates(plan)) {
              setUpgradeMsg(lang === "fr"
                ? "🔒 Créer un modèle — Plan Growth requis.\n\nPassez à Growth →"
                : "🔒 Create template — Growth plan required.\n\nUpgrade to Growth →");
              return;
            }
            setPanel("create");
          }}>{lang === "fr" ? "Créer un modèle" : "Create template"}</button>
          <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={() => { setSendTemplateId(null); setPanel("send"); }}>{lang === "fr" ? "Envoyer un message" : "Send outreach"}</button>
        </div>
      } />
      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px" }}>
        {toast && (
          <div style={{ background: "rgba(0,71,255,0.08)", border: "1px solid rgba(0,71,255,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
            {toast}
          </div>
        )}

        {canUseWhiteLabelOutreach(plan) && (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: isMobile ? "wrap" : undefined }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                {lang === "fr" ? "Outreach white-label" : "White-label outreach"}
              </div>
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                {lang === "fr"
                  ? "Retirez la marque Trackit de vos messages et relances."
                  : "Remove Trackit branding from your messages and follow-ups."}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: "#7A7A7A" }}>{whiteLabel ? (lang === "fr" ? "Activé" : "On") : (lang === "fr" ? "Désactivé" : "Off")}</span>
              <Toggle on={whiteLabel} onChange={() => setWhiteLabel((v) => !v)} />
            </label>
          </div>
        )}

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20, position: "relative" }}>
          {!canUseAutoFollowUp(plan) && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(2px)", borderRadius: 16, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <div style={{ textAlign: "center", maxWidth: 320 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>
                  {lang === "fr" ? "Relances automatiques — Pro" : "Automated follow-ups — Pro"}
                </p>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px" }}>
                  {lang === "fr" ? "Passez à Pro pour programmer des relances automatiques." : "Upgrade to Pro to schedule automatic follow-ups."}
                </p>
                <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={() => void onUpgradePro?.()}>
                  {lang === "fr" ? "Passer à Pro →" : "Upgrade to Pro →"}
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: isMobile ? "wrap" : undefined, gap: isMobile ? 8 : undefined, opacity: canUseAutoFollowUp(plan) ? 1 : 0.5 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 4 }}>{lang === "fr" ? "Relance automatique" : "Automated follow-up"}</h3>
              <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0 }}>{lang === "fr" ? "Votre prochaine relance est dans 3 jours" : "Your next follow-up is in 3 days"}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" style={btnSecondary} disabled={!canUseAutoFollowUp(plan)} onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}>{lang === "fr" ? "Voir la relance" : "Review follow-up"}</button>
              <Toggle on={canUseAutoFollowUp(plan)} onChange={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, opacity: canUseAutoFollowUp(plan) ? 1 : 0.5 }}>
            {[
              { day: lang === "fr" ? "JOUR 1" : "DAY 1", label: lang === "fr" ? "Message initial" : "Initial message" },
              { day: lang === "fr" ? "JOUR 3" : "DAY 3", label: lang === "fr" ? "Relance douce" : "Soft follow-up" },
              { day: lang === "fr" ? "JOUR 7" : "DAY 7", label: lang === "fr" ? "Relance finale" : "Final follow-up" },
            ].map((step, i) => (
              <div key={i} style={{ flex: 1, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 16, opacity: canUseAutoFollowUp(plan) ? 0.6 : 0.35, cursor: "default" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0047FF", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{step.day}</div>
                <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{step.label}</div>
              </div>
            ))}
          </div>
        </div>

        <OutreachHistorySection isMobile={isMobile} plan={plan} onNavigateToBilling={onNavigateToBilling} />
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
      {panel === "send" && (
        <SendOutreachPanel
          templates={templates}
          initialTemplateId={sendTemplateId}
          onClose={closePanel}
          onSent={() => {
            showToast(lang === "fr" ? "Message copié — collez-le dans le DM ✓" : "Message copied — paste it in the DM ✓");
            closePanel();
          }}
        />
      )}
      {upgradeMsg && <UpgradeModal lang={lang} message={upgradeMsg} onClose={() => setUpgradeMsg(null)} />}
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
      subtitle={lang === "fr" ? "Collez votre message depuis n'importe où — nous le transformerons en modèle réutilisable." : "Paste your message from anywhere — we'll turn it into a reusable template."}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: raw.trim() ? 1 : 0.45 }} disabled={!raw.trim()} onClick={parseAndImport}>{lang === "fr" ? "Importer le modèle" : "Import template"}</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A" }}>{lang === "fr" ? "Message" : "Message"}</label>
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
  const [subject, setSubject] = useState("");
  const [opening, setOpening] = useState("Hey {{name}},");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");

  return (
    <OutreachPanelShell
      title={lang === "fr" ? "Créer un modèle" : "Create template"}
      subtitle={lang === "fr" ? "Créez des blocs réutilisables. Utilisez {{name}} et {{brand}} pour la personnalisation." : "Build reusable blocks. Use {{name}} and {{brand}} for personalization."}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            style={{ ...btnPrimary, width: "100%", opacity: name.trim() && (body.trim() || opening.trim()) ? 1 : 0.45 }}
            disabled={!name.trim() || (!body.trim() && !opening.trim())}
            onClick={() => onSave({ name: name.trim(), subject: subject.trim(), opening: opening.trim(), body: body.trim(), cta: cta.trim() })}
          >
            {lang === "fr" ? "Sauvegarder le modèle" : "Save template"}
          </button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
        </div>
      }
    >
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Nom du modèle" : "Template name"}</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "fr" ? "Intro collaboration" : "Collab intro"} style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Ligne d'objet" : "Subject line"}</label>
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Partnership with {{brand}}" style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Introduction" : "Opening"}</label>
      <input type="text" value={opening} onChange={(e) => setOpening(e.target.value)} style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Message principal" : "Main message"}</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Your pitch..." style={{ ...panelInputStyle, resize: "vertical", marginBottom: 16, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Appel à l'action" : "Call to action"}</label>
      <input type="text" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Would you be open to a quick chat?" style={panelInputStyle} />
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
    <OutreachPanelShell title={lang === "fr" ? "Modèles" : "Templates"} subtitle={lang === "fr" ? "Vos modèles de messages sauvegardés et importés." : "Your saved and imported outreach templates."} onClose={onClose}>
      {templates.length === 0 ? (
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>No templates yet. Create or import one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 14, background: "#FAFAFA" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{templateDisplayName(t.name)}</div>
                  {t.imported && <span style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2, display: "block" }}>Imported</span>}
                </div>
                <button type="button" style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }} onClick={() => onUse(t.id)}>{lang === "fr" ? "Utiliser" : "Use"}</button>
              </div>
              {t.subject && <div style={{ fontSize: 12, color: "#7A7A7A", marginBottom: 4 }}><strong>Subject:</strong> {t.subject}</div>}
              <div style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.45, maxHeight: 72, overflow: "hidden" }}>
                {[t.opening, t.body, t.cta].filter(Boolean).join(" ")}
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
}: {
  selected: string[];
  onChange: (handles: string[]) => void;
}) {
  const lang = useLang();
  const [influencers, setInfluencers] = useState<{ handle: string; platform: string }[]>([]);

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
        }))
      );
    };
    void load();
  }, []);

  const toggle = (handle: string) => {
    onChange(selected.includes(handle) ? selected.filter((h) => h !== handle) : [...selected, handle]);
  };

  if (influencers.length === 0) {
    return (
      <div style={{ padding: 16, borderRadius: 10, border: "1px dashed #E5E5E5", fontSize: 13, color: "#9A9A9A", textAlign: "center" }}>
        {lang === "fr" ? "Aucun créateur sauvegardé. Ajoutez-en depuis Découverte ou Créateurs." : "No saved creators yet. Add creators from Discovery or Creators."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A" }}>{lang === "fr" ? "Influenceurs" : "Influencers"}</span>
        <button
          type="button"
          style={{ fontSize: 11, color: "#0047FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
          onClick={() => onChange(selected.length === influencers.length ? [] : influencers.map((i) => i.handle))}
        >
          {selected.length === influencers.length ? "Clear all" : lang === "fr" ? "Tout sélectionner" : "Select all"}
        </button>
      </div>
      {influencers.map((inf) => {
        const on = selected.includes(inf.handle);
        return (
          <button
            key={inf.handle}
            type="button"
            onClick={() => toggle(inf.handle)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${on ? "#0047FF" : "#E5E5E5"}`,
              background: on ? "rgba(0,71,255,0.06)" : "#FFFFFF",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              width: "100%",
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{inf.handle}</div>
              <div style={{ fontSize: 11, color: "#9A9A9A" }}>{inf.platform}</div>
            </div>
            <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${on ? "#0047FF" : "#D0D0D0"}`, background: on ? "#0047FF" : "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round"/></svg>}
            </div>
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
}: {
  templates: OutreachTemplate[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew?: () => void;
}) {
  const lang = useLang();
  const applyTemplate = (id: string) => onChange(id);
  const templateDisplayName = (name: string) =>
    name === "Collab intro" ? (lang === "fr" ? "Intro collaboration" : "Collab intro") : name;

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Modèle" : "Template"}</label>
      <select
        value={value}
        onChange={(e) => applyTemplate(e.target.value)}
        style={{ ...panelInputStyle, cursor: "pointer", marginBottom: 8 }}
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
  templates,
  initialTemplateId,
  onClose,
  onSent,
}: {
  templates: OutreachTemplate[];
  initialTemplateId: string | null;
  onClose: () => void;
  onSent: (count: number) => void;
}) {
  const lang = useLang();
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>([]);
  const [dmPlatform, setDmPlatform] = useState<(typeof OUTREACH_DM_PLATFORMS)[number]>("Instagram");
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [subject, setSubject] = useState("");
  const [opening, setOpening] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");

  const applyTemplateById = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setOpening(t.opening);
      setBody(t.body);
      setCta(t.cta);
    }
  };

  useEffect(() => {
    if (initialTemplateId) applyTemplateById(initialTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId]);

  const previewName = selectedInfluencers[0]?.replace(/^@/, "") || "there";
  const fullPreview = [opening.replace(/\{\{name\}\}/gi, previewName), body.replace(/\{\{name\}\}/gi, previewName), cta.replace(/\{\{name\}\}/gi, previewName)].filter(Boolean).join("\n\n");

  const canSend = selectedInfluencers.length > 0 && (opening.trim() || body.trim());

  const handleSend = async () => {
    if (!canSend) return;
    const messageText = fullPreview;
    const handle = selectedInfluencers[0].replace(/^@/, "");
    try {
      await navigator.clipboard.writeText(messageText);
    } catch {
      /* clipboard may be unavailable */
    }
    if (dmPlatform === "Instagram") {
      window.open(`https://www.instagram.com/direct/new/?username=${handle}`, "_blank");
    } else if (dmPlatform === "TikTok") {
      window.open(`https://www.tiktok.com/@${handle}`, "_blank");
    } else if (dmPlatform === "YouTube") {
      window.open(`https://www.youtube.com/@${handle}`, "_blank");
    } else if (dmPlatform === "Twitter") {
      window.open(`https://twitter.com/messages/compose?recipient_id=${handle}`, "_blank");
    } else if (dmPlatform === "Email") {
      window.open(`mailto:${handle}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageText)}`, "_blank");
    }
    onSent(selectedInfluencers.length);
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
        : dmPlatform === "YouTube"
          ? lang === "fr"
            ? "Envoyer via YouTube"
            : "Send via YouTube"
          : dmPlatform === "Twitter"
            ? lang === "fr"
              ? "Envoyer via Twitter"
              : "Send via Twitter"
            : lang === "fr"
              ? `Envoyer via ${dmPlatform}`
              : `Send via ${dmPlatform}`;

  return (
    <OutreachPanelShell
      title={lang === "fr" ? "Envoyer un message" : "Send outreach"}
      subtitle={lang === "fr" ? "Choisissez où envoyer le DM, sélectionnez des influenceurs, puis modifiez votre message." : "Choose where to send the DM, pick influencers, then edit your message."}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: canSend ? 1 : 0.45 }} disabled={!canSend} onClick={() => void handleSend()}>{sendViaLabel}</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
        </div>
      }
    >
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Envoyer un DM sur" : "Send DM on"}</label>
      <select
        value={dmPlatform}
        onChange={(e) => setDmPlatform(e.target.value as (typeof OUTREACH_DM_PLATFORMS)[number])}
        style={{ ...panelInputStyle, marginBottom: 20, cursor: "pointer" }}
      >
        {OUTREACH_DM_PLATFORMS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <InfluencerPicker selected={selectedInfluencers} onChange={setSelectedInfluencers} />
      <TemplateSelect templates={templates} value={templateId} onChange={applyTemplateById} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Sujet" : "Subject"}</label>
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...panelInputStyle, marginBottom: 14 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Introduction" : "Opening"}</label>
      <textarea value={opening} onChange={(e) => setOpening(e.target.value)} rows={2} style={{ ...panelInputStyle, resize: "vertical", marginBottom: 14, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Message principal" : "Main message"}</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...panelInputStyle, resize: "vertical", marginBottom: 14, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{lang === "fr" ? "Appel à l'action" : "Call to action"}</label>
      <textarea value={cta} onChange={(e) => setCta(e.target.value)} rows={2} style={{ ...panelInputStyle, resize: "vertical", marginBottom: 16, lineHeight: 1.5 }} />
      {fullPreview && (
        <div style={{ padding: 14, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Preview · {dmPlatform}</div>
          {subject && <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>Subject: {subject}</div>}
          <div style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{fullPreview}</div>
        </div>
      )}
    </OutreachPanelShell>
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
  const [shopError, setShopError] = useState("");
  const [connectedShop, setConnectedShop] = useState<string | null>(null);
  const [changingStore, setChangingStore] = useState(false);
  const [connectedStores, setConnectedStores] = useState<string[]>([]);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify") === "connected") {
      const shop = params.get("shop") || "";
      setConnectedShop(shop);
      setChangingStore(false);
      window.history.replaceState({}, "", "/dashboard");
      notifyShopifyConnected(lang, shop || (lang === "fr" ? "votre boutique" : "your store"));
    }
    if (params.get("shopify") === "error") {
      setShopError(lang === "fr" ? "La connexion a échoué. Réessayez." : "Connection failed. Please try again.");
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [lang]);

  const handleShopifyConnect = () => {
    if (!canUseShopify(plan)) {
      void onUpgrade?.();
      return;
    }
    const storeCount = Math.max(
      connectedStores.length,
      activeShop ? 1 : 0
    );
    if (!canAddAnotherShopifyStore(plan, storeCount) && !changingStore) {
      setShopError(
        lang === "fr"
          ? `Limite de ${storeLimit} boutique(s) atteinte. Passez à Scale pour jusqu'à 3 boutiques.`
          : `Store limit of ${storeLimit} reached. Upgrade to Scale for up to 3 stores.`
      );
      if (plan === "pro") void onUpgradeScale?.();
      else if (plan === "basic") void onUpgradePro?.();
      return;
    }
    if (!shopDomain.trim()) {
      setShopError("Please enter your store name");
      return;
    }
    setShopError("");
    let name = shopDomain.trim().toLowerCase();
    name = name.replace(/^https?:\/\//, "");
    name = name.replace(/\.myshopify\.com.*/, "");
    name = name.replace(/\..*/, "");
    name = name.replace(/[^a-z0-9-]/g, "");
    const domain = `${name}.myshopify.com`;
    window.location.href = `/api/shopify/install?shop=${domain}&user_id=${user?.id || ""}`;
  };

  const apps = [
    { name: "Shopify", desc: "Connect your store to track sales", logo: "/shopify-logo.svg", logoH: 39 },
    { name: "Zapier", desc: "Automate workflows with 5000+ apps", logo: "/zapier-logo.svg", logoH: 34 },
    { name: "Notion", desc: "Sync your workspace and docs", logo: "/notion-logo.svg", logoH: 34 },
    { name: "Make", desc: "Advanced visual automation", logo: "/make-logo.svg", logoH: 34 },
  ];

  return (
    <>
      <PageHeader isMobile={isMobile} title={lang === "fr" ? "Intégrations" : "Integrations"} subtitle={lang === "fr" ? "Connectez Trackit aux outils que vous utilisez déjà" : "Connect Trackit to the tools you already use"} />
      {connectedShop && (
        <div style={{ margin: isMobile ? "0 16px 16px" : "0 40px 16px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#15803d", fontSize: 14, fontWeight: 500 }}>
          ✓ {connectedShop} connected successfully
        </div>
      )}
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
          {apps.map((app) => (
            <div key={app.name} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, display: "flex", alignItems: "center", gap: 16 }}>
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
                            onClick={() => {
                              setChangingStore(true);
                              setShopDomain("");
                              setShopError("");
                            }}
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
                        ) : canChangeShopifyStore(plan) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setChangingStore(true);
                              setShopDomain(activeShop?.replace(/\.myshopify\.com$/, "") || "");
                              setShopError("");
                            }}
                            style={{ ...btnSecondary, padding: "8px 14px", fontSize: 12 }}
                          >
                            {lang === "fr" ? "Changer de boutique" : "Change my store"}
                          </button>
                        ) : plan === "basic" ? (
                          <p style={{ fontSize: 12, color: "#7A7A7A", margin: 0 }}>
                            {lang === "fr" ? "1 boutique sur Growth. " : "1 store on Growth. "}
                            <button type="button" onClick={() => void onUpgradePro?.()} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                              {lang === "fr" ? "Multi-boutiques sur Scale →" : "Multi-store on Scale →"}
                            </button>
                          </p>
                        ) : plan === "pro" ? (
                          <p style={{ fontSize: 12, color: "#7A7A7A", margin: 0 }}>
                            {lang === "fr" ? "1 boutique sur Pro. " : "1 store on Pro. "}
                            <button type="button" onClick={() => void onUpgradeScale?.()} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                              {lang === "fr" ? "Jusqu'à 3 boutiques sur Scale →" : "Up to 3 stores on Scale →"}
                            </button>
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <input
                            value={shopDomain}
                            onChange={(e) => { setShopDomain(e.target.value); setShopError(""); }}
                            placeholder="yourstore.myshopify.com"
                            style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                            onKeyDown={(e) => e.key === "Enter" && handleShopifyConnect()}
                          />
                          <button type="button" onClick={handleShopifyConnect} className="hero-cta-shopify hero-cta-compact-sm" style={{ flexShrink: 0 }}>
                            {lang === "fr" ? "Connecter →" : "Connect →"}
                          </button>
                        </div>
                        {changingStore && (
                          <button
                            type="button"
                            onClick={() => { setChangingStore(false); setShopDomain(""); setShopError(""); }}
                            style={{ background: "none", border: "none", fontSize: 12, color: "#7A7A7A", cursor: "pointer", marginTop: 8, padding: 0, fontFamily: "inherit" }}
                          >
                            {lang === "fr" ? "Annuler" : "Cancel"}
                          </button>
                        )}
                        <div style={{ fontSize: 12, color: "#7A7A7A", marginTop: 4, letterSpacing: "-0.01em" }}>
                          {lang === "fr" ? "Utilisez votre URL .myshopify.com. Trouvez-la dans Shopify Admin → Paramètres → Domaines." : "Use your .myshopify.com URL. Find it in Shopify Admin → Settings → Domains."}
                        </div>
                        {shopError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{shopError}</div>}
                      </>
                    )}
                  </div>
                )}
              </div>
              {app.name === "Shopify" ? null : (
                <button type="button" style={btnSecondary}>{lang === "fr" ? "Bientôt disponible" : "Coming soon"}</button>
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
  onUpgradeScale,
}: {
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgradeScale?: () => void;
}) {
  const lang = useLang();
  const fullAgent = canUseFullAutomationAgent(plan);
  const workflows = canUseAutomationWorkflows(plan);
  const showComingSoon = !workflows;

  return (
    <>
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
                if (fullAgent) {
                  alert(lang === "fr" ? "Agent d'automatisation — configuration bientôt disponible." : "Automation agent — setup coming soon.");
                  return;
                }
                if (workflows) {
                  void onUpgradeScale?.();
                  return;
                }
                alert(lang === "fr" ? "Bientôt disponible" : "Coming soon");
              }}
            >
              {fullAgent
                ? lang === "fr"
                  ? "Créer un agent"
                  : "Build an agent"
                : workflows
                  ? lang === "fr"
                    ? "Débloquer l'agent complet (Scale)"
                    : "Unlock full agent (Scale)"
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

function UpgradeGate({
  feature,
  requiredPlan,
  onUpgrade,
  isMobile,
}: {
  feature: string;
  requiredPlan: string;
  onUpgrade: () => void;
  isMobile?: boolean;
}) {
  return (
    <>
      <PageHeader isMobile={isMobile} title={feature} subtitle={`${feature} is available on the ${requiredPlan} plan and above`} />
      <div style={{ padding: isMobile ? "16px" : "40px" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 48 : 80, textAlign: "center" }}>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: isMobile ? 56 : 72, width: "auto", margin: "0 auto 18px", display: "block" }} />
          <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>Upgrade to unlock {feature}</h3>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 22, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>This feature is part of the {requiredPlan} plan. Upgrade your account to start using {feature.toLowerCase()}.</p>
          <button type="button" style={btnPrimary} onClick={() => void onUpgrade()}>Upgrade to {requiredPlan}</button>
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

type AffiliateRow = {
  creator: string;
  platform: string;
  ref: string;
  code: string;
  clicks: number;
  conversions: number;
  sales: number;
  commission: number;
  status: string;
};

const INITIAL_AFFILIATES: AffiliateRow[] = [];

function slugFromHandle(handle: string) {
  const base = handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "creator";
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

function codeFromHandle(handle: string, discount: string) {
  const base = handle.replace(/^@/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CREATOR";
  const pct = discount.replace(/\D/g, "") || "15";
  return `${base}${pct}`;
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

function AffiliatesView({ isMobile }: { isMobile?: boolean }) {
  const lang = useLang();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>(INITIAL_AFFILIATES);
  const [panelOpen, setPanelOpen] = useState(false);
  const statusColor = (s: string) => s === "Active" ? { bg: "rgba(31,181,103,0.1)", fg: "#1FB567" } : { bg: "rgba(122,122,122,0.1)", fg: "#7A7A7A" };

  const activeAffiliateCount = affiliates.filter((a) => a.status === "Active").length;
  const totalClicks = affiliates.reduce((sum, a) => sum + a.clicks, 0);
  const totalConversions = affiliates.reduce((sum, a) => sum + a.conversions, 0);
  const conversionRate = totalClicks > 0 ? `${((totalConversions / totalClicks) * 100).toFixed(1)}%` : "0%";

  const handleAddAffiliate = (row: Pick<AffiliateRow, "creator" | "platform" | "ref" | "code">) => {
    setAffiliates((list) => [
      { ...row, clicks: 0, conversions: 0, sales: 0, commission: 0, status: "Active" },
      ...list,
    ]);
    setPanelOpen(false);
  };

  return (
    <>
      <PageHeader isMobile={isMobile} title={lang === "fr" ? "Affiliés" : "Affiliates"} subtitle={lang === "fr" ? "Chaque créateur reçoit un lien de parrainage et un code promo uniques. Les ventes sont suivies automatiquement." : "Every creator gets a unique referral link and discount code. Sales tracked automatically."} right={
        <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={() => setPanelOpen(true)}>{lang === "fr" ? "+ Ajouter un affilié" : "+ Add affiliate"}</button>
      } />
        <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 56 : undefined }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginTop: 12, marginBottom: 24 }}>
          {[
            { label: lang === "fr" ? "Affiliés actifs" : "Active affiliates", value: String(activeAffiliateCount) },
            { label: lang === "fr" ? "Clics totaux" : "Total clicks", value: totalClicks.toLocaleString(lang === "fr" ? "fr-FR" : "en-US") },
            { label: lang === "fr" ? "Conversions totales" : "Total conversions", value: String(totalConversions) },
            { label: lang === "fr" ? "Taux de conversion" : "Conversion rate", value: conversionRate },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 1fr 0.7fr 0.9fr 1fr 1fr 0.9fr 1.4fr", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EFEFEF", background: "#FAFAFA", minWidth: isMobile ? 700 : undefined }}>
            {[
              lang === "fr" ? "Créateur" : "Creator",
              lang === "fr" ? "Lien de parrainage" : "Referral link",
              lang === "fr" ? "Réduction" : "Discount",
              lang === "fr" ? "Clics" : "Clicks",
              lang === "fr" ? "Conv." : "Conv.",
              lang === "fr" ? "Ventes" : "Sales",
              lang === "fr" ? "Commission" : "Commission",
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
            const sc = statusColor(a.status);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 1fr 0.7fr 0.9fr 1fr 1fr 0.9fr 1.4fr", gap: 12, padding: "16px 20px", borderBottom: i < affiliates.length - 1 ? "1px solid #F5F5F5" : "none", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.creator}</div>
                    <div style={{ fontSize: 11, color: "#9A9A9A" }}>{a.platform}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#0047FF", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/r/{a.ref}</div>
                <div style={{ fontSize: 12, color: "#1A1A1A", fontFamily: "monospace", fontWeight: 600 }}>{a.code}</div>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>{a.clicks.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>{a.conversions}</div>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>${a.sales.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>${a.commission}</div>
                <div><span style={{ fontSize: 11, fontWeight: 500, color: sc.fg, background: sc.bg, padding: "4px 10px", borderRadius: 999 }}>{affiliateStatusLabel(a.status, lang)}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" title="Copy link" style={iconBtn}><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" stroke="#7A7A7A" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
                  <button type="button" title="Copy code" style={iconBtn}><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="#7A7A7A" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="#7A7A7A" strokeWidth="1.7"/></svg></button>
                  <button type="button" title="Pay" style={{ ...iconBtn, color: "#0047FF" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="13" rx="2" stroke="#0047FF" strokeWidth="1.7"/><path d="M2 10h20" stroke="#0047FF" strokeWidth="1.7"/></svg></button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {panelOpen && (
        <AddAffiliatePanel
          onClose={() => setPanelOpen(false)}
          onAdd={handleAddAffiliate}
        />
      )}
    </>
  );
}

function AddAffiliatePanel({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (row: Pick<AffiliateRow, "creator" | "platform" | "ref" | "code">) => void;
}) {
  const lang = useLang();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [discount, setDiscount] = useState("15");
  const [generated, setGenerated] = useState<{ ref: string; code: string; link: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const normalizedHandle = handle.trim().startsWith("@") ? handle.trim() : handle.trim() ? `@${handle.trim()}` : "";

  const handleGenerate = () => {
    if (!normalizedHandle) return;
    const ref = slugFromHandle(normalizedHandle);
    const code = codeFromHandle(normalizedHandle, discount);
    const link = `${typeof window !== "undefined" ? window.location.origin : "https://trackit.app"}/r/${ref}`;
    setGenerated({ ref, code, link });
    setCopied(null);
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

  const canGenerate = normalizedHandle.length > 1;
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
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.45 }}>{lang === "fr" ? "Ajoutez un influenceur et générez son lien de parrainage et son code de réduction." : "Add an influencer and generate their referral link and discount code."}</p>
          </div>
          <button type="button" onClick={onClose} style={{ ...iconBtn, flexShrink: 0 }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>Influencer handle</label>
          <input
            type="text"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setGenerated(null); }}
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

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{ ...btnPrimary, width: "100%", opacity: canGenerate ? 1 : 0.45 }}
          >
            {lang === "fr" ? "Générer" : "Generate"}
          </button>

          {generated && (
            <div style={{ marginTop: 24, padding: 16, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Generated</div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Referral link</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 12, color: "#0047FF", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "10px 12px" }}>
                    {generated.link}
                  </div>
                  <button type="button" style={iconBtn} title="Copy link" onClick={() => void copyText(generated.link, "link")}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="#7A7A7A" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="#7A7A7A" strokeWidth="1.7"/></svg>
                  </button>
                </div>
                {copied === "link" && <div style={{ fontSize: 11, color: "#1FB567", marginTop: 4 }}>Copied</div>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Short path</div>
                <div style={{ fontSize: 13, color: "#1A1A1A", fontFamily: "monospace" }}>/r/{generated.ref}</div>
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

const btnPrimary: React.CSSProperties = { background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };
const btnSecondary: React.CSSProperties = { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };
const iconBtn: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

function buildSidebarNavEntries(
  notificationUnread: number,
  lang: "en" | "fr",
  counts: { activeCampaigns: number; savedCreators: number }
): SidebarNavEntry[] {
  return [
    { id: "dashboard", label: lang === "fr" ? "Tableau de bord" : "Dashboard", view: "dashboard", section: "main", iconKey: "home", keywords: ["home", "overview", "stats"] },
    { id: "discovery", label: lang === "fr" ? "Recherche" : "Discovery", view: "discovery", section: "main", iconKey: "search", keywords: ["find", "creators", "search", "tiktok", "instagram"] },
    { id: "creators", label: lang === "fr" ? "Créateurs" : "Creators", view: "creators", section: "main", iconKey: "creators", keywords: ["influencers", "profiles", "saved"] },
    { id: "campaigns", label: lang === "fr" ? "Campagnes" : "Campaigns", view: "campaigns", section: "main", iconKey: "campaigns", keywords: ["campaign", "collaborations"] },
    { id: "affiliates", label: lang === "fr" ? "Affiliés" : "Affiliates", view: "affiliates", section: "main", iconKey: "affiliates", keywords: ["partners", "referrals", "commission"] },
    { id: "outreach", label: lang === "fr" ? "Messages" : "Outreach", view: "outreach", section: "main", iconKey: "outreach", keywords: ["messages", "dm", "email", "follow up"] },
    { id: "payouts", label: lang === "fr" ? "Paiements" : "Payouts", view: "payouts", section: "main", iconKey: "payouts", keywords: ["payments", "pay", "commissions", "sales"] },
    { id: "analytics", label: lang === "fr" ? "Analytiques" : "Analytics", view: "analytics", section: "tools", iconKey: "analytics", keywords: ["reports", "data", "metrics", "roi"] },
    { id: "integrations", label: lang === "fr" ? "Intégrations" : "Integrations", view: "integrations", section: "tools", iconKey: "integrations", keywords: ["shopify", "zapier", "notion", "connect"] },
    { id: "automation", label: lang === "fr" ? "Automatisation" : "Automation", view: "automation", section: "tools", iconKey: "automation", keywords: ["agents", "workflows", "auto"] },
    {
      id: "notifications",
      label: lang === "fr" ? "Notifications" : "Notifications",
      view: "notifications",
      section: "workspace",
      iconKey: "notifications",
      keywords: ["alerts", "bell", "updates"],
      badge: notificationUnread > 0 ? String(notificationUnread) : undefined,
    },
    {
      id: "active-campaigns",
      label: lang === "fr" ? "Campagnes actives" : "Active Campaigns",
      view: "campaigns",
      section: "workspace",
      iconKey: "dot-blue",
      keywords: ["campaigns", "active", "running"],
      badge: counts.activeCampaigns > 0 ? String(counts.activeCampaigns) : undefined,
    },
    {
      id: "creator-lists",
      label: lang === "fr" ? "Listes de créateurs" : "Creator Lists",
      view: "discovery",
      section: "workspace",
      iconKey: "dot-pink",
      keywords: ["lists", "saved creators", "bookmarks"],
      badge: counts.savedCreators > 0 ? String(counts.savedCreators) : undefined,
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
    case "analytics":
      return <AnalyticsIcon />;
    case "integrations":
      return <IntegrationIcon />;
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

function SidebarItem({ collapsed, icon, label, active, badge, onClick }: { collapsed: boolean; icon: React.ReactNode; label: string; active?: boolean; badge?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 10, border: "none", background: active ? "#F5F5F5" : "transparent", color: active ? "#1A1A1A" : "#5A5A5A", fontSize: 14, fontWeight: active ? 500 : 400, letterSpacing: "-0.02em", marginBottom: 2, position: "relative", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
      {active && !collapsed && <span style={{ position: "absolute", left: -12, top: 8, bottom: 8, width: 3, borderRadius: 2, background: "#0047FF" }} />}
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: active ? "#0047FF" : "#9A9A9A", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
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
function AnalyticsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 3a9 9 0 019 9h-9V3z" fill="currentColor" opacity="0.25"/></svg>; }
function IntegrationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3v6H3v6h6v6h6v-6h6V9h-6V3H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function AutomationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function NotificationIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function HelpIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>; }
function FeedbackIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>; }
function DotIcon({ color }: { color: string }) { return <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />; }
