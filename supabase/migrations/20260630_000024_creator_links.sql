-- Liens créateur ↔ marque (invitation, validation, désactivation).
create table if not exists public.creator_links (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  brand_id uuid not null references public.profiles(id) on delete cascade,
  invite_id uuid,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  unique (creator_id, brand_id)
);

create index if not exists creator_links_brand_status_idx
  on public.creator_links (brand_id, status);

create index if not exists creator_links_creator_idx
  on public.creator_links (creator_id);

alter table public.creator_links enable row level security;

drop policy if exists "Creators can read own brand links" on public.creator_links;
create policy "Creators can read own brand links"
  on public.creator_links for select
  using (auth.uid() = creator_id);

drop policy if exists "Brands can read own creator links" on public.creator_links;
create policy "Brands can read own creator links"
  on public.creator_links for select
  using (auth.uid() = brand_id);

-- Backfill depuis les fiches creators déjà liées.
insert into public.creator_links (creator_id, brand_id, status)
select
  c.linked_user_id,
  c.user_id,
  case when coalesce(c.needs_review, false) then 'pending_review' else 'active' end
from public.creators c
where c.linked_user_id is not null
on conflict (creator_id, brand_id) do nothing;
