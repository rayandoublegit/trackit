import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-data";
import { purgeDemoData } from "@/lib/admin-demo-purge";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: how many demo rows exist. POST { confirm: true }: delete them. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json(await purgeDemoData(db, true));
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Server error" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) return NextResponse.json({ error: "Send { confirm: true } to delete." }, { status: 400 });
  const report = await purgeDemoData(db, false);
  await logAdminAction(db, admin, { action: "demo.purge", targetUserId: null, targetEmail: null, details: report });
  return NextResponse.json(report, { status: report.errors.length ? 207 : 200 });
}
