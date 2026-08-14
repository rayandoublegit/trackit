import type { SupabaseClient } from "@supabase/supabase-js";

/** True when Postgres/PostgREST reports a missing `workspace_id` column. */
export function isMissingWorkspaceIdError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return (error.message || "").includes("workspace_id");
  const msg = (error.message || "").toLowerCase();
  return msg.includes("workspace_id") && msg.includes("does not exist");
}

let workspaceIdReady: boolean | null = null;

/**
 * Cached probe: brand tables have `workspace_id` after the brand-workspaces migration.
 * Until then, all brand queries must scope by `user_id` only.
 */
export async function brandTablesHaveWorkspaceId(
  admin: SupabaseClient,
): Promise<boolean> {
  if (workspaceIdReady != null) return workspaceIdReady;
  const { error } = await admin.from("discovery_folders").select("workspace_id").limit(1);
  if (!error) {
    workspaceIdReady = true;
    return true;
  }
  if (isMissingWorkspaceIdError(error)) {
    workspaceIdReady = false;
    return false;
  }
  // Other errors (RLS, network): assume not ready so we don't 500 on every call.
  workspaceIdReady = false;
  return false;
}

export function stripWorkspaceId<T extends Record<string, unknown>>(row: T): Omit<T, "workspace_id"> {
  const next = { ...row };
  delete (next as { workspace_id?: unknown }).workspace_id;
  return next;
}

/**
 * Workspace to attach server-side writes to when the request has no
 * brand-space header: the owner's active workspace, else their default
 * workspace (same id as the owner), else null (pre-migration DB).
 */
export async function resolveOwnerActiveWorkspaceId(
  admin: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  if (!ownerId) return null;
  if (!(await brandTablesHaveWorkspaceId(admin))) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_id")
    .eq("id", ownerId)
    .maybeSingle();

  const activeId = (profile?.active_workspace_id as string | null) || null;
  if (activeId) {
    const { data: ws } = await admin
      .from("workspaces")
      .select("id")
      .eq("id", activeId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (ws?.id) return String(ws.id);
  }

  const { data: fallback } = await admin
    .from("workspaces")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle();
  return fallback?.id ? String(fallback.id) : null;
}
