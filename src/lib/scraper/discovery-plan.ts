import { buildSeedTargets } from "@/lib/niche-tree";
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
