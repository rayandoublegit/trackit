-- Cooldown marker when a live TikTok avatar scrape fails (deleted account, etc.).
-- /api/creator-avatar skips scrape for 7 days when this is set.
alter table public.creators_index
  add column if not exists avatar_refresh_failed_at timestamptz;

comment on column public.creators_index.avatar_refresh_failed_at is
  'Set when a live TikTok avatar scrape fails. Null = ok to retry. Enforced in /api/creator-avatar (7 days).';

create index if not exists creators_index_avatar_refresh_failed_at_idx
  on public.creators_index (avatar_refresh_failed_at)
  where avatar_refresh_failed_at is not null;
