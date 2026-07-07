import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { syncCreatorRowsByProfileHandle } from "@/lib/creator-account";
import {
  isProfileUsernameConflictError,
  isValidProfileUsername,
  normalizeProfileUsername,
} from "@/lib/profile-username";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : undefined;
  const avatarUrl = typeof body?.avatar_url === "string" ? body.avatar_url : undefined;
  const usernameRaw = typeof body?.username === "string" ? body.username : undefined;

  const { data: existing } = await admin
    .from("profiles")
    .select("username, full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const update: Record<string, string> = {};

  if (fullName !== undefined) update.full_name = fullName;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;

  if (usernameRaw !== undefined) {
    const normalized = normalizeProfileUsername(usernameRaw);
    const current = normalizeProfileUsername(existing.username);
    if (normalized) {
      if (!isValidProfileUsername(normalized)) {
        return NextResponse.json({ error: "Invalid username" }, { status: 400 });
      }
      if (normalized !== current) {
        const { data: taken } = await admin
          .from("profiles")
          .select("id")
          .eq("username", normalized)
          .neq("id", userId)
          .maybeSingle();
        if (taken) return NextResponse.json({ error: "Username taken" }, { status: 409 });
      }
      update.username = normalized;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, profile: existing });
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select("full_name, username, avatar_url")
    .single();

  if (error) {
    const status = isProfileUsernameConflictError(error) ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await syncCreatorRowsByProfileHandle(admin, userId, updated);

  const creatorPatch: Record<string, string> = {};
  if (update.avatar_url) creatorPatch.avatar_url = update.avatar_url;
  if (update.full_name) creatorPatch.full_name = update.full_name;
  if (Object.keys(creatorPatch).length) {
    await admin.from("creators").update(creatorPatch).eq("linked_user_id", userId);
  }

  return NextResponse.json({ ok: true, profile: updated });
}
