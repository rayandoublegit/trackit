create table if not exists public.niche_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  niche text not null,
  normalized_niche text not null,
  product_context text,
  created_at timestamptz not null default now()
);

create index if not exists niche_requests_normalized_niche_idx
  on public.niche_requests(normalized_niche);

create index if not exists niche_requests_created_at_idx
  on public.niche_requests(created_at desc);

alter table public.niche_requests enable row level security;

drop policy if exists "Users insert own niche requests" on public.niche_requests;
create policy "Users insert own niche requests"
  on public.niche_requests
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users read own niche requests" on public.niche_requests;
create policy "Users read own niche requests"
  on public.niche_requests
  for select
  using (auth.uid() = user_id);
