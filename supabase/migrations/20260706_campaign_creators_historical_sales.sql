-- Per creator–campaign link: whether pre-join brand sales count toward campaign analytics.
alter table public.campaign_creators
  add column if not exists historical_sales_attached boolean not null default true;

create index if not exists campaign_creators_historical_sales_idx
  on public.campaign_creators (campaign_id, historical_sales_attached);
