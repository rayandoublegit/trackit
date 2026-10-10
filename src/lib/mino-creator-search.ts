import type { FeedCreator } from "@/lib/discovery-feed";
import {
  liveCreatorSearch,
  liveSearchAvailable,
  nicheClause,
  queryCatalog,
  type CatalogPlatform,
  type CatalogQuery,
} from "@/lib/catalog-query";
import type { MinoCreatorSearch } from "@/lib/mino-search-parse";
import { nicheKeyFor } from "@/lib/mino-filters";

export { describeSearch, parseCreatorSearch, type MinoCreatorSearch } from "@/lib/mino-search-parse";

// Mino's creator search: turns a plain-language ask ("skincare creators in
// France with 50k+ followers") into catalog filters, then tops up from the
// live platform search when the catalog has too few matches.

export type MinoSearchResult = {
  search: MinoCreatorSearch;
  creators: FeedCreator[];
  sources: ("catalog" | "live")[];
};

/** Keeps stored chats light: only what the profile cards render (3 videos) and saving needs. */
export function cardCreator(c: FeedCreator): FeedCreator {
  const topVideos = (c.topVideos ?? []).filter((v) => v.cover || v.shareUrl).slice(0, 3);
  return {
    ...c,
    bio: (c.bio || "").slice(0, 160),
    // Live search results carry thumbnails but no top videos: keep a few to play.
    videoThumbnails: topVideos.length ? [] : (c.videoThumbnails ?? []).filter((v) => v.thumbnail).slice(0, 3),
    topVideos,
  };
}

/** Email-first, keeping the catalog order otherwise (stable sort). */
export function emailFirst(creators: FeedCreator[]): FeedCreator[] {
  return creators
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(Boolean(b.c.email)) - Number(Boolean(a.c.email)) || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * Runs the search: catalog first (TikTok, Instagram and YouTube rows all live
 * in creators_index), live platform search to top up.
 * `preferEmail` ranks creators with a known email first without requiring one.
 */
export async function runCreatorSearch(
  search: MinoCreatorSearch,
  limit = 12,
  opts: { preferEmail?: boolean; /** False (Free): catalog only, never a live platform search. Default true. */ allowLive?: boolean } = {},
): Promise<MinoSearchResult> {
  const sources: MinoSearchResult["sources"] = [];
  let creators: FeedCreator[] = [];

  const base: CatalogQuery = {
    platform: search.platform,
    minFollowers: search.minFollowers,
    maxFollowers: search.maxFollowers,
    country: search.country,
    language: search.language,
    hasEmail: search.hasEmail,
    minEngagement: search.minEngagement,
    minViews: search.minViews,
    viral: search.viral,
    sort: search.sort === "growth" ? "growth" : search.viral ? "viral" : "engagement",
    limit,
  };

  // A niche the catalog has no tag for ("cosmétiques") is read as its parent niche ("beauty").
  const niche = search.niche && !nicheClause(search.niche) ? nicheKeyFor(search.niche) || search.niche : search.niche;
  const byNiche = niche ? await queryCatalog({ ...base, niche }) : await queryCatalog(base);
  creators = byNiche.creators;
  if (creators.length === 0 && search.niche) {
    // The niche may be a word the catalog does not tag: try names and handles.
    creators = (await queryCatalog({ ...base, search: search.niche })).creators;
  }
  if (creators.length) sources.push("catalog");

  const livePlatform: CatalogPlatform = search.platform === "Instagram" ? "Instagram" : "TikTok";
  if (opts.allowLive !== false && creators.length < Math.min(6, limit) && search.niche && search.platform !== "YouTube" && liveSearchAvailable(livePlatform)) {
    const seen = new Set(creators.map((c) => `${c.platform}:${c.username}`.toLowerCase()));
    const live = (
      await liveCreatorSearch(search.niche, livePlatform, limit, {
        minFollowers: search.minFollowers,
        maxFollowers: search.maxFollowers,
      })
    )
      .filter((c) => !seen.has(`${c.platform}:${c.username}`.toLowerCase()))
      // Asked for an email: a live hit without one does not answer the ask.
      .filter((c) => !search.hasEmail || Boolean(c.email));
    if (live.length) {
      creators = [...creators, ...live].slice(0, limit);
      sources.push("live");
    }
  }

  return { search, creators: opts.preferEmail ? emailFirst(creators) : creators, sources };
}
