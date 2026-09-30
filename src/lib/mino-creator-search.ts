import type { FeedCreator } from "@/lib/discovery-feed";
import {
  liveCreatorSearch,
  liveSearchAvailable,
  queryCatalog,
  type CatalogPlatform,
  type CatalogQuery,
} from "@/lib/catalog-query";
import type { MinoCreatorSearch } from "@/lib/mino-search-parse";

export { describeSearch, parseCreatorSearch, type MinoCreatorSearch } from "@/lib/mino-search-parse";

// Mino's creator search: turns a plain-language ask ("skincare creators in
// France with 50k+ followers") into catalog filters, then tops up from the
// live platform search when the catalog has too few matches.

export type MinoSearchResult = {
  search: MinoCreatorSearch;
  creators: FeedCreator[];
  sources: ("catalog" | "live")[];
};

/** Runs the search: catalog first, live platform search to top up. */
export async function runCreatorSearch(search: MinoCreatorSearch, limit = 12): Promise<MinoSearchResult> {
  const sources: MinoSearchResult["sources"] = [];
  let creators: FeedCreator[] = [];

  const base: CatalogQuery = {
    platform: search.platform,
    minFollowers: search.minFollowers,
    maxFollowers: search.maxFollowers,
    country: search.country,
    hasEmail: search.hasEmail,
    minEngagement: search.minEngagement,
    minViews: search.minViews,
    viral: search.viral,
    sort: search.sort === "growth" ? "growth" : search.viral ? "viral" : "engagement",
    limit,
  };

  if (search.platform !== "Instagram" && search.platform !== "YouTube") {
    const byNiche = search.niche ? await queryCatalog({ ...base, niche: search.niche }) : await queryCatalog(base);
    creators = byNiche.creators;
    if (creators.length === 0 && search.niche) {
      // The niche may be a word the catalog does not tag: try names and handles.
      creators = (await queryCatalog({ ...base, search: search.niche })).creators;
    }
    if (creators.length) sources.push("catalog");
  }

  const livePlatform: CatalogPlatform = search.platform === "Instagram" ? "Instagram" : "TikTok";
  if (creators.length < Math.min(6, limit) && search.niche && search.platform !== "YouTube" && liveSearchAvailable(livePlatform)) {
    const seen = new Set(creators.map((c) => c.username.toLowerCase()));
    const live = (
      await liveCreatorSearch(search.niche, livePlatform, limit, {
        minFollowers: search.minFollowers,
        maxFollowers: search.maxFollowers,
      })
    ).filter((c) => !seen.has(c.username.toLowerCase()));
    if (live.length) {
      creators = [...creators, ...live].slice(0, limit);
      sources.push("live");
    }
  }

  return { search, creators, sources };
}

