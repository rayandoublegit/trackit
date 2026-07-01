import { NextResponse } from "next/server";
import { findDeactivatedCreatorBrand } from "@/lib/delete-creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** Vérifie si un email correspond à un compte créateur supprimé par une marque. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim();
  if (!email) return NextResponse.json({ deactivated: false });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ deactivated: false });

  try {
    const match = await findDeactivatedCreatorBrand(admin, email);
    if (!match) return NextResponse.json({ deactivated: false });
    return NextResponse.json({ deactivated: true, brandName: match.brandName });
  } catch {
    return NextResponse.json({ deactivated: false });
  }
}
