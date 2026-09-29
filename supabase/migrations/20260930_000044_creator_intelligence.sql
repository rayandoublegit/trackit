-- Creator intelligence: the long-term data behind the catalog.
--
-- creators_index stays the "current state" row per creator that the app reads.
-- Around it:
--   creator_snapshots        one row per creator per day (followers, likes, …)
--   creator_videos           every video we have seen, with its latest numbers
--   creator_video_snapshots  one row per video per day (views, likes, …)
--   scrape_jobs              the work queue the scraping cron drains
--   scrape_runs              one row per cron run (volume, API calls, errors)
-- Growth, 30-day views and ranks are precomputed into creators_index by
-- refresh_creator_rollup(), so reading the catalog never calls a scraping API.
--
-- Everything here is server-only: RLS on, no policies, no grants to anon or
-- authenticated. The app reads through service-role API routes.

-- 1. Current-state columns: identity, scheduling and precomputed rollups -------
alter table public.creators_index
  add column if not exists following bigint,
  add column if not exists total_likes bigint,
  add column if not exists video_count integer,
  add column if not exists is_verified boolean,
  add column if not exists bio_link text,
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists last_scraped_at timestamptz,
  add column if not exists next_scrape_at timestamptz,
  add column if not exists scrape_priority smallint not null default 5,
  add column if not exists scrape_failures smallint not null default 0,
  add column if not exists followers_7d_ago bigint,
  add column if not exists followers_30d_ago bigint,
  add column if not exists followers_growth_7d bigint,
  add column if not exists followers_growth_30d bigint,
  add column if not exists followers_growth_pct_7d numeric,
  add column if not exists followers_growth_pct_30d numeric,
  add column if not exists views_30d bigint,
  add column if not exists posts_30d integer,
  add column if not exists avg_views_30d bigint,
  add column if not exists views_gained_7d bigint,
  add column if not exists growth_score numeric,
  add column if not exists history_days integer not null default 0;

comment on column public.creators_index.scrape_priority is '1 = refresh most often, 9 = least often';
comment on column public.creators_index.growth_score is 'Rank for "Top scaling": follower growth, views gained and fresh output, blended';
comment on column public.creators_index.history_days is 'Days of snapshots we hold; growth figures need at least 7';

create index if not exists creators_index_next_scrape_idx
  on public.creators_index (next_scrape_at nulls first, scrape_priority);
create index if not exists creators_index_growth_idx on public.creators_index (growth_score desc nulls last);
create index if not exists creators_index_growth_pct_30d_idx on public.creators_index (followers_growth_pct_30d desc nulls last);
create index if not exists creators_index_views_30d_idx on public.creators_index (views_30d desc nulls last);
create index if not exists creators_index_views_gained_7d_idx on public.creators_index (views_gained_7d desc nulls last);

-- 2. Daily creator snapshots -------------------------------------------------
create table if not exists public.creator_snapshots (
  platform text not null,
  username text not null,
  captured_on date not null default current_date,
  captured_at timestamptz not null default now(),
  followers bigint,
  following bigint,
  total_likes bigint,
  video_count integer,
  avg_views bigint,
  engagement_rate numeric,
  primary key (platform, username, captured_on)
);
create index if not exists creator_snapshots_day_idx on public.creator_snapshots (captured_on);

-- 3. Videos --------------------------------------------------------------------
create table if not exists public.creator_videos (
  platform text not null,
  video_id text not null,
  username text not null,
  posted_at timestamptz,
  caption text,
  hashtags text[] not null default '{}',
  duration_seconds integer,
  media_type text not null default 'video',
  cover_url text,
  share_url text,
  music_title text,
  is_ad boolean not null default false,
  has_product_link boolean not null default false,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  views_gained_7d bigint,
  engagement_rate numeric,
  first_seen_at timestamptz not null default now(),
  last_scraped_at timestamptz not null default now(),
  primary key (platform, video_id),
  constraint creator_videos_media_type_chk check (media_type in ('video', 'photo', 'carousel'))
);
create index if not exists creator_videos_creator_idx on public.creator_videos (platform, username, posted_at desc);
create index if not exists creator_videos_posted_idx on public.creator_videos (posted_at desc);
create index if not exists creator_videos_views_idx on public.creator_videos (views desc);
create index if not exists creator_videos_gained_idx on public.creator_videos (views_gained_7d desc nulls last);
create index if not exists creator_videos_hashtags_idx on public.creator_videos using gin (hashtags);
create index if not exists creator_videos_caption_idx on public.creator_videos using gin (to_tsvector('simple', coalesce(caption, '')));

-- 4. Daily video snapshots ----------------------------------------------------
create table if not exists public.creator_video_snapshots (
  platform text not null,
  video_id text not null,
  captured_on date not null default current_date,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  primary key (platform, video_id, captured_on)
);
create index if not exists creator_video_snapshots_day_idx on public.creator_video_snapshots (captured_on);

-- 5. Scrape queue -------------------------------------------------------------
create table if not exists public.scrape_jobs (
  id bigserial primary key,
  kind text not null,
  platform text not null default 'tiktok',
  target text not null,
  priority smallint not null default 5,
  status text not null default 'queued',
  attempts smallint not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint scrape_jobs_kind_chk check (kind in ('creator_refresh', 'creator_discover')),
  constraint scrape_jobs_status_chk check (status in ('queued', 'running', 'done', 'failed'))
);
-- One live job per target: re-enqueueing is a no-op while it waits or runs.
create unique index if not exists scrape_jobs_live_uq
  on public.scrape_jobs (kind, platform, target) where status in ('queued', 'running');
create index if not exists scrape_jobs_pick_idx on public.scrape_jobs (status, priority, run_after);
create index if not exists scrape_jobs_finished_idx on public.scrape_jobs (finished_at);

-- 6. Run log --------------------------------------------------------------------
create table if not exists public.scrape_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text,
  jobs_claimed integer not null default 0,
  jobs_done integer not null default 0,
  jobs_failed integer not null default 0,
  api_calls integer not null default 0,
  creators_new integer not null default 0,
  videos_upserted integer not null default 0,
  notes jsonb
);

-- 7. Server-only access ---------------------------------------------------------
alter table public.creator_snapshots enable row level security;
alter table public.creator_videos enable row level security;
alter table public.creator_video_snapshots enable row level security;
alter table public.scrape_jobs enable row level security;
alter table public.scrape_runs enable row level security;
revoke all on public.creator_snapshots, public.creator_videos, public.creator_video_snapshots,
  public.scrape_jobs, public.scrape_runs from anon, authenticated;

-- 8. Queue functions ------------------------------------------------------------

-- Queue every creator whose refresh is due, most important first.
create or replace function public.enqueue_due_creators(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into scrape_jobs (kind, platform, target, priority)
  select 'creator_refresh', lower(coalesce(c.platform, 'tiktok')), lower(c.username), c.scrape_priority
  from creators_index c
  where coalesce(c.next_scrape_at, 'epoch'::timestamptz) <= now()
    and c.scrape_failures < 5
    and c.username is not null
  order by c.scrape_priority, c.next_scrape_at nulls first
  limit greatest(p_limit, 0)
  on conflict (kind, platform, target) where status in ('queued', 'running') do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Claim a batch atomically; concurrent runs never get the same job.
create or replace function public.claim_scrape_jobs(p_limit integer default 20, p_kinds text[] default array['creator_refresh', 'creator_discover'])
returns setof public.scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A run that died mid-way leaves jobs "running": give them back after 15 minutes.
  update scrape_jobs
     set status = 'queued', locked_at = null
   where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  update scrape_jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1
   where j.id in (
     select id from scrape_jobs
      where status = 'queued' and run_after <= now() and kind = any(p_kinds)
      order by priority, run_after
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning j.*;
end;
$$;

-- 9. Rollups: turn history into the numbers the catalog sorts on ---------------
create or replace function public.refresh_creator_rollup(p_platform text, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now bigint;
  v_7 bigint;
  v_30 bigint;
  v_days integer;
  v_views_30 bigint;
  v_posts_30 integer;
  v_gained bigint;
  v_growth_pct_30 numeric;
  v_growth_pct_7 numeric;
begin
  select followers into v_now from creator_snapshots
   where platform = p_platform and username = p_username
   order by captured_on desc limit 1;
  select followers into v_7 from creator_snapshots
   where platform = p_platform and username = p_username and captured_on <= current_date - 7
   order by captured_on desc limit 1;
  select followers into v_30 from creator_snapshots
   where platform = p_platform and username = p_username and captured_on <= current_date - 30
   order by captured_on desc limit 1;
  select count(*) into v_days from creator_snapshots where platform = p_platform and username = p_username;

  -- Views gained by each tracked video over 7 days (latest minus a week ago).
  update creator_videos v
     set views_gained_7d = greatest(v.views - s.views, 0)
    from (
      select distinct on (video_id) video_id, views
        from creator_video_snapshots
       where platform = p_platform and captured_on <= current_date - 7
         and video_id in (select video_id from creator_videos where platform = p_platform and username = p_username)
       order by video_id, captured_on desc
    ) s
   where v.platform = p_platform and v.video_id = s.video_id;

  select coalesce(sum(views), 0), count(*) into v_views_30, v_posts_30
    from creator_videos
   where platform = p_platform and username = p_username and posted_at >= now() - interval '30 days';

  select sum(views_gained_7d) into v_gained
    from creator_videos where platform = p_platform and username = p_username;

  v_growth_pct_7 := case when coalesce(v_7, 0) > 0 then round(((v_now - v_7)::numeric / v_7) * 100, 2) end;
  v_growth_pct_30 := case when coalesce(v_30, 0) > 0 then round(((v_now - v_30)::numeric / v_30) * 100, 2) end;

  update creators_index c
     set followers_7d_ago = v_7,
         followers_30d_ago = v_30,
         followers_growth_7d = case when v_7 is not null then v_now - v_7 end,
         followers_growth_30d = case when v_30 is not null then v_now - v_30 end,
         followers_growth_pct_7d = v_growth_pct_7,
         followers_growth_pct_30d = v_growth_pct_30,
         views_30d = v_views_30,
         posts_30d = v_posts_30,
         avg_views_30d = case when v_posts_30 > 0 then v_views_30 / v_posts_30 end,
         views_gained_7d = v_gained,
         history_days = v_days,
         -- Blend: follower growth (7d then 30d), then views the account is
         -- pulling right now relative to its size, then fresh output.
         growth_score = round(
             coalesce(v_growth_pct_7, v_growth_pct_30 / 4, 0) * 4
           + least(coalesce(v_gained::numeric / nullif(v_now, 0), 0), 20) * 10
           + least(coalesce(v_posts_30, 0), 30) * 0.3
         , 3)
   where lower(c.username) = p_username
     and lower(coalesce(c.platform, 'tiktok')) = p_platform;
end;
$$;

revoke all on function public.enqueue_due_creators(integer) from public, anon, authenticated;
revoke all on function public.claim_scrape_jobs(integer, text[]) from public, anon, authenticated;
revoke all on function public.refresh_creator_rollup(text, text) from public, anon, authenticated;
