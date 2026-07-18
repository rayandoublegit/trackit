import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// Génère un token court, lisible, sans caractères ambigus.
function makeToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  let body: { brandId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const access = await requireWorkspaceAccess(req, body.brandId);
  if ("error" in access) return access.error;
  const brandId = access.workspaceId;
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "Missing brandId" }, { status: 400 });
  }

  // Vérifie que la marque existe et est bien un compte "brand".
  const { data: brand, error: brandErr } = await supabase
    .from("profiles")
    .select("id, account_type")
    .eq("id", brandId)
    .single();

  if (brandErr || !brand) {
    return NextResponse.json({ ok: false, error: "Brand not found" }, { status: 404 });
  }
  if (brand.account_type === "creator") {
    return NextResponse.json({ ok: false, error: "Creators cannot invite" }, { status: 403 });
  }

  // Génère un token unique (retry en cas de collision improbable).
  let token = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = makeToken();
    const { data: existing } = await supabase
      .from("creator_invites")
      .select("id")
      .eq("token", candidate)
      .maybeSingle();
    if (!existing) { token = candidate; break; }
  }
  if (!token) {
    return NextResponse.json({ ok: false, error: "Could not generate token" }, { status: 500 });
  }

  const { data: invite, error: insertErr } = await supabase
    .from("creator_invites")
    .insert({ token, brand_id: brandId, status: "active" })
    .select("token")
    .single();

  if (insertErr || !invite) {
    return NextResponse.json({ ok: false, error: insertErr?.message || "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: invite.token });
}
