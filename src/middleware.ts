import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";

export async function middleware(request: NextRequest) {
  // Local preview bypass (env-gated via NEXT_PUBLIC_DEV_BYPASS_PLAN, never set in prod).
  if (DEV_BYPASS_PLAN) return NextResponse.next();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fr = request.nextUrl.pathname === "/fr" || request.nextUrl.pathname.startsWith("/fr/");
  const pathname = fr ? request.nextUrl.pathname.slice(3) || "/" : request.nextUrl.pathname;
  const home = (path: string) => new URL(fr ? `/fr${path}` : path, request.url);

  const requiresAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/onboarding");

  if (requiresAuth && !user) {
    return NextResponse.redirect(home("/auth"));
  }

  if (user && pathname === "/auth") {
    return NextResponse.redirect(home("/dashboard"));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/onboarding",
    "/auth",
    "/fr/dashboard/:path*",
    "/fr/settings/:path*",
    "/fr/onboarding",
    "/fr/auth",
  ],
};
