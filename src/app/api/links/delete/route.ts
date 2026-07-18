import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  let body: { brandId?: string; linkId?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body", errorFr: "Corps de requête invalide" }, { status: 400 });
  }

  const access = await requireWorkspaceAccess(req, body.brandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;
  const linkId = String(body.linkId || body.id || "").trim();

  if (!brandId || !linkId) {
    return NextResponse.json(
      { ok: false, error: "Missing brandId or linkId", errorFr: "brandId ou linkId manquant" },
      { status: 400 },
    );
  }

  const { data: link, error: findErr } = await supabase
    .from("affiliate_links")
    .select("id, brand_id")
    .eq("id", linkId)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  }
  if (!link || link.brand_id !== brandId) {
    return NextResponse.json(
      { ok: false, error: "Link not found", errorFr: "Lien introuvable" },
      { status: 404 },
    );
  }

  const { error: deleteErr } = await supabase.from("affiliate_links").delete().eq("id", linkId).eq("brand_id", brandId);

  if (deleteErr) {
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
