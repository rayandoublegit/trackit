import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { listCreatorBrandMemberships, syncCreatorRowsByProfileHandle } from "@/lib/creator-account";
import { backfillCreatorContentToCampaigns } from "@/lib/content-campaign-sync";
import { backfillDiscoveryContentRefs } from "@/lib/content-creator-sync";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Re-synchronise le lien créateur ↔ marque via le pseudo du profil (onboarding). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const access = await requireActorAccess(request, body?.userId);
  if ("error" in access) return access.error;
  const userId = access.actorId;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  await syncCreatorRowsByProfileHandle(admin, userId);
  const { profile, brands } = await listCreatorBrandMemberships(admin, userId);

  for (const brand of brands) {
    if (!brand.creatorRowId) continue;
    await backfillDiscoveryContentRefs(admin, brand.brandId, brand.creatorRowId);
    await backfillCreatorContentToCampaigns(admin, brand.brandId, brand.creatorRowId);
  }

  return NextResponse.json({
    ok: true,
    username: profile?.username ?? null,
    brands,
  });
}
