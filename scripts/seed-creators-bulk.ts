import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { buildSeedTargets } from "@/lib/niche-tree";
import {
  searchTikTokUsersRaw,
  fetchTikTokProfileRaw,
  fetchTikTokVideosRaw,
  parseProfile,
  parseVideos,
  extractCaptions,
} from "@/lib/scrapecreators";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import { classifyCreator } from "@/lib/creator-classify";

config({ path: ".env.local" });

const SEED_TARGET = Number(process.env.SEED_TARGET ?? 1500);
const PER_NICHE = Number(process.env.SEED_PER_NICHE ?? 8);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 5);
const MIN_FOLLOWERS = 5000;
const DRY = process.env.SEED_DRY === "1";
const USE_CLAUDE = Boolean(process.env.ANTHROPIC_API_KEY);

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Target = { q: string; l?: string; c?: string };

// Localized niche keywords -> language/country diversity. Search results for a
// localized term are overwhelmingly in that language, so we tag language/country
// from the term (used as the classification when Claude is unavailable).
const LOCALIZED: Target[] = [
  { q: "musculation", l: "fr", c: "FR" }, { q: "perte de poids", l: "fr", c: "FR" }, { q: "recettes faciles", l: "fr", c: "FR" },
  { q: "maquillage", l: "fr", c: "FR" }, { q: "mode femme", l: "fr", c: "FR" }, { q: "cuisine rapide", l: "fr", c: "FR" }, { q: "finance perso", l: "fr", c: "FR" },
  { q: "fitness mujeres", l: "es", c: "ES" }, { q: "maquillaje", l: "es", c: "ES" }, { q: "recetas", l: "es", c: "ES" },
  { q: "moda", l: "es", c: "ES" }, { q: "finanzas personales", l: "es", c: "ES" }, { q: "perder peso", l: "es", c: "ES" },
  { q: "fitness frauen", l: "de", c: "DE" }, { q: "abnehmen", l: "de", c: "DE" }, { q: "rezepte", l: "de", c: "DE" }, { q: "schminken", l: "de", c: "DE" },
  { q: "emagrecer", l: "pt", c: "BR" }, { q: "receitas", l: "pt", c: "BR" }, { q: "maquiagem", l: "pt", c: "BR" }, { q: "moda masculina", l: "pt", c: "BR" },
  { q: "ricette", l: "it", c: "IT" }, { q: "trucco", l: "it", c: "IT" }, { q: "palestra", l: "it", c: "IT" },
];

type SCUser = {
  unique_id?: string; nickname?: string; follower_count?: number; signature?: string;
  avatar_medium?: { url_list?: string[] }; avatar_168x168?: { url_list?: string[] };
};

async function search(query: string): Promise<SCUser[]> {
  const data = (await searchTikTokUsersRaw(query)) as { user_list?: { user_info?: SCUser }[] };
  return (data?.user_list ?? []).map((u) => u.user_info).filter((u): u is SCUser => !!u && !!u.unique_id);
}

async function enrichAndStore(u: SCUser, t: Target, seen: Set<string>): Promise<"ok" | "skip" | "fail"> {
  const username = String(u.unique_id);
  if (seen.has(username)) return "skip";
  seen.add(username);
  try {
    const [pRaw, vRaw] = await Promise.all([fetchTikTokProfileRaw(username), fetchTikTokVideosRaw(username)]);
    const profile = parseProfile(pRaw);
    const followers = profile.followers || Number(u.follower_count || 0);
    if (followers < MIN_FOLLOWERS) return "skip";
    const videos = parseVideos(vRaw);
    const row = buildEnrichmentRow(username, { ...profile, followers }, videos);

    // Classification: Claude if a key is present, else infer from the localized term.
    let extra: Record<string, unknown> = {
      primary_niche: t.q, niches: [t.q], language: t.l ?? null, country_code: t.c ?? null,
    };
    if (USE_CLAUDE) {
      try {
        const c = await classifyCreator({ displayName: profile.displayName, bio: profile.bio, captions: extractCaptions(vRaw) });
        extra = {
          primary_niche: c.primaryNiche,
          niches: Array.from(new Set([...c.niches, c.primaryNiche, t.q])),
          language: c.language ?? t.l ?? null,
          country_code: c.countryCode ?? t.c ?? null,
          email: c.email,
        };
      } catch { /* fall back to inferred values above */ }
    }

    const avatar =
      u.avatar_medium?.url_list?.[0] || u.avatar_168x168?.url_list?.[0] ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || username)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`;

    if (DRY) {
      console.log(`  DRY ok: @${username} f=${followers} eng=${row.engagement_rate}% views=${row.avg_views} auth=${row.authenticity_score} niche=${extra.primary_niche} lang=${extra.language}`);
      return "ok";
    }
    const { error } = await supa.from("creators_index").upsert({ ...row, avatar_url: avatar, ...extra }, { onConflict: "username" });
    if (error) { console.log(`  upsert error @${username}: ${error.message}`); return "fail"; }
    return "ok";
  } catch (e) {
    if (DRY) console.log(`  DRY fail @${username}: ${e instanceof Error ? e.message : e}`);
    return "fail";
  }
}

async function main() {
  console.log(`Mode: ${DRY ? "DRY (no writes)" : "WRITE"} | classify: ${USE_CLAUDE ? "Claude" : "inferred from term"} | target ${SEED_TARGET}`);
  const seen = new Set<string>();
  if (!DRY) {
    // Resume: skip creators already enriched.
    const { data: existing, error } = await supa.from("creators_index").select("username").eq("enrichment_status", "enriched").limit(20000);
    if (error) { console.error(`Cannot read creators_index (migration applied?): ${error.message}`); process.exit(1); }
    for (const r of existing ?? []) seen.add((r as { username: string }).username);
  }
  let stored = seen.size;
  console.log(`Resume: ${stored} already enriched.`);

  const targets: Target[] = [...buildSeedTargets().map((t) => ({ q: t.query })), ...LOCALIZED];
  for (const t of targets) {
    if (stored >= SEED_TARGET) break;
    let users: SCUser[] = [];
    try { users = await search(t.q); } catch { console.log(`search failed: ${t.q}`); continue; }
    const top = users.sort((a, b) => Number(b.follower_count || 0) - Number(a.follower_count || 0)).slice(0, PER_NICHE);
    for (let i = 0; i < top.length && stored < SEED_TARGET; i += CONCURRENCY) {
      const chunk = top.slice(i, i + CONCURRENCY);
      const res = await Promise.all(chunk.map((u) => enrichAndStore(u, t, seen)));
      stored += res.filter((r) => r === "ok").length;
    }
    console.log(`[${t.q}] stored=${stored}/${SEED_TARGET}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`DONE. ~${stored} creators ${DRY ? "(dry)" : "in creators_index"}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
