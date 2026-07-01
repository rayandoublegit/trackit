-- Flag explicite : créateur visible dans « dashboards actifs » (Invitations).
alter table public.creators add column if not exists dashboard_active boolean not null default false;

create index if not exists creators_brand_dashboard_active_idx
  on public.creators (user_id, dashboard_active)
  where dashboard_active = true;

-- Backfill : créateurs déjà validés (dans Gérer + compte lié).
update public.creators
set dashboard_active = true
where linked_user_id is not null
  and coalesce(needs_review, false) = false
  and dashboard_active = false;
