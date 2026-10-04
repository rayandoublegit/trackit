import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActorAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCreatorHandle } from "@/lib/creator-account";
import { joinCreatorToBrand, notifyCreatorJoined, publicBrandName } from "@/lib/creator-brand-join";
import { backfillCampaignContent } from "@/lib/content-campaign-sync";

export const dynamic = "force-dynamic";

// Public join link of a campaign: /join/<campaign id>. Anyone with the link can
// sign up as a creator and is added to that campaign. GET = what the page shows,
// POST = join (signed-in account required).

type CampaignRow = {
  id: string;
  user_id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  platform: string | null;
  commission_rate: number | null;
  commission_type: string | null;
  workspace_id?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadCampaign(supabase: SupabaseClient, id: string): Promise<CampaignRow | null> {
  if (!UUID.test(id)) return null;
  const base = "id, user_id, name, description, status, platform, commission_rate, commission_type";
  const withWorkspace = await supabase.from("campaigns").select(`${base}, workspace_id`).eq("id", id).maybeSingle();
  if (!withWorkspace.error) return (withWorkspace.data as CampaignRow | null) ?? null;
  const { data } = await supabase.from("campaigns").select(base).eq("id", id).maybeSingle();
  return (data as CampaignRow | null) ?? null;
}

function closed(campaign: CampaignRow): boolean {
  const status = (campaign.status || "").toLowerCase();
  return status === "draft" || status === "ended" || status === "archived" || status === "completed";
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });

  const id = (new URL(req.url).searchParams.get("id") || "").trim();
  const campaign = await loadCampaign(supabase, id);
  if (!campaign) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (closed(campaign)) return NextResponse.json({ ok: false, error: "closed" }, { status: 410 });

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      name: campaign.name || "",
      description: campaign.description || "",
      platform: campaign.platform || "",
      commissionRate: campaign.commission_rate,
      commissionType: campaign.commission_type,
    },
    brandName: await publicBrandName(supabase, campaign.user_id),
  });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });

  let body: { campaignId?: string; fullName?: string; socialHandle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const access = await requireActorAccess(req);
  if ("error" in access) return access.error;
  const creatorId = access.actorId;

  const campaign = await loadCampaign(supabase, (body.campaignId || "").trim());
  if (!campaign) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (closed(campaign)) return NextResponse.json({ ok: false, error: "closed" }, { status: 410 });
  if (campaign.user_id === creatorId) return NextResponse.json({ ok: false, error: "own_campaign" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, username, full_name")
    .eq("id", creatorId)
    .maybeSingle();
  // Never turn a brand account into a creator through a public link.
  if ((profile?.account_type || "").toLowerCase() === "brand") {
    return NextResponse.json({ ok: false, error: "brand_account" }, { status: 403 });
  }

  const socialHandle = normalizeCreatorHandle(body.socialHandle || profile?.username);
  if (!socialHandle) return NextResponse.json({ ok: false, error: "missing_handle" }, { status: 400 });
  const fullName = (body.fullName || profile?.full_name || "").trim();

  const joined = await joinCreatorToBrand(supabase, {
    brandId: campaign.user_id,
    creatorId,
    socialHandle,
    fullName,
    workspaceId: campaign.workspace_id ?? undefined,
  });
  if (!joined.ok) return NextResponse.json({ ok: false, error: joined.error }, { status: 500 });
  if (!joined.creatorRowId) return NextResponse.json({ ok: false, error: "no_creator_row" }, { status: 500 });

  const { data: already } = await supabase
    .from("campaign_creators")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("creator_id", joined.creatorRowId)
    .maybeSingle();

  if (!already) {
    const row: Record<string, unknown> = {
      user_id: campaign.user_id,
      campaign_id: campaign.id,
      creator_id: joined.creatorRowId,
      historical_sales_attached: false,
      created_at: new Date().toISOString(),
    };
    if (campaign.workspace_id) row.workspace_id = campaign.workspace_id;
    let { error } = await supabase.from("campaign_creators").insert(row);
    if (error && /workspace_id/.test(error.message)) {
      delete row.workspace_id;
      ({ error } = await supabase.from("campaign_creators").insert(row));
    }
    // A concurrent join already inserted the same pair: that's fine.
    if (error && error.code !== "23505") return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const backfillErr = await backfillCampaignContent(supabase, campaign.user_id, campaign.id);
    if (backfillErr) console.error("campaign join backfill failed:", backfillErr.message);

    await notifyCreatorJoined(supabase, campaign.user_id, socialHandle, fullName || null, {
      campaignId: campaign.id,
      campaignName: campaign.name || "",
    });
  }

  return NextResponse.json({ ok: true, alreadyJoined: Boolean(already), handle: socialHandle });
}
