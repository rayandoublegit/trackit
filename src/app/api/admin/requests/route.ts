import { NextResponse, type NextRequest } from "next/server";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { groupRequests } from "@/lib/admin-aggregate";
import { fetchRows, isoDaysAgo } from "@/lib/admin-data";
import { devRequests } from "@/lib/admin-dev-fixtures";
import type { RequestsData } from "@/lib/admin-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devRequests());
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const since = isoDaysAgo(180);
  const [niches, lookups, waitlist] = await Promise.all([
    fetchRows<{ normalized_niche: string | null; niche: string | null; created_at: string | null }>(
      db,
      "niche_requests",
      "normalized_niche, niche, created_at",
      { since: { column: "created_at", iso: since } },
    ),
    fetchRows<{ normalized_query: string | null; query: string | null; created_at: string | null }>(
      db,
      "creator_lookup_requests",
      "normalized_query, query, created_at",
      { since: { column: "created_at", iso: since } },
    ),
    fetchRows<{ email: string; first_name: string | null; expectations: string | null; created_at: string | null }>(
      db,
      "v2_waitlist",
      "email, first_name, expectations, created_at",
      { maxRows: 2000, orderBy: "created_at" },
    ),
  ]);

  const warnings: string[] = [];
  for (const [name, r] of [
    ["niche_requests", niches],
    ["creator_lookup_requests", lookups],
    ["v2_waitlist", waitlist],
  ] as const) {
    if (r.missing) warnings.push(`${name} : table absente`);
    else if (r.error) warnings.push(`${name} : ${r.error}`);
  }

  const data: RequestsData = {
    ok: true,
    niches: niches.error ? null : groupRequests(niches.rows, (r) => r.normalized_niche, (r) => r.niche, (r) => r.created_at),
    lookups: lookups.error ? null : groupRequests(lookups.rows, (r) => r.normalized_query, (r) => r.query, (r) => r.created_at),
    waitlist: waitlist.error ? null : waitlist.rows,
    warnings,
  };
  return NextResponse.json(data);
}
