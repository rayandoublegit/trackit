-- Onboarding referral attribution: social handles + free-text details per source.
create table if not exists public.user_referral_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  social_handle text,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_referral_attributions_user_id_key unique (user_id)
);

create index if not exists user_referral_attributions_source_idx
  on public.user_referral_attributions(source);

create index if not exists user_referral_attributions_social_handle_idx
  on public.user_referral_attributions(social_handle)
  where social_handle is not null;

alter table public.user_referral_attributions enable row level security;

drop policy if exists "Users manage own referral attribution" on public.user_referral_attributions;
create policy "Users manage own referral attribution"
  on public.user_referral_attributions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
