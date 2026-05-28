const STORAGE_KEY = "trackit_session_key";

/** Stable per-browser session id for active-session tracking. */
export function getOrCreateSessionKey(): string {
  if (typeof window === "undefined") return "";
  let key = sessionStorage.getItem(STORAGE_KEY);
  if (!key) {
    key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

export function getSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}
