import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { listCreatorBrandMemberships } from "@/lib/creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Marques auxquelles le créateur est rattaché (via invitation / pseudo). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { profile, brands } = await listCreatorBrandMemberships(admin, userId);

  return NextResponse.json({
    ok: true,
    username: profile?.username ?? null,
    brands,
  });
}
