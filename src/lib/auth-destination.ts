import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthRedirectPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (!data || data.onboarding_completed === false) {
    return "/onboarding";
  }
  return "/dashboard";
}
