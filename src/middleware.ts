import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require a session — unauthenticated users are sent to /auth */
export const protectedRouteMatcher = [
  "/analyze",
  "/analyze/:path*",
  "/dashboard",
  "/dashboard/:path*",
];

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const redirectTo = new URL("/auth", request.url);
  redirectTo.searchParams.set(
    "redirectTo",
    request.nextUrl.pathname + request.nextUrl.search
  );

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

  if (!user) {
    response = NextResponse.redirect(redirectTo);
  }

  return response;
}

export const config = {
  matcher: protectedRouteMatcher,
};

