// One-off: extract contact emails already present in creator bios (free, no API)
// so cards/drawer show a real "✉ email" instead of "Contact via DM".
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

async function main() {
  const updates: { username: string; email: string }[] = [];
  let scanned = 0;
  for (let page = 0; ; page++) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, bio, email")
      .eq("enrichment_status", "enriched")
      .order("username", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) { console.error(error.message); process.exit(1); }
    const rows = data ?? [];
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const r of rows) {
      if (r.email) continue;
      const m = (r.bio ?? "").match(EMAIL_RE);
      if (m) updates.push({ username: r.username, email: m[0].toLowerCase() });
    }
    if (rows.length < 1000) break;
  }
  console.log(`scanned ${scanned}, found ${updates.length} new emails`);

  const CHUNK = 25;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await Promise.all(updates.slice(i, i + CHUNK).map((u) =>
      supa.from("creators_index").update({ email: u.email }).eq("username", u.username)
    ));
  }
  console.log(`DONE. set ${updates.length} emails.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
