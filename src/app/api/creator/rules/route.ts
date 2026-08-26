import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { findCreatorRowsForProfile } from "@/lib/creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function findCreatorBrandIds(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [] as string[];
  const { rows } = await findCreatorRowsForProfile(admin, userId);
  return Array.from(new Set(rows.map((r) => r.user_id)));
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;

  const brandIds = await findCreatorBrandIds(userId);
  if (brandIds.length === 0) return NextResponse.json({ ok: true, rules: [] });

  const { data: rules, error } = await admin
    .from("brand_rules")
    .select("brand_id, body, updated_at")
    .in("brand_id", brandIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: brands } = await admin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map(
    (brands || []).map((b) => [
      b.id,
      b.business_name || b.full_name || (b.username ? `@${b.username}` : ""),
    ]),
  );

  const result = (rules || [])
    .filter((r) => String(r.body || "").trim().length > 0)
    .map((r) => ({
      brandId: r.brand_id,
      brandName: brandName.get(r.brand_id) || "",
      body: r.body || "",
      updatedAt: r.updated_at,
    }));

  return NextResponse.json({ ok: true, rules: result });
}
