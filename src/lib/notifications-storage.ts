import { formatCurrency } from "@/lib/useCurrency";
import { playNotificationSound } from "@/lib/notification-sound";

export type NotificationKind = "payout" | "campaign" | "outreach" | "team" | "system";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

const STORAGE_KEY = "trackit_notifications";
const RESET_VERSION_KEY = "trackit_notifications_reset_v2";
const WELCOME_MIGRATION_KEY = "trackit_notifications_welcome_migrated_v3";
const WELCOME_SENT_PREFIX = "trackit_welcome_sent_";

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
  input: Pick<NotificationItem, "kind" | "title" | "body">
) {
  return `${input.kind}\0${input.title}\0${input.body}`;
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

/** Updates legacy welcome notification copy for existing users (localStorage). */
export function migrateWelcomeNotifications() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(WELCOME_MIGRATION_KEY)) return;

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
  localStorage.setItem(WELCOME_MIGRATION_KEY, "1");
  if (changed) dispatchNotificationsUpdated();
}

/** Clears legacy mock notification data once per browser. */
export function ensureNotificationsReset() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(RESET_VERSION_KEY)) {
    migrateWelcomeNotifications();
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(RESET_VERSION_KEY, "1");
  migrateWelcomeNotifications();
}

export function loadNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeNotifications(items)));
}

export function resetNotifications(): NotificationItem[] {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  dispatchNotificationsUpdated();
  return [];
}

export function getStoredUnreadCount(): number {
  return loadNotifications().filter((n) => !n.read).length;
}

export function pushNotification(
  input: Omit<NotificationItem, "id" | "read" | "time"> & { time?: string }
): NotificationItem {
  const fp = notificationFingerprint(input);
  const existing = loadNotifications();
  const duplicate = existing.find((n) => notificationFingerprint(n) === fp);
  if (duplicate) {
    return duplicate;
  }

  playNotificationSound();

  const item: NotificationItem = {
    ...input,
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
  amount: number
) {
  const formatted = formatCurrency(amount, lang);
  pushNotification({
    kind: "payout",
    title:
      lang === "fr"
        ? `Paiement envoyé à ${creatorName}`
        : `You just paid ${creatorName}`,
    body:
      lang === "fr"
        ? `Vous venez de payer ${formatted} de commission.`
        : `You just paid ${formatted} in commission.`,
    time: formatNotificationTime(lang),
  });
}

export function notifyCampaignCreated(lang: "en" | "fr", campaignName: string) {
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
  });
}

export function notifyCreatorSaved(lang: "en" | "fr", creatorName: string) {
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
  });
}

export function notifyOutreachSent(lang: "en" | "fr", creatorName: string) {
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
  });
}

export function notifyShopifyConnected(lang: "en" | "fr", storeName: string) {
  pushNotification({
    kind: "system",
    title: lang === "fr" ? "Shopify connecté" : "Shopify connected",
    body:
      lang === "fr"
        ? `Trackit reçoit maintenant les commandes de ${storeName}.`
        : `Trackit is now receiving orders from ${storeName}.`,
    time: formatNotificationTime(lang),
  });
}

export function notifyFundsAdded(lang: "en" | "fr", amount: number) {
  pushNotification({
    kind: "payout",
    title: lang === "fr" ? "Fonds ajoutés au solde" : "Funds added to balance",
    body:
      lang === "fr"
        ? `${formatCurrency(amount, lang)} ont été ajoutés à votre solde de paiement.`
        : `${formatCurrency(amount, lang)} was added to your payout balance.`,
    time: formatNotificationTime(lang),
  });
}

/** Welcome notification — once per user, ever (persisted in localStorage). */
export function notifyWelcomeIfNeeded(userId: string, lang: "en" | "fr"): boolean {
  if (hasWelcomeNotificationBeenSent(userId)) return false;
  markWelcomeNotificationSent(userId);
  pushNotification({
    kind: "system",
    title: lang === "fr" ? "Bienvenue sur Trackit" : "Welcome to Trackit",
    body: welcomeNotificationBody(lang),
    time: formatNotificationTime(lang),
  });
  return true;
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
