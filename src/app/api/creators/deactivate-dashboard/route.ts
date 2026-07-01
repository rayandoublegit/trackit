import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { deleteCreatorAccountForBrand } from "@/lib/delete-creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Brand deactivates a creator — deletes their account and removes them from the brand workspace. */
export async function POST(request: NextRequest) {
  const brandId = await getAuthedUserId(request);
  if (!brandId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const creatorRowId = (body?.creatorId as string | undefined)?.trim();
  if (!creatorRowId) return NextResponse.json({ error: "Missing creatorId" }, { status: 400 });

  try {
    await deleteCreatorAccountForBrand(admin, brandId, creatorRowId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deactivation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
