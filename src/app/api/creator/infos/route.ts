import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { findCreatorRowsForProfile } from "@/lib/creator-account";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const KINDS = ["rules", "howto", "pricing"] as const;
type InfoKind = (typeof KINDS)[number];

function isKind(v: unknown): v is InfoKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  const kindParam = searchParams.get("kind") || "rules";
  if (!isKind(kindParam)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const brandIds = await findCreatorBrandIds(admin, userId);
  if (brandIds.length === 0) return NextResponse.json({ ok: true, items: [] });

  let rows: { brand_id: string; body: string; updated_at: string | null }[] = [];

  const { data, error } = await admin
    .from("brand_infos")
    .select("brand_id, body, updated_at")
    .in("brand_id", brandIds)
    .eq("kind", kindParam);

  if (error) {
    if (kindParam === "rules") {
      const legacy = await admin.from("brand_rules").select("brand_id, body, updated_at").in("brand_id", brandIds);
      if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
      rows = (legacy.data || []).map((r) => ({
        brand_id: r.brand_id,
        body: r.body || "",
        updated_at: r.updated_at,
      }));
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    rows = (data || []).map((r) => ({
      brand_id: r.brand_id,
      body: r.body || "",
      updated_at: r.updated_at,
    }));
  }

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

  const items = rows
    .filter((r) => String(r.body || "").trim().length > 0)
    .map((r) => ({
      brandId: r.brand_id,
      brandName: brandName.get(r.brand_id) || "",
      body: r.body || "",
      updatedAt: r.updated_at,
      kind: kindParam,
    }));

  return NextResponse.json({ ok: true, items });
}

async function findCreatorBrandIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
) {
  const { rows } = await findCreatorRowsForProfile(admin, userId);
  return Array.from(new Set(rows.map((r) => r.user_id)));
}
