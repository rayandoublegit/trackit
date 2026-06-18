import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET : liste les scripts d'une marque
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .select("id, title, content, file_url, target_creator_id, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Récupère les noms des créateurs ciblés pour affichage
  const { data: creators } = await supabaseAdmin
    .from("creators")
    .select("id, handle, full_name")
    .eq("user_id", brandId);
  const nameById = new Map((creators || []).map((c) => [c.id, c.full_name || c.handle]));

  const scripts = (data || []).map((s) => ({
    ...s,
    targetName: s.target_creator_id ? (nameById.get(s.target_creator_id) || null) : null,
  }));

  return NextResponse.json({ ok: true, scripts });
}

// POST : crée un script
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const brandId = (body?.brandId as string | undefined)?.trim();
  const title = (body?.title as string | undefined)?.trim();
  const content = (body?.content as string | undefined)?.trim() || null;
  const fileUrl = (body?.fileUrl as string | undefined)?.trim() || null;
  const targetCreatorId = (body?.targetCreatorId as string | undefined)?.trim() || null;

  if (!brandId || !title) return NextResponse.json({ error: "Missing brandId or title" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .insert({ brand_id: brandId, title, content, file_url: fileUrl, target_creator_id: targetCreatorId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE : supprime un script (par la marque)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const brandId = searchParams.get("brandId");
  if (!id || !brandId) return NextResponse.json({ error: "Missing id or brandId" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("scripts")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
