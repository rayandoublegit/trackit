import { NextResponse } from "next/server";
import { requireActorAccess } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET — notifications serveur non livrées pour la marque connectée
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const access = await requireActorAccess(request, searchParams.get("userId"));
  if ("error" in access) return access.error;
  const userId = access.actorId;
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data, error } = await admin
    .from("brand_notifications")
    .select("id, type, payload, created_at")
    .eq("brand_id", userId)
    .is("delivered_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}

// POST — accuse réception des notifications importées côté client
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const access = await requireActorAccess(request, body?.userId);
  if ("error" in access) return access.error;
  const userId = access.actorId;
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]).filter((v) => typeof v === "string") : [];
  if (!userId || ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await admin
    .from("brand_notifications")
    .update({ delivered_at: new Date().toISOString() })
    .eq("brand_id", userId)
    .in("id", ids.slice(0, 100));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
