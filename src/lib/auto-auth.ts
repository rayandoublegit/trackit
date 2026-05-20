import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthRedirectPath } from "@/lib/auth-destination";

/** If already signed in or restorable by IP, returns redirect path; otherwise null. */
export async function tryAutoAuth(
  supabase: SupabaseClient
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    return getAuthRedirectPath(supabase, session.user.id);
  }

  try {
    const res = await fetch("/api/auth/restore-session", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; redirectTo?: string };
    if (data.ok && data.redirectTo) return data.redirectTo;
  } catch {
    return null;
  }

  return null;
}

export async function recordLoginIp(): Promise<void> {
  try {
    await fetch("/api/auth/record-login", { method: "POST", credentials: "include" });
  } catch {
    /* non-blocking */
  }
}
