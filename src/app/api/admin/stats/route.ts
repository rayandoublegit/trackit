import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = "trackit_admin_2026";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Official Trackit niches (from the discovery dropdown). Only these are tracked.
const OFFICIAL_NICHES = ["fitness", "fashion", "beauty", "tech", "food", "travel"];
const TARGET_PER_NICHE = 100;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Supabase caps .select() at 1000 rows by default. Paginate to read the whole table.
  const rows: { niches: string[] | null; platform: string | null; followers: number | null }[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("creators_index")
      .select("niches, platform, followers")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const total = rows.length;
  // Total curated = distinct creators carrying the "curated" tag.
  const curated = rows.filter(r => (r.niches || []).includes("curated")).length;

  // Per niche: same logic as the reference SQL (unnest of niches).
  // A creator tagged ["curated","fitness"] counts in fitness; counted in each of its niches.
  const nicheCounts: Record<string, { total: number; curated: number; min: number; max: number; under10k: number; from10kto100k: number; over100k: number }> = {};

  for (const r of rows) {
    const f = Number(r.followers) || 0;
    const isCur = (r.niches || []).includes("curated");
    for (const n of (r.niches || [])) {
      if (n === "curated") continue;
      if (!nicheCounts[n]) nicheCounts[n] = { total: 0, curated: 0, min: f, max: f, under10k: 0, from10kto100k: 0, over100k: 0 };
      const nc = nicheCounts[n];
      nc.total++;
      if (isCur) nc.curated++;
      nc.min = Math.min(nc.min, f);
      nc.max = Math.max(nc.max, f);
      if (f < 10000) nc.under10k++;
      else if (f < 100000) nc.from10kto100k++;
      else nc.over100k++;
    }
  }

  const niches = OFFICIAL_NICHES.map(niche => {
    const c = nicheCounts[niche] || { total: 0, curated: 0, min: 0, max: 0, under10k: 0, from10kto100k: 0, over100k: 0 };
    return { niche, ...c, target: TARGET_PER_NICHE };
  }).sort((a, b) => a.curated - b.curated);

  return NextResponse.json({ ok: true, total, curated, niches });
}
