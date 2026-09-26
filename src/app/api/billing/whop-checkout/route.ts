import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { saveOnboardingProfileAdmin, type OnboardingSavePayload } from "@/lib/onboarding-save";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";
import { createWhopCheckout, whopConfigured } from "@/lib/whop";

export const dynamic = "force-dynamic";

const TIERS = new Set(["basic", "pro", "scale"]);

export async function POST(request: NextRequest) {
  if (!whopConfigured()) {
    return NextResponse.json({ error: "Whop is not configured", fallback: true }, { status: 503 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    tier?: string;
    annual?: boolean;
    currency?: string;
    onboarding?: OnboardingSavePayload;
  };

  const tier = (body.tier ?? "").toLowerCase();
  if (!TIERS.has(tier)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (body.onboarding) {
    if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    const saved = await saveOnboardingProfileAdmin(admin, user.id, user.email, body.onboarding, {
      markComplete: false,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  const workspace = await resolveWorkspaceContextForUser(user);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://partnerads.vercel.app").replace(/\/$/, "");
  const currency = body.currency === "eur" ? "eur" : "usd";

  try {
    const url = await createWhopCheckout({
      tier: tier as "basic" | "pro" | "scale",
      annual: Boolean(body.annual),
      currency,
      userId: workspace.ownerId,
      email: workspace.ownerEmail ?? user.email,
      redirectUrl: `${appUrl}/dashboard?view=billing&upgraded=true`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start checkout";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
