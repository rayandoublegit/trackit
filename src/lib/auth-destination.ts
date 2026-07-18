import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HAYTAM_WORKSPACE_ADMIN_EMAIL,
  normalizeWorkspaceEmail,
} from "@/lib/workspace-presets";

export async function getAuthRedirectPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (normalizeWorkspaceEmail(user?.email) === HAYTAM_WORKSPACE_ADMIN_EMAIL) {
    return "/dashboard";
  }

  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed, account_type")
    .eq("id", userId)
    .maybeSingle();

  // Les créateurs invités ont leur propre espace, jamais l'onboarding marque.
  if (data && data.account_type === "creator") {
    return "/dashboard?view=analytics";
  }
  if (!data || data.onboarding_completed === false) {
    return "/onboarding";
  }
  return "/dashboard";
}
