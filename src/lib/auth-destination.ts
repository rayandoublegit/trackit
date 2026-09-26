import type { SupabaseClient } from "@supabase/supabase-js";
import { selectProfileRow } from "@/lib/profile-row";
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

  const data = await selectProfileRow<{ onboarding_completed?: boolean | null; account_type?: string | null }>(
    supabase,
    userId,
    ["onboarding_completed", "account_type"]
  );

  if (data && data.account_type === "creator") {
    return "/dashboard?view=analytics";
  }
  const finished = data?.onboarding_completed === true || user?.user_metadata?.onboarding_completed === true;
  if (!finished) {
    return "/onboarding";
  }
  return "/dashboard";
}
