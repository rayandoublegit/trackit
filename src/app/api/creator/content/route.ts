import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findCreatorRowsForProfile } from "@/lib/creator-account";
import { syncContentRefToDiscoverySaved } from "@/lib/content-creator-sync";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET — list content uploaded by this creator
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { rows } = await findCreatorRowsForProfile(supabaseAdmin, userId);
  if (rows.length === 0) return NextResponse.json({ ok: true, items: [], brands: [] });

  const creatorRowIds = rows.map((r) => r.id);
  const brandIds = [...new Set(rows.map((r) => r.user_id))];

  const { data: items, error } = await supabaseAdmin
    .from("creator_content")
    .select("id, brand_id, creator_row_id, title, notes, file_url, file_name, file_type, file_size, created_at")
    .eq("creator_user_id", userId)
    .in("creator_row_id", creatorRowIds)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: brands } = await supabaseAdmin
    .from("profiles")
    .select("id, business_name, full_name, username")
    .in("id", brandIds);
  const brandName = new Map(
    (brands || []).map((b) => [b.id, b.business_name || b.full_name || (b.username ? `@${b.username}` : "")]),
  );

  const result = (items || []).map((item) => ({
    ...item,
    brandName: brandName.get(item.brand_id) || "",
  }));

  const brandOptions = brandIds.map((id) => ({
    id,
    name: brandName.get(id) || id,
    creatorRowId: rows.find((r) => r.user_id === id)?.id ?? null,
  }));

  return NextResponse.json({ ok: true, items: result, brands: brandOptions });
}

// POST — register uploaded content (files uploaded client-side to storage first)
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = (body?.userId as string | undefined)?.trim();
  const brandId = (body?.brandId as string | undefined)?.trim();
  const creatorRowId = (body?.creatorRowId as string | undefined)?.trim();
  const title = (body?.title as string | undefined)?.trim();
  const notes = (body?.notes as string | undefined)?.trim() || null;
  const fileUrl = (body?.fileUrl as string | undefined)?.trim();
  const fileName = (body?.fileName as string | undefined)?.trim();
  const fileType = (body?.fileType as string | undefined)?.trim() || null;
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : null;

  if (!userId || !brandId || !creatorRowId || !title || !fileUrl || !fileName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { rows } = await findCreatorRowsForProfile(supabaseAdmin, userId);
  const match = rows.find((r) => r.id === creatorRowId && r.user_id === brandId);
  if (!match) return NextResponse.json({ error: "Creator not linked to brand" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("creator_content")
    .insert({
      brand_id: brandId,
      creator_row_id: creatorRowId,
      creator_user_id: userId,
      title,
      notes,
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const syncErr = await syncContentRefToDiscoverySaved(supabaseAdmin, brandId, creatorRowId, {
    id: data.id,
    title,
  });
  if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE — creator removes own content
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const userId = searchParams.get("userId");
  if (!id || !userId) return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("creator_content")
    .delete()
    .eq("id", id)
    .eq("creator_user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
