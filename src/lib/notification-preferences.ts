/** Brand notification preference keys (settings toggles). */
export type NotificationPrefKey =
  | "outreach_reply"
  | "sale_tracked"
  | "commission_threshold"
  | "follow_up_reminder"
  | "weekly_report"
  | "team_joined";

export type NotificationChannel = "email" | "push";

export type NotificationPreferences = Record<
  NotificationChannel,
  Record<NotificationPrefKey, boolean>
>;

export const NOTIFICATION_PREF_LABELS: Record<NotificationPrefKey, string> = {
  outreach_reply: "New creator replied to outreach",
  sale_tracked: "Sale tracked from creator",
  commission_threshold: "Commission threshold reached",
  follow_up_reminder: "Follow up reminder",
  weekly_report: "Weekly performance report",
  team_joined: "New team member joined",
};

export const NOTIFICATION_PREF_KEYS = Object.keys(
  NOTIFICATION_PREF_LABELS
) as NotificationPrefKey[];

const DEFAULT_PREFS: NotificationPreferences = {
  email: {
    outreach_reply: true,
    sale_tracked: true,
    commission_threshold: false,
    follow_up_reminder: true,
    weekly_report: false,
    team_joined: false,
  },
  push: {
    outreach_reply: true,
    sale_tracked: true,
    commission_threshold: true,
    follow_up_reminder: true,
    weekly_report: false,
    team_joined: true,
  },
};

function storageKey(userId: string) {
  return `trackit_notif_prefs_${userId}`;
}

function mergePrefs(raw: unknown): NotificationPreferences {
  const base: NotificationPreferences = {
    email: { ...DEFAULT_PREFS.email },
    push: { ...DEFAULT_PREFS.push },
  };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<NotificationPreferences>;
  for (const channel of ["email", "push"] as const) {
    const channelPrefs = obj[channel];
    if (!channelPrefs || typeof channelPrefs !== "object") continue;
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof channelPrefs[key] === "boolean") {
        base[channel][key] = channelPrefs[key];
      }
    }
  }
  return base;
}

export function loadNotificationPreferences(userId: string | null | undefined): NotificationPreferences {
  if (typeof window === "undefined" || !userId) return mergePrefs(null);
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return mergePrefs(null);
    return mergePrefs(JSON.parse(raw));
  } catch {
    return mergePrefs(null);
  }
}

export function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences
): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function isNotificationEnabled(
  userId: string | null | undefined,
  key: NotificationPrefKey,
  channel: NotificationChannel = "push"
): boolean {
  if (!userId) return true;
  const prefs = loadNotificationPreferences(userId);
  return Boolean(prefs[channel][key]);
}

export function labelToNotificationPrefKey(label: string): NotificationPrefKey | null {
  const entry = (Object.entries(NOTIFICATION_PREF_LABELS) as [NotificationPrefKey, string][]).find(
    ([, value]) => value === label
  );
  return entry?.[0] ?? null;
}
