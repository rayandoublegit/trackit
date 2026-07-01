/** Normalise niche label for dedup and admin analytics. */
export function normalizeNicheRequest(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export type SubmitNicheRequestResult = { ok: true } | { ok: false; error: string };

/**
 * Log a niche the brand wants added to Trackit (table: niche_requests).
 * Same pattern as creator_lookup_requests — client insert with RLS.
 */
export async function submitNicheRequest(
  rawNiche: string,
  productContext?: string,
): Promise<SubmitNicheRequestResult> {
  const trimmed = rawNiche.trim();
  const normalized = normalizeNicheRequest(trimmed);
  if (normalized.length < 2) {
    return { ok: false, error: "Niche too short" };
  }

  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return { ok: false, error: "Database unavailable" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const context = productContext?.trim().slice(0, 200) || null;

  const { error } = await supabase.from("niche_requests").insert({
    user_id: user.id,
    niche: trimmed,
    normalized_niche: normalized,
    product_context: context,
  });

  if (error) {
    console.warn("[niche_requests]", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
