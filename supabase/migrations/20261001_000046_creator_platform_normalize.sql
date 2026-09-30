-- Creator platform: one spelling, for good. Plus the weekly scrape rhythm.
--
-- Production had creators_index.platform stored as 'TikTok' (14,098 rows) and
-- 'tiktok' (3,703 rows), so screens filtering on one spelling lost or doubled
-- part of the base. This migration:
--
--   1. merges creators stored twice (same platform + handle without case):
--      keeps the most recently scraped / richest row, fills its gaps from the
--      duplicate, and moves every child row (snapshots, videos, queue, saved
--      creators, list items) onto the kept row;
--   2. lowercases platform (and the creator key) in every table that stores
--      a creator platform: creators_index, creator_snapshots, creator_videos,
--      creator_video_snapshots, scrape_jobs, discovery_saved (+ its snapshot
--      json), discovery_folder_items, creators (a brand's creators);
--   3. makes it stick: triggers lowercase whatever old code still sends, and
--      CHECK constraints refuse anything else;
--   4. adds the weekly refresh functions (enqueue_weekly_refresh,
--      enqueue_tracked_creators), creator_videos.format (short / long / photo /
--      carousel, so YouTube shorts and long videos stay apart) and
--      creators_index.scrape_status (ok / not_found / failing).
--
-- Identity of a creator = (platform, lower(username)). creators_index.username
-- is the storage key: the bare handle for TikTok, 'ig_' + handle for Instagram,
-- 'yt_' + handle for YouTube (unique on its own, as the app has always used it).
-- Rows added before that convention ('instagram', 'luna') are the same creator
-- as ('instagram', 'ig_luna') and are merged too.
--
-- Idempotent (safe to run twice) and transactional: all of it or nothing.
-- outreach_history.platform is a DM channel ('Instagram DM', 'Email'…), not a
-- creator platform, and the gifting tables already only accept lowercase.

begin;

-- ── 0. Columns this migration relies on ────────────────────────────────────────
alter table public.creators_index add column if not exists scrape_status text;
alter table public.creator_videos add column if not exists format text;

-- ── 1. creators_index: who is who ─────────────────────────────────────────────
-- One row per creators_index row with its normalized identity.
create temporary table _ci_rows on commit drop as
select r.*,
       case r.norm_platform
         when 'instagram' then regexp_replace(r.norm_username, '^ig_', '')
         when 'youtube' then regexp_replace(r.norm_username, '^yt_', '')
         else r.norm_username
       end as norm_handle
from (
  select c.ctid as row_ctid,
         c.platform as old_platform,
         c.username as old_username,
         lower(coalesce(nullif(btrim(c.platform), ''), 'tiktok')) as norm_platform,
         lower(regexp_replace(btrim(c.username), '^@', '')) as norm_username,
         c.last_scraped_at,
         c.enrichment_status,
         c.followers
  from public.creators_index c
  where c.username is not null
) r;

-- Rank the rows of each creator: most recently scraped, then enriched, then
-- biggest, then the row already spelled right.
create temporary table _ci_ranked on commit drop as
select r.*,
       row_number() over (
         partition by r.norm_platform, r.norm_handle
         order by r.last_scraped_at desc nulls last,
                  (r.enrichment_status = 'enriched') desc nulls last,
                  r.followers desc nulls last,
                  (r.old_platform = r.norm_platform and r.old_username = r.norm_username) desc,
                  r.row_ctid
       ) as rank
from _ci_rows r;

-- One line per creator: the kept row and the key it ends with.
create temporary table _ci_groups on commit drop as
select k.norm_platform,
       k.norm_handle,
       k.row_ctid as keeper_ctid,
       k.old_username as keeper_old_username,
       k.norm_username as final_username
from _ci_ranked k
where k.rank = 1;

-- Two different platforms ending on the same key (TikTok 'luna' and an old
-- Instagram row 'Luna'): TikTok keeps the bare handle, the other one takes its
-- platform prefix. If even that is taken, the row keeps its current key.
with clash as (
  select g.norm_platform, g.norm_handle,
         row_number() over (
           partition by g.final_username
           order by (g.norm_platform = 'tiktok') desc, (g.keeper_old_username = g.final_username) desc, g.norm_platform
         ) as pos
  from _ci_groups g
)
update _ci_groups g
   set final_username = case g.norm_platform
                          when 'instagram' then 'ig_' || g.norm_handle
                          when 'youtube' then 'yt_' || g.norm_handle
                          else g.keeper_old_username
                        end
  from clash c
 where c.norm_platform = g.norm_platform and c.norm_handle = g.norm_handle and c.pos > 1;

update _ci_groups g
   set final_username = g.keeper_old_username
 where exists (
   select 1 from _ci_groups o
    where o.final_username = g.final_username
      and (o.norm_platform, o.norm_handle) <> (g.norm_platform, g.norm_handle)
      and o.keeper_old_username = o.final_username
 )
   and g.keeper_old_username <> g.final_username;

-- Every spelling a child row may use → the final key.
create temporary table _ci_map on commit drop as
select distinct r.norm_platform, r.norm_username as member_username, g.final_username
from _ci_rows r
join _ci_groups g on g.norm_platform = r.norm_platform and g.norm_handle = r.norm_handle;

-- Child tables are matched row by row against these: index them.
create index on _ci_map (norm_platform, member_username);
create index on _ci_map (member_username);
create index on _ci_groups (norm_platform, norm_handle);
create index on _ci_ranked (norm_platform, norm_handle);
analyze _ci_rows;
analyze _ci_ranked;
analyze _ci_groups;
analyze _ci_map;

-- ── 2. creators_index: merge, then normalize ──────────────────────────────────
-- Fill the kept row's gaps from its duplicates (never overwrite what it has).
with losers as (
  select r.norm_platform, r.norm_handle, r.rank, c.*
    from _ci_ranked r
    join public.creators_index c on c.ctid = r.row_ctid
   where r.rank > 1
),
gaps as (
  select l.norm_platform, l.norm_handle,
         (array_agg(l.email order by l.rank) filter (where nullif(l.email, '') is not null))[1] as email,
         (array_agg(l.primary_niche order by l.rank) filter (where nullif(l.primary_niche, '') is not null))[1] as primary_niche,
         (array_agg(l.country_code order by l.rank) filter (where nullif(l.country_code, '') is not null))[1] as country_code,
         (array_agg(l.avatar_url order by l.rank) filter (where nullif(l.avatar_url, '') is not null))[1] as avatar_url,
         (array_agg(l.top_videos order by l.rank) filter (where l.top_videos is not null))[1] as top_videos,
         min(l.first_seen_at) as first_seen_at
    from losers l
   group by l.norm_platform, l.norm_handle
),
loser_niches as (
  select l.norm_platform, l.norm_handle, array_agg(distinct n) as niches
    from losers l
    cross join lateral unnest(coalesce(l.niches, '{}')) as n
   where n is not null
   group by l.norm_platform, l.norm_handle
)
update public.creators_index k
   set email = coalesce(nullif(k.email, ''), d.email),
       primary_niche = coalesce(nullif(k.primary_niche, ''), d.primary_niche),
       country_code = coalesce(nullif(k.country_code, ''), d.country_code),
       avatar_url = coalesce(nullif(k.avatar_url, ''), d.avatar_url),
       top_videos = coalesce(k.top_videos, d.top_videos),
       first_seen_at = least(k.first_seen_at, d.first_seen_at),
       niches = (
         select coalesce(array_agg(distinct n), '{}')
           from unnest(coalesce(k.niches, '{}') || coalesce(ln.niches, '{}')) as n
          where n is not null
       )
  from _ci_groups g
  join gaps d on d.norm_platform = g.norm_platform and d.norm_handle = g.norm_handle
  left join loser_niches ln on ln.norm_platform = g.norm_platform and ln.norm_handle = g.norm_handle
 where k.ctid = g.keeper_ctid;

-- The duplicates go (their history moves to the kept row below).
delete from public.creators_index c
 using _ci_ranked r
 where c.ctid = r.row_ctid and r.rank > 1;

-- The kept rows take their final spelling (found by their old spelling: the
-- update above moved some of them). Rows renamed with a platform prefix go
-- first, so no key is ever held by two rows at once.
update public.creators_index c
   set platform = g.norm_platform, username = g.final_username
  from _ci_groups g
  join _ci_rows r on r.row_ctid = g.keeper_ctid
 where c.username = r.old_username
   and c.platform is not distinct from r.old_platform
   and g.final_username <> r.norm_username;

update public.creators_index c
   set platform = g.norm_platform, username = g.final_username
  from _ci_groups g
  join _ci_rows r on r.row_ctid = g.keeper_ctid
 where c.username = r.old_username
   and c.platform is not distinct from r.old_platform
   and (c.platform is distinct from g.norm_platform or c.username is distinct from g.final_username);

-- A single key column must stay unique on its own (the app upserts on it).
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.creators_index'::regclass
       and i.indisunique
       and i.indnatts = 1
       and a.attname = 'username'
       and i.indpred is null
  ) then
    create unique index creators_index_username_uidx on public.creators_index (username);
  end if;
end $$;

-- ── 3. History and queue follow the kept row ──────────────────────────────────
-- creator_snapshots: one row per creator per day.
delete from public.creator_snapshots s
 using (
   select x.ctid as row_ctid,
          row_number() over (
            partition by lower(x.platform), coalesce(m.final_username, lower(x.username)), x.captured_on
            order by x.captured_at desc nulls last,
                     (x.platform = lower(x.platform) and x.username = coalesce(m.final_username, lower(x.username))) desc,
                     x.followers desc nulls last
          ) as rank
     from public.creator_snapshots x
     left join _ci_map m on m.norm_platform = lower(x.platform) and m.member_username = lower(x.username)
 ) d
 where s.ctid = d.row_ctid and d.rank > 1;

update public.creator_snapshots x
   set platform = lower(x.platform),
       username = coalesce((select m.final_username from _ci_map m
                             where m.norm_platform = lower(x.platform) and m.member_username = lower(x.username)), lower(x.username))
 where x.platform <> lower(x.platform)
    or x.username <> coalesce((select m.final_username from _ci_map m
                                where m.norm_platform = lower(x.platform) and m.member_username = lower(x.username)), lower(x.username));

-- creator_videos: one row per video.
delete from public.creator_videos v
 using (
   select x.ctid as row_ctid,
          row_number() over (partition by lower(x.platform), x.video_id
                             order by (x.platform = lower(x.platform)) desc, x.last_scraped_at desc) as rank
     from public.creator_videos x
 ) d
 where v.ctid = d.row_ctid and d.rank > 1;

update public.creator_videos x
   set platform = lower(x.platform),
       username = coalesce((select m.final_username from _ci_map m
                             where m.norm_platform = lower(x.platform) and m.member_username = lower(x.username)), lower(x.username))
 where x.platform <> lower(x.platform)
    or x.username <> coalesce((select m.final_username from _ci_map m
                                where m.norm_platform = lower(x.platform) and m.member_username = lower(x.username)), lower(x.username));

-- creator_video_snapshots: one row per video per day.
delete from public.creator_video_snapshots v
 using (
   select x.ctid as row_ctid,
          row_number() over (partition by lower(x.platform), x.video_id, x.captured_on
                             order by (x.platform = lower(x.platform)) desc, x.views desc nulls last) as rank
     from public.creator_video_snapshots x
 ) d
 where v.ctid = d.row_ctid and d.rank > 1;

update public.creator_video_snapshots set platform = lower(platform) where platform <> lower(platform);

-- scrape_jobs: a duplicate live job is closed, not deleted.
update public.scrape_jobs j
   set status = 'failed', finished_at = now(), last_error = 'merged into a duplicate job (platform spelling)'
  from (
    select x.id,
           row_number() over (
             partition by x.kind, lower(x.platform),
                          case when x.kind = 'creator_refresh'
                               then coalesce((select m.final_username from _ci_map m
                                               where m.norm_platform = lower(x.platform) and m.member_username = lower(x.target)), lower(x.target))
                               else lower(x.target) end
             order by x.id
           ) as rank
      from public.scrape_jobs x
     where x.status in ('queued', 'running')
  ) d
 where j.id = d.id and d.rank > 1;

update public.scrape_jobs x
   set platform = lower(x.platform),
       target = case when x.kind = 'creator_refresh'
                     then coalesce((select m.final_username from _ci_map m
                                     where m.norm_platform = lower(x.platform) and m.member_username = lower(x.target)), lower(x.target))
                     else lower(x.target) end
 where x.platform <> lower(x.platform) or x.target <> lower(x.target)
    or (x.kind = 'creator_refresh' and exists (
          select 1 from _ci_map m
           where m.norm_platform = lower(x.platform) and m.member_username = lower(x.target) and m.final_username <> x.target));

-- ── 4. Brand-side references ──────────────────────────────────────────────────
-- discovery_saved: the saved creator follows the kept key; a workspace that
-- saved both spellings keeps the most recently updated one.
create temporary table _saved_new on commit drop as
select s.ctid as row_ctid,
       s.workspace_id,
       lower(coalesce(nullif(btrim(s.platform), ''), 'tiktok')) as new_platform,
       coalesce(
         (select m.final_username from _ci_map m
           where m.norm_platform = lower(coalesce(nullif(btrim(s.platform), ''), 'tiktok'))
             and m.member_username = lower(regexp_replace(btrim(s.creator_username), '^@', ''))),
         lower(regexp_replace(btrim(s.creator_username), '^@', ''))
       ) as new_username,
       s.updated_at
from public.discovery_saved s;

delete from public.discovery_saved s
 using (
   select n.row_ctid,
          row_number() over (partition by n.workspace_id, n.new_username order by n.updated_at desc nulls last, n.row_ctid) as rank
     from _saved_new n
    where n.workspace_id is not null
 ) d
 where s.ctid = d.row_ctid and d.rank > 1;

update public.discovery_saved s
   set platform = n.new_platform,
       creator_username = n.new_username
  from _saved_new n
 where s.ctid = n.row_ctid
   and (s.platform is distinct from n.new_platform or s.creator_username is distinct from n.new_username);

update public.discovery_saved
   set snapshot = jsonb_set(snapshot, '{platform}', to_jsonb(lower(snapshot->>'platform')))
 where snapshot is not null
   and jsonb_typeof(snapshot) = 'object'
   and jsonb_typeof(snapshot->'platform') = 'string'
   and snapshot->>'platform' <> lower(snapshot->>'platform');

-- discovery_folder_items: a list holds a creator once.
create temporary table _items_new on commit drop as
select i.ctid as row_ctid,
       i.folder_id,
       coalesce(
         -- No platform on a list item: the key it already has wins, then any match.
         (select coalesce(max(m.final_username) filter (where m.final_username = m.member_username), min(m.final_username))
            from _ci_map m where m.member_username = lower(regexp_replace(btrim(i.creator_username), '^@', ''))),
         lower(regexp_replace(btrim(i.creator_username), '^@', ''))
       ) as new_username,
       i.added_at
from public.discovery_folder_items i;

delete from public.discovery_folder_items i
 using (
   select n.row_ctid,
          row_number() over (partition by n.folder_id, n.new_username order by n.added_at asc nulls last, n.row_ctid) as rank
     from _items_new n
 ) d
 where i.ctid = d.row_ctid and d.rank > 1;

update public.discovery_folder_items i
   set creator_username = n.new_username
  from _items_new n
 where i.ctid = n.row_ctid and i.creator_username is distinct from n.new_username;

-- creators (a brand's own creators): the platform only; handles stay as typed.
update public.creators set platform = lower(btrim(platform)) where platform is not null and platform <> lower(btrim(platform));

-- ── 5. Make it stick ──────────────────────────────────────────────────────────
-- Old code (or an old deployment) may still send 'TikTok': lowercase it on the
-- way in instead of failing the write. The CHECKs below refuse anything else.
create or replace function public.creators_index_normalize()
returns trigger
language plpgsql
as $$
begin
  new.platform := lower(coalesce(nullif(btrim(new.platform), ''), 'tiktok'));
  if new.username is not null then
    new.username := lower(regexp_replace(btrim(new.username), '^@', ''));
  end if;
  return new;
end;
$$;

create or replace function public.normalize_platform_column()
returns trigger
language plpgsql
as $$
begin
  if new.platform is not null then
    new.platform := lower(btrim(new.platform));
  end if;
  return new;
end;
$$;

drop trigger if exists creators_index_normalize_trg on public.creators_index;
create trigger creators_index_normalize_trg
  before insert or update of platform, username on public.creators_index
  for each row execute function public.creators_index_normalize();

drop trigger if exists discovery_saved_platform_trg on public.discovery_saved;
create trigger discovery_saved_platform_trg
  before insert or update of platform on public.discovery_saved
  for each row execute function public.normalize_platform_column();

drop trigger if exists creators_platform_trg on public.creators;
create trigger creators_platform_trg
  before insert or update of platform on public.creators
  for each row execute function public.normalize_platform_column();

alter table public.creators_index alter column platform set default 'tiktok';
update public.creators_index set platform = 'tiktok' where platform is null;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('creators_index', 'creators_index_platform_lower_chk', 'platform = lower(platform)'),
      ('creators_index', 'creators_index_username_lower_chk', 'username = lower(username)'),
      ('creator_snapshots', 'creator_snapshots_platform_lower_chk', 'platform = lower(platform) and username = lower(username)'),
      ('creator_videos', 'creator_videos_platform_lower_chk', 'platform = lower(platform) and username = lower(username)'),
      ('creator_video_snapshots', 'creator_video_snapshots_platform_lower_chk', 'platform = lower(platform)'),
      ('scrape_jobs', 'scrape_jobs_platform_lower_chk', 'platform = lower(platform)'),
      ('discovery_saved', 'discovery_saved_platform_lower_chk', 'platform = lower(platform)'),
      ('creators', 'creators_platform_lower_chk', 'platform = lower(platform)')
    ) as v(tbl, name, expr)
  loop
    if to_regclass('public.' || t.tbl) is not null and not exists (
      select 1 from pg_constraint where conrelid = ('public.' || t.tbl)::regclass and conname = t.name
    ) then
      -- Enforced on every new write at once; existing rows are then validated.
      -- (Every row was normalized above; a row that could not be renamed
      -- without a clash would only leave the constraint unvalidated.)
      execute format('alter table public.%I add constraint %I check (%s) not valid', t.tbl, t.name, t.expr);
      begin
        execute format('alter table public.%I validate constraint %I', t.tbl, t.name);
      exception when check_violation then
        raise notice '% left unvalidated: some existing rows still differ', t.name;
      end;
    end if;
  end loop;
end $$;

-- ── 6. Video format: shorts and long videos stay apart ─────────────────────────
update public.creator_videos
   set format = case
                  when media_type in ('photo', 'carousel') then media_type
                  when platform = 'youtube' and coalesce(duration_seconds, 0) > 180 then 'long'
                  else 'short'
                end
 where format is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.creator_videos'::regclass and conname = 'creator_videos_format_chk') then
    alter table public.creator_videos
      add constraint creator_videos_format_chk check (format is null or format in ('short', 'long', 'photo', 'carousel'));
  end if;
end $$;
create index if not exists creator_videos_format_idx on public.creator_videos (platform, format, posted_at desc);

comment on column public.creator_videos.format is 'short (TikTok, Reels, YouTube Shorts), long (YouTube videos), photo, carousel';
comment on column public.creators_index.scrape_status is 'ok, not_found (renamed or deleted: history kept, retries back off), failing';

create index if not exists creators_index_last_scraped_idx on public.creators_index (last_scraped_at nulls first);

-- ── 7. Weekly rhythm ──────────────────────────────────────────────────────────
-- Queue every creator that is due this week: next_scrape_at within the horizon
-- (a creator refreshed a week ago is due; one backing off after failures is
-- not). Also prunes finished jobs older than 30 days.
create or replace function public.enqueue_weekly_refresh(
  p_limit integer default 20000,
  p_horizon interval default interval '6 days 12 hours',
  p_platforms text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  delete from scrape_jobs where status in ('done', 'failed') and finished_at < now() - interval '30 days';

  insert into scrape_jobs (kind, platform, target, priority)
  select 'creator_refresh', c.platform, c.username, c.scrape_priority
  from creators_index c
  where coalesce(c.next_scrape_at, 'epoch'::timestamptz) <= now() + p_horizon
    and c.scrape_failures < 5
    and c.username is not null
    and (p_platforms is null or c.platform = any(p_platforms))
  order by c.scrape_priority, c.next_scrape_at nulls first
  limit greatest(p_limit, 0)
  on conflict (kind, platform, target) where status in ('queued', 'running') do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Creators a brand works with (saved, in a list, in its creators, in a gifting
-- wishlist or mission) come back sooner: queue the healthy ones not refreshed
-- for p_min_age. Database only, no scraping call.
create or replace function public.enqueue_tracked_creators(
  p_limit integer default 200,
  p_min_age interval default interval '3 days 12 hours',
  p_platforms text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  with tracked as (
    select lower(creator_username) as key from discovery_saved
    union select lower(creator_username) from discovery_folder_items
    union select lower(regexp_replace(btrim(handle), '^@', '')) from creators where handle is not null
    union select 'ig_' || lower(regexp_replace(btrim(handle), '^@', '')) from creators where handle is not null and platform = 'instagram'
    union select lower(regexp_replace(btrim(handle), '^@', '')) from gift_wishlist_creators
    union select 'ig_' || lower(regexp_replace(btrim(handle), '^@', '')) from gift_wishlist_creators where platform = 'instagram'
    union select lower(regexp_replace(btrim(creator_handle), '^@', '')) from gift_missions
    union select 'ig_' || lower(regexp_replace(btrim(creator_handle), '^@', '')) from gift_missions where creator_platform = 'instagram'
  )
  insert into scrape_jobs (kind, platform, target, priority)
  select 'creator_refresh', c.platform, c.username, 1
  from creators_index c
  join tracked t on t.key = c.username
  where coalesce(c.last_scraped_at, 'epoch'::timestamptz) <= now() - p_min_age
    and c.scrape_failures = 0
    and (p_platforms is null or c.platform = any(p_platforms))
  order by c.last_scraped_at nulls first
  limit greatest(p_limit, 0)
  on conflict (kind, platform, target) where status in ('queued', 'running') do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Same as before, on normalized columns (no lower() so the indexes are used).
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
  select 'creator_refresh', c.platform, c.username, c.scrape_priority
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

create or replace function public.refresh_creator_rollup(p_platform text, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform text := lower(p_platform);
  v_username text := lower(p_username);
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
   where platform = v_platform and username = v_username
   order by captured_on desc limit 1;
  select followers into v_7 from creator_snapshots
   where platform = v_platform and username = v_username and captured_on <= current_date - 7
   order by captured_on desc limit 1;
  select followers into v_30 from creator_snapshots
   where platform = v_platform and username = v_username and captured_on <= current_date - 30
   order by captured_on desc limit 1;
  select count(*) into v_days from creator_snapshots where platform = v_platform and username = v_username;

  update creator_videos v
     set views_gained_7d = greatest(v.views - s.views, 0)
    from (
      select distinct on (video_id) video_id, views
        from creator_video_snapshots
       where platform = v_platform and captured_on <= current_date - 7
         and video_id in (select video_id from creator_videos where platform = v_platform and username = v_username)
       order by video_id, captured_on desc
    ) s
   where v.platform = v_platform and v.video_id = s.video_id;

  select coalesce(sum(views), 0), count(*) into v_views_30, v_posts_30
    from creator_videos
   where platform = v_platform and username = v_username and posted_at >= now() - interval '30 days';

  select sum(views_gained_7d) into v_gained
    from creator_videos where platform = v_platform and username = v_username;

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
         growth_score = round(
             coalesce(v_growth_pct_7, v_growth_pct_30 / 4, 0) * 4
           + least(coalesce(v_gained::numeric / nullif(v_now, 0), 0), 20) * 10
           + least(coalesce(v_posts_30, 0), 30) * 0.3
         , 3)
   where c.username = v_username
     and c.platform = v_platform;
end;
$$;

revoke all on function public.enqueue_weekly_refresh(integer, interval, text[]) from public, anon, authenticated;
revoke all on function public.enqueue_tracked_creators(integer, interval, text[]) from public, anon, authenticated;
revoke all on function public.enqueue_due_creators(integer) from public, anon, authenticated;
revoke all on function public.refresh_creator_rollup(text, text) from public, anon, authenticated;
revoke all on function public.creators_index_normalize() from public, anon, authenticated;
revoke all on function public.normalize_platform_column() from public, anon, authenticated;

commit;
