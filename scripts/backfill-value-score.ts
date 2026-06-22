// One-off: compute + store value_score (rentabilité) from existing metrics so
// the feed can sort by it in the DB. Free (no API). Run after the value_score
// migration is applied.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { valueScore } from "@/lib/creator-value";

config({ path: ".env.local" });

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  let total = 0;
  for (let page = 0; ; page++) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, followers, engagement_rate, avg_views")
      .eq("enrichment_status", "enriched")
      .order("username", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) { console.error(error.message); process.exit(1); }
    const rows = data ?? [];
    if (rows.length === 0) break;
    const ups = rows.map((r) => ({
      username: r.username,
      value_score: valueScore(Number(r.followers || 0), Number(r.engagement_rate || 0), Number(r.avg_views || 0)),
    }));
    const CHUNK = 25;
    for (let i = 0; i < ups.length; i += CHUNK) {
      await Promise.all(ups.slice(i, i + CHUNK).map((u) =>
        supa.from("creators_index").update({ value_score: u.value_score }).eq("username", u.username)
      ));
    }
    total += rows.length;
    console.log(`page ${page}: ${rows.length} (total ${total})`);
    if (rows.length < 1000) break;
  }
  console.log(`DONE. value_score set for ${total} creators.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
