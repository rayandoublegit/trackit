import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

  const requiresAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/analyze") ||
    pathname.startsWith("/verdict") ||
    pathname === "/pricing" ||
    pathname.startsWith("/pricing/");

  // Unauthenticated users → /auth only (no redirect to /pricing; homepage signs out unpaid sessions)
  if (requiresAuth && !user) {
    const redirectTo = new URL("/auth", request.url);
    redirectTo.searchParams.set(
      "redirectTo",
      pathname + request.nextUrl.search
    );
    return NextResponse.redirect(redirectTo);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/analyze",
    "/analyze/:path*",
    "/verdict/:path*",
    "/pricing",
    "/pricing/:path*",
  ],
};
