import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeCreatorHandleForEmail(value: string | null | undefined): string {
  return (value || "").trim().replace(/^@+/, "").toLowerCase();
}

/** Auth signup emails for creators linked to this brand (handle → email). */
export async function fetchLinkedCreatorEmailsByHandle(
  admin: SupabaseClient,
  brandId: string,
): Promise<Map<string, string>> {
  const { data: creators } = await admin
    .from("creators")
    .select("handle, linked_user_id")
    .eq("user_id", brandId)
    .not("linked_user_id", "is", null);

  const map = new Map<string, string>();
  if (!creators?.length) return map;

  const emailByUserId = new Map<string, string>();
  const userIds = [...new Set(creators.map((c) => c.linked_user_id).filter(Boolean))] as string[];

  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      const email = data?.user?.email?.trim();
      if (email) emailByUserId.set(uid, email);
    }),
  );

  for (const row of creators) {
    if (!row.linked_user_id || !row.handle) continue;
    const email = emailByUserId.get(row.linked_user_id);
    if (!email) continue;
    map.set(normalizeCreatorHandleForEmail(row.handle), email);
  }

  return map;
}

export async function accountEmailForLinkedUser(
  admin: SupabaseClient,
  linkedUserId: string | null | undefined,
): Promise<string | null> {
  const id = linkedUserId?.trim();
  if (!id) return null;
  const { data } = await admin.auth.admin.getUserById(id);
  return data?.user?.email?.trim() || null;
}

export function enrichSavedRowsWithAccountEmails<T extends { creator_username: string; snapshot?: unknown }>(
  rows: T[],
  emailByHandle: Map<string, string>,
): T[] {
  if (emailByHandle.size === 0) return rows;
  return rows.map((row) => {
    const email = emailByHandle.get(normalizeCreatorHandleForEmail(row.creator_username));
    if (!email) return row;
    const snap =
      row.snapshot && typeof row.snapshot === "object"
        ? { ...(row.snapshot as Record<string, unknown>) }
        : {};
    if (snap.accountEmail === email) return row;
    return { ...row, snapshot: { ...snap, accountEmail: email } };
  });
}
