// `npm run test:db` (second part) — the creator intelligence tables on a real
// Postgres: queue claiming, daily snapshots, rollups into creators_index, and
// that none of it is reachable from the browser roles.
import { freshDb, migrate } from "./db.mts";

type Row = Record<string, unknown>;
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const db = await freshDb();
const failures = await migrate(db);
check("all migrations apply on a fresh database", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));

const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];

// Three creators: one due now, one due later, one that keeps failing.
await q(`insert into creators_index (username, platform, followers, scrape_priority, next_scrape_at, scrape_failures) values
  ('rising.star', 'tiktok', 120000, 1, null, 0),
  ('steady.one', 'TikTok', 500000, 5, now() + interval '2 days', 0),
  ('broken.acct', 'tiktok', 9000, 5, null, 5)`);

// ── Queue
const queued = Number((await one("select enqueue_due_creators(50) as n")).n);
check("only due, healthy creators are queued", queued === 1, `queued ${queued}`);
const again = Number((await one("select enqueue_due_creators(50) as n")).n);
check("queueing twice does not duplicate a live job", again === 0, `queued ${again}`);
await q("insert into scrape_jobs (kind, platform, target, priority) values ('creator_discover', 'tiktok', 'skincare', 3)");

const first = await q("select * from claim_scrape_jobs(10, array['creator_refresh','creator_discover'])");
const second = await q("select * from claim_scrape_jobs(10, array['creator_refresh','creator_discover'])");
check("a claim takes every ready job, highest priority first", first.length === 2 && first[0].target === "rising.star", first.map((j) => j.target).join(","));
check("a second claim gets nothing already running", second.length === 0);
check("claimed jobs are running with one attempt", first.every((j) => j.status === "running" && Number(j.attempts) === 1));

await q("update scrape_jobs set locked_at = now() - interval '20 minutes' where target = 'skincare'");
const reclaimed = await q("select * from claim_scrape_jobs(10, array['creator_discover'])");
check("a job stuck running for 15+ minutes is taken again", reclaimed.length === 1 && Number(reclaimed[0].attempts) === 2);

// ── History: 31 days of snapshots and three videos with a week of views
for (let d = 31; d >= 0; d--) {
  const followers = 100000 + (31 - d) * 1000; // +1K a day
  await q(
    "insert into creator_snapshots (platform, username, captured_on, followers, avg_views) values ('tiktok','rising.star', current_date - $1::int, $2, 40000)",
    [d, followers],
  );
}
await q(`insert into creator_videos (platform, video_id, username, posted_at, views, likes) values
  ('tiktok','v1','rising.star', now() - interval '3 days', 90000, 9000),
  ('tiktok','v2','rising.star', now() - interval '12 days', 50000, 4000),
  ('tiktok','v3','rising.star', now() - interval '60 days', 400000, 30000)`);
await q(`insert into creator_video_snapshots (platform, video_id, captured_on, views) values
  ('tiktok','v1', current_date - 8, 10000),
  ('tiktok','v2', current_date - 8, 45000),
  ('tiktok','v3', current_date - 8, 395000)`);

await q("select refresh_creator_rollup('tiktok', 'rising.star')");
const c = await one("select * from creators_index where username = 'rising.star'");
check("followers 7 and 30 days ago come from snapshots", Number(c.followers_7d_ago) === 124000 && Number(c.followers_30d_ago) === 101000, `${c.followers_7d_ago} / ${c.followers_30d_ago}`);
check("30-day growth in followers and percent", Number(c.followers_growth_30d) === 30000 && Number(c.followers_growth_pct_30d) === 29.7, `${c.followers_growth_30d} / ${c.followers_growth_pct_30d}%`);
check("views and posts over the last 30 days", Number(c.views_30d) === 140000 && Number(c.posts_30d) === 2 && Number(c.avg_views_30d) === 70000);
check("views gained over 7 days add up per video", Number(c.views_gained_7d) === 90000, String(c.views_gained_7d));
check("a growth score and the days of history are stored", Number(c.growth_score) > 0 && Number(c.history_days) === 32, `${c.growth_score} / ${c.history_days}`);
const v1 = await one("select views_gained_7d from creator_videos where video_id = 'v1'");
check("each video keeps its own 7-day gain", Number(v1.views_gained_7d) === 80000);

await q("select refresh_creator_rollup('tiktok', 'steady.one')");
const s = await one("select followers_growth_pct_30d, history_days from creators_index where username = 'steady.one'");
check("a creator stored as 'TikTok' is matched without case", Number(s.history_days) === 0 && s.followers_growth_pct_30d === null);

// ── Browser roles see nothing
for (const table of ["creator_snapshots", "creator_videos", "creator_video_snapshots", "scrape_jobs", "scrape_runs"]) {
  let blocked = false;
  try {
    await db.exec("set role authenticated");
    await db.query(`select * from public.${table} limit 1`);
  } catch {
    blocked = true;
  } finally {
    await db.exec("reset role");
  }
  check(`${table} is closed to signed-in browsers`, blocked);
}
let rpcBlocked = false;
try {
  await db.exec("set role anon");
  await db.query("select enqueue_due_creators(1)");
} catch {
  rpcBlocked = true;
} finally {
  await db.exec("reset role");
}
check("queue functions cannot be called from the browser", rpcBlocked);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
