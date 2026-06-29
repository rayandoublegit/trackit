import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { enrichCreatorsForUser } from "@/lib/enrich-creator-avatars";

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
    .select(
      "id, handle, full_name, avatar_url, platform, followers, engagement_rate, balance, total_earned, total_sales, discount_code, paypal_link, revolut_link, iban, stripe_account_id, email"
    )
    .eq("user_id", userId)
    .order("balance", { ascending: false });

  const enriched = await enrichCreatorsForUser(supabaseAdmin, userId, data ?? []);
  return NextResponse.json(enriched);
}
