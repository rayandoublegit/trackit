-- Tracks paid Stripe subscription; default false for new signups (plan may stay 'spark' until checkout).
alter table public.profiles
  add column if not exists subscription_active boolean not null default false;

comment on column public.profiles.subscription_active is 'true after successful Stripe checkout (webhook); Spark-paid vs unpaid Spark both use plan spark';
