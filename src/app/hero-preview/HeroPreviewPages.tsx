"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { AffiliateLinksView } from "@/app/dashboard/AffiliateLinksView";
import { BrandContentView } from "@/app/dashboard/BrandContentView";
import { CampaignsView } from "@/app/dashboard/CampaignsView";
import { CreatorsView } from "@/app/dashboard/CreatorsView";
import {
  DashboardNavigationProvider,
  type DashboardNavigationContextValue,
} from "@/app/dashboard/DashboardNavigationProvider";
import { DiscoveryFeed } from "@/app/dashboard/DiscoveryFeed";
import { FinditInboxView } from "@/app/dashboard/FinditInboxView";
import { InboxView } from "@/app/dashboard/InboxView";
import { InvitationsView } from "@/app/dashboard/InvitationsView";
import { MeetingsView } from "@/app/dashboard/MeetingsView";
import { OutreachAnalyticsCards } from "@/app/dashboard/OutreachAnalyticsCards";
import { OutreachHistorySection } from "@/app/dashboard/OutreachView";
import { PayoutsView, TransactionsView } from "@/app/dashboard/PayoutsView";
import { PlannerNotesView } from "@/app/dashboard/PlannerNotesView";
import { SplitHeaderActions } from "@/app/dashboard/SplitHeaderActions";
import { TasksView } from "@/app/dashboard/TasksView";
import { WhiteboardView } from "@/app/dashboard/WhiteboardView";
import type { DashboardNavState } from "@/lib/dashboard-navigation";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import {
  loadNotifications,
  saveNotifications,
  setNotificationsUserId,
} from "@/lib/notifications-storage";
import {
  appendStoredOutreachEntry,
  loadStoredOutreachHistory,
} from "@/lib/outreach-history-storage";
import type { PlanTier } from "@/lib/plan-limits";
import { workspaceStorageKey } from "@/lib/workspaces";
import "@/app/dashboard/dashboard.css";

export type HeroPreviewPage =
  | "ai"
  | "inbox"
  | "outreach"
  | "tasks"
  | "discovery"
  | "findit-inbox"
  | "creators"
  | "campaigns"
  | "invitations"
  | "content"
  | "links"
  | "payouts"
  | "transactions"
  | "planner"
  | "planner-notes"
  | "whiteboard"
  | "integrations";

export const PAGE_RAIL: Record<HeroPreviewPage, string> = {
  ai: "home",
  inbox: "home",
  outreach: "home",
  tasks: "home",
  discovery: "findit",
  "findit-inbox": "findit",
  creators: "findit",
  campaigns: "trackit",
  invitations: "trackit",
  content: "trackit",
  links: "trackit",
  payouts: "payit",
  transactions: "payit",
  planner: "planner",
  "planner-notes": "planner",
  whiteboard: "whiteboard",
  integrations: "integrations",
};

export const RAIL_DEFAULT_PAGE: Record<string, HeroPreviewPage> = {
  home: "ai",
  findit: "discovery",
  trackit: "campaigns",
  payit: "payouts",
  planner: "planner",
  whiteboard: "whiteboard",
  integrations: "integrations",
  ai: "ai",
};

const PREVIEW_USER_ID = "hero-preview-session";
const PREVIEW_PLAN: PlanTier = "free";
const PREVIEW_NAME = "m's";
const SEED_FLAG = "trackit_hero_preview_seeded_v1";

const PAGE_VIEW: Record<HeroPreviewPage, DashboardView> = {
  ai: "ai",
  inbox: "notifications",
  outreach: "outreach",
  tasks: "tasks",
  discovery: "discovery",
  "findit-inbox": "findit-inbox",
  creators: "creators",
  campaigns: "campaigns",
  invitations: "invitations",
  content: "brand-content",
  links: "links",
  payouts: "payouts",
  transactions: "transactions",
  planner: "planner",
  "planner-notes": "planner-notes",
  whiteboard: "whiteboard",
  integrations: "integrations",
};

function noop() {}

function seedPreviewSession() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SEED_FLAG) === "1") {
    setNotificationsUserId(PREVIEW_USER_ID);
    return;
  }

  setNotificationsUserId(PREVIEW_USER_ID);
  if (loadNotifications().length === 0) {
    saveNotifications([
      {
        id: "hp-n1",
        kind: "team",
        title: "Maya accepted your invite",
        body: "She’s now in Summer Drop 2026.",
        time: "2h",
        read: false,
      },
      {
        id: "hp-n2",
        kind: "campaign",
        title: "New content from @leo.fits",
        body: "A TikTok draft is waiting in Discover Inbox.",
        time: "Yesterday",
        read: false,
      },
      {
        id: "hp-n3",
        kind: "payout",
        title: "Payout sent to Nora",
        body: "$240 commission marked as paid.",
        time: "Mon",
        read: true,
      },
    ]);
  }

  const tasksKey = workspaceStorageKey(`trackit.home.tasks.${PREVIEW_USER_ID}`);
  if (!localStorage.getItem(tasksKey)) {
    localStorage.setItem(
      tasksKey,
      JSON.stringify([
        {
          id: "hp-t1",
          title: "Follow up with Maya",
          done: false,
          createdAt: Date.now() - 86_400_000,
          due: new Date(Date.now() + 86_400_000).toISOString(),
          color: 0,
        },
        {
          id: "hp-t2",
          title: "Send Summer Drop brief",
          done: false,
          createdAt: Date.now() - 172_800_000,
          due: new Date(Date.now() + 259_200_000).toISOString(),
          color: 2,
        },
      ]),
    );
  }

  const meetingsKey = workspaceStorageKey(`trackit.planner.calls.${PREVIEW_USER_ID}`);
  if (!localStorage.getItem(meetingsKey)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    localStorage.setItem(
      meetingsKey,
      JSON.stringify([
        {
          id: "hp-m1",
          title: "Maya brief",
          when: tomorrow.toISOString(),
          withWho: "Maya Moves",
          notes: "",
        },
      ]),
    );
  }

  if (loadStoredOutreachHistory(PREVIEW_USER_ID).length === 0) {
    appendStoredOutreachEntry(PREVIEW_USER_ID, {
      creator_username: "maya.moves",
      creator_display_name: "Maya Moves",
      creator_avatar: "/hero-preview-avatar.png",
      platform: "TikTok DM",
      message: "Hey Maya — loved your last video. Want to join Summer Drop?",
      status: "replied",
      follow_up_date: null,
    });
    appendStoredOutreachEntry(PREVIEW_USER_ID, {
      creator_username: "leo.fits",
      creator_display_name: "Leo Fits",
      creator_avatar: "",
      platform: "Email",
      message: "Leo, we’re lining up a fitness drop next month.",
      status: "sent",
      follow_up_date: null,
    });
  }

  localStorage.setItem(SEED_FLAG, "1");
}

function PreviewSession({ view, children }: { view: DashboardView; children: ReactNode }) {
  useEffect(() => {
    seedPreviewSession();
    return () => {
      setNotificationsUserId(null);
    };
  }, []);

  const value = useMemo<DashboardNavigationContextValue>(
    () => ({
      navState: { view } satisfies DashboardNavState,
      ready: true,
      navigate: noop,
      goBack: noop,
      setView: noop,
    }),
    [view],
  );

  return <DashboardNavigationProvider value={value}>{children}</DashboardNavigationProvider>;
}

function PreviewOutreachPage() {
  return (
    <div className="ou-page">
      <div className="ou-page__head">
        <div>
          <h1 className="ou-page__title">Outreach</h1>
          <p className="ou-page__sub">Sent messages, replies, and follow-ups — all in one place.</p>
        </div>
        <SplitHeaderActions
          variant="white"
          primaryLabel="Contact"
          onPrimaryClick={noop}
          sectionLabel="Templates"
          menuAriaLabel="More actions"
          menuItems={[
            { label: "See templates", onClick: noop, icon: null },
            { label: "Import template", onClick: noop, icon: null },
            { label: "Import CSV", onClick: noop, icon: null },
            { label: "Create template", onClick: noop, icon: null },
          ]}
        />
      </div>
      <div className="ou-page__body">
        <OutreachAnalyticsCards userId={PREVIEW_USER_ID} />
        <OutreachHistorySection
          userId={PREVIEW_USER_ID}
          plan={PREVIEW_PLAN}
          onNavigateToBilling={noop}
          onUpgrade={noop}
          onUpgradePro={noop}
          onUpgradeScale={noop}
        />
      </div>
    </div>
  );
}

function PreviewIntegrationsPage() {
  const apps = [
    { name: "Shopify", desc: "Connect your store to track sales", logo: "/shopify-logo.svg", logoH: 39 },
    { name: "Stripe", desc: "Track analytics and everything automatically", logo: "/stripe-logo.svg", logoH: 28 },
    { name: "Zapier", desc: "Automate workflows with 5000+ apps", logo: "/zapier-logo.svg", logoH: 34 },
    { name: "Notion", desc: "Sync your workspace and docs", logo: "/notion-logo.svg", logoH: 34 },
    { name: "Make", desc: "Advanced visual automation", logo: "/make-logo.svg", logoH: 34 },
  ];
  return (
    <div style={{ minHeight: "100%", background: "#fff" }}>
      <div style={{ padding: "40px 40px 24px", background: "#fff" }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>
          Integrations
        </h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
          Connect Trackit to the tools you already use
        </p>
      </div>
      <div style={{ padding: "24px 40px 40px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {apps.map((app) => (
            <div
              key={app.name}
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: 24,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #EFEFEF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img src={app.logo} alt={app.name} width={34} height={app.logoH} style={{ objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{app.name}</div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{app.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RealPage({ page }: { page: HeroPreviewPage }) {
  const common = {
    userId: PREVIEW_USER_ID,
    isMobile: false,
    plan: PREVIEW_PLAN,
    onUpgrade: noop,
    onUpgradePro: noop,
    onUpgradeScale: noop,
  };

  switch (page) {
    case "inbox":
      return <InboxView userId={PREVIEW_USER_ID} />;
    case "outreach":
      return <PreviewOutreachPage />;
    case "tasks":
      return <TasksView userId={PREVIEW_USER_ID} displayName={PREVIEW_NAME} />;
    case "discovery":
      return <DiscoveryFeed plan={PREVIEW_PLAN} workspaceUserId={PREVIEW_USER_ID} onUpgrade={noop} />;
    case "findit-inbox":
      return <FinditInboxView userId={PREVIEW_USER_ID} />;
    case "creators":
      return <CreatorsView {...common} />;
    case "campaigns":
      return <CampaignsView {...common} />;
    case "invitations":
      return <InvitationsView {...common} />;
    case "content":
      return <BrandContentView userId={PREVIEW_USER_ID} />;
    case "links":
      return <AffiliateLinksView {...common} />;
    case "payouts":
      return <PayoutsView {...common} />;
    case "transactions":
      return <TransactionsView {...common} />;
    case "planner":
      return <MeetingsView userId={PREVIEW_USER_ID} displayName={PREVIEW_NAME} />;
    case "planner-notes":
      return <PlannerNotesView userId={PREVIEW_USER_ID} />;
    case "whiteboard":
      return <WhiteboardView userId={PREVIEW_USER_ID} />;
    case "integrations":
      return <PreviewIntegrationsPage />;
    default:
      return null;
  }
}

export function HeroPreviewPageView({ page }: { page: HeroPreviewPage }) {
  if (page === "ai") return null;
  return (
    <PreviewSession view={PAGE_VIEW[page]}>
      <RealPage page={page} />
    </PreviewSession>
  );
}
