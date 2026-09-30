-- Catalog and video library filters.
--
-- 1. Per-creator video stats on creators_index (median / best video views and
--    the number of viral videos), kept up to date by triggers so the catalog can
--    filter and sort on them with a plain indexed query. No scraper change needed:
--    any write to creator_videos refreshes the stats of the creators it touched.
-- 2. creator_videos.product_url: the product a video links to (filled by the
--    scraper when the source exposes it; has_product_link stays the flag).
-- 3. creator_video_library: every tracked video with its creator's niche,
--    country, language and a viral flag, so the video library filters in one query.
--
-- Viral video (one rule everywhere, see src/lib/viral.ts):
--   views >= greatest(100 000, 5 x the creator's median views)
--   The median needs at least 3 videos with views; without it nothing is called viral.
--
-- Platform values vary in case in production ('TikTok' and 'tiktok') until
-- migration 000046 normalizes them: every comparison below lowercases both
-- sides, so this file works applied before or after 000046.

-- 1. The rule ------------------------------------------------------------------
create or replace function public.is_viral_video(p_views bigint, p_median_views numeric)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_median_views is not null
     and p_median_views > 0
     and coalesce(p_views, 0) >= greatest(100000, 5 * p_median_views)
$$;

comment on function public.is_viral_video(bigint, numeric) is
  'Viral video: views >= max(100K, 5x the creator median views). Unknown median = not viral.';

-- 2. Columns -------------------------------------------------------------------
alter table public.creators_index
  add column if not exists videos_tracked integer not null default 0,
  add column if not exists median_video_views bigint,
  add column if not exists max_video_views bigint,
  add column if not exists viral_videos integer,
  add column if not exists last_viral_at timestamptz;

comment on column public.creators_index.videos_tracked is 'Videos stored in creator_videos; 0 = stats come from top_videos';
comment on column public.creators_index.median_video_views is 'Median views per video (tracked videos, else avg_views when 3+ posts were analyzed)';
comment on column public.creators_index.viral_videos is 'Videos with views >= max(100K, 5x median). Null when the median is unknown';

alter table public.creator_videos
  add column if not exists product_url text,
  -- Also added by 000046 (short / long / photo / carousel); here so the view below
  -- exists whatever the order the two migrations are applied in.
  add column if not exists format text;

comment on column public.creator_videos.product_url is 'Product the video links to (TikTok Shop anchor, etc.) when the source exposes it';

create index if not exists creators_index_lower_username_idx on public.creators_index (lower(username));
create index if not exists creators_index_viral_idx on public.creators_index (viral_videos desc nulls last);
create index if not exists creators_index_max_video_views_idx on public.creators_index (max_video_views desc nulls last);
create index if not exists creator_videos_username_idx on public.creator_videos (username);

-- 3. Stats from tracked videos -------------------------------------------------
create or replace function public.refresh_creator_video_stats(p_platform text, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform text := lower(coalesce(p_platform, 'tiktok'));
  v_username text := lower(p_username);
  v_count integer;
  v_sample integer;
  v_median numeric;
  v_max bigint;
  v_viral integer;
  v_last timestamptz;
begin
  select count(*),
         count(*) filter (where views > 0),
         percentile_cont(0.5) within group (order by views) filter (where views > 0),
         max(views)
    into v_count, v_sample, v_median, v_max
    from creator_videos
   where username = v_username and lower(platform) = v_platform;

  if coalesce(v_sample, 0) < 3 then
    v_median := null;
  end if;

  if v_median is not null then
    select count(*), max(posted_at)
      into v_viral, v_last
      from creator_videos
     where username = v_username and lower(platform) = v_platform
       and is_viral_video(views, v_median);
  end if;

  update creators_index c
     set videos_tracked = coalesce(v_count, 0),
         median_video_views = round(v_median)::bigint,
         max_video_views = v_max,
         viral_videos = v_viral,
         last_viral_at = v_last
   where lower(c.username) = v_username
     and lower(coalesce(c.platform, 'tiktok')) = v_platform;
end;
$$;

revoke all on function public.refresh_creator_video_stats(text, text) from public, anon, authenticated;

-- One refresh per creator touched by a statement (an upsert of 30 videos = 1).
create or replace function public.creator_videos_refresh_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select distinct lower(platform) as platform, lower(username) as username from changed_rows loop
    perform refresh_creator_video_stats(r.platform, r.username);
  end loop;
  return null;
end;
$$;

revoke all on function public.creator_videos_refresh_stats() from public, anon, authenticated;

drop trigger if exists creator_videos_stats_ins on public.creator_videos;
drop trigger if exists creator_videos_stats_upd on public.creator_videos;
drop trigger if exists creator_videos_stats_del on public.creator_videos;
create trigger creator_videos_stats_ins after insert on public.creator_videos
  referencing new table as changed_rows for each statement execute function public.creator_videos_refresh_stats();
create trigger creator_videos_stats_upd after update on public.creator_videos
  referencing new table as changed_rows for each statement execute function public.creator_videos_refresh_stats();
create trigger creator_videos_stats_del after delete on public.creator_videos
  referencing old table as changed_rows for each statement execute function public.creator_videos_refresh_stats();

-- 4. Stats for creators without tracked videos: their stored top videos --------
-- top_videos holds up to 9 best recent videos (playCount, createTime);
-- avg_views is the median of the latest posts when posts_analyzed > 0.
create or replace function public.creators_index_top_video_stats()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_median numeric;
  v_max bigint;
  v_viral integer;
  v_last double precision;
begin
  if coalesce(new.videos_tracked, 0) > 0 then
    return new;
  end if;
  v_median := case when coalesce(new.posts_analyzed, 0) >= 3 and coalesce(new.avg_views, 0) > 0 then new.avg_views end;

  select max(t.views),
         count(*) filter (where is_viral_video(t.views, v_median)),
         max(t.created) filter (where is_viral_video(t.views, v_median))
    into v_max, v_viral, v_last
    from (
      select case when (e ->> 'playCount') ~ '^[0-9]+(\.[0-9]+)?$' then (e ->> 'playCount')::numeric::bigint end as views,
             case when (e ->> 'createTime') ~ '^[0-9]+(\.[0-9]+)?$' then (e ->> 'createTime')::double precision end as created
        from jsonb_array_elements(case when jsonb_typeof(new.top_videos) = 'array' then new.top_videos else '[]'::jsonb end) e
    ) t
   where t.views is not null;

  new.median_video_views := round(v_median)::bigint;
  new.max_video_views := v_max;
  new.viral_videos := case when v_median is null or v_max is null then null else v_viral end;
  new.last_viral_at := case when v_last > 0 then to_timestamp(v_last) end;
  return new;
end;
$$;

drop trigger if exists creators_index_top_video_stats on public.creators_index;
create trigger creators_index_top_video_stats
  before insert or update of top_videos, avg_views, posts_analyzed, videos_tracked on public.creators_index
  for each row execute function public.creators_index_top_video_stats();

-- 5. Backfill ------------------------------------------------------------------
update public.creators_index set top_videos = top_videos where videos_tracked = 0;
select public.refresh_creator_video_stats(s.platform, s.username)
  from (select distinct lower(platform) as platform, lower(username) as username from public.creator_videos) s;

-- 6. The video library ---------------------------------------------------------
-- security_invoker: the caller's rights apply (server-only, like creator_videos).
-- creator_videos.username is the creator's storage key (creators_index.username).
create or replace view public.creator_video_library with (security_invoker = true) as
select
  v.platform,
  v.video_id,
  v.username,
  v.posted_at,
  v.caption,
  v.hashtags,
  v.duration_seconds,
  v.media_type,
  -- short (TikTok, Reels, Shorts) / long (YouTube videos over 3 min) / photo / carousel.
  coalesce(v.format, case
    when v.media_type in ('photo', 'carousel') then v.media_type
    when lower(v.platform) = 'youtube' and coalesce(v.duration_seconds, 0) > 180 then 'long'
    else 'short'
  end) as format,
  v.cover_url,
  v.share_url,
  v.music_title,
  v.is_ad,
  v.has_product_link,
  v.product_url,
  (v.has_product_link or coalesce(v.product_url, '') ~* '^https?://') as has_product,
  v.views,
  v.likes,
  v.comments,
  v.shares,
  v.saves,
  v.views_gained_7d,
  v.engagement_rate,
  v.first_seen_at,
  v.last_scraped_at,
  c.display_name,
  c.avatar_url,
  c.followers,
  c.primary_niche,
  lower(c.primary_niche) as niche_key,
  coalesce(c.niches, '{}') as niches,
  upper(c.country_code) as country_code,
  lower(c.language) as language,
  c.median_video_views as creator_median_views,
  public.is_viral_video(v.views, c.median_video_views) as is_viral
from public.creator_videos v
left join public.creators_index c
  on c.username = v.username
 and lower(coalesce(c.platform, 'tiktok')) = lower(v.platform);

revoke all on public.creator_video_library from anon, authenticated;
