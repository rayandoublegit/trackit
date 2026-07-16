import { formatCurrency } from "@/lib/useCurrency";
import { playNotificationSound } from "@/lib/notification-sound";
import {
  isNotificationEnabled,
  type NotificationPrefKey,
} from "@/lib/notification-preferences";

export type NotificationKind = "payout" | "campaign" | "outreach" | "team" | "system";

export type NotificationAction = "feedback";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  read: boolean;
  /** Optional navigation target when the notification is clicked. */
  action?: NotificationAction;
};

const LEGACY_STORAGE_KEY = "trackit_notifications";
const RESET_VERSION_KEY = "trackit_notifications_reset_v2";
const WELCOME_MIGRATION_KEY = "trackit_notifications_welcome_migrated_v3";
const WELCOME_SENT_PREFIX = "trackit_welcome_sent_";
const USER_SCOPED_MIGRATION_KEY = "trackit_notifications_user_scoped_v1";

let activeUserId: string | null = null;

function storageKeyForUser(userId: string) {
  return `trackit_notifications_${userId}`;
}

export function setNotificationsUserId(userId: string | null) {
  activeUserId = userId;
  if (typeof window === "undefined" || !userId) return;

  if (!localStorage.getItem(USER_SCOPED_MIGRATION_KEY)) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(USER_SCOPED_MIGRATION_KEY, "1");
  }
}

export function getNotificationsUserId() {
  return activeUserId;
}

function welcomeNotificationBody(lang: "en" | "fr") {
  return lang === "fr"
    ? "Vous êtes sur Trackit. Découvrez des créateurs, lancez des campagnes et pilotez tous vos partenariats — tout depuis un seul espace."
    : "You're on Trackit. Discover creators, launch campaigns, and run every partnership — all from one dashboard.";
}

function isWelcomeNotification(notification: NotificationItem) {
  return (
    notification.kind === "system" &&
    (notification.title === "Bienvenue sur Trackit" || notification.title === "Welcome to Trackit")
  );
}

function welcomeNotificationLang(notification: NotificationItem): "en" | "fr" {
  if (notification.title === "Bienvenue sur Trackit") return "fr";
  if (notification.title === "Welcome to Trackit") return "en";
  return notification.body.toLowerCase().includes("vous") ? "fr" : "en";
}

function welcomeSentKey(userId: string) {
  return `${WELCOME_SENT_PREFIX}${userId}`;
}

export function hasWelcomeNotificationBeenSent(userId: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(welcomeSentKey(userId)) === "1";
}

function markWelcomeNotificationSent(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(welcomeSentKey(userId), "1");
}

export const NOTIFICATIONS_UPDATED_EVENT = "trackit-notifications-updated";

function newNotificationId() {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function notificationFingerprint(
  input: Pick<NotificationItem, "kind" | "title" | "body" | "action">
) {
  return `${input.kind}\0${input.title}\0${input.body}\0${input.action ?? ""}`;
}

const FEEDBACK_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;
const FEEDBACK_LAST_KEY_PREFIX = "trackit_feedback_notif_at_";

export function isFeedbackNotification(notification: NotificationItem) {
  if (notification.action === "feedback") return true;
  return (
    notification.kind === "system" &&
    (notification.title === "Laisser un feedback de ce que vous pensez de Trackit" ||
      notification.title === "Leave feedback about what you think of Trackit")
  );
}

function feedbackLastKey(userId: string) {
  return `${FEEDBACK_LAST_KEY_PREFIX}${userId}`;
}

function dedupeNotifications(items: NotificationItem[]): NotificationItem[] {
  const seen = new Set<string>();
  const deduped: NotificationItem[] = [];
  for (const item of items) {
    const fp = notificationFingerprint(item);
    if (seen.has(fp)) continue;
    seen.add(fp);
    deduped.push(item);
  }
  return deduped;
}

function formatNotificationTime(lang: "en" | "fr") {
  return lang === "fr" ? "À l'instant" : "Just now";
}

function dispatchNotificationsUpdated() {
  if (typeof window === "undefined") return;
  const unread = loadNotifications().filter((n) => !n.read).length;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, { detail: { unread } })
  );
}

function resolveStorageKey(): string | null {
  if (!activeUserId) return null;
  return storageKeyForUser(activeUserId);
}

/** Updates legacy welcome notification copy for the active user. */
export function migrateWelcomeNotifications() {
  if (typeof window === "undefined" || !activeUserId) return;
  const migrationKey = `${WELCOME_MIGRATION_KEY}_${activeUserId}`;
  if (localStorage.getItem(migrationKey)) return;

  const items = loadNotifications();
  let changed = false;
  const next = items.map((notification) => {
    if (!isWelcomeNotification(notification)) return notification;
    const targetBody = welcomeNotificationBody(welcomeNotificationLang(notification));
    if (notification.body === targetBody) return notification;
    changed = true;
    return { ...notification, body: targetBody };
  });

  if (changed) saveNotifications(next);
  localStorage.setItem(migrationKey, "1");
  if (changed) dispatchNotificationsUpdated();
}

/** Clears legacy mock notification data once per browser. */
export function ensureNotificationsReset() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(RESET_VERSION_KEY)) {
    migrateWelcomeNotifications();
    return;
  }
  if (activeUserId) {
    localStorage.removeItem(storageKeyForUser(activeUserId));
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.setItem(RESET_VERSION_KEY, "1");
  migrateWelcomeNotifications();
}

export function loadNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  const key = resolveStorageKey();
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter(
      (n): n is NotificationItem =>
        typeof n === "object" &&
        n !== null &&
        typeof (n as NotificationItem).id === "string" &&
        typeof (n as NotificationItem).title === "string"
    );
    return dedupeNotifications(filtered);
  } catch {
    return [];
  }
}

export function saveNotifications(items: NotificationItem[]) {
  if (typeof window === "undefined") return;
  const key = resolveStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(dedupeNotifications(items)));
}

export function resetNotifications(): NotificationItem[] {
  if (typeof window !== "undefined") {
    const key = resolveStorageKey();
    if (key) localStorage.removeItem(key);
  }
  dispatchNotificationsUpdated();
  return [];
}

export function getStoredUnreadCount(): number {
  return loadNotifications().filter((n) => !n.read).length;
}

function resolveActiveUserId(userId?: string | null): string | null {
  if (userId) setNotificationsUserId(userId);
  return activeUserId;
}

export function pushNotification(
  input: Omit<NotificationItem, "id" | "read" | "time"> & {
    time?: string;
    prefKey?: NotificationPrefKey;
  },
  userId?: string | null
): NotificationItem | null {
  const uid = resolveActiveUserId(userId);
  if (!uid) return null;

  if (input.prefKey && !isNotificationEnabled(uid, input.prefKey, "push")) {
    return null;
  }

  const fp = notificationFingerprint(input);
  const existing = loadNotifications();
  const duplicate = existing.find((n) => notificationFingerprint(n) === fp);
  if (duplicate) {
    return duplicate;
  }

  playNotificationSound();

  const item: NotificationItem = {
    kind: input.kind,
    title: input.title,
    body: input.body,
    action: input.action,
    id: newNotificationId(),
    read: false,
    time: input.time ?? "Just now",
  };
  const next = [item, ...existing];
  saveNotifications(next);
  dispatchNotificationsUpdated();
  return item;
}

export function notifyCreatorPaid(
  lang: "en" | "fr",
  creatorName: string,
  amount: number,
  userId?: string | null
) {
  const formatted = formatCurrency(amount, lang);
  const name = creatorName.trim() || (lang === "fr" ? "ce créateur" : "this creator");
  pushNotification({
    kind: "payout",
    title:
      lang === "fr"
        ? `Paiement envoyé à ${name}`
        : `You paid ${name}`,
    body:
      lang === "fr"
        ? `Un payout de ${formatted} vient d'être envoyé à ${name}.`
        : `A ${formatted} payout was just sent to ${name}.`,
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyCampaignCreated(lang: "en" | "fr", campaignName: string, userId?: string | null) {
  pushNotification({
    kind: "campaign",
    title:
      lang === "fr"
        ? `Campagne « ${campaignName} » lancée`
        : `Campaign "${campaignName}" launched`,
    body:
      lang === "fr"
        ? "Votre campagne est active. Ajoutez des créateurs et suivez les ventes."
        : "Your campaign is live. Add creators and track sales.",
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyCreatorSaved(lang: "en" | "fr", creatorName: string, userId?: string | null) {
  pushNotification({
    kind: "outreach",
    title:
      lang === "fr"
        ? `${creatorName} ajouté à vos créateurs`
        : `${creatorName} saved to your creators`,
    body:
      lang === "fr"
        ? "Vous pouvez maintenant lancer une campagne ou envoyer un message."
        : "You can now run a campaign or send outreach.",
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyOutreachSent(lang: "en" | "fr", creatorName: string, userId?: string | null) {
  pushNotification({
    kind: "outreach",
    title:
      lang === "fr"
        ? `Message envoyé à ${creatorName}`
        : `Outreach sent to ${creatorName}`,
    body:
      lang === "fr"
        ? "Votre message a été enregistré dans l'historique."
        : "Your message was saved to outreach history.",
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyShopifyConnected(lang: "en" | "fr", storeName: string, userId?: string | null) {
  pushNotification({
    kind: "system",
    title: lang === "fr" ? "Shopify connecté" : "Shopify connected",
    body:
      lang === "fr"
        ? `Trackit reçoit maintenant les commandes de ${storeName}.`
        : `Trackit is now receiving orders from ${storeName}.`,
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyFundsAdded(lang: "en" | "fr", amount: number, userId?: string | null) {
  pushNotification({
    kind: "payout",
    title: lang === "fr" ? "Fonds ajoutés au solde" : "Funds added to balance",
    body:
      lang === "fr"
        ? `${formatCurrency(amount, lang)} ont été ajoutés à votre solde de paiement.`
        : `${formatCurrency(amount, lang)} was added to your payout balance.`,
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifySaleRecorded(
  lang: "en" | "fr",
  creatorName: string,
  orderAmount: number,
  commissionAmount: number,
  userId?: string | null
) {
  const name = creatorName.trim() || (lang === "fr" ? "un créateur" : "a creator");
  pushNotification({
    kind: "campaign",
    prefKey: "sale_tracked",
    title:
      lang === "fr"
        ? `Vente enregistrée — ${name}`
        : `Sale recorded — ${name}`,
    body:
      lang === "fr"
        ? `Commande de ${formatCurrency(orderAmount, lang)} · commission ${formatCurrency(commissionAmount, lang)}.`
        : `${formatCurrency(orderAmount, lang)} order · ${formatCurrency(commissionAmount, lang)} commission.`,
    time: formatNotificationTime(lang),
  }, userId);
}

export function notifyCreatorReplied(
  lang: "en" | "fr",
  creatorName: string,
  userId?: string | null
) {
  const name = creatorName.trim() || (lang === "fr" ? "Un créateur" : "A creator");
  pushNotification({
    kind: "outreach",
    prefKey: "outreach_reply",
    title:
      lang === "fr"
        ? `${name} a répondu à votre message`
        : `${name} replied to your outreach`,
    body:
      lang === "fr"
        ? "Ouvrez Outreach pour continuer la conversation."
        : "Open Outreach to continue the conversation.",
    time: formatNotificationTime(lang),
  }, userId);
}

/**
 * Brand-only feedback reminder — at most once every 5 days.
 * Clicking the notification opens the feedback page.
 */
export function notifyFeedbackIfNeeded(userId: string, lang: "en" | "fr"): boolean {
  if (typeof window === "undefined") return false;
  setNotificationsUserId(userId);

  const lastAt = Number(localStorage.getItem(feedbackLastKey(userId)) || "0");
  if (Number.isFinite(lastAt) && Date.now() - lastAt < FEEDBACK_INTERVAL_MS) {
    return false;
  }

  const existing = loadNotifications();
  // Don't stack unread feedback reminders.
  if (existing.some((n) => isFeedbackNotification(n) && !n.read)) {
    return false;
  }

  // Drop previous feedback notifications so a fresh unread one can appear.
  const withoutFeedback = existing.filter((n) => !isFeedbackNotification(n));
  saveNotifications(withoutFeedback);

  playNotificationSound();

  const item: NotificationItem = {
    id: newNotificationId(),
    kind: "system",
    title:
      lang === "fr"
        ? "Laisser un feedback de ce que vous pensez de Trackit"
        : "Leave feedback about what you think of Trackit",
    body:
      lang === "fr"
        ? "Cliquez pour ouvrir la page et partager votre avis."
        : "Click to open the page and share your thoughts.",
    time: formatNotificationTime(lang),
    read: false,
    action: "feedback",
  };

  saveNotifications([item, ...withoutFeedback]);
  localStorage.setItem(feedbackLastKey(userId), String(Date.now()));
  dispatchNotificationsUpdated();
  return true;
}

/** Welcome notification — once per user, ever (persisted in localStorage). */
export function notifyWelcomeIfNeeded(userId: string, lang: "en" | "fr"): boolean {
  setNotificationsUserId(userId);

  const items = loadNotifications();
  if (items.some(isWelcomeNotification)) {
    if (!hasWelcomeNotificationBeenSent(userId)) {
      markWelcomeNotificationSent(userId);
    }
    return false;
  }

  if (hasWelcomeNotificationBeenSent(userId)) {
    return false;
  }

  const item = pushNotification(
    {
      kind: "system",
      title: lang === "fr" ? "Bienvenue sur Trackit" : "Welcome to Trackit",
      body: welcomeNotificationBody(lang),
      time: formatNotificationTime(lang),
    },
    userId
  );

  if (item) {
    markWelcomeNotificationSent(userId);
    return true;
  }
  return false;
}

/** Replays welcome chime after a user gesture if welcome is still unread. */
export function playWelcomeSoundIfUnread(userId: string) {
  setNotificationsUserId(userId);
  const welcome = loadNotifications().find(isWelcomeNotification);
  if (welcome && !welcome.read) {
    playNotificationSound();
  }
}

/** Dev helper — fires a sample notification of the given type. */
export function simulateNotification(lang: "en" | "fr", kind: NotificationKind = "payout") {
  switch (kind) {
    case "payout":
      notifyCreatorPaid(lang, "Jordan Lee", 240);
      break;
    case "campaign":
      notifyCampaignCreated(lang, lang === "fr" ? "Lancement été" : "Summer Launch");
      break;
    case "outreach":
      notifyOutreachSent(lang, "@emma_style");
      break;
    case "team":
      pushNotification({
        kind: "team",
        title: lang === "fr" ? "Jordan Lee a rejoint votre espace" : "Jordan Lee joined your workspace",
        body:
          lang === "fr"
            ? "Il a accepté votre invitation en tant qu'Admin."
            : "They accepted your invite as Admin.",
        time: formatNotificationTime(lang),
      });
      break;
    case "system":
      notifyShopifyConnected(lang, "yourstore.myshopify.com");
      break;
  }
}
