"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { SettingsView } from "./SettingsView";
import { AnalyticsView } from "./AnalyticsView";
import { CampaignsView } from "./CampaignsView";
import { DiscoveryView } from "./DiscoveryView";
import { CreatorsView } from "./CreatorsView";
import { OutreachHistorySection } from "./OutreachView";
import { AddPaymentMethodModal, LiveSalesFeed, PayoutsWorkspacePaymentCard } from "./PayoutsView";
import { getDefaultPaymentMethod, usePaymentMethods } from "./usePaymentMethods";
import { FeedbackView } from "./FeedbackView";
import { HelpCenterView } from "./HelpCenterView";
import { NotificationsView, getInitialUnreadCount } from "./NotificationsView";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";

type View = "dashboard" | "discovery" | "creators" | "campaigns" | "affiliates" | "outreach" | "payouts" | "analytics" | "integrations" | "automation" | "settings" | "feedback" | "notifications" | "help";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; username: string | null; avatar_url: string | null; business_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [notificationUnread, setNotificationUnread] = useState(getInitialUnreadCount);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const avatarRetryRef = useRef(false);

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
    setProfile({
      full_name: profileData.full_name,
      username: profileData.username,
      avatar_url,
      business_name: profileData.business_name,
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (!authUser) { router.replace("/auth"); return; }
      const { data: profileData } = await supabase!
        .from("profiles")
        .select("onboarding_completed, full_name, username, avatar_url, business_name")
        .eq("id", authUser.id)
        .maybeSingle();
      if (!profileData || profileData.onboarding_completed === false) {
        router.replace("/onboarding");
        return;
      }
      setUser(authUser);
      const avatar_url = await resolveAvatarUrl(supabase!, authUser.id, profileData.avatar_url);
      avatarRetryRef.current = false;
      setAvatarBroken(false);
      setProfile({
        full_name: profileData.full_name,
        username: profileData.username,
        avatar_url,
        business_name: profileData.business_name,
      });
      setLoading(false);
    });
  }, [router]);

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

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA", fontFamily: "'InterDisplay', sans-serif" }}><p style={{ color: "#7A7A7A" }}>Loading...</p></div>;
  }

  const sidebarWidth = sidebarCollapsed ? 72 : 264;

  const storeName = profile?.business_name?.trim() || null;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex" }}>
      <aside style={{ width: sidebarWidth, minWidth: sidebarWidth, background: "#FFFFFF", borderRight: "1px solid #EFEFEF", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, transition: "width 0.2s ease", overflow: "hidden" }}>
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
              Find it, Track it, Pay it.
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
                <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>Free Plan</span>
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
              <input type="text" placeholder="Search" style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", fontFamily: "inherit", flex: 1, minWidth: 0, letterSpacing: "-0.01em" }} />
              <span style={{ fontSize: 11, color: "#9A9A9A", background: "#FFFFFF", padding: "2px 6px", borderRadius: 5, border: "1px solid #E5E5E5" }}>⌘K</span>
            </div>
          </div>
        )}

        <nav style={{ flex: 1, padding: "10px 12px", overflowY: "auto" }}>
          {!sidebarCollapsed && <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", padding: "12px 12px 8px 12px" }}>Main Menu</div>}
          <SidebarItem collapsed={sidebarCollapsed} icon={<HomeIcon />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<SearchIcon />} label="Discovery" active={view === "discovery"} onClick={() => setView("discovery")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<CreatorsIcon />} label="Creators" active={view === "creators"} onClick={() => setView("creators")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<CampaignIcon />} label="Campaigns" active={view === "campaigns"} onClick={() => setView("campaigns")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<AffiliateIcon />} label="Affiliates" active={view === "affiliates"} onClick={() => setView("affiliates")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<MessageIcon />} label="Outreach" active={view === "outreach"} onClick={() => setView("outreach")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<PayoutIcon />} label="Payouts" active={view === "payouts"} onClick={() => setView("payouts")} />

          {!sidebarCollapsed && <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", padding: "20px 12px 8px 12px" }}>Tools</div>}
          {sidebarCollapsed && <div style={{ height: 16 }} />}
          <SidebarItem collapsed={sidebarCollapsed} icon={<AnalyticsIcon />} label="Analytics" active={view === "analytics"} onClick={() => setView("analytics")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<IntegrationIcon />} label="Integrations" active={view === "integrations"} onClick={() => setView("integrations")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<AutomationIcon />} label="Automation" active={view === "automation"} onClick={() => setView("automation")} />

          {!sidebarCollapsed && <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", padding: "20px 12px 8px 12px" }}>Workspace</div>}
          {sidebarCollapsed && <div style={{ height: 16 }} />}
          <SidebarItem collapsed={sidebarCollapsed} icon={<NotificationIcon />} label="Notifications" active={view === "notifications"} badge={notificationUnread > 0 ? String(notificationUnread) : undefined} onClick={() => setView("notifications")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<DotIcon color="#0047FF" />} label="Active Campaigns" badge="5" onClick={() => setView("campaigns")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<DotIcon color="#FF3D8B" />} label="Creator Lists" badge="4" onClick={() => setView("discovery")} />
        </nav>

        <div style={{ padding: "10px 12px", borderTop: "1px solid #F5F5F5" }}>
          <SidebarItem collapsed={sidebarCollapsed} icon={<HelpIcon />} label="Help Center" active={view === "help"} onClick={() => setView("help")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<FeedbackIcon />} label="Feedback" active={view === "feedback"} onClick={() => setView("feedback")} />
          <SidebarItem collapsed={sidebarCollapsed} icon={<SettingsIcon />} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
        </div>

        <div style={{ padding: "12px 12px 16px 12px" }}>
          <button type="button" style={{ width: "100%", background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 14, padding: sidebarCollapsed ? "12px 0" : "14px 14px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
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

      <main style={{ flex: 1, overflow: "auto", background: "#FAFAFA" }}>
        {view === "dashboard" && <HomeView fullName={profile?.full_name ?? null} username={profile?.username ?? null} />}
        {view === "discovery" && <DiscoveryView />}
        {view === "creators" && <CreatorsView />}
        {view === "campaigns" && <CampaignsView />}
        {view === "affiliates" && <AffiliatesView />}
        {view === "outreach" && <OutreachView />}
        {view === "payouts" && <PayoutsView />}
        {view === "analytics" && <AnalyticsView />}
        {view === "integrations" && <IntegrationsView />}
        {view === "automation" && <AutomationView />}
        {view === "settings" && user && (
          <SettingsView onProfileUpdate={() => void reloadProfile(user.id)} />
        )}
        {view === "feedback" && <FeedbackView onBackToDashboard={() => setView("dashboard")} />}
        {view === "help" && <HelpCenterView />}
        {view === "notifications" && <NotificationsView onUnreadChange={setNotificationUnread} />}
      </main>
    </div>
  );
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: "32px 40px 24px 40px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

function HomeView({ fullName, username }: { fullName: string | null; username: string | null }) {
  const displayName = fullName?.split(" ")[0] || (username ? `@${username}` : "");
  return (
    <>
      <PageHeader title={`Welcome back${displayName ? ", " + displayName : ""}.`} subtitle="Connect your Shopify store to get started." />
      <div style={{ padding: 40 }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 18, padding: 60, textAlign: "center", marginBottom: 24 }}>
          <div style={{ margin: "0 auto 20px", display: "flex", justifyContent: "center" }}>
            <img src="/shopify-logo.svg" alt="Shopify" width={56} height={64} style={{ display: "block" }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>Connect your Shopify store</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 24, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>Sync products, orders, and customers in real time. We&apos;ll automatically track every sale your creators drive.</p>
          <button type="button" className="hero-cta-shopify">
            <img src="/shopify-logo.svg" alt="" width={20} height={23} style={{ display: "block", flexShrink: 0 }} />
            Connect Shopify
          </button>
          <p style={{ fontSize: 12, color: "#9A9A9A", marginTop: 14 }}>Shopify integration not connected yet</p>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 16 }}>Getting started</h3>
          {[
            { label: "Connect Shopify store", done: false },
            { label: "Find your first creators", done: false },
            { label: "Send first outreach", done: false },
            { label: "Track first sale", done: false },
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 3 ? "1px solid #F5F5F5" : "none" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px solid #E5E5E5", background: step.done ? "#0047FF" : "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {step.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", flex: 1 }}>{step.label}</span>
              <span style={{ fontSize: 12, color: "#9A9A9A" }}>—</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

type OutreachPanel = "import" | "create" | "mass" | "send" | "seeTemplates" | null;

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

const OUTREACH_INFLUENCERS = [
  { handle: "@emma.style", platform: "Instagram" },
  { handle: "@jakefit", platform: "TikTok" },
  { handle: "@beautybylu", platform: "YouTube" },
  { handle: "@techwithsam", platform: "TikTok" },
  { handle: "@alexcreates", platform: "Instagram" },
];

const INITIAL_OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "seed-1",
    name: "Collab intro",
    subject: "Partnership with {{brand}}",
    opening: "Hey {{name}},",
    body: "We love your content and think you'd be a great fit for our brand. We're offering {{commission}} commission on every sale through your unique link.",
    cta: "Would you be open to a quick chat this week?",
  },
];

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

function OutreachView() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>(INITIAL_OUTREACH_TEMPLATES);
  const [panel, setPanel] = useState<OutreachPanel>(null);
  const [sendTemplateId, setSendTemplateId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      <PageHeader title="Outreach" subtitle="Send personalized messages and manage follow-ups automatically" right={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" style={btnSecondary} onClick={() => setPanel("seeTemplates")}>See templates</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel("import")}>Import template</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel("create")}>Create template</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel("mass")}>Mass outreach</button>
          <button type="button" style={btnPrimary} onClick={() => { setSendTemplateId(null); setPanel("send"); }}>Send outreach</button>
        </div>
      } />
      <div style={{ padding: 40 }}>
        {toast && (
          <div style={{ background: "rgba(0,71,255,0.08)", border: "1px solid rgba(0,71,255,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
            {toast}
          </div>
        )}

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 4 }}>Automated follow-up</h3>
              <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0 }}>Your next follow-up is in 3 days</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" style={btnSecondary}>Review follow-up</button>
              <Toggle on />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { day: "Day 1", label: "Initial message" },
              { day: "Day 3", label: "Soft follow-up" },
              { day: "Day 7", label: "Final follow-up" },
            ].map((step, i) => (
              <div key={i} style={{ flex: 1, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0047FF", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>{step.day}</div>
                <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{step.label}</div>
              </div>
            ))}
          </div>
        </div>

        <OutreachHistorySection />
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
      {panel === "mass" && (
        <MassOutreachPanel
          templates={templates}
          onClose={closePanel}
          onSent={(count) => {
            showToast(`Mass outreach queued for ${count} influencer${count === 1 ? "" : "s"}`);
            closePanel();
          }}
        />
      )}
      {panel === "send" && (
        <SendOutreachPanel
          templates={templates}
          initialTemplateId={sendTemplateId}
          onClose={closePanel}
          onSent={(count) => {
            showToast(`Outreach sent to ${count} influencer${count === 1 ? "" : "s"}`);
            closePanel();
          }}
        />
      )}
    </>
  );
}

function ImportTemplatePanel({ onClose, onImport }: { onClose: () => void; onImport: (t: Omit<OutreachTemplate, "id" | "imported">) => void }) {
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
      title="Import template"
      subtitle="Paste your message from anywhere — we'll turn it into a reusable template."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: raw.trim() ? 1 : 0.45 }} disabled={!raw.trim()} onClick={parseAndImport}>Import template</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A" }}>Message</label>
        <button type="button" onClick={() => void handlePaste()} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.7"/></svg>
          Paste
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

function CreateTemplatePanel({ onClose, onSave }: { onClose: () => void; onSave: (t: Omit<OutreachTemplate, "id" | "imported">) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [opening, setOpening] = useState("Hey {{name}},");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");

  return (
    <OutreachPanelShell
      title="Create template"
      subtitle="Build reusable blocks. Use {{name}} and {{brand}} for personalization."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            style={{ ...btnPrimary, width: "100%", opacity: name.trim() && (body.trim() || opening.trim()) ? 1 : 0.45 }}
            disabled={!name.trim() || (!body.trim() && !opening.trim())}
            onClick={() => onSave({ name: name.trim(), subject: subject.trim(), opening: opening.trim(), body: body.trim(), cta: cta.trim() })}
          >
            Save template
          </button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Template name</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Collab intro" style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Subject line</label>
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Partnership with {{brand}}" style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Opening</label>
      <input type="text" value={opening} onChange={(e) => setOpening(e.target.value)} style={{ ...panelInputStyle, marginBottom: 16 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Main message</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Your pitch..." style={{ ...panelInputStyle, resize: "vertical", marginBottom: 16, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Call to action</label>
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
  return (
    <OutreachPanelShell title="Templates" subtitle="Your saved and imported outreach templates." onClose={onClose}>
      {templates.length === 0 ? (
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>No templates yet. Create or import one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 14, background: "#FAFAFA" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{t.name}</div>
                  {t.imported && <span style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2, display: "block" }}>Imported</span>}
                </div>
                <button type="button" style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }} onClick={() => onUse(t.id)}>Use</button>
              </div>
              {t.subject && <div style={{ fontSize: 12, color: "#7A7A7A", marginBottom: 4 }}><strong>Subject:</strong> {t.subject}</div>}
              <div style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.45, maxHeight: 72, overflow: "hidden" }}>
                {[t.opening, t.body, t.cta].filter(Boolean).join(" ")}
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" style={{ ...btnSecondary, width: "100%", marginTop: 20 }} onClick={onCreate}>+ Create template</button>
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
  const toggle = (handle: string) => {
    onChange(selected.includes(handle) ? selected.filter((h) => h !== handle) : [...selected, handle]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A" }}>Influencers</span>
        <button
          type="button"
          style={{ fontSize: 11, color: "#0047FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
          onClick={() => onChange(selected.length === OUTREACH_INFLUENCERS.length ? [] : OUTREACH_INFLUENCERS.map((i) => i.handle))}
        >
          {selected.length === OUTREACH_INFLUENCERS.length ? "Clear all" : "Select all"}
        </button>
      </div>
      {OUTREACH_INFLUENCERS.map((inf) => {
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
  const applyTemplate = (id: string) => onChange(id);

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Template</label>
      <select
        value={value}
        onChange={(e) => applyTemplate(e.target.value)}
        style={{ ...panelInputStyle, cursor: "pointer", marginBottom: 8 }}
      >
        <option value="">No template — write from scratch</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
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

  return (
    <OutreachPanelShell
      title="Send outreach"
      subtitle="Choose where to send the DM, pick influencers, then edit your message."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: canSend ? 1 : 0.45 }} disabled={!canSend} onClick={() => onSent(selectedInfluencers.length)}>Send via {dmPlatform}</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Send DM on</label>
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
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Subject</label>
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...panelInputStyle, marginBottom: 14 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Opening</label>
      <textarea value={opening} onChange={(e) => setOpening(e.target.value)} rows={2} style={{ ...panelInputStyle, resize: "vertical", marginBottom: 14, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Main message</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...panelInputStyle, resize: "vertical", marginBottom: 14, lineHeight: 1.5 }} />
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>Call to action</label>
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

function MassOutreachPanel({
  templates,
  onClose,
  onSent,
}: {
  templates: OutreachTemplate[];
  onClose: () => void;
  onSent: (count: number) => void;
}) {
  const [selectedInfluencers, setSelectedInfluencers] = useState<string[]>(OUTREACH_INFLUENCERS.map((i) => i.handle));
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  const t = templates.find((x) => x.id === templateId);
  const canSend = selectedInfluencers.length > 0 && !!t;

  return (
    <OutreachPanelShell
      title="Mass outreach"
      subtitle="Send the same template to multiple influencers at once."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, width: "100%", opacity: canSend ? 1 : 0.45 }} disabled={!canSend} onClick={() => onSent(selectedInfluencers.length)}>Send to {selectedInfluencers.length} influencers</button>
          <button type="button" style={{ ...btnSecondary, width: "100%" }} onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <TemplateSelect templates={templates} value={templateId} onChange={setTemplateId} />
      {!templates.length && (
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px" }}>Create or import a template first.</p>
      )}
      <InfluencerPicker selected={selectedInfluencers} onChange={setSelectedInfluencers} />
      {t && (
        <div style={{ marginTop: 16, padding: 14, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Template preview</div>
          <div style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.5 }}>{[t.opening, t.body, t.cta].filter(Boolean).join(" ")}</div>
        </div>
      )}
    </OutreachPanelShell>
  );
}

type PayoutPartner = {
  id: string;
  name: string;
  handle: string;
  owed: string;
  hasPaymentMethod: boolean;
  paymentLabel?: string;
};

const PAYOUT_PARTNERS_SEED: PayoutPartner[] = [
  { id: "1", name: "Alex Rivera", handle: "@alexcreates", owed: "$124.50", hasPaymentMethod: true, paymentLabel: "PayPal · alex@email.com" },
  { id: "2", name: "Jordan Lee", handle: "@jordanlee", owed: "$89.00", hasPaymentMethod: false },
  { id: "3", name: "Sam Taylor", handle: "@samtaylor", owed: "$210.25", hasPaymentMethod: true, paymentLabel: "Bank · •••• 4821" },
  { id: "4", name: "Morgan Kim", handle: "@morgankim", owed: "$56.75", hasPaymentMethod: false },
];

function formatUsd(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PayoutsView() {
  const [search, setSearch] = useState("");
  const [partners, setPartners] = useState<PayoutPartner[]>(PAYOUT_PARTNERS_SEED);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [methodType, setMethodType] = useState<"paypal" | "bank">("paypal");
  const [methodValue, setMethodValue] = useState("");
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const { methods: paymentMethods } = usePaymentMethods();
  const defaultPaymentMethod = getDefaultPaymentMethod(paymentMethods);
  const [payoutModal, setPayoutModal] = useState<"addFunds" | null>(null);
  const [addPaymentForFunds, setAddPaymentForFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = partners.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
  );
  const registering = partners.find((p) => p.id === registeringId) ?? null;

  const handlePayClick = (partner: PayoutPartner) => {
    setPayMessage(null);
    if (!partner.hasPaymentMethod) {
      setRegisteringId(partner.id);
      setMethodType("paypal");
      setMethodValue("");
      return;
    }
    setPayingId(partner.id);
    setTimeout(() => {
      setPayMessage(`Payment of ${partner.owed} sent to ${partner.name}.`);
      setPayingId(null);
    }, 600);
  };

  const handleSavePaymentMethod = () => {
    if (!registering || !methodValue.trim()) return;
    const label = methodType === "paypal" ? `PayPal · ${methodValue.trim()}` : `Bank · ${methodValue.trim()}`;
    setPartners((prev) =>
      prev.map((p) => (p.id === registering.id ? { ...p, hasPaymentMethod: true, paymentLabel: label } : p))
    );
    setRegisteringId(null);
    setMethodValue("");
    setPayMessage(`Payment method saved for ${registering.name}. You can pay them now.`);
  };

  const openAddFunds = () => {
    setPayMessage(null);
    setFundAmount("");
    setPayoutModal("addFunds");
  };

  const handleAddFunds = () => {
    const amount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return;
    setBalance((b) => b + amount);
    setFundAmount("");
    setPayoutModal(null);
    setPayMessage(`${formatUsd(amount)} added to your balance.`);
  };

  const parsedFundAmount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
  const canAddFunds = defaultPaymentMethod !== null && parsedFundAmount > 0;
  const chargingLabel = defaultPaymentMethod ? `${defaultPaymentMethod.brand} ···· ${defaultPaymentMethod.last4}` : null;

  return (
    <>
      <PageHeader title="Payouts" subtitle="Track commissions and pay creators automatically when Shopify sales come in" />
      <div style={{ padding: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginBottom: 20 }}>
          <div style={{ background: "#0047FF", color: "#FFFFFF", borderRadius: 16, padding: 28 }}>
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: "-0.01em", marginBottom: 6 }}>Your balance</div>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", marginBottom: 18 }}>{formatUsd(balance)}</div>
            <button type="button" onClick={openAddFunds} className="hero-cta-shopify">Add money to balance</button>
          </div>
          <PayoutsWorkspacePaymentCard />
        </div>

        <LiveSalesFeed />

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>Automate payouts</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>When a Shopify sale is detected, automatically pay the creator their commission</div>
          </div>
          <Toggle on={false} />
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 14 }}>Pay partners</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: "10px 14px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search partners by name or handle..."
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", flex: 1, color: "#1A1A1A", letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          {payMessage && (
            <div style={{ margin: "0 20px", marginTop: 14, padding: "12px 14px", background: "#F0F6FF", border: "1px solid #D6E4FF", borderRadius: 10, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
              {payMessage}
            </div>
          )}

          {registering && (
            <div style={{ margin: "14px 20px 0", padding: 20, background: "#FFFBF0", border: "1px solid #FFE4A8", borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                Register payment method for {registering.name}
              </div>
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 16 }}>
                This partner has no payout method on file. Add one before you can pay {registering.owed}.
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setMethodType("paypal")} style={{ ...btnSecondary, background: methodType === "paypal" ? "#F5F5F5" : "#FFFFFF", borderColor: methodType === "paypal" ? "#1A1A1A" : "#E5E5E5" }}>PayPal</button>
                <button type="button" onClick={() => setMethodType("bank")} style={{ ...btnSecondary, background: methodType === "bank" ? "#F5F5F5" : "#FFFFFF", borderColor: methodType === "bank" ? "#1A1A1A" : "#E5E5E5" }}>Bank account</button>
              </div>
              <input
                type="text"
                value={methodValue}
                onChange={(e) => setMethodValue(e.target.value)}
                placeholder={methodType === "paypal" ? "PayPal email" : "Account number or IBAN"}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", marginBottom: 12, letterSpacing: "-0.02em" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleSavePaymentMethod} disabled={!methodValue.trim()} style={{ ...btnPrimary, opacity: methodValue.trim() ? 1 : 0.5 }}>Save & continue</button>
                <button type="button" onClick={() => { setRegisteringId(null); setMethodValue(""); }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>No partners match your search</div>
            ) : (
              filtered.map((partner, i) => (
                <div
                  key={partner.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 20px",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none",
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#EFEFEF", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{partner.name}</div>
                    <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{partner.handle}</div>
                    {partner.hasPaymentMethod ? (
                      <div style={{ fontSize: 11, color: "#7A7A7A", marginTop: 4, letterSpacing: "-0.01em" }}>{partner.paymentLabel}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#C45C00", marginTop: 4, letterSpacing: "-0.01em" }}>No payment method</div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginRight: 8 }}>{partner.owed}</div>
                  <button
                    type="button"
                    onClick={() => handlePayClick(partner)}
                    disabled={payingId === partner.id || registeringId === partner.id}
                    style={{ ...btnPrimary, minWidth: 72, opacity: payingId === partner.id ? 0.7 : 1 }}
                  >
                    {payingId === partner.id ? "Paying…" : "Pay"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>Commission tracker</div>
            <div style={{ display: "flex", gap: 18 }}>
              <button type="button" style={{ background: "none", border: "none", fontSize: 13, color: "#1A1A1A", fontWeight: 500, cursor: "pointer", borderBottom: "2px solid #1A1A1A", paddingBottom: 4 }}>Active</button>
              <button type="button" style={{ background: "none", border: "none", fontSize: 13, color: "#7A7A7A", cursor: "pointer", paddingBottom: 4 }}>History</button>
            </div>
          </div>
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>Connect Shopify to start tracking commissions</div>
          </div>
        </div>

      {payoutModal === "addFunds" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={() => setPayoutModal(null)}>
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>Add money to balance</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 20px 0", lineHeight: 1.5 }}>Current balance: {formatUsd(balance)}</p>
            {!defaultPaymentMethod ? (
              <>
                <p style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 16px 0" }}>Add a payment method before you can fund your balance.</p>
                <button type="button" onClick={() => setAddPaymentForFunds(true)} style={{ ...btnPrimary, width: "100%" }}>Add a payment method</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", margin: "0 0 8px 0" }}>Charging {chargingLabel}</p>
                <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>Amount to add</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: "#1A1A1A" }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ flex: 1, boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 18, fontFamily: "inherit", color: "#1A1A1A", letterSpacing: "-0.02em" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {[50, 100, 250, 500].map((amt) => (
                    <button key={amt} type="button" onClick={() => setFundAmount(String(amt))} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>${amt}</button>
                  ))}
                </div>
                <button type="button" onClick={handleAddFunds} disabled={!canAddFunds} style={{ ...btnPrimary, width: "100%", opacity: canAddFunds ? 1 : 0.5 }}>Add funds</button>
              </>
            )}
            <button type="button" onClick={() => setPayoutModal(null)} style={{ ...btnSecondary, width: "100%", marginTop: 10 }}>Cancel</button>
          </div>
        </div>
      )}

      {addPaymentForFunds && (
        <AddPaymentMethodModal
          onClose={() => setAddPaymentForFunds(false)}
          onAdded={() => setPayMessage("Payment method connected. You can add funds now.")}
        />
      )}

      </div>
    </>
  );
}

function IntegrationsView() {
  const apps = [
    { name: "Shopify", desc: "Connect your store to track sales", logo: "/shopify-logo.svg", logoH: 39 },
    { name: "Zapier", desc: "Automate workflows with 5000+ apps", logo: "/zapier-logo.svg", logoH: 34 },
    { name: "Notion", desc: "Sync your workspace and docs", logo: "/notion-logo.svg", logoH: 34 },
    { name: "Make", desc: "Advanced visual automation", logo: "/make-logo.svg", logoH: 34 },
  ];
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect Trackit to the tools you already use" />
      <div style={{ padding: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {apps.map((app) => (
            <div key={app.name} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: "#FFFFFF", border: "1px solid #EFEFEF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <img src={app.logo} alt={app.name} width={34} height={app.logoH} style={{ display: "block", objectFit: "contain" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>{app.name}</div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{app.desc}</div>
              </div>
              <button type="button" style={btnSecondary}>Connect</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AutomationView() {
  return (
    <>
      <PageHeader title="Automation" subtitle="Build agents that run your creator marketing on autopilot" />
      <div style={{ padding: 40 }}>
        <div style={{ background: "linear-gradient(135deg, #0047FF 0%, #003BD6 100%)", color: "#FFFFFF", borderRadius: 18, padding: 32, marginBottom: 20, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>Make an automation agent</h2>
            <p style={{ fontSize: 14, opacity: 0.9, letterSpacing: "-0.01em", margin: 0, marginBottom: 18 }}>Assemble triggers, actions, and conditions like puzzle pieces. No code required.</p>
            <button type="button" style={{ background: "#FFFFFF", color: "#0047FF", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" }}>Build an agent</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 36px)", gap: 6, flexShrink: 0 }}>
            {[0,1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255," + (0.08 + (i % 3) * 0.12) + ")" }} />
            ))}
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 14 }}>Pre-built automations</h3>
          {[
            "When creator posts → notify me",
            "When sale detected → add to commission tracker",
            "When commission threshold reached → auto payout",
            "When no reply after 3 days → send follow-up",
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < 3 ? "1px solid #F5F5F5" : "none" }}>
              <span style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{row}</span>
              <Toggle on={false} />
            </div>
          ))}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>Import from code</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Paste a webhook URL or import an automation from JSON</div>
          </div>
          <button type="button" style={btnSecondary}>Import</button>
          <button type="button" style={btnSecondary}>Test</button>
        </div>
      </div>
    </>
  );
}

function LockedView({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div style={{ padding: 40 }}>
        <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 80, textAlign: "center" }}>
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

const INITIAL_AFFILIATES: AffiliateRow[] = [
  { creator: "@emma.style", platform: "Instagram", ref: "emma_a3f9k2", code: "EMMA15", clicks: 1240, conversions: 58, sales: 4820, commission: 482, status: "Active" },
  { creator: "@jakefit", platform: "TikTok", ref: "jake_x7b2m1", code: "JAKE15", clicks: 2100, conversions: 102, sales: 8900, commission: 890, status: "Active" },
  { creator: "@beautybylu", platform: "YouTube", ref: "lu_k9p4z3", code: "LU15", clicks: 890, conversions: 41, sales: 3200, commission: 320, status: "Active" },
  { creator: "@techwithsam", platform: "TikTok", ref: "sam_m2n8q5", code: "SAM15", clicks: 617, conversions: 33, sales: 2780, commission: 278, status: "Paused" },
];

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

function AffiliatesView() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>(INITIAL_AFFILIATES);
  const [panelOpen, setPanelOpen] = useState(false);
  const statusColor = (s: string) => s === "Active" ? { bg: "rgba(31,181,103,0.1)", fg: "#1FB567" } : { bg: "rgba(122,122,122,0.1)", fg: "#7A7A7A" };

  const handleAddAffiliate = (row: Pick<AffiliateRow, "creator" | "platform" | "ref" | "code">) => {
    setAffiliates((list) => [
      { ...row, clicks: 0, conversions: 0, sales: 0, commission: 0, status: "Active" },
      ...list,
    ]);
    setPanelOpen(false);
  };

  return (
    <>
      <PageHeader title="Affiliates" subtitle="Every creator gets a unique referral link and discount code. Sales tracked automatically." right={
        <button type="button" style={btnPrimary} onClick={() => setPanelOpen(true)}>+ Add affiliate</button>
      } />
      <div style={{ padding: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Active affiliates", value: "12" },
            { label: "Total clicks", value: "4,847" },
            { label: "Total conversions", value: "234" },
            { label: "Conversion rate", value: "4.8%" },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr 1fr 0.7fr 0.9fr 1fr 1fr 0.9fr 1.4fr", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EFEFEF", background: "#FAFAFA" }}>
            {["Creator", "Referral link", "Discount", "Clicks", "Conv.", "Sales", "Commission", "Status", "Action"].map((h) => (
              <div key={h} style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{h}</div>
            ))}
          </div>
          {affiliates.map((a, i) => {
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
                <div><span style={{ fontSize: 11, fontWeight: 500, color: sc.fg, background: sc.bg, padding: "4px 10px", borderRadius: 999 }}>{a.status}</span></div>
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
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>New affiliate</h2>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.45 }}>Add an influencer and generate their referral link and discount code.</p>
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
            placeholder="@creator"
            style={{ ...affiliateInputStyle, marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            style={{ ...affiliateInputStyle, marginBottom: 16, cursor: "pointer" }}
          >
            {["Instagram", "TikTok", "YouTube", "Twitter", "Other"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>Discount on code (%)</label>
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
            Generate
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
            Add to affiliates
          </button>
          <button type="button" onClick={onClose} style={{ ...btnSecondary, width: "100%" }}>Cancel</button>
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

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{ position: "relative", width: 40, height: 22, background: on ? "#0047FF" : "#E5E5E5", borderRadius: 999, cursor: "pointer", transition: "background 0.2s" }}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#FFFFFF", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }} />
    </div>
  );
}

const btnPrimary: React.CSSProperties = { background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };
const btnSecondary: React.CSSProperties = { background: "#FFFFFF", color: "#1A1A1A", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" };
const iconBtn: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

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
