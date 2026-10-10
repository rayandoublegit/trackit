import { buildSeedTargets, EN_NICHE_QUERIES, FR_NICHE_QUERIES, NICHE_TREE } from "@/lib/niche-tree";
import type { ScrapePlatform } from "./types";

// Weekly discovery: which keywords to search on which platform this week.
// The niche tree gives ~580 queries (English and French, every sub-niche).
// Each week every enabled platform searches the next slice of that list, so
// the whole tree is covered every few weeks on each platform. Keywords typed
// by hand (?discover=a,b) come first. Each search = 1 API call.

export type DiscoveryItem = { platform: ScrapePlatform; keyword: string };

export function weeklyDiscoveryPlan(opts: {
  platforms: ScrapePlatform[];
  maxKeywords: number;
  weekIndex: number;
  extra?: string[];
  queries?: string[];
}): DiscoveryItem[] {
  const platforms = [...new Set(opts.platforms)];
  const max = Math.max(0, Math.floor(opts.maxKeywords));
  if (!platforms.length || !max) return [];
  const out: DiscoveryItem[] = [];
  const seen = new Set<string>();
  const push = (platform: ScrapePlatform, keyword: string) => {
    const k = keyword.trim().toLowerCase();
    const id = `${platform}:${k}`;
    if (!k || seen.has(id) || out.length >= max) return false;
    seen.add(id);
    out.push({ platform, keyword: k });
    return true;
  };

  for (const keyword of opts.extra ?? []) for (const p of platforms) push(p, keyword);

  const queries = [...new Set((opts.queries ?? buildSeedTargets().map((t) => t.query)).map((q) => q.trim().toLowerCase()).filter(Boolean))];
  if (!queries.length) return out;
  const left = max - out.length;
  // Split what is left evenly across platforms (the first ones take the remainder).
  const share = platforms.map((_, i) => Math.floor(left / platforms.length) + (i < left % platforms.length ? 1 : 0));
  platforms.forEach((platform, i) => {
    const n = Math.min(share[i], queries.length);
    const start = (((opts.weekIndex * n) % queries.length) + queries.length) % queries.length;
    for (let j = 0; j < n; j += 1) push(platform, queries[(start + j) % queries.length]);
  });
  return out;
}

// ── Instagram ──────────────────────────────────────────────────────────────────
// Instagram's search returns about 5 accounts per query, most without a
// follower count, so it needs many more (and more precise) queries than TikTok:
// every niche query of the tree plus variants per sub-niche and per country,
// French ones first. Each query = 1 call; the accounts it returns are probed
// (profile call) before they are added. See docs/SCRAPING.md.

/** Country words added to sub-niches, French market first. */
export const INSTAGRAM_COUNTRY_VARIANTS: { country: string; words: string[] }[] = [
  { country: "FR", words: ["france", "paris", "lyon", "marseille", "influenceuse", "blogueuse", "createur", "createurs francais"] },
  { country: "BE", words: ["belgique"] },
  { country: "CH", words: ["suisse"] },
  { country: "CA", words: ["quebec"] },
  { country: "GB", words: ["uk", "london"] },
  { country: "US", words: ["usa", "influencer", "blogger", "creator"] },
  { country: "DE", words: ["deutschland"] },
  { country: "ES", words: ["espana"] },
  { country: "IT", words: ["italia"] },
];

export type InstagramQuery = { keyword: string; country: string | null };

/**
 * Every Instagram search query, French first: the French niche queries, then
 * "<sub-niche> <word>" for each French variant, then the English queries, then
 * the other countries' variants. Deduplicated, lowercase.
 */
export function instagramSearchQueries(): InstagramQuery[] {
  const out: InstagramQuery[] = [];
  const seen = new Set<string>();
  const push = (keyword: string, country: string | null) => {
    const k = keyword.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ keyword: k, country });
  };
  const subNiches = [...new Set(Object.values(NICHE_TREE).flat())];
  for (const queries of Object.values(FR_NICHE_QUERIES)) for (const q of queries) push(q, "FR");
  const [fr, ...others] = INSTAGRAM_COUNTRY_VARIANTS;
  for (const word of fr.words) for (const sub of subNiches) push(/^(influenceuse|blogueuse|createur)/.test(word) ? `${word} ${sub}` : `${sub} ${word}`, "FR");
  for (const queries of Object.values(EN_NICHE_QUERIES)) for (const q of queries) push(q, null);
  for (const { country, words } of others) for (const word of words) for (const sub of subNiches) push(`${sub} ${word}`, country);
  return out;
}
