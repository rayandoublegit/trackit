-- Trace les comptes créateurs supprimés par une marque (message à la connexion).
create table if not exists public.creator_deactivations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  brand_id uuid not null references public.profiles(id) on delete cascade,
  brand_name text not null,
  creator_handle text,
  deactivated_at timestamptz not null default now()
);

create unique index if not exists creator_deactivations_email_brand_idx
  on public.creator_deactivations (email, brand_id);

create index if not exists creator_deactivations_email_lookup_idx
  on public.creator_deactivations (email);

alter table public.creator_deactivations enable row level security;
