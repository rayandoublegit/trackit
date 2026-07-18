import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_BYPASS_PLAN, DEV_BYPASS_USER_ID } from "@/lib/dev-bypass";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";

type RequestLike = NextRequest | Request;

async function readRequestCookies(request?: RequestLike) {
  if (request && "cookies" in request && typeof request.cookies?.getAll === "function") {
    return request.cookies.getAll();
  }
  return (await cookies()).getAll();
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
    data: { user },
  } = await supabase.auth.getUser();
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
