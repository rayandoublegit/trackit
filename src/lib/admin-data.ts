import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "@/lib/admin-auth";

// Server-only reads for the staff console. A missing table or a failed query is
// reported as such (null / error), never turned into a zero.

type PgError = { message?: string; code?: string } | null | undefined;

export function isMissingRelation(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|could not find the table|schema cache/i.test(error.message ?? "");
}

export type RowsResult<T> = { rows: T[]; error: string | null; missing: boolean; truncated: boolean };

/**
 * Reads up to `maxRows` rows page by page (PostgREST caps a page at 1000).
 * `since` keeps only rows whose column is on or after the ISO date.
 */
export async function fetchRows<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  opts: { since?: { column: string; iso: string }; maxRows?: number; orderBy?: string } = {},
): Promise<RowsResult<T>> {
  const maxRows = opts.maxRows ?? 20_000;
  const page = 1000;
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += page) {
    let query = db.from(table).select(columns).range(from, Math.min(from + page, maxRows) - 1);
    if (opts.since) query = query.gte(opts.since.column, opts.since.iso);
    if (opts.orderBy) query = query.order(opts.orderBy, { ascending: false });
    const { data, error } = await query;
    if (error) return { rows, error: error.message, missing: isMissingRelation(error), truncated: false };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < page) return { rows, error: null, missing: false, truncated: false };
  }
  return { rows, error: null, missing: false, truncated: true };
}

export type CountResult = { count: number | null; missing: boolean; error: string | null };

type AnyQuery = any;

export async function countRows(
  db: SupabaseClient,
  table: string,
  filter?: (query: AnyQuery) => AnyQuery,
): Promise<CountResult> {
  let query: AnyQuery = db.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) return { count: null, missing: isMissingRelation(error), error: error.message };
  return { count: count ?? 0, missing: false, error: null };
}

export function isoDaysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// ── Audit log ────────────────────────────────────────────────────────────────

export type AuditEntry = {
  id: string;
  actor_email: string;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Records a staff action. Never blocks the action itself: if the table is not
 * migrated yet the entry is only written to the server log.
 */
export async function logAdminAction(
  db: SupabaseClient,
  admin: AdminContext,
  entry: { action: string; targetUserId?: string | null; targetEmail?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  const row = {
    actor_id: admin.userId,
    actor_email: admin.email,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    details: entry.details ?? null,
  };
  try {
    const { error } = await db.from("admin_audit_log").insert(row);
    if (error) console.warn("admin audit (not stored):", entry.action, error.message);
  } catch (err) {
    console.warn("admin audit (not stored):", entry.action, err instanceof Error ? err.message : err);
  }
}

export async function listAdminAudit(
  db: SupabaseClient,
  limit = 100,
): Promise<{ entries: AuditEntry[]; missing: boolean; error: string | null }> {
  const { data, error } = await db
    .from("admin_audit_log")
    .select("id, actor_email, action, target_user_id, target_email, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { entries: [], missing: isMissingRelation(error), error: error.message };
  return { entries: (data ?? []) as AuditEntry[], missing: false, error: null };
}
