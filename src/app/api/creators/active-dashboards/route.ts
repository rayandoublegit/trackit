import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { listActiveDashboardCreators } from "@/lib/active-dashboard-creators";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedBrandId = (searchParams.get("brandId") || "").trim();
  if (!requestedBrandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });
  const access = await requireWorkspaceAccess(request, requestedBrandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;

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
