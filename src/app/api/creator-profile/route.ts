import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readCreatorProfile } from "@/lib/creator-intel-read";

export const dynamic = "force-dynamic";

/** /api/creator-profile?username= — everything the creator page shows, from stored data only. */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const username = (req.nextUrl.searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const data = await readCreatorProfile(admin, username);
  if (!data) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "cache-control": "private, max-age=60" } });
}
