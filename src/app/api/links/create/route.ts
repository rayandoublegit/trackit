import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildTrackitShortLink,
  generateAffiliateSlug,
  normalizeCreatorUsername,
  normalizeDestinationUrl,
} from "@/lib/affiliate-short-link";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  let body: {
    brandId?: string;
    creatorUsername?: string;
    creator_username?: string;
    destinationUrl?: string;
    destination_url?: string;
    campaignId?: string;
    campaign_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body", errorFr: "Corps de requête invalide" }, { status: 400 });
  }

  const brandId = String(body.brandId || "").trim();
  const creatorUsernameRaw = String(body.creatorUsername || body.creator_username || "").trim();
  const destinationRaw = String(body.destinationUrl || body.destination_url || "").trim();
  const campaignId = String(body.campaignId || body.campaign_id || "").trim() || null;

  if (!brandId || !creatorUsernameRaw || !destinationRaw) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing brandId, creatorUsername, or destinationUrl",
        errorFr: "brandId, pseudo créateur ou URL de destination manquant",
      },
      { status: 400 },
    );
  }

  let creatorUsername: string;
  let destinationUrl: string;
  try {
    creatorUsername = normalizeCreatorUsername(creatorUsernameRaw);
    destinationUrl = normalizeDestinationUrl(destinationRaw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid creator or destination URL", errorFr: "Créateur ou URL de destination invalide" },
      { status: 400 },
    );
  }

  const { data: brand, error: brandErr } = await supabase
    .from("profiles")
    .select("id, account_type")
    .eq("id", brandId)
    .maybeSingle();

  if (brandErr || !brand) {
    return NextResponse.json({ ok: false, error: "Brand not found", errorFr: "Marque introuvable" }, { status: 404 });
  }
  if (brand.account_type === "creator") {
    return NextResponse.json(
      { ok: false, error: "Creators cannot create brand links", errorFr: "Les créateurs ne peuvent pas créer de liens marque" },
      { status: 403 },
    );
  }

  if (campaignId) {
    const { data: campaign, error: campaignErr } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", brandId)
      .maybeSingle();
    if (campaignErr || !campaign) {
      return NextResponse.json(
        { ok: false, error: "Campaign not found", errorFr: "Campagne introuvable" },
        { status: 404 },
      );
    }
  }

  let inserted:
    | { id: string; slug: string; destination_url: string }
    | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = generateAffiliateSlug(attempt < 4 ? 7 : 8);
    const { data, error } = await supabase
      .from("affiliate_links")
      .insert({
        slug,
        brand_id: brandId,
        creator_username: creatorUsername,
        campaign_id: campaignId,
        destination_url: destinationUrl,
        active: true,
      })
      .select("id, slug, destination_url")
      .single();

    if (!error && data) {
      inserted = data;
      break;
    }
    if (error?.code !== "23505" && !String(error?.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: error?.message || "Insert failed" }, { status: 500 });
    }
  }

  if (!inserted) {
    return NextResponse.json(
      { ok: false, error: "Could not allocate unique slug", errorFr: "Impossible de générer un slug unique" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    slug: inserted.slug,
    link: buildTrackitShortLink(inserted.slug),
    destination_url: inserted.destination_url,
  });
}
