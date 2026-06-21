import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildCreatorStatsPayload } from "@/lib/creator-account";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const result = await buildCreatorStatsPayload(supabaseAdmin, userId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
