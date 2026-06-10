export type StoredOutreachEntry = {
  id: string;
  user_id: string;
  creator_username: string;
  creator_display_name: string;
  creator_avatar: string;
  platform: string;
  message: string;
  status: string;
  follow_up_date: string | null;
  created_at: string;
};

function storageKey(userId: string) {
  return `trackit_outreach_history_${userId}`;
}

function newEntryId() {
  return `oh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function loadStoredOutreachHistory(userId: string): StoredOutreachEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredOutreachEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredOutreachEntry).id === "string" &&
        typeof (item as StoredOutreachEntry).message === "string" &&
        typeof (item as StoredOutreachEntry).created_at === "string"
    );
  } catch {
    return [];
  }
}

function saveStoredOutreachHistory(userId: string, entries: StoredOutreachEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}

export function appendStoredOutreachEntry(
  userId: string,
  entry: Omit<StoredOutreachEntry, "id" | "user_id" | "created_at"> & { id?: string; created_at?: string }
): StoredOutreachEntry {
  const row: StoredOutreachEntry = {
    id: entry.id ?? newEntryId(),
    user_id: userId,
    creator_username: entry.creator_username,
    creator_display_name: entry.creator_display_name,
    creator_avatar: entry.creator_avatar,
    platform: entry.platform,
    message: entry.message,
    status: entry.status,
    follow_up_date: entry.follow_up_date,
    created_at: entry.created_at ?? new Date().toISOString(),
  };
  const list = loadStoredOutreachHistory(userId);
  saveStoredOutreachHistory(userId, [row, ...list]);
  return row;
}

export function updateStoredOutreachEntry(
  userId: string,
  id: string,
  patch: Partial<Pick<StoredOutreachEntry, "status" | "follow_up_date">>
) {
  const list = loadStoredOutreachHistory(userId);
  saveStoredOutreachHistory(
    userId,
    list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
  );
}

export function clearStoredOutreachHistory(userId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable */
  }
}
