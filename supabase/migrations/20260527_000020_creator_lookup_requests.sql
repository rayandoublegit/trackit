create table if not exists public.creator_lookup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  query text not null,
  normalized_query text not null,
  created_at timestamptz not null default now()
);

create index if not exists creator_lookup_requests_normalized_query_idx
  on public.creator_lookup_requests(normalized_query);

create index if not exists creator_lookup_requests_created_at_idx
  on public.creator_lookup_requests(created_at desc);

alter table public.creator_lookup_requests enable row level security;

drop policy if exists "Users insert own creator lookup requests" on public.creator_lookup_requests;
create policy "Users insert own creator lookup requests"
  on public.creator_lookup_requests
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users read own creator lookup requests" on public.creator_lookup_requests;
create policy "Users read own creator lookup requests"
  on public.creator_lookup_requests
  for select
  using (auth.uid() = user_id);
