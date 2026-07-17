import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeCreatorHandle } from "@/lib/managed-creator-commission";
import { buildTrackitShortLink } from "@/lib/affiliate-short-link";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CreatorRow = {
  id: string;
  handle: string | null;
  discount_code: string | null;
  affiliate_ref?: string | null;
  user_id: string;
};

async function loadCreatorsByLinkedUser(userId: string): Promise<CreatorRow[]> {
  const withRef = await supabaseAdmin
    .from("creators")
    .select("id, handle, discount_code, affiliate_ref, user_id")
    .eq("linked_user_id", userId);

  if (withRef.error && withRef.error.message.toLowerCase().includes("affiliate_ref")) {
    const fallback = await supabaseAdmin
      .from("creators")
      .select("id, handle, discount_code, user_id")
      .eq("linked_user_id", userId);
    return (fallback.data ?? []).map((r) => ({ ...r, affiliate_ref: null }));
  }
  return (withRef.data ?? []) as CreatorRow[];
}

async function loadCreatorsByHandle(handle: string): Promise<CreatorRow[]> {
  const withRef = await supabaseAdmin
    .from("creators")
    .select("id, handle, discount_code, affiliate_ref, user_id")
    .ilike("handle", handle)
    .limit(20);

  if (withRef.error && withRef.error.message.toLowerCase().includes("affiliate_ref")) {
    const fallback = await supabaseAdmin
      .from("creators")
      .select("id, handle, discount_code, user_id")
      .ilike("handle", handle)
      .limit(20);
    return (fallback.data ?? []).map((r) => ({ ...r, affiliate_ref: null }));
  }
  return (withRef.data ?? []) as CreatorRow[];
}

async function crmAffiliateFor(
  brandId: string,
  handle: string
): Promise<{ affiliateRef: string; promoCode: string }> {
  const { data: savedRows } = await supabaseAdmin
    .from("discovery_saved")
    .select("creator_username, snapshot")
    .eq("user_id", brandId);

  const saved = (savedRows ?? []).find(
    (s) => normalizeCreatorHandle(String(s.creator_username || "")) === handle
  );
  const snap =
    saved?.snapshot && typeof saved.snapshot === "object"
      ? (saved.snapshot as Record<string, unknown>)
      : null;
  const crm =
    snap?.crm && typeof snap.crm === "object" ? (snap.crm as Record<string, unknown>) : null;

  return {
    affiliateRef: typeof crm?.affiliateRef === "string" ? crm.affiliateRef.trim() : "",
    promoCode: typeof crm?.promoCode === "string" ? crm.promoCode.trim() : "",
  };
}

async function latestAffiliateLinkForCreator(
  brandId: string,
  handle: string
): Promise<{ slug: string; destination_url: string }> {
  const { data, error } = await supabaseAdmin
    .from("affiliate_links")
    .select("slug, destination_url")
    .eq("brand_id", brandId)
    .eq("creator_username", handle)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message.toLowerCase().includes("affiliate_links")) {
      return { slug: "", destination_url: "" };
    }
    return { slug: "", destination_url: "" };
  }

  return {
    slug: data?.slug?.trim() || "",
    destination_url: data?.destination_url?.trim() || "",
  };
}

/**
 * Creator-facing: returns the affiliate link assigned by their brand (if any).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") || "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  const profileHandle = normalizeCreatorHandle(profile?.username || "");

  let creatorRows = await loadCreatorsByLinkedUser(userId);
  if (creatorRows.length === 0 && profileHandle) {
    creatorRows = await loadCreatorsByHandle(profileHandle);
  }

  for (const row of creatorRows) {
    const handle = normalizeCreatorHandle(row.handle || "");
    let affiliateRef = row.affiliate_ref?.trim() || "";
    let code = row.discount_code?.trim() || "";
    let destinationUrl = "";

    if (row.user_id && handle && (!affiliateRef || !code)) {
      const crm = await crmAffiliateFor(row.user_id, handle);
      if (!affiliateRef) affiliateRef = crm.affiliateRef;
      if (!code) code = crm.promoCode;
    }

    if (row.user_id && handle) {
      const latest = await latestAffiliateLinkForCreator(row.user_id, handle);
      if (!affiliateRef) affiliateRef = latest.slug;
      destinationUrl = latest.destination_url;
    }

    if (!affiliateRef && !code) continue;

    return NextResponse.json({
      ok: true,
      assigned: true,
      link: affiliateRef ? buildTrackitShortLink(affiliateRef, destinationUrl || null) : null,
      ref: affiliateRef || null,
      code: code || null,
      handle: row.handle,
    });
  }

  return NextResponse.json({
    ok: true,
    assigned: false,
    link: null,
    ref: null,
    code: null,
  });
}
