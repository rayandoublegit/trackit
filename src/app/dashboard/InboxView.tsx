"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import {
  loadNotifications,
  NOTIFICATIONS_UPDATED_EVENT,
  saveNotifications,
  setNotificationsUserId,
  type NotificationItem,
} from "@/lib/notifications-storage";
import { WsIcon } from "./workspace/WorkspaceIcons";

export type { NotificationItem };

export function InboxView({
  userId,
  isMobile,
  onUnreadChange,
  onOpenAction,
  onNavigate,
}: {
  userId?: string;
  isMobile?: boolean;
  onUnreadChange?: (count: number) => void;
  onOpenAction?: (action: NonNullable<NotificationItem["action"]>) => void;
  onNavigate?: (view: DashboardView) => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setHydrated(true);
      return;
    }
    const refresh = () => {
      setNotificationsUserId(userId);
      setItems(loadNotifications());
      setHydrated(true);
    };
    refresh();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
  }, [userId]);

  const persist = (next: NotificationItem[]) => {
    setItems(next);
    saveNotifications(next);
    onUnreadChange?.(next.filter((n) => !n.read).length);
  };

  const openItem = (item: NotificationItem) => {
    if (!item.read) {
      persist(items.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    }
    if (item.action) onOpenAction?.(item.action);
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--ws-surface, #fff)",
      }}
    >
      <div
        style={{
          padding: isMobile ? "22px 18px 8px" : "28px 40px 10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 26 : 30,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            color: "var(--ws-text, #111)",
          }}
        >
          Inbox
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => persist(items.map((n) => ({ ...n, read: true })))}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--ws-text-muted)",
              cursor: "pointer",
            }}
          >
            {fr ? "Tout marquer comme lu" : "Mark all as read"}
          </button>
        )}
      </div>

      {hydrated && items.length > 0 ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "8px 12px 32px" : "10px 32px 48px",
          }}
        >
          <ul className="fi-inbox__list" style={{ maxWidth: 720 }}>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="fi-inbox__item" onClick={() => openItem(item)}>
                  <span
                    className="fi-inbox__dot"
                    aria-hidden
                    style={item.read ? { background: "transparent" } : undefined}
                  />
                  <span className="fi-inbox__body">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </span>
                  <time>{item.time}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "24px 20px 48px" : "32px 40px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              maxWidth: 360,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                border: "1px solid var(--ws-border, #E8E8EA)",
                background: "var(--ws-pill, #F4F4F5)",
                display: "grid",
                placeItems: "center",
                marginBottom: 22,
                color: "var(--ws-accent, #0047ff)",
              }}
              className="inbox-empty-icon"
            >
              <WsIcon name="invite" size={26} />
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 650,
                letterSpacing: "-0.035em",
                color: "var(--ws-text, #111)",
                lineHeight: 1.3,
              }}
            >
              {fr
                ? "Il semblerait que votre inbox soit encore calme"
                : "Looks like your inbox is still quiet"}
            </p>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 14.5,
                lineHeight: 1.45,
                letterSpacing: "-0.02em",
                color: "var(--ws-text-muted, #8E8E93)",
              }}
            >
              {fr
                ? "Invitez un créateur — les premières notifications arriveront ici."
                : "Invite a creator — the first notifications will land here."}
            </p>

            <button
              type="button"
              onClick={() => onNavigate?.("discovery")}
              style={{
                marginTop: 22,
                border: "none",
                borderRadius: 999,
                padding: "11px 22px",
                background: "var(--ws-btn, #111)",
                color: "var(--ws-btn-text, #fff)",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                letterSpacing: "-0.02em",
                cursor: "pointer",
              }}
            >
              {fr ? "Inviter un créateur" : "Invite a creator"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
