import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export type UserSessionRow = {
  id: string;
  sessionKey: string;
  device: string;
  location: string;
  lastActiveAt: string;
  isCurrent: boolean;
};

async function getAuthedClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { supabase, user, session };
}

export async function GET(request: NextRequest) {
  const authed = await getAuthedClient(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user } = authed;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const currentSessionKey =
    request.headers.get("x-trackit-session-key") ?? "";

  const { data, error } = await admin
    .from("user_sessions")
    .select("id, session_key, device_label, location_label, ip_address, last_active_at")
    .eq("user_id", user.id)
    .order("last_active_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions: UserSessionRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    sessionKey: row.session_key as string,
    device: (row.device_label as string) || "Unknown device",
    location:
      (row.location_label as string) ||
      (row.ip_address as string) ||
      "—",
    lastActiveAt: row.last_active_at as string,
    isCurrent: currentSessionKey
      ? row.session_key === currentSessionKey
      : false,
  }));

  return NextResponse.json({ sessions });
}

export async function DELETE(request: NextRequest) {
  const authed = await getAuthedClient(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, session } = authed;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sessionKey?: string;
    revokeOthers?: boolean;
  };

  const currentSessionKey =
    request.headers.get("x-trackit-session-key") ?? "";

  if (body.revokeOthers) {
    await admin
      .from("user_sessions")
      .delete()
      .eq("user_id", user.id)
      .neq("session_key", currentSessionKey);

    if (session?.access_token) {
      try {
        await admin.auth.admin.signOut(session.access_token, "others");
      } catch (e) {
        console.warn("admin.signOut others:", e);
      }
    }

    return NextResponse.json({ ok: true });
  }

  const targetKey = body.sessionKey;
  if (!targetKey) {
    return NextResponse.json({ error: "Missing sessionKey" }, { status: 400 });
  }

  await admin
    .from("user_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("session_key", targetKey);

  if (targetKey === currentSessionKey) {
    return NextResponse.json({ ok: true, signOut: true });
  }

  return NextResponse.json({ ok: true });
}
