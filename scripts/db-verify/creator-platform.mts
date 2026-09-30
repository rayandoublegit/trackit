// `npm run test:db` (third part) — migration 000046 on a production-like
// database: creators stored as 'TikTok' and 'tiktok' (and twice), their
// history, queue and saved references; then the merge, the lowercase-only
// guarantees, idempotency and the weekly queue functions.
import { freshDb, migrate, readMigration } from "./db.mts";

const NORMALIZE = "20261001_000046_creator_platform_normalize.sql";

type Row = Record<string, unknown>;
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const db = await freshDb();
const failures = await migrate(db, (file) => file === NORMALIZE);
check("every migration before 000046 applies", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));

const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one(sql, params)).n);
async function fails(sql: string): Promise<boolean> {
  try {
    await db.exec(sql);
    return false;
  } catch {
    return true;
  }
}

// ── Production-like data, before the migration ─────────────────────────────────
// luna.beauty: the same creator twice with both spellings. The 'TikTok' row was
//   scraped (keep it); the 'tiktok' row holds an email and a niche to carry over.
// Nora.D / nora.d: the same TikTok creator stored with two username cases.
// mia: an Instagram creator stored as 'ig_mia' (Instagram) and 'mia' (instagram).
// kai: a TikTok creator and a different Instagram creator 'Kai' (no ig_ prefix).
await q(`insert into creators_index (username, platform, followers, niches, email, last_scraped_at, enrichment_status, first_seen_at) values
  ('luna.beauty', 'TikTok', 100000, '{beauty}', null, now() - interval '2 days', 'enriched', now() - interval '20 days'),
  ('luna.beauty', 'tiktok', 90000, '{skincare}', 'luna@example.com', null, 'pending', now() - interval '40 days'),
  ('Nora.D', 'TikTok', 50000, '{fitness}', null, now() - interval '9 days', 'enriched', now()),
  ('nora.d', 'tiktok', 52000, '{fitness}', null, now() - interval '1 day', 'enriched', now()),
  ('solo', 'TikTok', 7000, '{}', null, null, 'pending', now()),
  ('nullplat', null, 8000, '{}', null, null, 'pending', now()),
  ('ig_mia', 'Instagram', 30000, '{fashion}', null, now() - interval '3 days', 'enriched', now()),
  ('mia', 'instagram', 29000, '{}', 'mia@example.com', null, 'pending', now()),
  ('kai', 'tiktok', 11000, '{}', null, now() - interval '1 day', 'enriched', now()),
  ('Kai', 'Instagram', 12000, '{}', null, now() - interval '1 day', 'enriched', now())`);
const before = await count("select count(*) as n from creators_index");

await q(`insert into creator_snapshots (platform, username, captured_on, captured_at, followers) values
  ('TikTok', 'luna.beauty', current_date - 1, now() - interval '1 day', 99000),
  ('tiktok', 'luna.beauty', current_date - 1, now() - interval '20 hours', 99500),
  ('tiktok', 'luna.beauty', current_date - 8, now() - interval '8 days', 95000),
  ('TikTok', 'Nora.D', current_date - 9, now() - interval '9 days', 49000),
  ('tiktok', 'nora.d', current_date - 1, now() - interval '1 day', 52000),
  ('Instagram', 'Kai', current_date - 1, now() - interval '1 day', 12000)`);
await q(`insert into creator_videos (platform, video_id, username, views, last_scraped_at) values
  ('TikTok', 'v1', 'luna.beauty', 1000, now() - interval '2 days'),
  ('tiktok', 'v1', 'luna.beauty', 1500, now() - interval '1 day'),
  ('TikTok', 'v2', 'Nora.D', 800, now()),
  ('Instagram', 'k1', 'Kai', 400, now())`);
await q(`insert into creator_video_snapshots (platform, video_id, captured_on, views) values
  ('TikTok', 'v1', current_date - 1, 1000), ('tiktok', 'v1', current_date - 1, 1500), ('TikTok', 'v2', current_date - 1, 800)`);
await q(`insert into scrape_jobs (kind, platform, target, status) values
  ('creator_refresh', 'TikTok', 'luna.beauty', 'queued'),
  ('creator_refresh', 'tiktok', 'luna.beauty', 'queued'),
  ('creator_refresh', 'TikTok', 'Nora.D', 'done'),
  ('creator_discover', 'TikTok', 'Skincare', 'queued')`);

const user = (await one("insert into auth.users (email) values ('brand@test.local') returning id")).id as string;
const ws = (await one("insert into workspaces (owner_id, name) values ($1, 'Brand') returning id", [user])).id as string;
await q(
  `insert into discovery_saved (user_id, workspace_id, creator_username, platform, snapshot, updated_at) values
    ($1, $2, 'Nora.D', 'TikTok', '{"platform":"TikTok","followers":50000}', now() - interval '5 days'),
    ($1, $2, 'nora.d', 'tiktok', null, now()),
    ($1, $2, 'Kai', 'Instagram', '{"platform":"Instagram"}', now())`,
  [user, ws],
);
const folder = (await one("insert into discovery_folders (user_id, name) values ($1, 'Shortlist') returning id", [user])).id as string;
await q("insert into discovery_folder_items (folder_id, creator_username, added_at) values ($1, 'Nora.D', now() - interval '3 days'), ($1, 'nora.d', now())", [folder]);
await q("insert into creators (user_id, handle, platform) values ($1, 'NoraD', 'TikTok'), ($1, 'mia', 'Instagram')", [user]);

// ── The migration ──────────────────────────────────────────────────────────────
let migrationError = "";
try {
  await db.exec(readMigration(NORMALIZE));
} catch (e) {
  migrationError = (e as Error).message;
}
check("migration 000046 applies on production-like data", !migrationError, migrationError);

const creators = await q("select username, platform, followers, email, niches, first_seen_at from creators_index order by username");
const byKey = new Map(creators.map((c) => [String(c.username), c]));
check("every platform is lowercase", creators.every((c) => c.platform === String(c.platform).toLowerCase()), creators.map((c) => c.platform).join(","));
check("a missing platform becomes tiktok", byKey.get("nullplat")?.platform === "tiktok");
check("duplicates are merged: 10 rows become 7", creators.length === 7 && before === 10, creators.map((c) => `${c.platform}:${c.username}`).join(" "));

const luna = byKey.get("luna.beauty");
check("the most recently scraped row is kept", Number(luna?.followers) === 100000, String(luna?.followers));
check("the kept row takes what only the duplicate had", luna?.email === "luna@example.com", String(luna?.email));
check("niches of both rows are kept", JSON.stringify([...((luna?.niches as string[]) ?? [])].sort()) === '["beauty","skincare"]', JSON.stringify(luna?.niches));
check("the oldest first-seen date is kept", Date.now() - new Date(String(luna?.first_seen_at)).getTime() > 39 * 86_400_000);

const nora = byKey.get("nora.d");
check("usernames differing only by case are one creator", !byKey.has("Nora.D") && Number(nora?.followers) === 52000, String(nora?.followers));
check("ig_mia and mia (Instagram) are one creator under ig_mia", byKey.has("ig_mia") && !byKey.has("mia") && byKey.get("ig_mia")?.email === "mia@example.com");
check("a TikTok and an Instagram creator sharing a handle both stay", byKey.get("kai")?.platform === "tiktok" && byKey.get("ig_kai")?.platform === "instagram");

const snaps = await q("select platform, username, captured_on::text as day, followers from creator_snapshots order by username, captured_on");
check("snapshots are lowercase", snaps.every((s) => s.platform === String(s.platform).toLowerCase() && s.username === String(s.username).toLowerCase()));
check("one snapshot per creator per day, the latest wins", snaps.filter((s) => s.username === "luna.beauty").length === 2 && Number(snaps.find((s) => s.username === "luna.beauty" && Number(s.followers) !== 95000)?.followers) === 99500);
check("history of the merged creator is continuous", snaps.filter((s) => s.username === "nora.d").length === 2, snaps.filter((s) => s.username === "nora.d").map((s) => s.day).join(","));
check("history follows a renamed creator", snaps.some((s) => s.platform === "instagram" && s.username === "ig_kai"));

const vids = await q("select platform, video_id, username, views from creator_videos order by video_id");
check("videos: one row per video, the freshest kept", vids.filter((v) => v.video_id === "v1").length === 1 && Number(vids.find((v) => v.video_id === "v1")?.views) === 1500);
check("videos point at the kept creator", vids.find((v) => v.video_id === "v2")?.username === "nora.d" && vids.find((v) => v.video_id === "k1")?.username === "ig_kai");
check("video formats are filled", (await count("select count(*) as n from creator_videos where format is null")) === 0);
check("video snapshots are deduplicated", (await count("select count(*) as n from creator_video_snapshots where video_id = 'v1'")) === 1);

const jobs = await q("select kind, platform, target, status from scrape_jobs order by id");
check("queue: one live job per creator, the duplicate closed", jobs.filter((j) => j.target === "luna.beauty" && j.status === "queued").length === 1 && jobs.filter((j) => j.status === "failed").length === 1);
check("queue: targets and platforms are lowercase", jobs.every((j) => j.platform === "tiktok" && j.target === String(j.target).toLowerCase()), jobs.map((j) => `${j.platform}:${j.target}`).join(" "));

const saved = await q("select creator_username, platform, snapshot from discovery_saved order by creator_username");
check("saved creators: one per workspace, on the kept key", saved.length === 2 && saved.some((s) => s.creator_username === "nora.d") && saved.some((s) => s.creator_username === "ig_kai"), saved.map((s) => s.creator_username).join(","));
check("saved snapshots carry a lowercase platform", saved.every((s) => s.platform === String(s.platform).toLowerCase() && (!s.snapshot || (s.snapshot as Row).platform === String((s.snapshot as Row).platform).toLowerCase())));
const items = await q("select creator_username from discovery_folder_items");
check("a list holds the merged creator once", items.length === 1 && items[0].creator_username === "nora.d");
check("a brand's creators get a lowercase platform", (await count("select count(*) as n from creators where platform <> lower(platform)")) === 0);

// ── Idempotent ─────────────────────────────────────────────────────────────────
let secondError = "";
try {
  await db.exec(readMigration(NORMALIZE));
} catch (e) {
  secondError = (e as Error).message;
}
check("running the migration twice changes nothing", !secondError && (await count("select count(*) as n from creators_index")) === 7, secondError);

// ── Only lowercase from now on ─────────────────────────────────────────────────
await q("insert into creators_index (username, platform, followers) values ('@Zed.Fit', 'TikTok', 1000)");
const zed = await one("select username, platform from creators_index where username = 'zed.fit'");
check("old code writing 'TikTok' is lowercased on the way in", zed?.platform === "tiktok");
await q("insert into creators_index (username, platform, followers) values ('LUNA.BEAUTY', 'TikTok', 123) on conflict (username) do update set followers = excluded.followers");
check("an upsert with another spelling updates the same creator", (await count("select count(*) as n from creators_index where username = 'luna.beauty' and followers = 123")) === 1 && (await count("select count(*) as n from creators_index")) === 8);
check("a mixed-case snapshot is refused", await fails("insert into creator_snapshots (platform, username, captured_on) values ('TikTok', 'x', current_date)"));
check("a mixed-case video is refused", await fails("insert into creator_videos (platform, video_id, username) values ('YouTube', 'y1', 'x')"));
check("a mixed-case queue job is refused", await fails("insert into scrape_jobs (kind, platform, target) values ('creator_refresh', 'TikTok', 'x')"));
await q("insert into discovery_saved (user_id, workspace_id, creator_username, platform) values ($1, $2, 'solo', 'TikTok')", [user, ws]);
check("saving with 'TikTok' stores tiktok", (await one("select platform from discovery_saved where creator_username = 'solo'"))?.platform === "tiktok");
check("an unknown video format is refused", await fails("insert into creator_videos (platform, video_id, username, format) values ('youtube', 'y2', 'x', 'vertical')"));

// ── Weekly queue ───────────────────────────────────────────────────────────────
await q("update scrape_jobs set status = 'done', finished_at = now() where status in ('queued', 'running')");
await q(`update creators_index set scrape_failures = 0, next_scrape_at = case username
  when 'luna.beauty' then now() + interval '5 days'   -- due this week
  when 'nora.d' then now() + interval '6 days 12 hours' -- refreshed a few hours ago: not yet
  when 'solo' then now() + interval '20 days'          -- backing off after failures
  else null end`);
await q("update creators_index set scrape_failures = 6 where username = 'nullplat'");
const weekly = Number((await one("select enqueue_weekly_refresh(100, interval '6 days', null) as n")).n);
const queuedNow = (await q("select target from scrape_jobs where status = 'queued' and kind = 'creator_refresh' order by target")).map((r) => String(r.target));
check("the weekly enqueue takes everyone due this week, not those backing off or given up", weekly === 5 && !queuedNow.includes("nora.d") && !queuedNow.includes("solo") && !queuedNow.includes("nullplat"), `${weekly}: ${queuedNow.join(",")}`);
check("enqueueing again the same week adds nothing", Number((await one("select enqueue_weekly_refresh(100, interval '6 days', null) as n")).n) === 0);
const igOnly = Number((await one("select enqueue_weekly_refresh(100, interval '30 days', array['instagram']) as n")).n);
check("the weekly enqueue can be limited to platforms", igOnly === 0);
await q("update scrape_jobs set status = 'done', finished_at = now() - interval '40 days' where status = 'queued'");
await q("select enqueue_weekly_refresh(0, interval '6 days', null)");
check("finished jobs older than 30 days are pruned", (await count("select count(*) as n from scrape_jobs where finished_at < now() - interval '30 days'")) === 0);

await q("update creators_index set last_scraped_at = now() - interval '4 days', scrape_failures = 0 where username in ('nora.d', 'kai')");
const tracked = Number((await one("select enqueue_tracked_creators(50, interval '3 days', null) as n")).n);
const trackedJobs = (await q("select target, priority from scrape_jobs where status = 'queued' and kind = 'creator_refresh'")).map((r) => `${r.target}:${r.priority}`);
// Tracked: nora.d (saved + in a list), ig_mia (a brand's Instagram creator 'mia'),
// solo (saved, never scraped). kai is tracked by nobody; ig_kai was scraped yesterday.
check(
  "creators a brand works with are refreshed sooner, first in line",
  tracked === 3 && trackedJobs.sort().join() === "ig_mia:1,nora.d:1,solo:1",
  `${tracked}: ${trackedJobs.join(",")}`,
);

await q("select refresh_creator_rollup('TikTok', 'Nora.D')");
check("the rollup finds a creator whatever the spelling asked", Number((await one("select history_days from creators_index where username = 'nora.d'")).history_days) === 2);

let rpcBlocked = false;
try {
  await db.exec("set role anon");
  await db.query("select enqueue_weekly_refresh(1)");
} catch {
  rpcBlocked = true;
} finally {
  await db.exec("reset role");
}
check("the weekly queue functions cannot be called from the browser", rpcBlocked);

// ── Production shape: username already unique, the mixed-case row is the one kept ──
const prod = await freshDb();
const prodFailures = await migrate(prod, (file) => file === NORMALIZE);
await prod.exec("create unique index creators_index_username_key on public.creators_index (username)");
await prod.exec(`insert into creators_index (username, platform, followers, last_scraped_at) values
  ('Kim.K', 'TikTok', 70000, now() - interval '1 day'),
  ('kim.k', 'tiktok', 60000, null)`);
await prod.exec(`insert into creator_snapshots (platform, username, captured_on, followers) values
  ('TikTok', 'Kim.K', current_date - 1, 70000), ('tiktok', 'kim.k', current_date - 9, 60000)`);
let prodError = "";
try {
  await prod.exec(readMigration(NORMALIZE));
} catch (e) {
  prodError = (e as Error).message;
}
const kim = (await prod.query("select username, platform, followers from creators_index")).rows as Row[];
const kimSnaps = (await prod.query("select platform, username from creator_snapshots")).rows as Row[];
const usernameUniques = (
  await prod.query(`select count(*) as n from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.creators_index'::regclass and i.indisunique and i.indnatts = 1 and a.attname = 'username'`)
).rows[0] as Row;
check(
  "with a unique username index already there, the kept mixed-case row is renamed after its duplicate goes",
  prodFailures.length === 0 && !prodError && kim.length === 1 && kim[0].username === "kim.k" && Number(kim[0].followers) === 70000,
  prodError || JSON.stringify(kim),
);
check("its history is merged under the lowercase key", kimSnaps.length === 2 && kimSnaps.every((r) => r.platform === "tiktok" && r.username === "kim.k"));
check("no second unique index on username is added", Number(usernameUniques.n) === 1, String(usernameUniques.n));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
