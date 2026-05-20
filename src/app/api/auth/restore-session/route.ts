import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { getAuthRedirectPath } from "@/lib/auth-destination";
import { getClientIp } from "@/lib/get-client-ip";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  let body: { ok: boolean; redirectTo?: string } = { ok: false };
  let status = 401;

  if (existingUser) {
    body = { ok: true, redirectTo: await getAuthRedirectPath(supabase, existingUser.id) };
    status = 200;
  } else {
    const ip = getClientIp(request);
    if (ip) {
      const { data: profiles, error: profileErr } = await admin
        .from("profiles")
        .select("id")
        .eq("last_login_ip", ip);

      if (!profileErr && profiles?.length === 1) {
        const profileId = profiles[0].id;
        const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(profileId);
        const email = authUser?.user?.email;

        if (!userErr && email) {
          const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
          });

          const tokenHash = linkData?.properties?.hashed_token;
          if (!linkErr && tokenHash) {
            const { error: verifyErr } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: "email",
            });

            if (!verifyErr) {
              await admin.from("profiles").update({ last_login_ip: ip }).eq("id", profileId);
              body = { ok: true, redirectTo: await getAuthRedirectPath(supabase, profileId) };
              status = 200;
            }
          }
        }
      }
    }
  }

  const response = NextResponse.json(body, { status });
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
