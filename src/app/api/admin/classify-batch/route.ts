import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyCreator } from "@/lib/creator-classify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only (service_role header): Claude-classify a batch of creators for
// accurate language/country/email/niche. Runs server-side (Vercel Anthropic
// key). Paginated via ?offset=&limit=. Keeps existing values where Claude is
// unsure (null) so coverage never drops.
export async function GET(req: NextRequest) {
  const provided = (req.headers.get("x-admin-key") || "").trim();
  const allowed = [process.env.ADMIN_TOKEN, process.env.SUPABASE_SERVICE_ROLE_KEY]
    .filter(Boolean)
    .map((k) => (k as string).trim());
  if (!provided || !allowed.includes(provided)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no anthropic key" }, { status: 503 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const p = req.nextUrl.searchParams;
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(50, Math.max(1, Number(p.get("limit")) || 40));

  const { data, error } = await admin
    .from("creators_index")
    .select("username, display_name, bio, language, country_code, email")
    .eq("enrichment_status", "enriched")
    .order("username", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  let updated = 0;
  const CONC = 6;
  for (let i = 0; i < rows.length; i += CONC) {
    await Promise.all(rows.slice(i, i + CONC).map(async (r) => {
      try {
        const c = await classifyCreator({ displayName: r.display_name || r.username, bio: r.bio || "", captions: [] });
        await admin.from("creators_index").update({
          primary_niche: c.primaryNiche,
          niches: Array.from(new Set([...c.niches, c.primaryNiche])),
          language: c.language && c.language !== "unknown" ? c.language : r.language,
          country_code: c.countryCode ?? r.country_code,
          email: c.email ?? r.email,
        }).eq("username", r.username);
        updated++;
      } catch { /* skip this creator */ }
    }));
  }
  return NextResponse.json({ offset, processed: rows.length, updated, done: rows.length < limit });
}
