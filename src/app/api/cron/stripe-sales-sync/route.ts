import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { runStripeSalesSync } from "@/lib/stripe-sales-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const admin = createClient(url, key);
    const report = await runStripeSalesSync(admin);
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("stripe-sales-sync cron error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 },
    );
  }
}
