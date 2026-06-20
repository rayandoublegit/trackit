create table if not exists public.outreach_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null default '',
  creator_display_name text not null default '',
  creator_avatar text not null default '',
  platform text not null default '',
  message text not null default '',
  status text not null default 'sent',
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_history_user_id_idx on public.outreach_history(user_id);
create index if not exists outreach_history_created_at_idx on public.outreach_history(created_at desc);

alter table public.outreach_history enable row level security;

drop policy if exists "Users manage own outreach history" on public.outreach_history;
create policy "Users manage own outreach history"
  on public.outreach_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
