import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json([]);

  const { data } = await supabaseAdmin
    .from("creators")
    .select("id, handle, full_name, avatar_url, platform, balance, total_earned, total_sales, discount_code, paypal_link, revolut_link, iban")
    .eq("user_id", userId)
    .order("balance", { ascending: false });

  return NextResponse.json(data || []);
}
