import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function getAuthedUser(request: NextRequest) {
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
  return user;
}

export async function GET(request: NextRequest) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: payouts, error } = await admin
    .from("payouts")
    .select("id, creator_id, amount, status, stripe_transfer_id, paid_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "paid")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("GET /api/payouts/history error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = payouts ?? [];
  const creatorIds = [...new Set(rows.map((p) => p.creator_id).filter(Boolean))];

  let creatorMap: Record<
    string,
    { handle?: string; full_name?: string; avatar_url?: string; platform?: string }
  > = {};

  if (creatorIds.length > 0) {
    const { data: creators } = await admin
      .from("creators")
      .select("id, handle, full_name, avatar_url, platform")
      .in("id", creatorIds);

    creatorMap = Object.fromEntries((creators ?? []).map((c) => [c.id, c]));
  }

  const history = rows.map((row) => ({
    ...row,
    creator: row.creator_id ? creatorMap[row.creator_id] ?? null : null,
  }));

  return NextResponse.json({ payouts: history });
}
