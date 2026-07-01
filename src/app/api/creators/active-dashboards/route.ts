import { NextResponse } from "next/server";
import { listActiveDashboardCreators } from "@/lib/active-dashboard-creators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = (searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, creators: [] });

  try {
    const creators = await listActiveDashboardCreators(admin, brandId);
    return NextResponse.json({ ok: true, creators });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load creators";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
