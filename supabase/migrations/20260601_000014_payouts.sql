create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'pending',
  stripe_transfer_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payouts_user_id_idx on public.payouts(user_id);
create index if not exists payouts_creator_id_idx on public.payouts(creator_id);
create index if not exists payouts_paid_at_idx on public.payouts(paid_at desc);

alter table public.payouts enable row level security;

drop policy if exists "Users manage own payouts" on public.payouts;
create policy "Users manage own payouts"
  on public.payouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
