// `npm run test:db` (fifth part) — migration 000050 (mailboxes + outreach
// sequences): replays on top of every migration, re-runs cleanly, tables are
// server-only (RLS on, no policies, no anon/authenticated grants), constraints
// and cascades behave.
import { freshDb, migrate, readMigration } from "./db.mts";

const FILE = "20261009_000050_mailboxes_and_sequences.sql";
const TABLES = ["email_mailboxes", "outreach_sequences", "outreach_sequence_contacts", "outreach_messages"];

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const db = await freshDb();
const failures = await migrate(db);
check("every migration applies (000050 included)", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));

type Row = Record<string, unknown>;
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
async function fails(sql: string): Promise<boolean> {
  try {
    await db.exec(sql);
    return false;
  } catch {
    return true;
  }
}

let rerunError = "";
try {
  await db.exec(readMigration(FILE));
} catch (e) {
  rerunError = (e as Error).message;
}
check("000050 is idempotent (second run)", rerunError === "", rerunError);

for (const t of TABLES) {
  const [rls] = await q(`select relrowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`, [t]);
  check(`${t}: RLS enabled`, rls?.relrowsecurity === true);
  const policies = await q(`select policyname from pg_policies where schemaname = 'public' and tablename = $1`, [t]);
  check(`${t}: no policies (server-only)`, policies.length === 0, policies.map((p) => String(p.policyname)).join(","));
  const grants = await q(
    `select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated')`,
    [t],
  );
  check(`${t}: no anon/authenticated grants`, grants.length === 0, grants.map((g) => `${g.grantee}:${g.privilege_type}`).join(","));
}

// Fixtures
const [user] = await q(`insert into auth.users (email) values ('brand@test.dev') returning id`);
const uid = String(user.id);
await q(`insert into public.workspaces (id, owner_id, name) values ($1, $1, 'Brand') on conflict (id) do nothing`, [uid]);
const [mb] = await q(
  `insert into public.email_mailboxes (workspace_id, user_id, provider, from_email, smtp_host, smtp_port, imap_host, imap_port, username, secret_encrypted)
   values ($1, $1, 'gmail', 'alex@brand.com', 'smtp.gmail.com', 465, 'imap.gmail.com', 993, 'alex@brand.com', 'v1:a:b:c') returning id, daily_limit, status`,
  [uid],
);
check("mailbox defaults: daily_limit 40, status connected", Number(mb.daily_limit) === 40 && mb.status === "connected");
check(
  "one mailbox per address per user (case-insensitive)",
  await fails(`insert into public.email_mailboxes (user_id, provider, from_email) values ('${uid}', 'smtp', 'ALEX@brand.com')`),
);
check("provider is checked", await fails(`insert into public.email_mailboxes (user_id, provider, from_email) values ('${uid}', 'yahoo', 'x@brand.com')`));

const [seq] = await q(
  `insert into public.outreach_sequences (workspace_id, user_id, mailbox_id, name, brand_pitch) values ($1, $1, $2, 'Spring', 'Free product') returning id, status, steps, send_window`,
  [uid, mb.id],
);
check("sequence defaults: draft, 2 steps, Mon-Fri window", seq.status === "draft" && Array.isArray(seq.steps) && (seq.steps as unknown[]).length === 2 && (seq.send_window as { days: number[] }).days.length === 5);
check("sequence status is checked", await fails(`update public.outreach_sequences set status = 'running' where id = '${seq.id}'`));

const [contact] = await q(
  `insert into public.outreach_sequence_contacts (sequence_id, creator_username, platform, creator_email, creator_name) values ($1, 'mia', 'tiktok', 'mia@creator.com', 'Mia') returning id, status`,
  [seq.id],
);
check("contact defaults to pending", contact.status === "pending");
check(
  "unique (sequence_id, creator_email)",
  await fails(`insert into public.outreach_sequence_contacts (sequence_id, creator_email) values ('${seq.id}', 'mia@creator.com')`),
);
check("contact status is checked", await fails(`update public.outreach_sequence_contacts set status = 'opened' where id = '${contact.id}'`));

await q(`insert into public.outreach_messages (contact_id, mailbox_id, step_index, subject, body, message_id, sent_at) values ($1, $2, 0, 's', 'b', '<x@brand.com>', now())`, [contact.id, mb.id]);

await q(`delete from public.email_mailboxes where id = $1`, [mb.id]);
const [afterMailbox] = await q(`select mailbox_id from public.outreach_sequences where id = $1`, [seq.id]);
const [msgAfter] = await q(`select mailbox_id from public.outreach_messages where contact_id = $1`, [contact.id]);
check("deleting a mailbox keeps the sequence and the log (mailbox_id set null)", afterMailbox.mailbox_id === null && msgAfter.mailbox_id === null);

await q(`delete from public.outreach_sequences where id = $1`, [seq.id]);
const [left] = await q(
  `select (select count(*) from public.outreach_sequence_contacts) as c, (select count(*) from public.outreach_messages) as m`,
);
check("deleting a sequence cascades to contacts and messages", Number(left.c) === 0 && Number(left.m) === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
