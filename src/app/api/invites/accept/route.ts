import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Valide un token d'invitation. GET = lire les infos (qui invite), POST = relier un créateur.
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") || "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const { data: invite } = await supabase
    .from("creator_invites")
    .select("id, brand_id, status")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 404 });
  if (invite.status === "revoked") return NextResponse.json({ ok: false, error: "Invite revoked" }, { status: 410 });

  // Récupère le nom de la marque pour l'afficher au créateur.
  const { data: brand } = await supabase
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", invite.brand_id)
    .maybeSingle();

  const brandName = brand?.business_name || brand?.full_name || (brand?.username ? `@${brand.username}` : "this brand");
  return NextResponse.json({ ok: true, brandName, brandId: invite.brand_id });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  let body: { token?: string; creatorId?: string; fullName?: string; socialHandle?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 }); }

  const token = (body.token || "").trim();
  const creatorId = (body.creatorId || "").trim();
  const fullName = (body.fullName || "").trim();
  const socialHandle = (body.socialHandle || "").trim().replace(/^@+/, "");
  if (!token || !creatorId) return NextResponse.json({ ok: false, error: "Missing token or creatorId" }, { status: 400 });

  // Vérifie l'invitation.
  const { data: invite } = await supabase
    .from("creator_invites")
    .select("id, brand_id, status")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, error: "Invalid invite" }, { status: 404 });
  if (invite.status === "revoked") return NextResponse.json({ ok: false, error: "Invite revoked" }, { status: 410 });

  // Marque le compte comme "creator".
  const profileUpdate: Record<string, unknown> = { account_type: "creator" };
  if (fullName) profileUpdate.full_name = fullName;
  if (socialHandle) profileUpdate.username = socialHandle;
  const { error: profErr } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", creatorId);
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });

  // Crée le lien créateur <-> marque (upsert pour éviter les doublons).
  const { error: linkErr } = await supabase
    .from("creator_links")
    .upsert(
      { creator_id: creatorId, brand_id: invite.brand_id, invite_id: invite.id, status: "active" },
      { onConflict: "creator_id,brand_id" }
    );
  if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });

  // Crée (ou relie) la ligne du créateur dans le carnet de la marque,
  // pour qu'il apparaisse direct dans les Payouts et reçoive son IBAN.
  const handle = socialHandle.toLowerCase().replace(/\s+/g, "");
  if (handle) {
    const { data: existing } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", invite.brand_id)
      .eq("handle", handle)
      .maybeSingle();

    if (existing) {
      // La marque l'avait déjà ajouté : on pose juste le lien + le nom.
      await supabase
        .from("creators")
        .update({ linked_user_id: creatorId, full_name: fullName || undefined })
        .eq("id", existing.id);
    } else {
      // Sinon on crée la ligne d'accueil.
      await supabase
        .from("creators")
        .insert({
          user_id: invite.brand_id,
          handle,
          full_name: fullName || handle,
          linked_user_id: creatorId,
          platform: "tiktok",
          commission_rate: 10,
        });
    }
  }

  // Marque l'invitation comme utilisée.
  await supabase
    .from("creator_invites")
    .update({ status: "used", used_at: new Date().toISOString(), used_by: creatorId })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, brandId: invite.brand_id });
}
