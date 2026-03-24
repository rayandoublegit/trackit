alter table public.profiles
  add column if not exists subscription_status text default 'inactive';

comment on column public.profiles.subscription_status is 'inactive until Stripe checkout completes (webhook sets active)';

-- Backfill from legacy flag and higher tiers so existing users are not locked out
update public.profiles
set subscription_status = 'active'
where coalesce(subscription_active, false) = true
   or lower(plan) in ('build', 'scale');
