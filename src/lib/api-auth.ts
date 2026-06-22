import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { DEV_BYPASS_PLAN, DEV_BYPASS_USER_ID } from "@/lib/dev-bypass";

// Resolve the current user id for workspace API routes. Honors the env-gated
// local dev bypass (never set in prod); otherwise reads the Supabase session
// from request cookies (same pattern as /api/creators).
export async function getAuthedUserId(request: NextRequest): Promise<string | null> {
  if (DEV_BYPASS_PLAN) return DEV_BYPASS_USER_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const supabase = createServerClient(url, anon, {
    cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
