import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { whopMembershipId } from "@/lib/comp-plan";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";
import { whopMembershipManageUrl } from "@/lib/whop";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const workspace = await resolveWorkspaceContextForUser(user);
  const { data: profile } = await admin
    .from("profiles")
    .select("subscription_status")
    .eq("id", workspace.ownerId)
    .maybeSingle();

  const membershipId = whopMembershipId(profile?.subscription_status);
  if (!membershipId) return NextResponse.json({ error: "No Whop membership" }, { status: 404 });

  try {
    const url = await whopMembershipManageUrl(membershipId);
    if (!url) return NextResponse.json({ error: "Whop did not return a manage link" }, { status: 502 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open Whop billing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
