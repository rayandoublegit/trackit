-- Trackit production: turn on gifting, staff audit log and session tracking.
-- Paste this whole file in the Supabase SQL editor of the Trackit project (tokpuhzjhysqxwjkxfya)
-- after a backup. It creates only missing objects: user_sessions, gift_* tables, the private
-- gift-videos bucket, gift_commit_mission_action and admin_audit_log. One transaction: all or nothing.
-- Tested on a fresh Postgres with every other migration applied (see docs/VERIFICATION_2026-09-29.md).

begin;

-- ===== migrations/20260528_000009_user_sessions.sql =====
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_key text not null,
  device_label text,
  user_agent text,
  ip_address text,
  location_label text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id, last_active_at desc);

alter table public.user_sessions enable row level security;

create policy "Users can view own sessions"
  on public.user_sessions for select
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on public.user_sessions for delete
  using (auth.uid() = user_id);

comment on table public.user_sessions is 'Tracked browser sessions for security settings';

-- ===== migrations/20260923_000040_gifting.sql =====
-- Gifting, creator wishlists, frozen contracts, manual shipments and ad rights.
-- Affiliate, RPM and payout tables are left untouched.

create table if not exists public.gift_wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.gift_wishlist_creators (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.gift_wishlists(id) on delete cascade,
  handle text not null,
  platform text not null check (platform in ('tiktok', 'instagram')),
  created_at timestamptz not null default now(),
  unique (wishlist_id, platform, handle)
);

create table if not exists public.gift_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  product text not null,
  brief text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'completed')),
  video_count integer not null default 1 check (video_count between 1 and 20),
  deadline date not null,
  fixed_fee_cents integer not null default 0 check (fixed_fee_cents >= 0),
  currency text not null default 'EUR',
  allow_ads boolean not null default false,
  rights_days integer not null default 0 check (rights_days >= 0),
  territories text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.gift_missions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.gift_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  creator_handle text not null,
  creator_platform text not null check (creator_platform in ('tiktok', 'instagram')),
  creator_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited',
  contract_text text not null,
  signed_name text,
  signed_at timestamptz,
  address jsonb,
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_platform, creator_handle)
);

create table if not exists public.gift_videos (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references public.gift_missions(id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'changes_requested', 'approved')),
  feedback text not null default '',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gift_missions_creator_user_idx on public.gift_missions (creator_user_id);
create index if not exists gift_missions_handle_idx on public.gift_missions (creator_handle);
create index if not exists gift_campaigns_workspace_idx on public.gift_campaigns (workspace_id);

alter table public.gift_wishlists enable row level security;
alter table public.gift_wishlist_creators enable row level security;
alter table public.gift_campaigns enable row level security;
alter table public.gift_missions enable row level security;
alter table public.gift_videos enable row level security;

create policy "Brands manage their gift wishlists"
  on public.gift_wishlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Brands manage wishlist creators"
  on public.gift_wishlist_creators for all
  using (exists (
    select 1 from public.gift_wishlists w
    where w.id = wishlist_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.gift_wishlists w
    where w.id = wishlist_id and w.user_id = auth.uid()
  ));

create policy "Brands manage gift campaigns"
  on public.gift_campaigns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Brand and invited creator read gift missions"
  on public.gift_missions for select
  using (auth.uid() = user_id or auth.uid() = creator_user_id);

create policy "Brands write gift missions"
  on public.gift_missions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Creators update their claimed gift missions"
  on public.gift_missions for update
  using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

create policy "Brand and creator read gift videos"
  on public.gift_videos for select
  using (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ));

create policy "Brand and creator write gift videos"
  on public.gift_videos for all
  using (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ))
  with check (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ));

-- ===== migrations/20260925_000041_gifting_private_media.sql =====
-- Gift data contains signed contracts and shipping addresses. All writes and
-- reads go through the authenticated API, which performs role/workspace checks.
-- RLS alone cannot restrict which columns a creator may update.
revoke all on public.gift_wishlists from anon, authenticated;
revoke all on public.gift_wishlist_creators from anon, authenticated;
revoke all on public.gift_campaigns from anon, authenticated;
revoke all on public.gift_missions from anon, authenticated;
revoke all on public.gift_videos from anon, authenticated;

alter table public.gift_videos
  add column if not exists storage_path text;
alter table public.gift_missions
  add column if not exists revision integer not null default 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-videos', 'gift-videos', false, 524288000,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- One transaction covers the mission transition and its video metadata.
-- Only the server-side service role may invoke this after checking the actor.
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
      revision = revision + 1
  where id = p_mission_id and revision = p_expected_revision;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;

  if p_video is not null then
    insert into public.gift_videos (
      mission_id, name, status, feedback, approved_at, storage_path
    ) values (
      p_mission_id,
      p_video->>'name',
      p_video->>'status',
      coalesce(p_video->>'feedback', ''),
      (p_video->>'approved_at')::timestamptz,
      p_video->>'storage_path'
    )
    on conflict (mission_id) do update set
      name = excluded.name,
      status = excluded.status,
      feedback = excluded.feedback,
      approved_at = excluded.approved_at,
      storage_path = coalesce(excluded.storage_path, public.gift_videos.storage_path);
  end if;
  return true;
end;
$$;

revoke all on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) to service_role;

-- ===== migrations/20260928_000042_admin_audit_log.sql =====
-- Staff console: every account change made by staff is recorded here.
-- Written by the server with the service role only; no browser access.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text not null,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

commit;
