-- Creator payout model: commission (%) or RPM (€ / N views.

alter table public.creators
  add column if not exists payout_model text not null default 'commission';

alter table public.creators
  drop constraint if exists creators_payout_model_check;

alter table public.creators
  add constraint creators_payout_model_check
  check (payout_model in ('commission', 'rpm'));

alter table public.creators
  add column if not exists rpm_rate numeric(12, 4);

alter table public.creators
  add column if not exists rpm_per_views integer;

comment on column public.creators.payout_model is
  'commission = % on sales; rpm = € per N views';
comment on column public.creators.rpm_rate is
  'EUR paid per 1000 views when payout_model = rpm (normalized)';
comment on column public.creators.rpm_per_views is
  'Views unit chosen in the accept modal (e.g. 1000)';
