-- Video intelligence (docs/VIDEO_INTEL.md): transcripts of every tracked
-- video, a structured analysis per video (Claude, Message Batches API), a
-- "why their videos work" synthesis per creator, and niche-level patterns.
--
-- Idempotent, and safe to paste in the Supabase SQL editor where each
-- top-level statement may run on its own connection: no temp tables, every
-- multi-step data change lives inside one function or DO block.
-- Server-only like the rest of the creator data: RLS on, no policies, no
-- grants to anon / authenticated.
--
-- Why a dedicated queue (video_intel_jobs) instead of new kinds in scrape_jobs:
--   * volume: one row per video per stage (millions) next to ~100k scrape
--     jobs; the scraper's claim and its weekly enqueue would scan them;
--   * shape: one row per (kind, platform, target) kept for ever and reset to
--     "queued" (no unbounded growth, natural dedup), plus a "submitted" state
--     tied to an Anthropic batch, which scrape_jobs does not have;
--   * isolation: a stuck analysis backlog can never delay creator refreshes.

-- 1. Capture on creator_videos (filled by the scraper at ingest) -------------
alter table public.creator_videos
  add column if not exists subtitle_url text,
  add column if not exists subtitle_lang text,
  add column if not exists audio_kind text,
  add column if not exists media_url text;

comment on column public.creator_videos.subtitle_url is 'WEBVTT caption track the platform put in the payload (free transcript; signed URLs expire)';
comment on column public.creator_videos.media_url is 'Short-lived media file URL from the last scrape (speech-to-text fallback; expires)';
comment on column public.creator_videos.audio_kind is 'original / music / none when the payload says (none = no speech to transcribe)';

-- Keyset walk of new videos for the enqueue (first_seen_at, platform, video_id).
create index if not exists creator_videos_first_seen_key_idx
  on public.creator_videos (first_seen_at, platform, video_id);

-- 2. Performance rules (same as src/lib/video-intel/performance.ts) ----------
create or replace function public.video_performance_ratio(p_views bigint, p_median numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select case when p_median is null or p_median <= 0 or p_views is null then null
              else round(greatest(p_views, 0)::numeric / p_median, 3) end
$$;

create or replace function public.video_performance_band(p_views bigint, p_median numeric)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_median is null or p_median <= 0 or p_views is null then null
    when p_views >= greatest(100000, 5 * p_median) then 'viral'
    when p_views::numeric / p_median >= 1.5 then 'over'
    when p_views::numeric / p_median >= 0.67 then 'normal'
    when p_views::numeric / p_median >= 0.33 then 'under'
    else 'flop'
  end
$$;

-- 3. Transcripts ---------------------------------------------------------------
create table if not exists public.creator_video_transcripts (
  platform text not null,
  video_id text not null,
  status text not null,
  source text not null,
  language text,
  text text,
  segments jsonb not null default '[]'::jsonb,
  word_count integer not null default 0,
  has_speech boolean not null default false,
  credits numeric not null default 0,
  hash text,
  fetched_at timestamptz not null default now(),
  primary key (platform, video_id),
  constraint creator_video_transcripts_status_chk check (status in ('ok', 'no_speech', 'unavailable'))
);

-- 4. Per-video insights ------------------------------------------------------
create table if not exists public.creator_video_insights (
  platform text not null,
  video_id text not null,
  username text not null,
  model text not null,
  prompt_version integer not null,
  analysis jsonb not null,
  hook text,
  hook_type text,
  content_format text,
  topic text,
  cta_type text,
  has_cta boolean,
  has_product boolean,
  promotion_type text,
  tone text,
  language text,
  pace_wps numeric,
  views bigint,
  median_views bigint,
  performance_ratio numeric,
  band text,
  input_tokens integer,
  output_tokens integer,
  analysed_at timestamptz not null default now(),
  perf_updated_at timestamptz not null default now(),
  primary key (platform, video_id),
  constraint creator_video_insights_band_chk check (band is null or band in ('flop', 'under', 'normal', 'over', 'viral'))
);
create index if not exists creator_video_insights_creator_idx on public.creator_video_insights (platform, username);
create index if not exists creator_video_insights_username_idx on public.creator_video_insights (username);
create index if not exists creator_video_insights_ratio_idx on public.creator_video_insights (performance_ratio desc nulls last, video_id);
create index if not exists creator_video_insights_hook_idx on public.creator_video_insights (hook_type, performance_ratio desc nulls last);
create index if not exists creator_video_insights_format_idx on public.creator_video_insights (content_format, performance_ratio desc nulls last);
create index if not exists creator_video_insights_cta_idx on public.creator_video_insights (cta_type);
create index if not exists creator_video_insights_product_idx on public.creator_video_insights (has_product) where has_product;
create index if not exists creator_video_insights_topic_idx on public.creator_video_insights using gin (to_tsvector('simple', coalesce(topic, '')));
create index if not exists creator_video_insights_prompt_idx on public.creator_video_insights (prompt_version);

-- 5. Per-creator synthesis ---------------------------------------------------
create table if not exists public.creator_content_insights (
  platform text not null,
  username text not null,
  summary_en text,
  summary_fr text,
  patterns jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  videos_analysed integer not null default 0,
  model text,
  prompt_version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (platform, username)
);
create index if not exists creator_content_insights_username_idx on public.creator_content_insights (username);

-- 6. The queue ---------------------------------------------------------------
-- One row per (kind, platform, target) for ever; finished rows are reset to
-- "queued" when work is due again. target = video_id (transcript, analyze)
-- or the creator storage key (synthesize). id is the Anthropic custom_id ("j<id>").
create table if not exists public.video_intel_jobs (
  id bigserial not null unique,
  kind text not null,
  platform text not null,
  target text not null,
  priority smallint not null default 5,
  status text not null default 'queued',
  attempts smallint not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  batch_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, platform, target),
  constraint video_intel_jobs_kind_chk check (kind in ('transcript', 'analyze', 'synthesize')),
  constraint video_intel_jobs_status_chk check (status in ('queued', 'running', 'submitted', 'done', 'failed'))
);
create index if not exists video_intel_jobs_pick_idx on public.video_intel_jobs (kind, priority, run_after) where status = 'queued';
create index if not exists video_intel_jobs_running_idx on public.video_intel_jobs (kind, locked_at) where status = 'running';
create index if not exists video_intel_jobs_batch_idx on public.video_intel_jobs (batch_id) where batch_id is not null;

-- 7. LLM batches (gateway batch API or sync passes), runs, pauses -----------------------------------------
create table if not exists public.anthropic_batches (
  id text primary key,
  kind text not null,
  model text not null,
  status text not null default 'in_progress',
  request_count integer not null default 0,
  succeeded integer not null default 0,
  errored integer not null default 0,
  expired integer not null default 0,
  canceled integer not null default 0,
  results_processed integer not null default 0,
  est_cost_usd numeric not null default 0,
  actual_cost_usd numeric,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  submitted_at timestamptz not null default now(),
  ended_at timestamptz,
  results_processed_at timestamptz,
  last_polled_at timestamptz,
  last_error text,
  constraint anthropic_batches_status_chk check (status in ('in_progress', 'canceling', 'ended', 'processed', 'failed'))
);
comment on table public.anthropic_batches is 'LLM batches of video intelligence: Cheaper Inference gateway batch ids, or sync-<id> passes (name kept from the first design)';
create index if not exists anthropic_batches_open_idx on public.anthropic_batches (status, submitted_at) where status in ('in_progress', 'canceling', 'ended');
create index if not exists anthropic_batches_submitted_idx on public.anthropic_batches (submitted_at);

create table if not exists public.video_intel_runs (
  id bigserial primary key,
  stage text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items integer not null default 0,
  calls integer not null default 0,
  credits numeric not null default 0,
  est_usd numeric not null default 0,
  notes jsonb not null default '{}'::jsonb
);
create index if not exists video_intel_runs_stage_idx on public.video_intel_runs (stage, started_at desc);

-- Key/value state: pauses ("pause:anthropic", "pause:scrapecreators") and the enqueue watermark.
create table if not exists public.video_intel_state (
  key text primary key,
  paused_until timestamptz,
  reason text,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 8. Niche-level patterns (refreshed by the niche cron) ----------------------
create table if not exists public.video_intel_niche_patterns (
  platform text not null,
  niche text not null,
  dimension text not null,
  value text not null,
  videos integer not null,
  creators integer not null,
  median_ratio numeric,
  lift numeric,
  win_share numeric,
  lose_share numeric,
  refreshed_at timestamptz not null default now(),
  primary key (platform, niche, dimension, value)
);

alter table public.creator_video_transcripts enable row level security;
alter table public.creator_video_insights enable row level security;
alter table public.creator_content_insights enable row level security;
alter table public.video_intel_jobs enable row level security;
alter table public.anthropic_batches enable row level security;
alter table public.video_intel_runs enable row level security;
alter table public.video_intel_state enable row level security;
alter table public.video_intel_niche_patterns enable row level security;
revoke all on public.creator_video_transcripts, public.creator_video_insights, public.creator_content_insights,
  public.video_intel_jobs, public.anthropic_batches, public.video_intel_runs, public.video_intel_state,
  public.video_intel_niche_patterns from anon, authenticated;
revoke all on sequence public.video_intel_jobs_id_seq, public.video_intel_runs_id_seq from anon, authenticated;

-- 9. Claim (concurrent passes never get the same job) ------------------------
create or replace function public.claim_video_intel_jobs(p_kind text, p_limit integer default 50)
returns setof public.video_intel_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A pass that died mid-way leaves jobs "running": give them back after 20 minutes.
  update video_intel_jobs
     set status = 'queued', locked_at = null, updated_at = now()
   where kind = p_kind and status = 'running' and locked_at < now() - interval '20 minutes';

  return query
  update video_intel_jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
   where (j.kind, j.platform, j.target) in (
     select kind, platform, target from video_intel_jobs
      where kind = p_kind and status = 'queued' and run_after <= now()
      order by priority, run_after
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning j.*;
end;
$$;

-- Hand claimed jobs back untouched (pause, cap, failed submit): the attempt is refunded.
create or replace function public.release_video_intel_jobs(p_ids bigint[], p_run_after timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update video_intel_jobs
     set status = 'queued', locked_at = null, batch_id = null, attempts = greatest(attempts - 1, 0),
         run_after = coalesce(p_run_after, now()), updated_at = now()
   where id = any(p_ids) and status in ('running', 'submitted');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 10. Enqueue ----------------------------------------------------------------
-- Walks creator_videos by (first_seen_at, platform, video_id) from a stored
-- watermark: each call looks only at videos it has not seen, so the cost does
-- not grow with the base. Priority: 1 creators brands work with (saved, lists,
-- their creators, gifting), 2 viral / over-performing (>= 1.5x median),
-- 3 posted in the last 30 days, 5 the rest. Photos and carousels are skipped.
-- Also re-queues analyses written by an older prompt version (priority 8).
create or replace function public.enqueue_video_intel(p_limit integer default 20000, p_prompt_version integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w_at timestamptz;
  w_platform text;
  w_video text;
  l_at timestamptz;
  l_platform text;
  l_video text;
  scanned integer := 0;
  queued integer := 0;
  requeued integer := 0;
begin
  select (value->>'at')::timestamptz, coalesce(value->>'platform', ''), coalesce(value->>'video_id', '')
    into w_at, w_platform, w_video
    from video_intel_state where key = 'enqueue_watermark';
  w_at := coalesce(w_at, '-infinity'::timestamptz);
  w_platform := coalesce(w_platform, '');
  w_video := coalesce(w_video, '');

  with batch as (
    select v.platform, v.video_id, v.username, v.media_type, v.views, v.posted_at, v.first_seen_at
      from creator_videos v
     where (v.first_seen_at, v.platform, v.video_id) > (w_at, w_platform, w_video)
       and v.first_seen_at < now() - interval '5 minutes' -- rows of scrapes still committing are not skipped
     order by v.first_seen_at, v.platform, v.video_id
     limit greatest(p_limit, 0)
  ),
  tracked as (
    select lower(creator_username) as key from discovery_saved
    union select lower(creator_username) from discovery_folder_items
    union select lower(regexp_replace(btrim(handle), '^@', '')) from creators where handle is not null
    union select 'ig_' || lower(regexp_replace(btrim(handle), '^@', '')) from creators where handle is not null and platform = 'instagram'
    union select lower(regexp_replace(btrim(handle), '^@', '')) from gift_wishlist_creators
    union select 'ig_' || lower(regexp_replace(btrim(handle), '^@', '')) from gift_wishlist_creators where platform = 'instagram'
    union select lower(regexp_replace(btrim(creator_handle), '^@', '')) from gift_missions
    union select 'ig_' || lower(regexp_replace(btrim(creator_handle), '^@', '')) from gift_missions where creator_platform = 'instagram'
  ),
  ins as (
    insert into video_intel_jobs (kind, platform, target, priority)
    select 'transcript', lower(b.platform), b.video_id,
           case
             when t.key is not null then 1
             when c.median_video_views > 0 and b.views >= 1.5 * c.median_video_views then 2
             when b.posted_at > now() - interval '30 days' then 3
             else 5
           end
      from batch b
      left join creators_index c on c.username = b.username
      left join (select distinct key from tracked) t on t.key = lower(b.username)
     where coalesce(b.media_type, 'video') = 'video'
    on conflict (kind, platform, target) do nothing
    returning 1
  )
  select (select count(*) from batch), (select count(*) from ins) into scanned, queued;

  select b.first_seen_at, b.platform, b.video_id into l_at, l_platform, l_video
    from (
      select v.first_seen_at, v.platform, v.video_id from creator_videos v
       where (v.first_seen_at, v.platform, v.video_id) > (w_at, w_platform, w_video)
       and v.first_seen_at < now() - interval '5 minutes' -- rows of scrapes still committing are not skipped
       order by v.first_seen_at, v.platform, v.video_id
       limit greatest(p_limit, 0)
    ) b
   order by b.first_seen_at desc, b.platform desc, b.video_id desc
   limit 1;
  if found then
    insert into video_intel_state (key, value, updated_at)
    values ('enqueue_watermark', jsonb_build_object('at', l_at, 'platform', l_platform, 'video_id', l_video), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;

  -- Older prompt versions: back in the queue, after everything new.
  with old as (
    select i.platform, i.video_id from creator_video_insights i
     where i.prompt_version < p_prompt_version
     limit greatest(p_limit / 4, 0)
  )
  update video_intel_jobs j
     set status = 'queued', priority = 8, attempts = 0, run_after = now(), batch_id = null, updated_at = now()
    from old
   where j.kind = 'analyze' and j.platform = old.platform and j.target = old.video_id and j.status in ('done', 'failed');
  get diagnostics requeued = row_count;

  return jsonb_build_object('scanned', scanned, 'queued', queued, 'requeued', requeued);
end;
$$;

-- Creators whose analysed-video count calls for a (new) synthesis, among the given ones.
create or replace function public.enqueue_creator_synthesis(p_platform text, p_usernames text[], p_min_videos integer default 6, p_prompt_version integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  with counts as (
    select i.username, count(*) filter (where i.band is not null) as n
      from creator_video_insights i
     where i.platform = lower(p_platform) and i.username = any(p_usernames)
     group by i.username
  ),
  due as (
    select c.username, c.n from counts c
      left join creator_content_insights s on s.platform = lower(p_platform) and s.username = c.username
     where c.n >= p_min_videos
       and (s.username is null
            or s.prompt_version < p_prompt_version
            or (c.n >= s.videos_analysed + 3 and c.n >= s.videos_analysed * 1.25)
            or (c.n > s.videos_analysed and s.updated_at < now() - interval '30 days'))
  )
  insert into video_intel_jobs (kind, platform, target, priority)
  select 'synthesize', lower(p_platform), d.username, 3 from due d
  on conflict (kind, platform, target) do update
     set status = 'queued', attempts = 0, run_after = now(), batch_id = null, updated_at = now()
   where video_intel_jobs.status in ('done', 'failed');
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- 11. Keep performance current when the scraper refreshes views ---------------
-- Statement-level (one pass per upsert of a creator's ~30 videos); runs after
-- creator_videos_stats_upd (trigger names fire in alphabetical order), so the
-- creator's new median is in place. Never lets an error break a scrape.
create or replace function public.creator_videos_sync_insight_performance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    update creator_video_insights i
       set views = v.views,
           median_views = c.median_video_views,
           performance_ratio = video_performance_ratio(v.views, c.median_video_views),
           band = video_performance_band(v.views, c.median_video_views),
           perf_updated_at = now()
      from (select distinct lower(platform) as platform, username from changed_rows) t
      join creators_index c on c.username = t.username
      join creator_videos v on v.username = t.username and lower(v.platform) = t.platform
     where i.platform = lower(v.platform) and i.video_id = v.video_id;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists creator_videos_zz_intel_perf_upd on public.creator_videos;
create trigger creator_videos_zz_intel_perf_upd after update on public.creator_videos
  referencing new table as changed_rows for each statement execute function public.creator_videos_sync_insight_performance();

-- 12. Niche patterns ---------------------------------------------------------
-- Lift of each hook type / format / CTA / product presence per niche and
-- platform: median performance ratio of the videos with the feature over the
-- niche's median ratio. Groups need p_min_videos videos from p_min_creators
-- creators. One platform per call keeps each call short.
create or replace function public.refresh_video_intel_niche_patterns(p_platform text, p_min_videos integer default 30, p_min_creators integer default 5)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  delete from video_intel_niche_patterns where platform = lower(p_platform);
  with base as (
    select i.username, i.performance_ratio as r, i.band, i.hook_type, i.content_format, i.cta_type, i.has_product,
           coalesce(nullif(lower(c.primary_niche), ''), 'unknown') as niche
      from creator_video_insights i
      left join creators_index c on c.username = i.username
     where i.platform = lower(p_platform) and i.performance_ratio is not null
  ),
  scoped as (
    select niche, username, r, band, hook_type, content_format, cta_type, has_product from base
    union all
    select 'all', username, r, band, hook_type, content_format, cta_type, has_product from base
  ),
  niche_median as (
    select niche, percentile_cont(0.5) within group (order by r) as m from scoped group by niche
  ),
  expanded as (
    select niche, username, r, band, 'hook_type' as dimension, hook_type as value from scoped where hook_type is not null
    union all select niche, username, r, band, 'format', content_format from scoped where content_format is not null
    union all select niche, username, r, band, 'cta', coalesce(cta_type, 'none') from scoped
    union all select niche, username, r, band, 'product', case when has_product then 'with_product' else 'no_product' end from scoped where has_product is not null
  ),
  grouped as (
    select e.niche, e.dimension, e.value,
           count(*)::int as videos,
           count(distinct e.username)::int as creators,
           percentile_cont(0.5) within group (order by e.r) as median_ratio,
           avg(case when e.band in ('over', 'viral') then 1 else 0 end) as win_share,
           avg(case when e.band in ('under', 'flop') then 1 else 0 end) as lose_share
      from expanded e
     group by e.niche, e.dimension, e.value
    having count(*) >= p_min_videos and count(distinct e.username) >= p_min_creators
  )
  insert into video_intel_niche_patterns (platform, niche, dimension, value, videos, creators, median_ratio, lift, win_share, lose_share, refreshed_at)
  select lower(p_platform), g.niche, g.dimension, g.value, g.videos, g.creators,
         round(g.median_ratio::numeric, 3),
         case when m.m > 0 then round((g.median_ratio / m.m)::numeric, 3) end,
         round(g.win_share::numeric, 3), round(g.lose_share::numeric, 3), now()
    from grouped g join niche_median m on m.niche = g.niche;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- 13. Library view with insights (filters and sort by performance) -----------
-- Built on creator_video_library (migration 000047); skipped when that view is
-- not there yet (re-run this file after 000047 to create it).
do $$
begin
  if to_regclass('public.creator_video_library') is null then
    raise notice 'creator_video_library missing (apply 000047 first): creator_video_library_insights not created';
    return;
  end if;
  execute $v$
    create or replace view public.creator_video_library_insights with (security_invoker = true) as
    select
      l.*,
      i.hook,
      i.hook_type,
      i.content_format,
      i.topic,
      i.cta_type,
      i.has_cta,
      i.has_product as mentions_product,
      i.promotion_type,
      i.tone,
      i.pace_wps,
      i.performance_ratio,
      i.band
    from public.creator_video_library l
    join public.creator_video_insights i on i.platform = lower(l.platform) and i.video_id = l.video_id
  $v$;
  execute 'revoke all on public.creator_video_library_insights from anon, authenticated';
end;
$$;

revoke all on function public.video_performance_ratio(bigint, numeric) from public, anon, authenticated;
revoke all on function public.video_performance_band(bigint, numeric) from public, anon, authenticated;
revoke all on function public.claim_video_intel_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.release_video_intel_jobs(bigint[], timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_video_intel(integer, integer) from public, anon, authenticated;
revoke all on function public.enqueue_creator_synthesis(text, text[], integer, integer) from public, anon, authenticated;
revoke all on function public.creator_videos_sync_insight_performance() from public, anon, authenticated;
revoke all on function public.refresh_video_intel_niche_patterns(text, integer, integer) from public, anon, authenticated;
