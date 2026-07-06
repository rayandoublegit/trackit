-- Shopify orders intentionally removed by the brand should not be re-imported on sync.
create table if not exists public.sales_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shopify_order_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, shopify_order_id)
);

create index if not exists sales_suppressions_user_id_idx on public.sales_suppressions (user_id);

alter table public.sales_suppressions enable row level security;

create policy "sales_suppressions_select_own"
  on public.sales_suppressions
  for select
  using (auth.uid() = user_id);
