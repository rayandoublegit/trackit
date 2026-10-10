-- Connected mailboxes and automatic email outreach sequences (brand side).
-- Idempotent, SQL Editor safe (no DO blocks). Every table is server-only:
-- RLS on, no policies; the app reads and writes them with the secret key.
--
-- email_mailboxes            a brand's own mailbox (SMTP + IMAP today, OAuth later)
-- outreach_sequences         an automatic campaign: pitch, tone, steps, send window
-- outreach_sequence_contacts one creator inside a sequence and where they are
-- outreach_messages          every email sent (or failed) by a sequence

-- 1) Mailboxes ---------------------------------------------------------------
create table if not exists public.email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'smtp',
  auth_type text not null default 'password',
  from_name text not null default '',
  from_email text not null,
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean not null default true,
  imap_host text,
  imap_port integer,
  username text,
  -- AES-256-GCM ciphertext (MAILBOX_ENCRYPTION_KEY). Never sent to the browser.
  secret_encrypted text,
  daily_limit integer not null default 40,
  signature text not null default '',
  status text not null default 'connected',
  last_error text,
  last_checked_at timestamptz,
  -- Earliest time the sender cron may send the next email (random 60-180 s spacing).
  next_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_mailboxes drop constraint if exists email_mailboxes_provider_check;
alter table public.email_mailboxes add constraint email_mailboxes_provider_check
  check (provider in ('gmail', 'outlook', 'smtp'));
alter table public.email_mailboxes drop constraint if exists email_mailboxes_auth_type_check;
alter table public.email_mailboxes add constraint email_mailboxes_auth_type_check
  check (auth_type in ('password', 'oauth'));
alter table public.email_mailboxes drop constraint if exists email_mailboxes_status_check;
alter table public.email_mailboxes add constraint email_mailboxes_status_check
  check (status in ('connected', 'error'));
alter table public.email_mailboxes drop constraint if exists email_mailboxes_daily_limit_check;
alter table public.email_mailboxes add constraint email_mailboxes_daily_limit_check
  check (daily_limit between 1 and 500);

create unique index if not exists email_mailboxes_user_email_uidx
  on public.email_mailboxes (user_id, lower(from_email));
create index if not exists email_mailboxes_workspace_idx on public.email_mailboxes (workspace_id);

-- 2) Sequences (automatic campaigns) -----------------------------------------
create table if not exists public.outreach_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid references public.email_mailboxes(id) on delete set null,
  name text not null default '',
  brand_pitch text not null default '',
  tone text not null default 'friendly',
  lang text not null default 'en',
  -- [{ "delay_days": 0 }, { "delay_days": 3 }, ...]: the first email + up to 3 follow-ups.
  steps jsonb not null default '[{"delay_days":0},{"delay_days":3}]'::jsonb,
  status text not null default 'draft',
  -- { "days": [1,2,3,4,5], "start_hour": 9, "end_hour": 18, "timezone": "Europe/Paris" }
  send_window jsonb not null default '{"days":[1,2,3,4,5],"start_hour":9,"end_hour":18,"timezone":"Europe/Paris"}'::jsonb,
  launched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_sequences drop constraint if exists outreach_sequences_status_check;
alter table public.outreach_sequences add constraint outreach_sequences_status_check
  check (status in ('draft', 'active', 'paused', 'done'));
alter table public.outreach_sequences drop constraint if exists outreach_sequences_lang_check;
alter table public.outreach_sequences add constraint outreach_sequences_lang_check
  check (lang in ('en', 'fr'));

create index if not exists outreach_sequences_user_idx on public.outreach_sequences (user_id, created_at desc);
create index if not exists outreach_sequences_workspace_idx on public.outreach_sequences (workspace_id);
create index if not exists outreach_sequences_active_idx on public.outreach_sequences (status) where status = 'active';
create index if not exists outreach_sequences_mailbox_idx on public.outreach_sequences (mailbox_id);

-- 3) Contacts inside a sequence ---------------------------------------------
create table if not exists public.outreach_sequence_contacts (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.outreach_sequences(id) on delete cascade,
  creator_username text not null default '',
  platform text not null default '',
  creator_email text not null,
  creator_name text not null default '',
  -- The stored creator facts used to write the email, plus the reviewed draft.
  personalization jsonb not null default '{}'::jsonb,
  step_index integer not null default 0,
  next_send_at timestamptz,
  status text not null default 'pending',
  last_message_id text,
  thread_subject text,
  last_error text,
  sent_count integer not null default 0,
  attempts integer not null default 0,
  history_id uuid,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_sequence_contacts drop constraint if exists outreach_sequence_contacts_status_check;
alter table public.outreach_sequence_contacts add constraint outreach_sequence_contacts_status_check
  check (status in ('pending', 'sent', 'replied', 'bounced', 'unsubscribed', 'failed'));

create unique index if not exists outreach_sequence_contacts_seq_email_uidx
  on public.outreach_sequence_contacts (sequence_id, creator_email);
create index if not exists outreach_sequence_contacts_sequence_idx
  on public.outreach_sequence_contacts (sequence_id, status);
create index if not exists outreach_sequence_contacts_due_idx
  on public.outreach_sequence_contacts (next_send_at)
  where status in ('pending', 'sent') and next_send_at is not null;
create index if not exists outreach_sequence_contacts_email_idx
  on public.outreach_sequence_contacts (lower(creator_email));

-- 4) Message log ---------------------------------------------------------------
create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.outreach_sequence_contacts(id) on delete cascade,
  mailbox_id uuid references public.email_mailboxes(id) on delete set null,
  step_index integer not null default 0,
  subject text not null default '',
  body text not null default '',
  message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists outreach_messages_contact_idx on public.outreach_messages (contact_id, step_index);
create index if not exists outreach_messages_mailbox_sent_idx on public.outreach_messages (mailbox_id, sent_at desc);
create index if not exists outreach_messages_message_id_idx on public.outreach_messages (message_id);

-- 5) Server-only -------------------------------------------------------------
alter table public.email_mailboxes enable row level security;
alter table public.outreach_sequences enable row level security;
alter table public.outreach_sequence_contacts enable row level security;
alter table public.outreach_messages enable row level security;

revoke all on public.email_mailboxes from anon, authenticated;
revoke all on public.outreach_sequences from anon, authenticated;
revoke all on public.outreach_sequence_contacts from anon, authenticated;
revoke all on public.outreach_messages from anon, authenticated;
