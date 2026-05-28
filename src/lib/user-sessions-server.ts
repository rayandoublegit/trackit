import { parseUserAgent } from "@/lib/parse-user-agent";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function resolveLocationLabel(ip: string): Promise<string> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::")) return "Local network";
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`,
      { next: { revalidate: 86400 } }
    );
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      country?: string;
    };
    if (data.status === "success" && data.city && data.country) {
      return `${data.city}, ${data.country}`;
    }
  } catch {
    /* fallback */
  }
  return ip;
}

export async function upsertUserSession(
  userId: string,
  sessionKey: string,
  userAgent: string | null,
  ip: string | null
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !sessionKey) return;

  const locationLabel = ip ? await resolveLocationLabel(ip) : null;

  await admin.from("user_sessions").upsert(
    {
      user_id: userId,
      session_key: sessionKey,
      device_label: parseUserAgent(userAgent),
      user_agent: userAgent,
      ip_address: ip,
      location_label: locationLabel,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "user_id,session_key" }
  );
}
