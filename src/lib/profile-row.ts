import type { SupabaseClient } from "@supabase/supabase-js";

export function missingProfileColumn(message: string | undefined): string | null {
  const match = message?.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
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
