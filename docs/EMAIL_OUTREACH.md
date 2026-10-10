# Automatic email outreach (brand mailbox + sequences)

Brands connect their own mailbox and run automatic, personalised email
campaigns to creators from Outreach (card "Automatic email campaigns") and
Settings > General ("Connected mailboxes"). Pro and Scale only
(`canUseAIOutreach`).

## Decision: SMTP + IMAP now, OAuth later

Sending through Gmail / Microsoft with OAuth needs an app registration and, for
the Gmail send scope, a Google security verification that takes weeks. So the
mailbox connection uses **SMTP (send) + IMAP (reply detection)** with a
password today. It works now with Gmail / Google Workspace (app password),
Outlook / Microsoft 365 (authenticated SMTP enabled), OVH, Zoho and any custom
domain.

Everything goes through a driver interface (`src/lib/mailbox-driver.ts`:
`verifySmtp`, `verifyImap`, `send`, `fetchInbox`), chosen by
`email_mailboxes.auth_type`. Adding Gmail API / Microsoft Graph later means a
new driver for `auth_type = 'oauth'` (plus token storage); routes, crons and UI
stay the same.

## Data (migration `20261009_000050_mailboxes_and_sequences.sql`)

All four tables are server-only (RLS on, no policies, anon/authenticated revoked).

- `email_mailboxes`: SMTP/IMAP settings, `secret_encrypted` (AES-256-GCM with
  `MAILBOX_ENCRYPTION_KEY`, never returned to the browser), `daily_limit`,
  `next_send_at` (spacing), `status` connected/error.
- `outreach_sequences`: pitch, tone, language, `steps` (first email + up to 3
  follow-ups with `delay_days`), `send_window` (weekdays, hours, time zone),
  status draft/active/paused/done.
- `outreach_sequence_contacts`: one creator per sequence (unique email), step,
  `next_send_at`, status pending/sent/replied/bounced/unsubscribed/failed,
  stored facts and the reviewed first-email draft in `personalization`.
- `outreach_messages`: every email sent (Message-ID) or failed (error).

Sequence emails are mirrored into `outreach_history` (platform "Email"), so the
existing Outreach history shows them; replies set it to "replied".

## Personalisation

`src/lib/outreach-sequences-prompt.ts` + `generateSequenceEmail` in
`src/lib/outreach-sequences-server.ts`, model `claude-sonnet-5-5`, JSON output.

- Facts come only from stored data: `creators_index` (name, niche, followers,
  avg views, engagement, country, language, bio) and the latest
  `creator_videos.caption`. Unknown values are left out, numbers are given
  pre-formatted.
- Number guard: any number in the draft that is not in the facts or the brand's
  pitch triggers one rewrite; a second failure rejects the first email (shown
  to the brand) or falls back to a number-free template for follow-ups.
- Language: the creator's (`creators_index.language`) when known, else the
  sequence language.
- **When:** the first email for 2-3 contacts is generated at preview time and
  stored; the cron sends exactly that draft. Everyone else is generated at send
  time (fresh stats, no AI cost for creators who reply or opt out before their
  turn, instant launch). Follow-ups are always generated at send time from the
  first email.

## Crons (vercel.json)

- `/api/cron/outreach-send` every 10 min: per mailbox at most one email per
  run, only inside the sequence window, under the rolling 24 h `daily_limit`
  and after `next_send_at` (random 60-180 s after the previous send). Follow-ups
  use `In-Reply-To` / `References` and "Re: subject". Plain text + simple HTML,
  signature, opt-out sentence, `List-Unsubscribe`. SMTP auth errors flag the
  mailbox and stop it until reconnected; failures retry 3 times.
  With a 10-minute schedule a mailbox sends at most ~6 emails an hour.
- `/api/cron/outreach-replies` every 20 min: IMAP INBOX since the first send;
  matches by Message-ID, else sender address; "stop"/"unsubscribe" replies and
  bounces (mailer-daemon) suppress the address in all the brand's sequences.

## Env

`MAILBOX_ENCRYPTION_KEY` (32 random bytes, base64:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`),
`ANTHROPIC_API_KEY`, `CRON_SECRET`, Supabase keys. Changing the encryption key
makes stored passwords unreadable (mailboxes switch to "error" and must be
reconnected).

## Limits and deliverability

- Gmail: ~500 recipients/day (consumer), ~2,000 (Workspace), but cold outreach
  should stay at 30-50 a day per mailbox. Microsoft 365: 10,000 recipients/day,
  30 messages/minute; same advice.
- Set SPF, DKIM and DMARC on the sending domain; warm up new mailboxes (start
  at 10-20 a day, raise slowly); prefer a secondary domain for volume.
- OVH / custom SMTP servers do not file a copy in "Sent" (Gmail and Microsoft
  365 do). Opens are not tracked (no pixel).
