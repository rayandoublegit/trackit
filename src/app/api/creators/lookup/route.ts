import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sourceFor } from "@/lib/scraper/sources";
import { runCreatorLookup } from "@/lib/creator-live-lookup-server";
import { lookupErrorMessage } from "@/lib/creator-live-lookup";
import { DEV_BYPASS_PLAN } from "@/lib/dev-bypass";
import { normalizePlan } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";
// The lookup answers within 25 s; the refresh it started may finish a little later.
export const maxDuration = 60;

/**
 * /api/creators/lookup?q=<@handle | handle | profile link>&platform=<tiktok|instagram|youtube|auto>&tab=<catalog tab>&lang=<fr|en>
 *
 * Finds one creator: from the catalog when refreshed in the last 3 days,
 * otherwise live from the platform (profile + latest videos, stored like a
 * scraper refresh). Answers the catalog row (same shape as /api/catalog rows).
 * Signed-in users only; live lookups are rate limited per user (lib/creator-live-lookup-server).
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

  // Live lookups (API calls) come with the paid plans, like the catalog search itself.
  let plan = normalizePlan(DEV_BYPASS_PLAN || null);
  if (!DEV_BYPASS_PLAN) {
    const { data } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
    plan = normalizePlan(data?.plan);
  }

  const { status, body: out } = await runCreatorLookup(
    { admin, sourceFor },
    { userId, query: pick("q"), platform: pick("platform") || "auto", tab: pick("tab") || null, lang, allowLive: plan !== "free" },
  );
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (!out.ok && out.retryAfterSec) headers["retry-after"] = String(out.retryAfterSec);
  return NextResponse.json(out, { status, headers });
}

export const GET = handle;
export const POST = handle;
