import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sourceFor } from "@/lib/scraper/sources";
import { runCreatorLookup } from "@/lib/creator-live-lookup-server";
import { lookupErrorMessage } from "@/lib/creator-live-lookup";
import { canSeeCreatorEmails, canUseLiveLookup, lowestTierFor } from "@/lib/plan-limits";
import { paywallBody, redactCreatorEmail } from "@/lib/plan-paywall";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";

export const dynamic = "force-dynamic";
// The lookup answers within 25 s; the refresh it started may finish a little later.
export const maxDuration = 60;

/**
 * /api/creators/lookup?q=<@handle | handle | profile link>&platform=<tiktok|instagram|youtube|auto>&tab=<catalog tab>&lang=<fr|en>
 *
 * Finds one creator: from the catalog when refreshed in the last 3 days,
 * otherwise live from the platform (profile + latest videos, stored like a
 * scraper refresh). Answers the catalog row (same shape as /api/catalog rows).
 * Signed-in users only. Live lookups: Growth and above (402 plan_required on Free),
 * rate limited per workspace owner per hour (lib/creator-live-lookup-server).
 * Free answers never carry the creator email (hasEmail instead).
 * POST (it may spend API calls and write rows); GET is accepted for manual checks.
 */
async function handle(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lang = p.get("lang") === "fr" ? "fr" : "en";
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ ok: false, code: "unauthorized", message: lookupErrorMessage("unauthorized", lang) }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, code: "unavailable", message: lookupErrorMessage("unavailable", lang) }, { status: 503 });

  let body: Record<string, unknown> = {};
  if (req.method === "POST" && req.headers.get("content-type")?.includes("application/json")) {
    body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  }
  const pick = (name: string) => String(body[name] ?? p.get(name) ?? "");

  // Live lookups (API calls) come with Growth and above; a creator already in
  // the catalog is answered from the database for every plan.
  const plan = await resolveOwnerPlan(admin, userId);

  const { status, body: out } = await runCreatorLookup(
    { admin, sourceFor },
    { userId, query: pick("q"), platform: pick("platform") || "auto", tab: pick("tab") || null, lang, allowLive: canUseLiveLookup(plan) },
  );
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (!out.ok && out.retryAfterSec) headers["retry-after"] = String(out.retryAfterSec);
  if (!out.ok && out.code === "plan_required") {
    return NextResponse.json({ ...out, ...paywallBody("live-lookup", lowestTierFor(canUseLiveLookup), { message: out.message }) }, { status: 402, headers });
  }
  const answer = out.ok && !canSeeCreatorEmails(plan) ? { ...out, creator: redactCreatorEmail(out.creator) } : out;
  return NextResponse.json(answer, { status, headers });
}

export const GET = handle;
export const POST = handle;
