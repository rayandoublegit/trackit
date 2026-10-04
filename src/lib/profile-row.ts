import type { SupabaseClient } from "@supabase/supabase-js";

export function missingProfileColumn(message: string | undefined): string | null {
  if (!message) return null;
  const schema = message.match(/Could not find the '([^']+)' column/);
  if (schema) return schema[1];
  const postgres = message.match(/column (?:[\w]+\.)?"?([a-z0-9_]+)"? does not exist/i);
  return postgres?.[1] ?? null;
}

/** Read a profile even when production is missing columns the app expects. */
export async function selectProfileRow<T extends Record<string, unknown>>(
  client: SupabaseClient,
  userId: string,
  columns: string[]
): Promise<T | null> {
  const wanted = [...columns];
  for (let attempt = 0; attempt <= columns.length; attempt += 1) {
    if (wanted.length === 0) return null;
    const { data, error } = await client
      .from("profiles")
      .select(wanted.join(","))
      .eq("id", userId)
      .maybeSingle();
    if (!error) return (data as T | null) ?? null;
    const column = missingProfileColumn(error.message);
    const index = column ? wanted.indexOf(column) : -1;
    if (index < 0) return null;
    wanted.splice(index, 1);
  }
  return null;
}

const PROFILE_PAGE = 1000; // PostgREST caps a single response at 1000 rows.

/**
 * List every profile, page by page, dropping columns the live table does not
 * have yet. Without paging, PostgREST silently stops at the first 1000 rows.
 */
export async function listProfileRows<T extends Record<string, unknown>>(
  client: SupabaseClient,
  columns: string[],
  maxRows = 50_000
): Promise<{ rows: T[]; error: string | null }> {
  const wanted = [...columns];
  const rows: T[] = [];
  let from = 0;
  for (let attempt = 0; attempt <= columns.length; ) {
    if (wanted.length === 0) return { rows: [], error: "No profile columns available" };
    let query = client
      .from("profiles")
      .select(wanted.join(","))
      .range(from, Math.min(from + PROFILE_PAGE, maxRows) - 1);
    if (wanted.includes("created_at")) query = query.order("created_at", { ascending: false });
    query = query.order("id", { ascending: true });
    const { data, error } = await query;
    if (error) {
      const column = missingProfileColumn(error.message);
      const index = column ? wanted.indexOf(column) : -1;
      if (index < 0) return { rows: [], error: error.message };
      wanted.splice(index, 1);
      rows.length = 0;
      from = 0;
      attempt += 1;
      continue;
    }
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    from += PROFILE_PAGE;
    if (batch.length < PROFILE_PAGE || from >= maxRows) return { rows, error: null };
  }
  return { rows: [], error: "Could not read profiles" };
}

async function writeProfile(
  client: SupabaseClient,
  payload: Record<string, unknown>,
  write: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const values = { ...payload };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { error } = await write(values);
    if (!error) return { ok: true };
    const column = missingProfileColumn(error.message);
    if (!column || !(column in values)) return { ok: false, error: error.message };
    delete values[column];
    if (Object.keys(values).length === 0) return { ok: true };
  }
  return { ok: false, error: "Could not save profile" };
}

export function upsertProfileRow(
  client: SupabaseClient,
  values: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  return writeProfile(client, values, (payload) =>
    client.from("profiles").upsert(payload, { onConflict: "id" })
  );
}

export function updateProfileRow(
  client: SupabaseClient,
  userId: string,
  values: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  return writeProfile(client, values, (payload) => client.from("profiles").update(payload).eq("id", userId));
}
