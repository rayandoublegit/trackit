/** Normalise @handle / email fragment for dedup and analytics. */
export function normalizeCreatorLookupQuery(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/**
 * Log a creator search that returned no results (table: creator_lookup_requests).
 * Wired to Supabase — used to track handles to add to creators_index.
 */
export async function logCreatorLookupRequest(rawQuery: string): Promise<void> {
  const trimmed = rawQuery.trim();
  const normalized = normalizeCreatorLookupQuery(trimmed);
  if (normalized.length < 2) return;

  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("creator_lookup_requests").insert({
    user_id: user.id,
    query: trimmed,
    normalized_query: normalized,
  });

  if (error) {
    console.warn("[creator_lookup_requests]", error.message);
  }
}
