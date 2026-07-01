import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET — brand lists content for a creator (by handle) or all creators
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const targetHandle = searchParams.get("targetHandle")?.trim().replace(/^@/, "") || null;
  if (!brandId) return NextResponse.json({ error: "No brandId" }, { status: 400 });

  let targetCreatorId: string | null = null;
  if (targetHandle) {
    const { data: creatorRow } = await supabaseAdmin
      .from("creators")
      .select("id")
      .eq("user_id", brandId)
      .ilike("handle", targetHandle)
      .maybeSingle();
    targetCreatorId = creatorRow?.id ?? null;
    if (!targetCreatorId) {
      return NextResponse.json({ ok: true, items: [] });
    }
  }

  let query = supabaseAdmin
    .from("creator_content")
    .select(
      "id, title, notes, file_url, file_name, file_type, file_size, creator_row_id, creator_user_id, created_at",
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (targetCreatorId) {
    query = query.eq("creator_row_id", targetCreatorId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creatorIds = [...new Set((data || []).map((r) => r.creator_row_id).filter(Boolean))];
  const { data: creators } = creatorIds.length
    ? await supabaseAdmin.from("creators").select("id, handle, full_name").in("id", creatorIds)
    : { data: [] as { id: string; handle: string | null; full_name: string | null }[] };
  const nameById = new Map(
    (creators || []).map((c) => [c.id, c.full_name || (c.handle ? `@${c.handle.replace(/^@/, "")}` : "")]),
  );

  const items = (data || []).map((item) => ({
    ...item,
    creatorName: item.creator_row_id ? nameById.get(item.creator_row_id) || null : null,
  }));

  return NextResponse.json({ ok: true, items });
}
