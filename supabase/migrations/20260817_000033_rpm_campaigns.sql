-- RPM campaigns: pay creators per 1,000 content views.
-- commission_type = 'rpm' on campaigns; commission_rate = % of RPM gross paid to creator.

alter table public.campaigns
  add column if not exists rpm_rate numeric(12, 4);

comment on column public.campaigns.rpm_rate is
  'EUR (or brand currency) paid per 1000 views when commission_type = rpm';

alter table public.campaign_content
  add column if not exists views_baseline bigint not null default 0,
  add column if not exists views_last_settled bigint not null default 0,
  add column if not exists rpm_accrued numeric(12, 2) not null default 0;

create table if not exists public.rpm_accruals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  content_id uuid not null references public.creator_content(id) on delete cascade,
  views_from bigint not null,
  views_to bigint not null,
  billable_views bigint not null,
  rpm_rate numeric(12, 4) not null,
  commission_pct numeric(8, 2) not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists rpm_accruals_campaign_idx
  on public.rpm_accruals (campaign_id, created_at desc);

create index if not exists rpm_accruals_creator_idx
  on public.rpm_accruals (creator_id, created_at desc);

create index if not exists rpm_accruals_content_idx
  on public.rpm_accruals (content_id, created_at desc);

alter table public.rpm_accruals enable row level security;

drop policy if exists "Brands read own rpm accruals" on public.rpm_accruals;
create policy "Brands read own rpm accruals"
  on public.rpm_accruals for select
  using (auth.uid() = brand_id);

grant select on public.rpm_accruals to authenticated;
