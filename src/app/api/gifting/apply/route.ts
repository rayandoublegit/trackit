import { NextResponse, type NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import { applyToGiftCampaign, giftViewerState } from "@/lib/gift-apply-server";
import { isGiftShareToken } from "@/lib/gift-share";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Public gift link /gift/<token>.
// GET  ?token=  → who is looking (anonymous, creator, brand, owner) and their application, if any.
// POST { token, platform, handle, message, acceptTerms, lang } → apply (signed-in account required).

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!isGiftShareToken(token)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  const actorId = await getAuthedActorId(request);
  const result = await giftViewerState(admin, actorId, token);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!isGiftShareToken(body.token)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  const result = await applyToGiftCampaign(admin, actorId, body);
  return NextResponse.json(result.body, { status: result.status });
}
