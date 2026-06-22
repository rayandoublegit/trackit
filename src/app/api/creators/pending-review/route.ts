import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lazy so the route doesn't crash at import when Supabase env is absent (e.g.
// local dev preview). Real deployments always have these set.
const hasSupabase = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET : liste les créateurs récemment arrivés (needs_review = true) pour cette marque
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });
  if (!hasSupabase()) return NextResponse.json({ ok: true, creators: [] });

  const { data, error } = await getSupabaseAdmin()
    .from("creators")
    .select("id, handle, full_name, avatar_url, platform, commission_rate, discount_code")
    .eq("user_id", brandId)
    .eq("needs_review", true)
    .order("id", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, creators: data || [] });
}

// POST : la marque valide/complète un créateur -> needs_review = false + champs
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const brandId = (body?.brandId as string | undefined)?.trim();
  const creatorId = (body?.creatorId as string | undefined)?.trim();
  const commissionRate = body?.commissionRate;
  const discountCode = (body?.discountCode as string | undefined)?.trim() || null;
  const platform = (body?.platform as string | undefined)?.trim() || null;
  const avatarUrl = (body?.avatarUrl as string | undefined)?.trim() || null;
  const niche = (body?.niche as string | undefined)?.trim() || null;
  const followers = body?.followers;
  const engagement = body?.engagement;
  if (!brandId || !creatorId) return NextResponse.json({ error: "Missing brandId or creatorId" }, { status: 400 });
  if (!hasSupabase()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const update: Record<string, unknown> = { needs_review: false };
  if (commissionRate !== undefined && commissionRate !== null && commissionRate !== "") update.commission_rate = Number(commissionRate);
  if (discountCode) update.discount_code = discountCode;
  if (platform) update.platform = platform;
  if (avatarUrl) update.avatar_url = avatarUrl;
  if (niche) update.niche = niche;
  if (followers !== undefined && followers !== null && followers !== "") update.followers = Number(followers);
  if (engagement !== undefined && engagement !== null && engagement !== "") update.engagement_rate = Number(engagement);

  const { error } = await getSupabaseAdmin()
    .from("creators")
    .update(update)
    .eq("id", creatorId)
    .eq("user_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE : la marque ignore le pop-up sans rien changer (juste needs_review = false)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creatorId");
  const brandId = searchParams.get("brandId");
  if (!creatorId || !brandId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  if (!hasSupabase()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await getSupabaseAdmin()
    .from("creators")
    .update({ needs_review: false })
    .eq("id", creatorId)
    .eq("user_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
