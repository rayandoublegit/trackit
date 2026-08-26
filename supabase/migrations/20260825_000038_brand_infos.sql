-- Brand infos: rules / howto / pricing — one body per kind per brand.

create table if not exists public.brand_infos (
  brand_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('rules', 'howto', 'pricing')),
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (brand_id, kind)
);

alter table public.brand_infos enable row level security;

drop policy if exists "Brands manage own infos" on public.brand_infos;
create policy "Brands manage own infos"
  on public.brand_infos for all
  using (auth.uid() = brand_id)
  with check (auth.uid() = brand_id);

grant select, insert, update, delete on public.brand_infos to authenticated;

-- Migrate legacy brand_rules if present
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'brand_rules'
  ) then
    insert into public.brand_infos (brand_id, kind, body, updated_at)
    select brand_id, 'rules', body, coalesce(updated_at, now())
    from public.brand_rules
    on conflict (brand_id, kind) do nothing;
  end if;
end $$;
