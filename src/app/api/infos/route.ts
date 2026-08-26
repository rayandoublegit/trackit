import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const KINDS = ["rules", "howto", "pricing"] as const;
type InfoKind = (typeof KINDS)[number];

function isKind(v: unknown): v is InfoKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

function missingTableMessage(error: { message?: string } | null) {
  const msg = error?.message || "";
  if (
    (msg.includes("brand_infos") || msg.includes("brand_rules")) &&
    (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("Could not find"))
  ) {
    return "Table brand_infos absente — appliquez supabase/migrations/20260825_000038_brand_infos.sql";
  }
  return msg || "Unknown error";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brandId");
  const kindParam = url.searchParams.get("kind") || "rules";
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  if (!isKind(kindParam)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("brand_infos")
    .select("brand_id, kind, body, updated_at")
    .eq("brand_id", workspaceId)
    .eq("kind", kindParam)
    .maybeSingle();

  if (error) {
    // Fallback to legacy brand_rules for kind=rules
    if (kindParam === "rules") {
      const legacy = await admin
        .from("brand_rules")
        .select("brand_id, body, updated_at")
        .eq("brand_id", workspaceId)
        .maybeSingle();
      if (!legacy.error) {
        return NextResponse.json({
          ok: true,
          info: legacy.data
            ? { brand_id: legacy.data.brand_id, kind: "rules", body: legacy.data.body, updated_at: legacy.data.updated_at }
            : { brand_id: workspaceId, kind: "rules", body: "", updated_at: null },
        });
      }
    }
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    info: data || { brand_id: workspaceId, kind: kindParam, body: "", updated_at: null },
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : null;
  const kind = body?.kind;
  const access = await requireWorkspaceAccess(request, brandId);
  if ("error" in access) return access.error;
  const workspaceId = access.workspaceId;

  if (!isKind(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const text = typeof body?.body === "string" ? body.body : "";
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("brand_infos")
    .upsert(
      {
        brand_id: workspaceId,
        kind,
        body: text,
        updated_at: now,
      },
      { onConflict: "brand_id,kind" },
    )
    .select("brand_id, kind, body, updated_at")
    .single();

  if (error) {
    if (kind === "rules") {
      const legacy = await admin.from("brand_rules").upsert(
        { brand_id: workspaceId, body: text, updated_at: now },
        { onConflict: "brand_id" },
      ).select("brand_id, body, updated_at").single();
      if (!legacy.error) {
        return NextResponse.json({
          ok: true,
          info: { brand_id: legacy.data.brand_id, kind: "rules", body: legacy.data.body, updated_at: legacy.data.updated_at },
        });
      }
    }
    return NextResponse.json({ error: missingTableMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, info: data });
}
