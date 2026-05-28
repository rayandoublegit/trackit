import { getOrCreateSessionKey } from "@/lib/session-key";

/** Record login IP and register this browser as an active session. */
export async function recordLoginIp(): Promise<void> {
  try {
    const sessionKey = getOrCreateSessionKey();
    await fetch("/api/auth/record-login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(sessionKey ? { "X-Trackit-Session-Key": sessionKey } : {}),
      },
      body: JSON.stringify({
        sessionKey,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    });
  } catch {
    /* non-blocking */
  }
}
