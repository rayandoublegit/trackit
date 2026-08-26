import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_BYPASS_PLAN, DEV_BYPASS_USER_ID } from "@/lib/dev-bypass";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

type RequestLike = NextRequest | Request;

async function readRequestCookies(request?: RequestLike) {
  // Prefer next/headers — request.cookies can miss chunked auth cookies in some
  // App Router edge cases. Merge both so neither source alone is a blind spot.
  const fromHeaders = (await cookies()).getAll();
  const fromRequest =
    request && "cookies" in request && typeof request.cookies?.getAll === "function"
      ? request.cookies.getAll()
      : [];
  if (!fromRequest.length) return fromHeaders;
  if (!fromHeaders.length) return fromRequest;
  const byName = new Map<string, { name: string; value: string }>();
  for (const c of fromRequest) byName.set(c.name, c);
  for (const c of fromHeaders) byName.set(c.name, c);
  return Array.from(byName.values());
}

async function getAuthedSupabaseUser(request?: RequestLike) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieList = await readRequestCookies(request);
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieList;
      },
      setAll() {},
    },
  });
  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();
  if (cookieUser) return cookieUser;

  // Bearer fallback when the browser has a session but cookies weren't forwarded.
  const auth = request?.headers?.get("authorization")?.trim() || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const {
    data: { user },
  } = await createClient(url, anon).auth.getUser(token);
  return user;
}

/** Authenticated actor id (never remapped to a delegated workspace owner). */
export async function getAuthedActorId(request?: RequestLike): Promise<string | null> {
  if (DEV_BYPASS_PLAN) return DEV_BYPASS_USER_ID;
  const user = await getAuthedSupabaseUser(request);
  return user?.id ?? null;
}

// Resolve the current workspace owner id for API routes. Honors the env-gated
// local dev bypass (never set in prod); otherwise reads the Supabase session
// from request cookies and maps delegated admins to the principal workspace.
export async function getAuthedUserId(request?: RequestLike): Promise<string | null> {
  if (DEV_BYPASS_PLAN) return DEV_BYPASS_USER_ID;
  const user = await getAuthedSupabaseUser(request);
  if (!user) return null;
  try {
    return (await resolveWorkspaceContextForUser(user)).ownerId;
  } catch {
    return null;
  }
}

/** Rejects unauthenticated callers and cross-workspace userId/brandId spoofing. */
export async function requireWorkspaceAccess(
  request: RequestLike | undefined,
  requestedWorkspaceId?: string | null,
): Promise<{ workspaceId: string } | { error: NextResponse }> {
  const workspaceId = await getAuthedUserId(request);
  if (!workspaceId) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const requested = requestedWorkspaceId?.trim() || "";
  if (requested && requested !== workspaceId) {
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { workspaceId };
}

/** Rejects unauthenticated callers and actor userId spoofing (creator-facing routes). */
export async function requireActorAccess(
  request: RequestLike | undefined,
  requestedUserId?: string | null,
): Promise<{ actorId: string } | { error: NextResponse }> {
  const actorId = await getAuthedActorId(request);
  if (!actorId) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const requested = requestedUserId?.trim() || "";
  if (requested && requested !== actorId) {
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { actorId };
}
