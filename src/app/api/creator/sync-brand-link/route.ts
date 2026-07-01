import { NextResponse } from "next/server";
import { listCreatorBrandMemberships, syncCreatorRowsByProfileHandle } from "@/lib/creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Re-synchronise le lien créateur ↔ marque via le pseudo du profil (onboarding). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = (body?.userId as string | undefined)?.trim();
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  await syncCreatorRowsByProfileHandle(admin, userId);
  const { profile, brands } = await listCreatorBrandMemberships(admin, userId);

  return NextResponse.json({
    ok: true,
    username: profile?.username ?? null,
    brands,
  });
}
