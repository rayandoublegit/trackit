import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId")?.trim();
  const creatorIdsParam = searchParams.get("creatorIds")?.trim();

  if (!requestedUserId || !creatorIdsParam) {
    return NextResponse.json({ ok: false, error: "Missing userId or creatorIds" }, { status: 400 });
  }
  const access = await requireWorkspaceAccess(request, requestedUserId);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;

  const creatorIds = [...new Set(creatorIdsParam.split(",").map((id) => id.trim()).filter(Boolean))];
  if (creatorIds.length === 0) {
    return NextResponse.json({ ok: true, creators: {} });
  }

  const { data: sales, error } = await supabaseAdmin
    .from("sales")
    .select("creator_id, order_amount, commission_amount")
    .eq("user_id", userId)
    .in("creator_id", creatorIds);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const creators: Record<string, { count: number; revenue: number; commission: number }> = {};
  for (const row of sales || []) {
    const id = String(row.creator_id);
    const agg = creators[id] || { count: 0, revenue: 0, commission: 0 };
    agg.count += 1;
    agg.revenue += Number(row.order_amount) || 0;
    agg.commission += Number(row.commission_amount) || 0;
    creators[id] = agg;
  }

  return NextResponse.json({ ok: true, creators });
}
