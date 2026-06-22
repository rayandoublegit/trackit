-- Creator Workspace: saved creators, named folders, outreach pipeline + rich videos.

create table if not exists public.discovery_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null,
  platform text not null default 'tiktok',
  display_name text default '',
  avatar_url text default '',
  followers bigint default 0,
  engagement_rate numeric default 0,
  primary_niche text default '',
  country_code text,
  value_score integer,
  snapshot jsonb,
  pipeline_status text not null default 'saved',
  notes text default '',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_username)
);

create table if not exists public.discovery_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.discovery_folder_items (
  folder_id uuid not null references public.discovery_folders(id) on delete cascade,
  creator_username text not null,
  added_at timestamptz not null default now(),
  primary key (folder_id, creator_username)
);

alter table public.creators_index add column if not exists top_videos jsonb;

create index if not exists discovery_saved_user_idx on public.discovery_saved (user_id, pipeline_status);
create index if not exists discovery_folders_user_idx on public.discovery_folders (user_id, position);
create index if not exists discovery_folder_items_creator_idx on public.discovery_folder_items (creator_username);

alter table public.discovery_saved enable row level security;
alter table public.discovery_folders enable row level security;
alter table public.discovery_folder_items enable row level security;

-- CREATE POLICY does not support IF NOT EXISTS -> drop then create (idempotent).
drop policy if exists discovery_saved_owner on public.discovery_saved;
create policy discovery_saved_owner on public.discovery_saved
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists discovery_folders_owner on public.discovery_folders;
create policy discovery_folders_owner on public.discovery_folders
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists discovery_folder_items_owner on public.discovery_folder_items;
create policy discovery_folder_items_owner on public.discovery_folder_items
  using (exists (select 1 from public.discovery_folders f where f.id = folder_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.discovery_folders f where f.id = folder_id and f.user_id = auth.uid()));
