import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const norm = (s: string | null | undefined) =>
  (s || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  // 1. Profil du créateur (pour récupérer son pseudo)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("username, full_name, account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.account_type !== "creator") {
    return NextResponse.json({ error: "Not a creator" }, { status: 403 });
  }

  const handle = norm(profile.username);

  // 2. Trouver SA ligne dans creators : d'abord par linked_user_id, sinon par handle
  let creatorRow: { id: string; user_id: string; balance: number; total_earned: number; total_sales: number; commission_rate: number | null; discount_code: string | null; handle: string | null } | null = null;

  const { data: linkedRows } = await supabaseAdmin
    .from("creators")
    .select("id, user_id, balance, total_earned, total_sales, commission_rate, discount_code, handle")
    .eq("linked_user_id", userId);

  if (linkedRows && linkedRows.length > 0) {
    creatorRow = linkedRows[0];
  } else if (handle) {
    // Fallback : match par handle normalisé, puis pose le lien
    const { data: allByHandle } = await supabaseAdmin
      .from("creators")
      .select("id, user_id, balance, total_earned, total_sales, commission_rate, discount_code, handle");
    const match = (allByHandle || []).find((c) => norm(c.handle) === handle);
    if (match) {
      creatorRow = match;
      await supabaseAdmin
        .from("creators")
        .update({ linked_user_id: userId })
        .eq("id", match.id);
    }
  }

  if (!creatorRow) {
    return NextResponse.json({ ok: true, linked: false, totalSales: 0, totalCommissions: 0, balance: 0, salesCount: 0, sales: [] });
  }

  // 3. Récupérer UNIQUEMENT les ventes de CE créateur (filtre sur sa ligne)
  const { data: salesRows } = await supabaseAdmin
    .from("sales")
    .select("order_amount, commission_amount, created_at, discount_code_used")
    .eq("creator_id", creatorRow.id)
    .order("created_at", { ascending: false });

  const sales = salesRows || [];
  const totalSales = sales.reduce((sum, s) => sum + (Number(s.order_amount) || 0), 0);
  const totalCommissions = sales.reduce((sum, s) => sum + (Number(s.commission_amount) || 0), 0);

  // 4. Nom de la marque (pour affichage, sans exposer d'autres données)
  let brandName: string | null = null;
  const { data: brand } = await supabaseAdmin
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", creatorRow.user_id)
    .maybeSingle();
  if (brand) {
    brandName = brand.business_name || brand.full_name || (brand.username ? `@${brand.username}` : null);
  }

  return NextResponse.json({
    ok: true,
    linked: true,
    brandName,
    discountCode: creatorRow.discount_code || null,
    commissionRate: creatorRow.commission_rate ?? null,
    totalSales,
    totalCommissions,
    balance: Number(creatorRow.balance) || 0,
    totalEarned: Number(creatorRow.total_earned) || 0,
    salesCount: sales.length,
    sales: sales.slice(0, 50).map((s) => ({
      orderAmount: Number(s.order_amount) || 0,
      commissionAmount: Number(s.commission_amount) || 0,
      date: s.created_at,
      discountCode: s.discount_code_used || null,
    })),
  });
}
