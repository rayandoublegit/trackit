create extension if not exists pgcrypto;

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null,
  target_customer text not null,
  why_problem text not null,
  existing_solutions text not null,
  unfair_advantage text not null,
  market_conversations text not null,
  email text not null,
  status text not null default 'pending',
  verdict text null,
  created_at timestamptz not null default now()
);

alter table public.analyses enable row level security;

create policy "Users can insert own analyses"
on public.analyses
for insert
with check (auth.uid() = user_id);

create policy "Users can view own analyses"
on public.analyses
for select
using (auth.uid() = user_id);

create policy "Users can update own analyses"
on public.analyses
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant insert on public.analyses to authenticated;
grant select on public.analyses to authenticated;
grant update on public.analyses to authenticated;

