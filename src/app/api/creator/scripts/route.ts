import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Trouve la/les ligne(s) creators de ce créateur (par linked_user_id), retourne {brandIds, creatorRowIds}
async function findCreatorContext(userId: string) {
  const { data: rows } = await supabaseAdmin
    .from("creators")
    .select("id, user_id")
    .eq("linked_user_id", userId);
  const brandIds = Array.from(new Set((rows || []).map((r) => r.user_id)));
  const creatorRowIds = (rows || []).map((r) => r.id);
  return { brandIds, creatorRowIds };
}

// GET : liste les scripts destinés à ce créateur
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { brandIds, creatorRowIds } = await findCreatorContext(userId);
  if (brandIds.length === 0) return NextResponse.json({ ok: true, scripts: [] });

  // Scripts des marques liées : soit pour tous (target null), soit ciblant une de ses lignes creators
  const { data: scripts, error } = await supabaseAdmin
    .from("scripts")
    .select("id, brand_id, title, content, file_url, target_creator_id, created_at")
    .in("brand_id", brandIds)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visible = (scripts || []).filter(
    (s) => !s.target_creator_id || creatorRowIds.includes(s.target_creator_id)
  );

  // Statuts de lecture déjà posés par ce créateur
  const { data: reads } = await supabaseAdmin
    .from("script_reads")
    .select("script_id, status")
    .eq("creator_id", userId);
  const statusBy = new Map((reads || []).map((r) => [r.script_id, r.status]));

  // Noms des marques
  const { data: brands } = await supabaseAdmin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map((brands || []).map((b) => [b.id, b.business_name || b.full_name || (b.username ? `@${b.username}` : "")]));

  const result = visible.map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    file_url: s.file_url,
    created_at: s.created_at,
    brandName: brandName.get(s.brand_id) || "",
    status: statusBy.get(s.id) || null,
  }));

  return NextResponse.json({ ok: true, scripts: result });
}

// POST : marque un script comme vu/fait
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = (body?.userId as string | undefined)?.trim();
  const scriptId = (body?.scriptId as string | undefined)?.trim();
  const status = (body?.status as string | undefined)?.trim() || "done";
  if (!userId || !scriptId) return NextResponse.json({ error: "Missing userId or scriptId" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("script_reads")
    .upsert(
      { script_id: scriptId, creator_id: userId, status, updated_at: new Date().toISOString() },
      { onConflict: "script_id,creator_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
