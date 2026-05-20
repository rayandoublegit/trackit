import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAuthRedirectPath } from "@/lib/auth-destination";
import { getClientIp } from "@/lib/get-client-ip";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  let response = NextResponse.redirect(new URL("/dashboard", request.url));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const ip = getClientIp(request);
    const admin = getSupabaseAdmin();
    if (ip && admin) {
      await admin.from("profiles").update({ last_login_ip: ip }).eq("id", user.id);
    }
    const path = await getAuthRedirectPath(supabase, user.id);
    response = NextResponse.redirect(new URL(path, request.url));
  }

  return response;
}
