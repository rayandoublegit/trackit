-- Notifications serveur pour la marque (actions des créateurs).
-- Écrites par le service role uniquement, livrées au client via /api/notifications.

create table if not exists public.brand_notifications (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists brand_notifications_undelivered_idx
  on public.brand_notifications (brand_id, created_at)
  where delivered_at is null;

alter table public.brand_notifications enable row level security;
-- Pas de policy : seul le service role (API) lit/écrit cette table.
