"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  ensureNotificationsReset,
  getStoredUnreadCount,
  loadNotifications,
  NOTIFICATIONS_UPDATED_EVENT,
  resetNotifications,
  saveNotifications,
  type NotificationItem,
  type NotificationKind,
} from "@/lib/notifications-storage";

export type { NotificationItem, NotificationKind };

export function getInitialUnreadCount() {
  return getStoredUnreadCount();
}

const KIND_COLORS: Record<NotificationKind, string> = {
  payout: "#0047FF",
  campaign: "#7C3AED",
  outreach: "#FF3D8B",
  team: "#2E7D32",
  system: "#7A7A7A",
};

function NotificationKindIcon({
  kind,
  useTrackitLogo,
}: {
  kind: NotificationKind;
  useTrackitLogo?: boolean;
}) {
  if (useTrackitLogo) {
    return (
      <img
        src="/favicon.png"
        alt=""
        width={20}
        height={20}
        style={{ display: "block", objectFit: "contain" }}
      />
    );
  }

  const stroke = KIND_COLORS[kind];
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "payout":
      return (
        <svg {...common}>
          <path
            d="M12 3v18M16 7.5H9.75a2.75 2.75 0 000 5.5h5.5a2.75 2.75 0 010 5.5H7"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "campaign":
      return (
        <svg {...common}>
          <path
            d="M4 14v5a1 1 0 001 1h14a1 1 0 001-1v-5"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 14V9l4-5 4 5v5"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "outreach":
      return (
        <svg {...common}>
          <path
            d="M4 6.5l8 5 8-5"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 6.5h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1v-11z"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" stroke={stroke} strokeWidth="1.7" />
          <path
            d="M3.5 19.5v-1a4 4 0 004-4h3a4 4 0 004 4v1"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M16 8.5a2.5 2.5 0 010 5M19 19.5v-1a3 3 0 00-2.2-2.9"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "system":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth="1.7" />
          <path
            d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

type FilterTab = "all" | "unread";

export function NotificationsView({ onUnreadChange, isMobile }: { onUnreadChange?: (count: number) => void; isMobile?: boolean }) {
  const lang = useLang();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    ensureNotificationsReset();
    const loaded = loadNotifications();
    saveNotifications(loaded);
    setNotifications(loaded);
    onUnreadChange?.(loaded.filter((n) => !n.read).length);
    setHydrated(true);
  }, [onUnreadChange]);

  useEffect(() => {
    const refresh = () => {
      const loaded = loadNotifications();
      setNotifications(loaded);
      onUnreadChange?.(loaded.filter((n) => !n.read).length);
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
  }, [onUnreadChange]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const persist = (list: NotificationItem[]) => {
    saveNotifications(list);
    onUnreadChange?.(list.filter((n) => !n.read).length);
  };

  const markRead = (id: string) => {
    setNotifications((list) => {
      const next = list.map((n) => (n.id === id ? { ...n, read: true } : n));
      persist(next);
      return next;
    });
  };

  const markAllRead = () => {
    setNotifications((list) => {
      const next = list.map((n) => ({ ...n, read: true }));
      persist(next);
      return next;
    });
  };

  const dismiss = (id: string) => {
    setNotifications((list) => {
      const next = list.filter((n) => n.id !== id);
      persist(next);
      return next;
    });
  };

  const resetAll = () => {
    const cleared = resetNotifications();
    setNotifications(cleared);
    onUnreadChange?.(0);
  };

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <>
      <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 24, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>{lang === "fr" ? "Notifications" : "Notifications"}</h1>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {unreadCount > 0
                ? `${unreadCount} ${lang === "fr" ? "non lues" : "unread"}`
                : lang === "fr"
                  ? "Vous êtes à jour"
                  : "You're all caught up"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="hero-cta-shopify-light hero-cta-compact">
                {lang === "fr" ? "Tout marquer comme lu" : "Mark all as read"}
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="hero-cta-shopify-light hero-cta-compact"
                style={{ color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2" }}
              >
                {lang === "fr" ? "Tout réinitialiser" : "Reset all"}
              </button>
            )}
          </div>
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
              {tab === "all" ? (lang === "fr" ? "Tout" : "All") : `${lang === "fr" ? "Non lues" : "Unread"}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px" }}>
        {!hydrated ? (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 40, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </div>
        ) : visible.length === 0 ? (
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
            <div style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>
              {lang === "fr" ? "Aucune notification" : "No notifications"}
            </div>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {filter === "unread"
                ? lang === "fr"
                  ? "Vous avez tout lu."
                  : "You've read everything."
                : lang === "fr"
                  ? "Les mises à jour sur les paiements, campagnes et votre équipe apparaîtront ici."
                  : "Updates about payouts, campaigns, and your team will show up here."}
            </p>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
            {visible.map((n, i) => {
              const useTrackitLogo = n.kind === "system" && n.title.toLowerCase().includes("trackit");
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
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 1,
                    }}
                  >
                    <NotificationKindIcon kind={n.kind} useTrackitLogo={useTrackitLogo} />
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
