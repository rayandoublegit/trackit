-- Brand rules: one document per brand, shown read-only to linked creators.

create table if not exists public.brand_rules (
  brand_id uuid primary key references public.profiles(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.brand_rules enable row level security;

drop policy if exists "Brands manage own rules" on public.brand_rules;
create policy "Brands manage own rules"
  on public.brand_rules for all
  using (auth.uid() = brand_id)
  with check (auth.uid() = brand_id);

grant select, insert, update, delete on public.brand_rules to authenticated;
