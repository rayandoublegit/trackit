create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_key text not null,
  device_label text,
  user_agent text,
  ip_address text,
  location_label text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id, last_active_at desc);

alter table public.user_sessions enable row level security;

create policy "Users can view own sessions"
  on public.user_sessions for select
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on public.user_sessions for delete
  using (auth.uid() = user_id);

comment on table public.user_sessions is 'Tracked browser sessions for security settings';
