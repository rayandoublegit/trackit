alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.profiles.stripe_customer_id is 'Stripe Customer id (cus_...) for billing portal and webhooks';
comment on column public.profiles.stripe_subscription_id is 'Active Stripe Subscription id (sub_...) when subscribed';
