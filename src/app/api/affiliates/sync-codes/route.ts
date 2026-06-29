import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncAffiliateEntriesToCreators } from "@/lib/creator-promo-codes";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Persists affiliate-panel codes (local list) onto creators.discount_code in Supabase. */
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  const entries = Array.isArray(body.entries) ? body.entries : [];

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
  }

  const normalized = entries
    .map((row: { handle?: string; creator?: string; code?: string }) => ({
      handle: String(row.handle || row.creator || ""),
      code: String(row.code || ""),
    }))
    .filter((row: { handle: string; code: string }) => row.handle && row.code);

  const synced = await syncAffiliateEntriesToCreators(supabaseAdmin, userId, normalized);
  return NextResponse.json({ ok: true, synced });
}
