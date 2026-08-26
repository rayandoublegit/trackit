import type { SupabaseClient } from "@supabase/supabase-js";
import { CREATOR_ROW_SYNC_SELECT, syncCreatorRowsByProfileHandle } from "@/lib/creator-account";
import {
  syncCreatorToDiscoverySaved,
  type BrandCreatorSyncRow,
} from "@/lib/creator-discovery-sync";
import {
  isProfileUsernameConflictError,
  isValidProfileUsername,
  normalizeProfileUsername,
} from "@/lib/profile-username";
import { toPersistableAvatarUrl } from "@/lib/resolve-avatar-url";
import { isWorkspaceMarkPath, avatarStoragePath } from "@/lib/workspace-avatar";

export type ProfileSaveInput = {
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
};

export type SavedProfile = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

/** Rename creator handle everywhere it is stored as a username key. */
export async function propagateCreatorHandleRename(
  supabase: SupabaseClient,
  userId: string,
  oldHandle: string,
  newHandle: string,
): Promise<void> {
  const oldH = normalizeProfileUsername(oldHandle);
  const newH = normalizeProfileUsername(newHandle);
  if (!oldH || !newH || oldH === newH) return;

  await supabase.from("creators").update({ handle: newH }).eq("linked_user_id", userId);

  const tables = [
    "discovery_saved",
    "discovery_folder_items",
    "affiliate_links",
    "outreach_history",
  ] as const;

  for (const table of tables) {
    await supabase.from(table).update({ creator_username: newH }).ilike("creator_username", oldH);
  }
}

export async function saveUserProfile(
  admin: SupabaseClient,
  userId: string,
  input: ProfileSaveInput,
): Promise<{ profile: SavedProfile; previousUsername: string | null } | { error: string; status: number }> {
  const { data: existing } = await admin
    .from("profiles")
    .select("username, full_name, avatar_url, account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) return { error: "Profile not found", status: 404 };

  const previousUsername = normalizeProfileUsername(existing.username) || null;
  const update: Record<string, string | null> = {};

  if (input.full_name !== undefined) update.full_name = input.full_name.trim();
  if (input.avatar_url === null) {
    update.avatar_url = null;
  } else if (typeof input.avatar_url === "string") {
    if (isWorkspaceMarkPath(avatarStoragePath(input.avatar_url))) {
      // Workspace marks are stored separately — never write them onto the account.
    } else {
      update.avatar_url =
        toPersistableAvatarUrl(admin, userId, input.avatar_url) ??
        input.avatar_url.split("?")[0] ??
        input.avatar_url;
    }
  }

  if (input.username !== undefined) {
    const normalized = normalizeProfileUsername(input.username);
    if (normalized) {
      if (!isValidProfileUsername(normalized)) {
        return { error: "Invalid username", status: 400 };
      }
      if (normalized !== previousUsername) {
        const { data: taken } = await admin
          .from("profiles")
          .select("id")
          .eq("username", normalized)
          .neq("id", userId)
          .maybeSingle();
        if (taken) return { error: "Username taken", status: 409 };
      }
      update.username = normalized;
    }
  }

  if (Object.keys(update).length === 0) {
    return {
      profile: {
        full_name: existing.full_name,
        username: existing.username,
        avatar_url: existing.avatar_url,
      },
      previousUsername,
    };
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select("full_name, username, avatar_url, account_type")
    .single();

  if (error) {
    const status = isProfileUsernameConflictError(error) ? 409 : 500;
    return { error: error.message, status };
  }

  const newUsername = normalizeProfileUsername(updated.username) || null;
  if (previousUsername && newUsername && previousUsername !== newUsername) {
    await propagateCreatorHandleRename(admin, userId, previousUsername, newUsername);
  }

  if (updated.account_type === "creator") {
    await syncCreatorRowsByProfileHandle(admin, userId, updated);
  }

  const creatorPatch: Record<string, string | null> = {};
  if (typeof update.avatar_url === "string" && update.avatar_url) {
    creatorPatch.avatar_url = update.avatar_url;
  }
  if (typeof update.full_name === "string") {
    creatorPatch.full_name = update.full_name;
  }
  if (newUsername) creatorPatch.handle = newUsername;
  if (Object.keys(creatorPatch).length) {
    await admin.from("creators").update(creatorPatch).eq("linked_user_id", userId);
  }

  // Keep brand CRM (discovery_saved) in sync with profile name / handle / avatar.
  if (updated.account_type === "creator") {
    const { data: linkedCreators } = await admin
      .from("creators")
      .select(`${CREATOR_ROW_SYNC_SELECT}, user_id`)
      .eq("linked_user_id", userId);
    for (const row of linkedCreators ?? []) {
      const brandId = typeof row.user_id === "string" ? row.user_id : "";
      if (!brandId) continue;
      await syncCreatorToDiscoverySaved(admin, brandId, row as BrandCreatorSyncRow);
    }
  }

  return {
    profile: {
      full_name: updated.full_name,
      username: updated.username,
      avatar_url: updated.avatar_url,
    },
    previousUsername,
  };
}
