-- Hooks: brand creates short hooks; all linked creators with a dashboard see them.

create table if not exists public.hooks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  color smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists hooks_brand_created_idx
  on public.hooks (brand_id, created_at desc);

create table if not exists public.hook_reads (
  hook_id uuid not null references public.hooks(id) on delete cascade,
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'seen',
  updated_at timestamptz not null default now(),
  primary key (hook_id, creator_user_id)
);

create index if not exists hook_reads_creator_idx
  on public.hook_reads (creator_user_id, updated_at desc);

alter table public.hooks enable row level security;
alter table public.hook_reads enable row level security;

drop policy if exists "Brands read own hooks" on public.hooks;
create policy "Brands read own hooks"
  on public.hooks for select
  using (auth.uid() = brand_id);

drop policy if exists "Brands insert own hooks" on public.hooks;
create policy "Brands insert own hooks"
  on public.hooks for insert
  with check (auth.uid() = brand_id);

drop policy if exists "Brands update own hooks" on public.hooks;
create policy "Brands update own hooks"
  on public.hooks for update
  using (auth.uid() = brand_id);

drop policy if exists "Brands delete own hooks" on public.hooks;
create policy "Brands delete own hooks"
  on public.hooks for delete
  using (auth.uid() = brand_id);

drop policy if exists "Creators read hook status" on public.hook_reads;
create policy "Creators read hook status"
  on public.hook_reads for select
  using (auth.uid() = creator_user_id);

drop policy if exists "Creators upsert hook status" on public.hook_reads;
create policy "Creators upsert hook status"
  on public.hook_reads for insert
  with check (auth.uid() = creator_user_id);

drop policy if exists "Creators update hook status" on public.hook_reads;
create policy "Creators update hook status"
  on public.hook_reads for update
  using (auth.uid() = creator_user_id);

grant select, insert, update, delete on public.hooks to authenticated;
grant select, insert, update on public.hook_reads to authenticated;
