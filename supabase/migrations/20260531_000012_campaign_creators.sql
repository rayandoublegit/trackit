create table if not exists public.campaign_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists campaign_creators_campaign_id_idx on public.campaign_creators(campaign_id);
create index if not exists campaign_creators_creator_id_idx on public.campaign_creators(creator_id);
create index if not exists campaign_creators_user_id_idx on public.campaign_creators(user_id);

alter table public.campaign_creators enable row level security;

create policy "Users manage own campaign creators"
  on public.campaign_creators
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
