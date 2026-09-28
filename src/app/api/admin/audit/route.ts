import { NextResponse, type NextRequest } from "next/server";
import { adminDevPreview, requireAdmin } from "@/lib/admin-auth";
import { listAdminAudit } from "@/lib/admin-data";
import { devAudit } from "@/lib/admin-dev-fixtures";
import type { AuditData } from "@/lib/admin-types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) {
    if (adminDevPreview()) return NextResponse.json(devAudit());
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const result = await listAdminAudit(db, 100);
  if (result.error && !result.missing) return NextResponse.json({ error: result.error }, { status: 500 });
  const data: AuditData = { ok: true, missing: result.missing, entries: result.entries };
  return NextResponse.json(data);
}
