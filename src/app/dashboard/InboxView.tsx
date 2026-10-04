"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import {
  loadNotifications,
  NOTIFICATIONS_UPDATED_EVENT,
  saveNotifications,
  setNotificationsUserId,
  type NotificationItem,
  type NotificationKind,
} from "@/lib/notifications-storage";
import { WsIcon } from "./workspace/WorkspaceIcons";

export type { NotificationItem };

type WsIconName = Parameters<typeof WsIcon>[0]["name"];

type Filter = "all" | "unread" | NotificationKind;

const KINDS: { kind: NotificationKind; en: string; fr: string; icon: WsIconName }[] = [
  { kind: "campaign", en: "Campaigns", fr: "Campagnes", icon: "campaign" },
  { kind: "outreach", en: "Outreach", fr: "Prospection", icon: "invite" },
  { kind: "payout", en: "Payouts", fr: "Paiements", icon: "payit" },
  { kind: "team", en: "Team", fr: "Équipe", icon: "users" },
  { kind: "system", en: "System", fr: "Système", icon: "settings" },
];

const kindMeta = (kind: NotificationKind) => KINDS.find((k) => k.kind === kind) ?? KINDS[4];

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
  const [filter, setFilter] = useState<Filter>("all");

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
    if (!item.read) persist(items.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    if (item.action) onOpenAction?.(item.action);
  };

  const toggleRead = (item: NotificationItem) =>
    persist(items.map((n) => (n.id === item.id ? { ...n, read: !n.read } : n)));

  const dismiss = (item: NotificationItem) => persist(items.filter((n) => n.id !== item.id));

  const unreadCount = items.filter((n) => !n.read).length;

  const counts = useMemo(() => {
    const map = new Map<NotificationKind, number>();
    for (const n of items) map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
    return map;
  }, [items]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => !n.read);
    return items.filter((n) => n.kind === filter);
  }, [filter, items]);

  const newItems = visible.filter((n) => !n.read);
  const earlierItems = visible.filter((n) => n.read);
  const maxCount = Math.max(1, ...Array.from(counts.values()));

  const renderRow = (item: NotificationItem, index: number) => {
    const meta = kindMeta(item.kind);
    return (
      <li key={item.id} className="nx-row-wrap" style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}>
        <div
          role="button"
          tabIndex={0}
          className={`nx-row${item.read ? "" : " is-unread"}`}
          onClick={() => openItem(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItem(item);
            }
          }}
        >
          <span className={`nx-row__icon nx-kind--${item.kind}`} aria-hidden>
            <WsIcon name={meta.icon} size={16} />
          </span>
          <span className="nx-row__body">
            <span className="nx-row__top">
              <strong>{item.title}</strong>
              <span className="nx-row__tag">{fr ? meta.fr : meta.en}</span>
            </span>
            <span className="nx-row__text">{item.body}</span>
          </span>
          <span className="nx-row__side">
            <time>{item.time}</time>
            <span className="nx-row__actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRead(item);
                }}
                title={item.read ? (fr ? "Marquer non lu" : "Mark unread") : fr ? "Marquer lu" : "Mark read"}
              >
                <span className={`nx-dot${item.read ? " is-hollow" : ""}`} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(item);
                }}
                title={fr ? "Supprimer" : "Dismiss"}
              >
                ×
              </button>
            </span>
          </span>
        </div>
      </li>
    );
  };

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: fr ? "Tout" : "All", count: items.length },
    { id: "unread", label: fr ? "Non lues" : "Unread", count: unreadCount },
    ...KINDS.filter((k) => counts.get(k.kind)).map((k) => ({
      id: k.kind as Filter,
      label: fr ? k.fr : k.en,
      count: counts.get(k.kind) ?? 0,
    })),
  ];

  const quickLinks: { view: DashboardView; label: string; hint: string; icon: WsIconName }[] = [
    { view: "discovery", label: fr ? "Découvrir" : "Discover", hint: fr ? "Trouver des créateurs" : "Find creators", icon: "findit" },
    { view: "campaigns", label: fr ? "Campagnes" : "Campaigns", hint: fr ? "Suivre vos campagnes" : "Track your campaigns", icon: "trackit" },
    { view: "payouts", label: "Pay it", hint: fr ? "Payer vos créateurs" : "Pay your creators", icon: "payit" },
  ];

  return (
    <div className={`nx-page${isMobile ? " is-mobile" : ""}`}>
      <section className="nx-main">
        <header className="nx-head">
          <div>
            <p className="nx-eyebrow">{fr ? "Centre d’activité" : "Activity center"}</p>
            <h1>{fr ? "Boîte de réception" : "Inbox"}</h1>
          </div>
          {unreadCount > 0 ? (
            <button type="button" className="nx-ghost" onClick={() => persist(items.map((n) => ({ ...n, read: true })))}>
              {fr ? "Tout marquer comme lu" : "Mark all as read"}
            </button>
          ) : null}
        </header>

        <div className="nx-filters" role="tablist">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`nx-filter${filter === f.id ? " is-active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="nx-feed">
          {!hydrated ? null : visible.length === 0 ? (
            <div className="nx-empty">
              <span className="nx-empty__icon" aria-hidden>
                <WsIcon name="bell" size={22} />
              </span>
              <p className="nx-empty__title">
                {items.length === 0
                  ? fr
                    ? "Votre inbox est encore calme"
                    : "Your inbox is still quiet"
                  : fr
                    ? "Rien ici"
                    : "Nothing here"}
              </p>
              <p className="nx-empty__text">
                {items.length === 0
                  ? fr
                    ? "Invitez un créateur, lancez une campagne : l’activité arrivera ici."
                    : "Invite a creator or launch a campaign — activity will land here."
                  : fr
                    ? "Aucune notification pour ce filtre."
                    : "No notifications match this filter."}
              </p>
              {items.length === 0 ? (
                <button type="button" className="nx-primary" onClick={() => onNavigate?.("discovery")}>
                  {fr ? "Trouver des créateurs" : "Find creators"}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {newItems.length > 0 ? (
                <div className="nx-group">
                  <div className="nx-group__label">{fr ? "Nouveau" : "New"}</div>
                  <ul>{newItems.map(renderRow)}</ul>
                </div>
              ) : null}
              {earlierItems.length > 0 ? (
                <div className="nx-group">
                  <div className="nx-group__label">{fr ? "Plus tôt" : "Earlier"}</div>
                  <ul>{earlierItems.map((item, i) => renderRow(item, i + newItems.length))}</ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <aside className="nx-rail">
        <div className="nx-card nx-summary">
          <p className="nx-card__label">{fr ? "Aperçu" : "Overview"}</p>
          <div className="nx-summary__big">
            <strong>{unreadCount}</strong>
            <span>{fr ? "non lues" : "unread"}</span>
          </div>
          <div className="nx-summary__meta">
            <span>
              {items.length} {fr ? "au total" : "total"}
            </span>
            <span>{unreadCount === 0 ? (fr ? "Vous êtes à jour" : "All caught up") : fr ? "À traiter" : "Needs attention"}</span>
          </div>
        </div>

        <div className="nx-card">
          <p className="nx-card__label">{fr ? "Par catégorie" : "By category"}</p>
          <ul className="nx-bars">
            {KINDS.map((k) => {
              const count = counts.get(k.kind) ?? 0;
              return (
                <li key={k.kind}>
                  <button type="button" onClick={() => setFilter(k.kind)} disabled={count === 0}>
                    <span className={`nx-bars__icon nx-kind--${k.kind}`} aria-hidden>
                      <WsIcon name={k.icon} size={13} />
                    </span>
                    <span className="nx-bars__name">{fr ? k.fr : k.en}</span>
                    <span className="nx-bars__track">
                      <span className={`nx-kind--${k.kind}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                    </span>
                    <span className="nx-bars__count">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="nx-card">
          <p className="nx-card__label">{fr ? "Accès rapide" : "Quick actions"}</p>
          <ul className="nx-links">
            {quickLinks.map((link) => (
              <li key={link.view}>
                <button type="button" onClick={() => onNavigate?.(link.view)}>
                  <span className="nx-links__icon" aria-hidden>
                    <WsIcon name={link.icon} size={15} />
                  </span>
                  <span className="nx-links__text">
                    <strong>{link.label}</strong>
                    <span>{link.hint}</span>
                  </span>
                  <span className="nx-links__arrow" aria-hidden>→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button type="button" className="nx-prefs" onClick={() => onNavigate?.("settings")}>
          <WsIcon name="settings" size={14} />
          {fr ? "Préférences de notification" : "Notification preferences"}
        </button>
      </aside>
    </div>
  );
}
