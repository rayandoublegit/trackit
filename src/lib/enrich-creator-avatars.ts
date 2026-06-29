import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAvatarByHandleFromSavedRows,
  mergeCreatorAvatarUrl,
  normalizeCreatorHandle,
  pickBestCreatorAvatar,
} from "@/lib/creator-avatar";

type CreatorWithHandle = {
  handle?: string | null;
  avatar_url?: string | null;
};

export async function loadAvatarByHandleForUser(
  admin: SupabaseClient,
  userId: string
): Promise<Record<string, string>> {
  const { data: savedRows } = await admin
    .from("discovery_saved")
    .select("creator_username, avatar_url, snapshot")
    .eq("user_id", userId);

  const map = buildAvatarByHandleFromSavedRows(savedRows ?? []);

  const { data: indexRows } = await admin
    .from("creators_index")
    .select("username, avatar_url");

  for (const row of indexRows ?? []) {
    const handle = normalizeCreatorHandle(row.username);
    const url = pickBestCreatorAvatar(row.avatar_url, map[handle]);
    if (handle && url) map[handle] = url;
  }

  return map;
}

export function enrichCreatorsWithAvatars<T extends CreatorWithHandle>(
  creators: T[],
  avatarByHandle: Record<string, string>
): Array<T & { avatar_url: string | null }> {
  return creators.map((creator) => {
    const merged = mergeCreatorAvatarUrl(creator.handle, creator.avatar_url, avatarByHandle);
    return {
      ...creator,
      avatar_url: merged || creator.avatar_url || null,
    };
  });
}

export async function enrichCreatorsForUser<T extends CreatorWithHandle>(
  admin: SupabaseClient,
  userId: string,
  creators: T[]
): Promise<Array<T & { avatar_url: string | null }>> {
  const avatarByHandle = await loadAvatarByHandleForUser(admin, userId);
  return enrichCreatorsWithAvatars(creators, avatarByHandle);
}

export async function enrichCreatorsWithSavedAvatarsClient<T extends CreatorWithHandle>(
  client: SupabaseClient,
  userId: string,
  creators: T[]
): Promise<Array<T & { avatar_url: string | null }>> {
  const { data: savedRows } = await client
    .from("discovery_saved")
    .select("creator_username, avatar_url, snapshot")
    .eq("user_id", userId);

  const avatarByHandle = buildAvatarByHandleFromSavedRows(savedRows ?? []);
  return enrichCreatorsWithAvatars(creators, avatarByHandle);
}
