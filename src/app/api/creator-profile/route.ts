import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readCreatorProfile } from "@/lib/creator-intel-read";
import { canSeeCreatorEmails } from "@/lib/plan-limits";
import { creatorsForPlan, redactCreatorEmail } from "@/lib/plan-paywall";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";

export const dynamic = "force-dynamic";

/**
 * /api/creator-profile?username= — everything the creator page shows, from stored data only.
 * Free plan: no creator email (hasEmail instead), here and on similar creators.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const username = (req.nextUrl.searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const data = await readCreatorProfile(admin, username);
  if (!data) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  const emails = canSeeCreatorEmails(await resolveOwnerPlan(admin, userId));
  const body = emails ? data : { ...data, creator: redactCreatorEmail(data.creator), similar: creatorsForPlan(data.similar, false) };
  return NextResponse.json(body, { headers: { "cache-control": "private, max-age=60, stale-while-revalidate=600" } });
}
