import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { saveUserProfile } from "@/lib/profile-persist";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const fullName = typeof body?.full_name === "string" ? body.full_name : undefined;
  const avatarUrl = typeof body?.avatar_url === "string" ? body.avatar_url : body?.avatar_url === null ? null : undefined;
  const usernameRaw = typeof body?.username === "string" ? body.username : undefined;

  const result = await saveUserProfile(admin, userId, {
    full_name: fullName,
    avatar_url: avatarUrl,
    username: usernameRaw,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, profile: result.profile });
}
