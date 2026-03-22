-- Run in Supabase SQL editor or via supabase db push
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy 'Users can view own profile' on public.profiles
  for select using (auth.uid() = id);

create policy 'Users can insert own profile' on public.profiles
  for insert with check (auth.uid() = id);

grant select, insert on public.profiles to authenticated;
