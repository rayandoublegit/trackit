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
  setNotificationsUserId,
  type NotificationItem,
  type NotificationKind,
} from "@/lib/notifications-storage";

export type { NotificationItem, NotificationKind };

export function getInitialUnreadCount() {
  return getStoredUnreadCount();
}

const ICON_COLOR = "#1A1A1A";
const READ_BG = "#FFFFFF";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

function NotificationKindIcon({
  kind,
  useTrackitLogo,
}: {
  kind: NotificationKind;
  useTrackitLogo?: boolean;
}) {
  const stroke = ICON_COLOR;

  if (useTrackitLogo) {
    return (
      <img
        src={TRACKIT_LOGO}
        alt=""
        width={20}
        height={20}
        style={{
          display: "block",
          objectFit: "contain",
        }}
      />
    );
  }

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

function useNotifications(userId: string | undefined, onUnreadChange?: (count: number) => void) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setHydrated(true);
      onUnreadChange?.(0);
      return;
    }
    setNotificationsUserId(userId);
    ensureNotificationsReset();
    const loaded = loadNotifications();
    saveNotifications(loaded);
    setNotifications(loaded);
    onUnreadChange?.(loaded.filter((n) => !n.read).length);
    setHydrated(true);
  }, [userId, onUnreadChange]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      setNotificationsUserId(userId);
      const loaded = loadNotifications();
      setNotifications(loaded);
      onUnreadChange?.(loaded.filter((n) => !n.read).length);
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
  }, [userId, onUnreadChange]);

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

  return {
    notifications,
    filter,
    setFilter,
    hydrated,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    resetAll,
    visible,
  };
}

function NotificationList({
  visible,
  hydrated,
  filter,
  lang,
  onMarkRead,
  onDismiss,
  onOpenAction,
}: {
  visible: NotificationItem[];
  hydrated: boolean;
  filter: FilterTab;
  lang: "en" | "fr";
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpenAction?: (action: NonNullable<NotificationItem["action"]>) => void;
}) {
  if (!hydrated) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
        {lang === "fr" ? "Chargement…" : "Loading…"}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔔</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
          {lang === "fr" ? "Aucune notification" : "No notifications"}
        </div>
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.45 }}>
          {filter === "unread"
            ? lang === "fr"
              ? "Vous avez tout lu."
              : "You've read everything."
            : lang === "fr"
              ? "Les mises à jour apparaîtront ici."
              : "Updates will show up here."}
        </p>
      </div>
    );
  }

  return (
    <>
      {visible.map((n, i) => {
        const useTrackitLogo = n.kind === "system" && n.title.toLowerCase().includes("trackit");
        const unread = !n.read;
        return (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              onMarkRead(n.id);
              if (n.action) onOpenAction?.(n.action);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMarkRead(n.id);
                if (n.action) onOpenAction?.(n.action);
              }
            }}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              border: "none",
              borderBottom: i < visible.length - 1 ? "1px solid #F0F0F0" : "none",
              background: READ_BG,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              <NotificationKindIcon kind={n.kind} useTrackitLogo={useTrackitLogo} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: unread ? 600 : 500,
                    color: "#1A1A1A",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {n.title}
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "#7A7A7A",
                  letterSpacing: "-0.01em",
                  margin: "0 0 4px 0",
                  lineHeight: 1.45,
                }}
              >
                {n.body}
              </p>
              <span style={{ fontSize: 11, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                {n.time}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(n.id);
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
    </>
  );
}

export function NotificationsPanel({
  userId,
  onUnreadChange,
  onOpenAction,
  fullHeight,
}: {
  userId?: string;
  onUnreadChange?: (count: number) => void;
  onOpenAction?: (action: NonNullable<NotificationItem["action"]>) => void;
  fullHeight?: boolean;
}) {
  const lang = useLang();
  const {
    notifications,
    filter,
    setFilter,
    hydrated,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    resetAll,
    visible,
  } = useNotifications(userId, onUnreadChange);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        maxHeight: fullHeight ? "none" : 480,
        height: fullHeight ? "100%" : undefined,
        minHeight: fullHeight ? 420 : undefined,
      }}
    >
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #F0F0F0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            {!fullHeight ? (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>
                  {lang === "fr" ? "Notifications" : "Notifications"}
                </h2>
                <p style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "2px 0 0" }}>
                  {unreadCount > 0
                    ? `${unreadCount} ${lang === "fr" ? "non lues" : "unread"}`
                    : lang === "fr"
                      ? "Vous êtes à jour"
                      : "You're all caught up"}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0 }}>
                {unreadCount > 0
                  ? `${unreadCount} ${lang === "fr" ? "non lues" : "unread"}`
                  : lang === "fr"
                    ? "Vous êtes à jour"
                    : "You're all caught up"}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid #E5E5E5",
                  background: "#FFFFFF",
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  color: "#1A1A1A",
                  letterSpacing: "-0.01em",
                }}
              >
                {lang === "fr" ? "Tout lire" : "Mark all read"}
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={resetAll}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  color: "#DC2626",
                  letterSpacing: "-0.01em",
                }}
              >
                {lang === "fr" ? "Réinitialiser" : "Reset"}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "unread"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: "none",
                fontSize: 12,
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
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        <NotificationList
          visible={visible}
          hydrated={hydrated}
          filter={filter}
          lang={lang}
          onMarkRead={markRead}
          onDismiss={dismiss}
          onOpenAction={onOpenAction}
        />
      </div>
    </div>
  );
}
