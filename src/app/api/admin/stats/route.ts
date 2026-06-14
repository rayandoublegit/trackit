import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = "trackit_admin_2026";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Per-niche curation targets. Edit these numbers as you grow.
const NICHE_TARGETS: Record<string, number> = {
  food: 50, beauty: 80, fitness: 60, fashion: 80, lifestyle: 60,
  tech: 40, gaming: 50, travel: 40, family: 40, pets: 30,
};
const DEFAULT_TARGET = 50;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("creators_index")
    .select("niches, platform, followers, language");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.length;
  const curated = rows.filter(r => (r.niches || []).includes("curated")).length;

  const byPlatform: Record<string, number> = {};
  const nicheCounts: Record<string, { total: number; curated: number; min: number; max: number; under10k: number; from10kto100k: number; over100k: number }> = {};

  for (const r of rows) {
    const p = r.platform || "unknown";
    byPlatform[p] = (byPlatform[p] || 0) + 1;

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

  const niches = Object.entries(nicheCounts)
    .map(([niche, c]) => ({
      niche,
      ...c,
      target: NICHE_TARGETS[niche] ?? DEFAULT_TARGET,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    ok: true,
    total,
    curated,
    byPlatform,
    niches,
  });
}
