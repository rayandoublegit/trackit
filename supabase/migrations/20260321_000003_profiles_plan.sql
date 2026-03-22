-- Run in Supabase SQL editor or via migration
alter table public.profiles
  add column if not exists plan text not null default 'spark';

comment on column public.profiles.plan is 'spark | build | scale';
