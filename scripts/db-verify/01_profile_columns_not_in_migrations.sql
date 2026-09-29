-- LOCAL TEST ONLY: profile columns production added by hand (no migration versions them).
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists business_name text,
  add column if not exists account_type text default 'brand',
  add column if not exists onboarding_completed boolean default false,
  add column if not exists role text default 'user',
  add column if not exists referral_source text,
  add column if not exists shopify_store text,
  add column if not exists shopify_store_url text,
  add column if not exists shopify_access_token text,
  add column if not exists auto_payout_monthly boolean default false,
  add column if not exists business_type text,
  add column if not exists email text;
