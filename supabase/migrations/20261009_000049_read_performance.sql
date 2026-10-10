-- Read performance: the creator page, the video library and the catalog sorts
-- on a catalog of ~100,000 creators.
--
-- Indexes only (no data change, no new column), all idempotent. Each one
-- matches a query in src/lib/creator-intel-read.ts or src/lib/catalog-query.ts:
--
-- Creator page (readCreatorProfile)
--   creator_snapshots  where username = $1 [and platform ilike $2] order by captured_on
--     The primary key starts with platform, which the code compares without
--     case (ilike), so it could not serve this read: every page open scanned
--     the whole table. Now an index range on username.
--   creator_videos     where username = $1 [...] order by posted_at desc nulls last limit 60
--   creators_index     "similar": primary_niche in (spellings) and followers between
--                      f/4 and 4f, top 8 by engagement.
--
-- Video library (readVideoLibrary, view creator_video_library)
--   creator_videos     order by views desc, video_id               (default sort)
--                      order by posted_at desc nulls last, views…  (recent)
--                      order by engagement_rate desc nulls last…   (engagement)
--     The existing (posted_at desc) index is NULLS FIRST, so it could not serve
--     "desc nulls last"; same for a plain (views desc) with the video_id tie-break.
--   creators_index     stored top videos fallback: top 120 by avg_views desc
--                      nulls last among creators with top_videos (also the
--                      catalog "views" sort index).
--
-- Catalog sorts (queryCatalog): every sort is "<col> desc nulls last", then
-- followers, then username. The indexes from 000015 are "desc" (NULLS FIRST)
-- and could not serve them; growth / viral / views_30d already had nulls-last
-- indexes (000044, 000047).
--
-- Works whether or not 000046 / 000047 are applied (only columns from 000015
-- and 000044 are used). Building them takes a few seconds on 100K creators and
-- briefly blocks writes to the table being indexed: apply outside a scrape run.

-- Creator page ------------------------------------------------------------------
create index if not exists creator_snapshots_username_day_idx
  on public.creator_snapshots (username, captured_on);

create index if not exists creator_videos_username_posted_idx
  on public.creator_videos (username, posted_at desc nulls last);

create index if not exists creators_index_niche_followers_idx
  on public.creators_index (primary_niche, followers);

-- Video library -----------------------------------------------------------------
create index if not exists creator_videos_views_id_idx
  on public.creator_videos (views desc, video_id);
-- Superseded by creator_videos_views_id_idx (same leading column).
drop index if exists public.creator_videos_views_idx;

create index if not exists creator_videos_recent_idx
  on public.creator_videos (posted_at desc nulls last, views desc, video_id);

create index if not exists creator_videos_engagement_idx
  on public.creator_videos (engagement_rate desc nulls last, views desc, video_id);

-- The stored top videos fallback (top 120 creators by avg_views desc nulls
-- last) uses creators_index_avg_views_nl_idx below.

-- Catalog sorts -----------------------------------------------------------------
create index if not exists creators_index_curated_followers_idx
  on public.creators_index (is_curated desc nulls last, followers desc nulls last, username);

create index if not exists creators_index_followers_nl_idx
  on public.creators_index (followers desc nulls last, username);

create index if not exists creators_index_engagement_nl_idx
  on public.creators_index (engagement_rate desc nulls last);

create index if not exists creators_index_avg_views_nl_idx
  on public.creators_index (avg_views desc nulls last);

create index if not exists creators_index_reach_nl_idx
  on public.creators_index (views_per_follower desc nulls last);

create index if not exists creators_index_last_post_nl_idx
  on public.creators_index (last_post_at desc nulls last);

analyze public.creators_index;
analyze public.creator_videos;
analyze public.creator_snapshots;
