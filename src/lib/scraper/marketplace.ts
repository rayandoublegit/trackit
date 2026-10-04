// TikTok Creator Marketplace listing through ScrapeCreators
// (GET /v1/tiktok/creators/popular, 1 credit per page of 20): creators only (no
// brand pages), filtered by the creator's country and follower range, with the
// country TikTok has on file. It walks deep: each page that still brings new
// creators queues the next one, so the base grows far past what keyword
// searches (≈30 accounts each, no next page) can reach.
//
// A walk is a creator_discover job whose target is
//   market:<COUNTRY>:<FOLLOWER RANGE>:<SORT>:<PAGE>     e.g. market:FR:10K-100K:follower:1

export const MARKET_COUNTRIES = [
  "FR", "GB", "US", "DE", "ES", "IT", "CA", "BR", "AU", "TR", "AE", "SA",
  "EG", "ID", "PH", "MY", "TH", "VN", "JP", "KR", "TW", "SG", "IL", "RU",
] as const;
export const MARKET_RANGES = ["10K-100K", "100K-1M", "1M-10M"] as const;
export const MARKET_SORTS = ["follower", "engagement", "avg_views"] as const;

export type MarketTarget = { country: string; range: string; sort: string; page: number };

const PREFIX = "market:";

export function isMarketTarget(target: string): boolean {
  return target.startsWith(PREFIX);
}

export function marketTarget(t: MarketTarget): string {
  return `${PREFIX}${t.country}:${t.range}:${t.sort}:${t.page}`;
}

export function parseMarketTarget(target: string): MarketTarget | null {
  if (!isMarketTarget(target)) return null;
  const [country, range, sort, page] = target.slice(PREFIX.length).split(":");
  const n = Math.floor(Number(page));
  if (!(MARKET_COUNTRIES as readonly string[]).includes(country)) return null;
  if (!(MARKET_RANGES as readonly string[]).includes(range) && range !== "10M+") return null;
  if (!(MARKET_SORTS as readonly string[]).includes(sort)) return null;
  if (!Number.isFinite(n) || n < 1) return null;
  return { country, range, sort, page: n };
}

export type MarketCreator = { username: string; displayName: string; followers: number; countryCode: string | null; avatarUrl: string };

/** Handle from a TikTok profile link ("https://www.tiktok.com/@name" → "name"). */
export function handleFromTikTokLink(link: unknown): string {
  const m = String(link ?? "").match(/tiktok\.com\/@([A-Za-z0-9._]+)/);
  return m ? m[1].toLowerCase() : "";
}

export function parseMarketPage(raw: any): { creators: MarketCreator[]; hasMore: boolean } {
  const list: any[] = Array.isArray(raw?.creators) ? raw.creators : [];
  const creators = list
    .map((c) => ({
      username: handleFromTikTokLink(c?.tt_link),
      displayName: String(c?.nick_name ?? ""),
      followers: Number(c?.follower_cnt) || 0,
      countryCode: /^[A-Z]{2}$/.test(String(c?.country_code ?? "").toUpperCase()) ? String(c.country_code).toUpperCase() : null,
      avatarUrl: typeof c?.avatar_url === "string" ? c.avatar_url : "",
    }))
    .filter((c) => c.username);
  return { creators, hasMore: Boolean(raw?.pagination?.has_more) };
}

/** Every walk to start, French creators first, then by country, range and sort. */
export function marketSeeds(countries: readonly string[] = MARKET_COUNTRIES): MarketTarget[] {
  const out: MarketTarget[] = [];
  for (const country of countries) for (const range of MARKET_RANGES) for (const sort of MARKET_SORTS) out.push({ country, range, sort, page: 1 });
  return out;
}

/**
 * Next page to walk, or null. A walk goes on while pages bring new creators
 * (or for its first 3 pages), up to maxPage.
 */
export function nextMarketPage(t: MarketTarget, hasMore: boolean, added: number, maxPage: number): MarketTarget | null {
  if (!hasMore || t.page >= maxPage) return null;
  if (added === 0 && t.page >= 3) return null;
  return { ...t, page: t.page + 1 };
}
