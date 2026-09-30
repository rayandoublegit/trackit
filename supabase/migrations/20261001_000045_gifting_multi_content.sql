-- Gifting: several contents per mission (videos or photos).
-- A campaign asks for video_count contents (1..20). Each one is a row in
-- gift_videos at its own position (1..video_count). Existing rows become
-- position 1, kind 'video'. Idempotent: safe to run twice and on live data.

-- ── Content rows ─────────────────────────────────────────────
alter table public.gift_videos add column if not exists position integer not null default 1;
alter table public.gift_videos add column if not exists kind text not null default 'video';
alter table public.gift_videos add column if not exists created_at timestamptz not null default now();
alter table public.gift_videos add column if not exists updated_at timestamptz not null default now();

do $$
declare
  mission_col smallint;
  c record;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gift_videos'::regclass and conname = 'gift_videos_kind_check'
  ) then
    alter table public.gift_videos
      add constraint gift_videos_kind_check check (kind in ('video', 'photo'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gift_videos'::regclass and conname = 'gift_videos_position_check'
  ) then
    alter table public.gift_videos
      add constraint gift_videos_position_check check (position between 1 and 20);
  end if;

  -- Drop the one-video-per-mission rule, whatever its name (it was declared inline).
  select attnum into mission_col
  from pg_attribute
  where attrelid = 'public.gift_videos'::regclass and attname = 'mission_id';
  for c in
    select conname from pg_constraint
    where conrelid = 'public.gift_videos'::regclass
      and contype = 'u'
      and conkey = array[mission_col]::smallint[]
  loop
    execute format('alter table public.gift_videos drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gift_videos'::regclass and conname = 'gift_videos_mission_position_key'
  ) then
    alter table public.gift_videos
      add constraint gift_videos_mission_position_key unique (mission_id, position);
  end if;
end $$;

-- ── Mission approval date (start of ad rights) ──────────────
-- Set once, the first time every expected content is approved.
alter table public.gift_missions add column if not exists approved_at timestamptz;

update public.gift_missions m
set approved_at = v.approved_at
from (
  select mission_id, min(approved_at) as approved_at
  from public.gift_videos
  where approved_at is not null
  group by mission_id
) v
where v.mission_id = m.id
  and m.status = 'approved'
  and m.approved_at is null;

-- ── Private bucket: videos and photos ────────────────────────
-- 500 MB per file at the bucket level; the API holds photos to 25 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-videos', 'gift-videos', false, 524288000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── One transaction: mission transition + one content item ──
-- Same signature, revision lock and grants as before. p_video may carry
-- "position" (default 1) and "kind" (default 'video' on insert, unchanged on update).
create or replace function public.gift_commit_mission_action(
  p_mission_id uuid,
  p_expected_revision integer,
  p_mission jsonb,
  p_video jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  v_position integer;
  v_kind text;
begin
  update public.gift_missions
  set status = p_mission->>'status',
      signed_name = p_mission->>'signed_name',
      signed_at = (p_mission->>'signed_at')::timestamptz,
      address = nullif(p_mission->'address', 'null'::jsonb),
      carrier = p_mission->>'carrier',
      tracking_number = p_mission->>'tracking_number',
      shipped_at = (p_mission->>'shipped_at')::timestamptz,
      delivered_at = (p_mission->>'delivered_at')::timestamptz,
      approved_at = coalesce(approved_at, (p_mission->>'approved_at')::timestamptz),
      revision = revision + 1
  where id = p_mission_id and revision = p_expected_revision;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;

  if p_video is not null then
    v_position := coalesce(nullif(p_video->>'position', '')::integer, 1);
    v_kind := nullif(p_video->>'kind', '');
    insert into public.gift_videos (
      mission_id, position, kind, name, status, feedback, approved_at, storage_path, updated_at
    ) values (
      p_mission_id,
      v_position,
      coalesce(v_kind, 'video'),
      p_video->>'name',
      p_video->>'status',
      coalesce(p_video->>'feedback', ''),
      (p_video->>'approved_at')::timestamptz,
      p_video->>'storage_path',
      now()
    )
    on conflict (mission_id, position) do update set
      kind = coalesce(v_kind, public.gift_videos.kind),
      name = excluded.name,
      status = excluded.status,
      feedback = excluded.feedback,
      approved_at = excluded.approved_at,
      storage_path = coalesce(excluded.storage_path, public.gift_videos.storage_path),
      updated_at = now();
  end if;
  return true;
end;
$$;

revoke all on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) to service_role;

-- Browsers still never touch gift tables directly.
revoke all on public.gift_videos from anon, authenticated;
revoke all on public.gift_missions from anon, authenticated;
