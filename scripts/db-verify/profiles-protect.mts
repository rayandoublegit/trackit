// `npm run test:db` (eighth part) — migration 000060: a signed-in user can
// still edit their own profile from the browser, but can no longer write their
// own plan, subscription or staff role. Server (service role) writes still work.
import { freshDb, migrate, readMigration } from "./db.mts";

const FILE = "20261029_000060_profiles_protect_billing_columns.sql";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const db = await freshDb();
const failures = await migrate(db);
check("every migration applies on a fresh database (000060 included)", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));

let rerun = "";
try {
  await db.exec(readMigration(FILE));
} catch (e) {
  rerun = (e as Error).message;
}
check("000060 re-runs cleanly (idempotent)", !rerun, rerun);

// Statement by statement (SQL editor): function, drop trigger, create trigger.
const editor = await freshDb();
await migrate(editor, (f) => f === FILE);
const sql = readMigration(FILE);
const fnEnd = sql.indexOf("$$;") + 3;
const parts = [sql.slice(0, fnEnd), ...sql.slice(fnEnd).split(";").map((s) => s.trim()).filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")))];
let editorError = "";
for (const part of parts) {
  try {
    await editor.exec(part);
  } catch (e) {
    editorError = (e as Error).message;
    break;
  }
}
check(`000060 runs statement by statement (${parts.length} statements)`, !editorError, editorError);

const user = "11111111-1111-1111-1111-111111111111";
await db.query("insert into auth.users (id, email) values ($1, 'brand@example.com')", [user]);
await db.query("insert into public.profiles (id, username, plan, role, business_name) values ($1, 'brand1', 'free', 'user', 'Old')", [user]);

async function asUser<T>(fn: () => Promise<T>): Promise<T | Error> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } catch (e) {
    return e as Error;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

const res = await asUser(() =>
  db.query("update public.profiles set plan = 'scale', role = 'admin', subscription_active = true, subscription_status = 'active', business_name = 'Maison Lune' where id = $1", [user]),
);
check("the user's own update goes through (no error)", !(res instanceof Error), res instanceof Error ? res.message : "");
const row = (await db.query<Record<string, unknown>>("select plan, role, subscription_active, subscription_status, business_name from public.profiles where id = $1", [user])).rows[0];
check("business name changed (normal fields stay editable)", row.business_name === "Maison Lune", String(row.business_name));
check("plan kept (browser cannot upgrade itself)", row.plan === "free", String(row.plan));
check("role kept (browser cannot make itself admin)", row.role === "user", String(row.role));
check("subscription kept", row.subscription_active !== true && row.subscription_status !== "active", `${row.subscription_active} / ${row.subscription_status}`);

// Browser insert (upsert before the signup trigger): forced to free / user.
const other = "22222222-2222-2222-2222-222222222222";
await db.query("insert into auth.users (id, email) values ($1, 'new@example.com')", [other]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${other}', false);`);
let insertError = "";
try {
  await db.query("insert into public.profiles (id, username, plan, role, business_name) values ($1, 'brand2', 'scale', 'admin', 'New')", [other]);
} catch (e) {
  insertError = (e as Error).message;
}
await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
const inserted = (await db.query<Record<string, unknown>>("select plan, role, business_name from public.profiles where id = $1", [other])).rows[0];
check("browser insert works", !insertError && inserted?.business_name === "New", insertError);
check("browser insert is forced to the free plan and user role", inserted?.plan === "free" && inserted?.role === "user", `${inserted?.plan} / ${inserted?.role}`);

// Server (service role) and SQL editor (owner) still change plans.
// Supabase gives service_role BYPASSRLS; the local harness role does not have it.
await db.exec("alter role service_role bypassrls");
await db.exec("set role service_role");
await db.query("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [user]);
await db.exec("reset role");
const afterServer = (await db.query<Record<string, unknown>>("select plan, subscription_status from public.profiles where id = $1", [user])).rows[0];
check("service role (webhooks) can still set the plan", afterServer.plan === "pro" && afterServer.subscription_status === "active", `${afterServer.plan}`);
await db.query("update public.profiles set role = 'staff' where id = $1", [user]);
const afterOwner = (await db.query<Record<string, unknown>>("select role from public.profiles where id = $1", [user])).rows[0];
check("SQL editor (owner) can still set the role", afterOwner.role === "staff", String(afterOwner.role));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
