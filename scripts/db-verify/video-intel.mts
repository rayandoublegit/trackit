// `npm run test:db` (eighth part) — migration 000053 (video intelligence):
// applies on top of every migration, re-runs cleanly, runs statement by
// statement (Supabase SQL editor), is server only, and its functions behave:
// performance bands, the watermark enqueue with priorities, the claim, the
// release, the performance sync trigger, synthesis enqueue, prompt-version
// requeue, niche patterns and the library view.
import { freshDb, migrate, readMigration } from "./db.mts";

const FILE = "20261029_000053_video_intel.sql";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

type Row = Record<string, any>;

/** Top-level statements, keeping $$ … $$ bodies whole and skipping comment lines. */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    if (!inDollar && line.trim().startsWith("--")) continue;
    cur += line + "\n";
    const marks = (line.match(/\$\$/g) ?? []).length;
    if (marks % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*(--.*)?$/.test(line.trim())) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ── 1. SQL editor mode ──
const editor = await freshDb();
const before = await migrate(editor, (f) => f === FILE);
check("every migration before 000053 applies", before.length === 0, before.map((f) => `${f.file}: ${f.error}`).join(" | "));
let editorError = "";
const statements = splitStatements(readMigration(FILE));
for (const statement of statements) {
  try {
    await editor.exec(statement);
  } catch (e) {
    editorError = `${(e as Error).message} :: ${statement.slice(0, 90)}`;
    break;
  }
}
check(`000053 runs statement by statement (${statements.length} statements, SQL editor mode)`, !editorError, editorError);
let rerun = "";
try {
  await editor.exec(readMigration(FILE));
} catch (e) {
  rerun = (e as Error).message;
}
check("000053 re-runs cleanly (idempotent)", !rerun, rerun);

// ── 2. Fresh database ──
const db = await freshDb();
const failures = await migrate(db);
check("every migration applies on a fresh database (000053 included)", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];

const TABLES = ["creator_video_transcripts", "creator_video_insights", "creator_content_insights", "video_intel_jobs", "anthropic_batches", "video_intel_runs", "video_intel_state", "video_intel_niche_patterns"];
for (const t of TABLES) {
  const rls = await one("select relrowsecurity from pg_class where relname = $1", [t]);
  const pol = await one("select count(*)::int as n from pg_policies where tablename = $1", [t]);
  const anon = await one(`select has_table_privilege('anon', 'public.${t}', 'select') as a, has_table_privilege('authenticated', 'public.${t}', 'insert') as b, has_table_privilege('service_role', 'public.${t}', 'insert') as s`);
  check(`${t}: RLS on, no policy, anon/authenticated locked out, service_role writes`, rls?.relrowsecurity === true && pol.n === 0 && anon.a === false && anon.b === false && anon.s === true);
}
const view = await one("select has_table_privilege('anon', 'public.creator_video_library_insights', 'select') as a");
check("library insights view not readable by anon", view.a === false);
const fn = await one("select has_function_privilege('anon', 'public.claim_video_intel_jobs(text, integer)', 'execute') as a, has_function_privilege('authenticated', 'public.enqueue_video_intel(integer, integer)', 'execute') as b");
check("queue functions not executable by anon / authenticated", fn.a === false && fn.b === false);

// ── 3. Performance rules ──
const bands = await q(`select v, m, public.video_performance_band(v, m) as band, public.video_performance_ratio(v, m) as r
  from (values (600000::bigint, 100000::numeric), (400000, 100000), (60000, 10000), (15000, 10000), (10000, 10000), (5000, 10000), (1000, 10000), (1000, null)) x(v, m)`);
check(
  "bands: viral / over / over / over / normal / under / flop / null",
  JSON.stringify(bands.map((b) => b.band)) === JSON.stringify(["viral", "over", "over", "over", "normal", "under", "flop", null]),
  bands.map((b) => b.band).join(","),
);
check("ratio rounded to 3 decimals", Number(bands[3].r) === 1.5 && bands[7].r === null);

// ── 4. Enqueue (watermark, priorities) ──
const user = (await one("insert into auth.users (email) values ('brand@intel.local') returning id")).id as string;
await q(`insert into public.creators_index (username, platform, followers, median_video_views) values
  ('luna', 'tiktok', 100000, 10000), ('ig_mia', 'instagram', 50000, 2000), ('nobody', 'tiktok', 1000, null)`);
await q("insert into public.discovery_saved (user_id, creator_username, platform) values ($1, 'ig_mia', 'instagram')", [user]);
await q(`insert into public.creator_videos (platform, video_id, username, media_type, views, posted_at, first_seen_at) values
  ('tiktok', 'v_over', 'luna', 'video', 20000, now() - interval '90 days', now() - interval '2 days'),
  ('tiktok', 'v_recent', 'luna', 'video', 9000, now() - interval '3 days', now() - interval '2 days'),
  ('tiktok', 'v_old', 'luna', 'video', 9000, now() - interval '200 days', now() - interval '2 days'),
  ('tiktok', 'v_photo', 'luna', 'photo', 9000, now() - interval '3 days', now() - interval '2 days'),
  ('instagram', 'C_tracked', 'ig_mia', 'video', 100, now() - interval '100 days', now() - interval '1 day'),
  ('tiktok', 'v_new', 'nobody', 'video', 10, now(), now())`);
const e1 = (await one("select public.enqueue_video_intel(2, 1) as r")).r;
const e2 = (await one("select public.enqueue_video_intel(100, 1) as r")).r;
const e3 = (await one("select public.enqueue_video_intel(100, 1) as r")).r;
check("enqueue walks by watermark in pages (2 then the rest, then nothing)", e1.scanned === 2 && e2.scanned === 3 && e3.scanned === 0, `${JSON.stringify(e1)} ${JSON.stringify(e2)} ${JSON.stringify(e3)}`);
const jobs = await q("select target, priority from public.video_intel_jobs where kind = 'transcript' order by target");
const pr = Object.fromEntries(jobs.map((j) => [j.target, Number(j.priority)]));
check("priorities: tracked 1, over-performing 2, recent 3, rest 5; photos skipped", pr.C_tracked === 1 && pr.v_over === 2 && pr.v_recent === 3 && pr.v_old === 5 && !("v_photo" in pr), JSON.stringify(pr));
check("videos still being written (first seen < 5 min ago) wait for the next pass", !("v_new" in pr));

// ── 5. Claim / release ──
const c1 = await q("select * from public.claim_video_intel_jobs('transcript', 2)");
const c2 = await q("select * from public.claim_video_intel_jobs('transcript', 10)");
check("claim takes the best priorities first", c1.map((j) => j.target).sort().join(",") === "C_tracked,v_over", c1.map((j) => j.target).join(","));
check("a second claim never gets the same jobs", c2.length === 2 && !c2.some((j) => c1.some((k) => k.id === j.id)));
const rel = (await one("select public.release_video_intel_jobs(array[$1::bigint], now()) as n", [c1[0].id])).n;
const back = await one("select status, attempts from public.video_intel_jobs where id = $1", [c1[0].id]);
check("release hands a job back with its attempt refunded", rel === 1 && back.status === "queued" && Number(back.attempts) === 0);
await q("update public.video_intel_jobs set status = 'running', locked_at = now() - interval '30 minutes' where id = $1", [c2[0].id]);
const stale = await q("select * from public.claim_video_intel_jobs('transcript', 10)");
check("a job stuck running for 20+ minutes is claimed again", stale.some((j) => j.id === c2[0].id));

// ── 6. Performance sync trigger ──
await q(`insert into public.creator_video_insights (platform, video_id, username, model, prompt_version, analysis, hook_type, content_format, views, median_views, performance_ratio, band)
  values ('tiktok', 'v_over', 'luna', 'claude-haiku-5-5', 1, '{}', 'question', 'talking_head', 20000, 10000, 2, 'over')`);
await q("update public.creator_videos set views = 2000 where platform = 'tiktok' and video_id = 'v_over'");
const synced = await one("select views, performance_ratio, band from public.creator_video_insights where video_id = 'v_over'");
check("a scrape that changes views updates the stored ratio and band", Number(synced.views) === 2000 && synced.band !== "over", JSON.stringify(synced));

// ── 7. Synthesis enqueue ──
for (let i = 0; i < 6; i++) {
  await q(`insert into public.creator_video_insights (platform, video_id, username, model, prompt_version, analysis, performance_ratio, band)
    values ('instagram', 'S${i}', 'ig_mia', 'm', 1, '{}', 1, 'normal')`);
}
const s1 = (await one("select public.enqueue_creator_synthesis('instagram', array['ig_mia'], 6, 1) as n")).n;
const s2 = (await one("select public.enqueue_creator_synthesis('instagram', array['ig_mia'], 6, 1) as n")).n;
check("6 analysed videos queue one synthesis; a live job is not duplicated", s1 === 1 && s2 === 0, `${s1} ${s2}`);
await q("update public.video_intel_jobs set status = 'done' where kind = 'synthesize'");
await q("insert into public.creator_content_insights (platform, username, videos_analysed, prompt_version) values ('instagram', 'ig_mia', 6, 1)");
const s3 = (await one("select public.enqueue_creator_synthesis('instagram', array['ig_mia'], 6, 1) as n")).n;
for (let i = 6; i < 9; i++) await q(`insert into public.creator_video_insights (platform, video_id, username, model, prompt_version, analysis, performance_ratio, band) values ('instagram', 'S${i}', 'ig_mia', 'm', 1, '{}', 3, 'over')`);
const s4 = (await one("select public.enqueue_creator_synthesis('instagram', array['ig_mia'], 6, 1) as n")).n;
check("no refresh without new videos; +3 and +25% re-queues it", s3 === 0 && s4 === 1, `${s3} ${s4}`);

// ── 8. Prompt version requeue ──
await q("insert into public.video_intel_jobs (kind, platform, target, status) values ('analyze', 'tiktok', 'v_over', 'done')");
const e4 = (await one("select public.enqueue_video_intel(100, 2) as r")).r;
const re = await one("select status, priority from public.video_intel_jobs where kind = 'analyze' and target = 'v_over'");
check("analyses from an older prompt version go back to the queue last (priority 8)", e4.requeued >= 1 && re.status === "queued" && Number(re.priority) === 8, JSON.stringify(e4));

// ── 9. Niche patterns and the library view ──
await q("update public.creators_index set primary_niche = 'fashion' where username = 'ig_mia'");
const np = (await one("select public.refresh_video_intel_niche_patterns('instagram', 1, 1) as n")).n;
const rows = await q("select niche, dimension, value, videos from public.video_intel_niche_patterns where platform = 'instagram' order by niche, dimension");
check("niche patterns written per niche and for 'all'", np > 0 && rows.some((r) => r.niche === "fashion") && rows.some((r) => r.niche === "all"), `${np} rows`);
const np2 = (await one("select public.refresh_video_intel_niche_patterns('instagram', 1, 1) as n")).n;
check("niche refresh is idempotent", np2 === np);
const lib = await q("select video_id, hook_type, content_format, band, performance_ratio from public.creator_video_library_insights where video_id = 'v_over'");
check("library view joins videos and insights", lib.length === 1 && lib[0].hook_type === "question");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
