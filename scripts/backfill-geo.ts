// One-off: give creators a language + (proxy) country so the Localisation /
// Langue filters return results. TikTok exposes no location and most data has
// null language; we detect language from bio+name and map to the dominant
// country. Approximate by design — the deployed enrich cron refines it with
// Claude over time (which overwrites these values).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { franc } from "franc-min";

config({ path: ".env.local" });

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const L3to1: Record<string, string> = { fra: "fr", spa: "es", deu: "de", por: "pt", ita: "it", eng: "en", nld: "nl" };
const LANG_TO_COUNTRY: Record<string, string> = { fr: "FR", es: "ES", de: "DE", pt: "BR", it: "IT", en: "US" };

async function main() {
  const { data, error } = await supa
    .from("creators_index")
    .select("username, bio, display_name, primary_niche")
    .eq("enrichment_status", "enriched")
    .is("language", null)
    .limit(5000);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = data ?? [];
  console.log(`to process: ${rows.length}`);

  const updates: { username: string; language: string; country_code: string }[] = [];
  for (const r of rows) {
    const text = `${r.bio ?? ""} ${r.display_name ?? ""} ${r.primary_niche ?? ""}`.trim();
    const code3 = text.length >= 12 ? franc(text, { minLength: 12 }) : "und";
    const lang = L3to1[code3];
    if (!lang) continue;
    const country = LANG_TO_COUNTRY[lang];
    if (!country) continue;
    updates.push({ username: r.username, language: lang, country_code: country });
  }

  const CHUNK = 25;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await Promise.all(updates.slice(i, i + CHUNK).map((u) =>
      supa.from("creators_index").update({ language: u.language, country_code: u.country_code }).eq("username", u.username)
    ));
    if (i % 250 === 0) console.log(`updated ${i}/${updates.length}`);
  }
  const byLang: Record<string, number> = {};
  for (const u of updates) byLang[u.language] = (byLang[u.language] || 0) + 1;
  console.log(`DONE. set ${updates.length} of ${rows.length}. by language:`, JSON.stringify(byLang));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
