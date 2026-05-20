"use client";

import { useEffect, useState } from "react";

export type NotificationKind = "payout" | "campaign" | "outreach" | "team" | "system";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    kind: "payout",
    title: "Payout sent to Jordan Lee",
    body: "$240.00 commission was paid successfully from your balance.",
    time: "12 min ago",
    read: false,
  },
  {
    id: "2",
    kind: "campaign",
    title: "Summer Launch hit 50 sales",
    body: "Your campaign reached its first milestone. Review performance in Campaigns.",
    time: "2 hours ago",
    read: false,
  },
  {
    id: "3",
    kind: "outreach",
    title: "3 creators replied to outreach",
    body: "Sam Taylor, Morgan Kim, and Alex Rivera responded. Open Outreach to follow up.",
    time: "5 hours ago",
    read: false,
  },
  {
    id: "4",
    kind: "team",
    title: "Jordan Lee joined your workspace",
    body: "They accepted your invite as Admin. Manage roles in Settings → Team.",
    time: "Yesterday",
    read: true,
  },
  {
    id: "5",
    kind: "system",
    title: "Shopify connected",
    body: "Trackit is now receiving order webhooks from your store.",
    time: "2 days ago",
    read: true,
  },
  {
    id: "6",
    kind: "payout",
    title: "Low balance warning",
    body: "Your payout balance is below $100. Add funds to avoid failed creator payments.",
    time: "3 days ago",
    read: true,
  },
];

export function getInitialUnreadCount() {
  return INITIAL_NOTIFICATIONS.filter((n) => !n.read).length;
}

const btnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const KIND_STYLES: Record<NotificationKind, { bg: string; color: string; icon: string }> = {
  payout: { bg: "#F0F6FF", color: "#0047FF", icon: "$" },
  campaign: { bg: "#F3E8FF", color: "#7C3AED", icon: "◆" },
  outreach: { bg: "#FFF0F6", color: "#FF3D8B", icon: "✉" },
  team: { bg: "#E8F5E9", color: "#2E7D32", icon: "◎" },
  system: { bg: "#F5F5F5", color: "#7A7A7A", icon: "⚙" },
};

type FilterTab = "all" | "unread";

export function NotificationsView({ onUnreadChange }: { onUnreadChange?: (count: number) => void }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<FilterTab>("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const markRead = (id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = () => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
  };

  const dismiss = (id: string) => {
    setNotifications((list) => list.filter((n) => n.id !== id));
  };

  return (
    <>
      <div style={{ padding: "32px 40px 24px 40px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>Notifications</h1>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} style={btnSecondary}>
              Mark all as read
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {(["all", "unread"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontFamily: "inherit",
                fontWeight: filter === tab ? 500 : 400,
                cursor: "pointer",
                background: filter === tab ? "#1A1A1A" : "#F5F5F5",
                color: filter === tab ? "#FFFFFF" : "#7A7A7A",
                letterSpacing: "-0.02em",
              }}
            >
              {tab === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 40 }}>
        {visible.length === 0 ? (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: 16,
              padding: 60,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>No notifications</div>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {filter === "unread" ? "You've read everything." : "Updates about payouts, campaigns, and your team will show up here."}
            </p>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
            {visible.map((n, i) => {
              const style = KIND_STYLES[n.kind];
              return (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => markRead(n.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); markRead(n.id); } }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    width: "100%",
                    padding: "18px 20px",
                    border: "none",
                    borderBottom: i < visible.length - 1 ? "1px solid #F5F5F5" : "none",
                    background: n.read ? "#FFFFFF" : "#FAFCFF",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: style.bg,
                      color: style.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {style.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: n.read ? 500 : 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{n.title}</span>
                      {!n.read && (
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0047FF", flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 6px 0", lineHeight: 1.45 }}>{n.body}</p>
                    <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{n.time}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(n.id);
                    }}
                    aria-label="Dismiss"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#9A9A9A",
                      fontSize: 18,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 4,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
