// `npm run test:db` (seventh part) — migration 000052 (feature_usage): applies
// on top of every migration, re-runs cleanly, also runs statement by statement
// (Supabase SQL editor), is server only (RLS on, no grants to anon /
// authenticated), and answers the hourly count the server reads.
import { freshDb, migrate, readMigration } from "./db.mts";

const FILE = "20261009_000052_feature_usage.sql";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

type Row = Record<string, unknown>;

/** Top-level statements (this file has no dollar-quoted bodies). */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── 1. Statement by statement on a database with every earlier migration ──
const editor = await freshDb();
const before = await migrate(editor, (f) => f === FILE);
check("every migration before 000052 applies", before.length === 0, before.map((f) => f.file).join(", "));
let editorError = "";
const statements = splitStatements(readMigration(FILE));
for (const statement of statements) {
  try {
    await editor.exec(statement);
  } catch (e) {
    editorError = `${(e as Error).message} :: ${statement.slice(0, 80)}`;
    break;
  }
}
check(`000052 runs statement by statement (${statements.length} statements, SQL editor mode)`, !editorError, editorError);
let rerun = "";
try {
  await editor.exec(readMigration(FILE));
} catch (e) {
  rerun = (e as Error).message;
}
check("000052 re-runs cleanly (idempotent)", !rerun, rerun);

// ── 2. Fresh database with every migration ──
const db = await freshDb();
const failures = await migrate(db);
check("every migration applies on a fresh database (000052 included)", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];

const [rls] = await q("select relrowsecurity from pg_class where relname = 'feature_usage'");
check("RLS is on", rls?.relrowsecurity === true);
const [policies] = await q("select count(*)::int as n from pg_policies where tablename = 'feature_usage'");
check("no policies (server only)", policies.n === 0);
for (const role of ["anon", "authenticated"]) {
  const [grant] = await q("select has_table_privilege($1, 'public.feature_usage', 'select') as s, has_table_privilege($1, 'public.feature_usage', 'insert') as i", [role]);
  check(`${role} can neither read nor write`, grant.s === false && grant.i === false);
}
const [svc] = await q("select has_table_privilege('service_role', 'public.feature_usage', 'insert') as i");
check("service_role can write", svc.i === true);
const [idx] = await q("select count(*)::int as n from pg_indexes where indexname = 'feature_usage_owner_feature_used_at_idx'");
check("index on (owner_id, feature, used_at)", idx.n === 1);

const owner = (await one("insert into auth.users (email) values ('brand@usage.local') returning id")).id as string;
const other = (await one("insert into auth.users (email) values ('other@usage.local') returning id")).id as string;
await q(
  `insert into public.feature_usage (owner_id, feature, used_at, meta) values
   ($1, 'mino-analysis', now() - interval '10 minutes', '{"site":"a.com"}'),
   ($1, 'mino-analysis', now() - interval '50 minutes', '{}'),
   ($1, 'mino-analysis', now() - interval '2 hours', '{}'),
   ($2, 'mino-analysis', now() - interval '5 minutes', '{}')`,
  [owner, other],
);
const [hour] = await q(
  "select count(*)::int as n from public.feature_usage where owner_id = $1 and feature = 'mino-analysis' and used_at >= now() - interval '1 hour'",
  [owner],
);
check("the hourly count sees only this owner's last hour", hour.n === 2, String(hour.n));
const [defaults] = await q("select meta, used_at is not null as has_time from public.feature_usage where owner_id = $1 order by used_at desc limit 1", [other]);
check("meta and used_at have defaults", typeof defaults.meta === "object" && defaults.has_time === true);
let badFeature = "";
try {
  await db.query("insert into public.feature_usage (owner_id, feature) values ($1, '')", [owner]);
} catch (e) {
  badFeature = (e as Error).message;
}
check("an empty feature name is refused", /check/i.test(badFeature));
await q("delete from auth.users where id = $1", [owner]);
const [gone] = await q("select count(*)::int as n from public.feature_usage where owner_id = $1", [owner]);
check("rows go with the deleted account", gone.n === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
