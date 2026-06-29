-- Sales attributed to creators (Shopify webhook, manual entry, sync backfill).
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  shopify_order_id text not null,
  order_amount numeric(12, 2) not null default 0,
  commission_amount numeric(12, 2) not null default 0,
  discount_code_used text,
  shop_domain text,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create unique index if not exists sales_shopify_order_id_key on public.sales (shopify_order_id);
create index if not exists sales_user_id_created_at_idx on public.sales (user_id, created_at desc);
create index if not exists sales_creator_id_idx on public.sales (creator_id);
create index if not exists sales_campaign_id_idx on public.sales (campaign_id);

alter table public.sales enable row level security;

drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own" on public.sales
  for select using (auth.uid() = user_id);

drop policy if exists "sales_insert_own" on public.sales;
create policy "sales_insert_own" on public.sales
  for insert with check (auth.uid() = user_id);
