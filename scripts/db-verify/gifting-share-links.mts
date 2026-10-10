// `npm run test:db` (sixth part) — migration 000051 (gift share links and
// applications): applies on top of every migration, re-runs cleanly, also runs
// statement by statement (Supabase SQL editor), backfills tokens on existing
// campaigns, and the two SQL functions enforce open/duplicate/rate/spots rules.
import { freshDb, migrate, readMigration } from "./db.mts";
import { applyGiftAction, type GiftMission } from "../../src/lib/gifting.ts";
import { GIFT_APPLY_MAX_PER_HOUR, isGiftShareToken } from "../../src/lib/gift-share.ts";

const FILE = "20261009_000051_gifting_share_links.sql";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

type Row = Record<string, unknown>;

/** Top-level statements of a SQL file (dollar-quoted bodies and comments kept intact). */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (!dollar && rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(rest)?.[0];
    if (tag) {
      if (!dollar) dollar = tag;
      else if (dollar === tag) dollar = null;
      current += tag;
      i += tag.length;
      continue;
    }
    if (!dollar && sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      current += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (!dollar && sql[i] === ";") {
      if (current.trim()) out.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

// ── 1. Production-like: every migration before 000051, with live data ──
const prod = await freshDb();
const before = await migrate(prod, (f) => f === FILE);
check("every migration before 000051 applies", before.length === 0, before.map((f) => f.file).join(", "));
const pq = async (sql: string, params: unknown[] = []) => (await prod.query(sql, params)).rows as Row[];
const [owner] = await pq("insert into auth.users (email) values ('live-brand@test.local') returning id");
const [creatorA] = await pq("insert into auth.users (email) values ('live-creator@test.local') returning id");
const [liveCampaign] = await pq(
  "insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline) values ($1,$1,'Live','P','B','2026-12-01') returning id",
  [owner.id],
);
// Old data that breaks "one mission per creator per campaign": the migration must not fail on it.
await pq(
  `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id, contract_text)
   values ($1,$2,$2,'a','tiktok',$3,'x'), ($1,$2,$2,'a','instagram',$3,'x')`,
  [liveCampaign.id, owner.id, creatorA.id],
);

// The SQL editor may run each top-level statement on its own: replay it that way.
const statements = splitStatements(readMigration(FILE));
let editorError = "";
for (const statement of statements) {
  try {
    await prod.exec(statement);
  } catch (e) {
    editorError = `${(e as Error).message} :: ${statement.slice(0, 80)}`;
    break;
  }
}
check(`000051 runs statement by statement (${statements.length} statements, SQL editor mode)`, !editorError, editorError);
const [backfilled] = await pq("select share_token, share_enabled, platforms, spots from public.gift_campaigns where id=$1", [liveCampaign.id]);
check(
  "existing campaigns get a well-formed token, an enabled link, both platforms and unlimited spots",
  isGiftShareToken(backfilled?.share_token) && String(backfilled?.share_token).length === 43 && backfilled?.share_enabled === true
    && JSON.stringify(backfilled?.platforms) === '["tiktok","instagram"]' && backfilled?.spots === null,
  String(backfilled?.share_token),
);
const [dupIndex] = await pq("select count(*)::int as n from pg_class where relname = 'gift_missions_campaign_creator_key'");
check("with duplicate old missions the unique index is skipped instead of failing", dupIndex.n === 0);
let rerun = "";
try {
  await prod.exec(readMigration(FILE));
} catch (e) {
  rerun = (e as Error).message;
}
check("000051 re-runs on live data (idempotent)", !rerun, rerun);
const [stillSame] = await pq("select share_token from public.gift_campaigns where id=$1", [liveCampaign.id]);
check("a re-run keeps existing tokens", stillSame.share_token === backfilled.share_token);

// ── 2. Fresh database with every migration ──
const db = await freshDb();
const failures = await migrate(db);
check("every migration applies on a fresh database (000051 included)", failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];
async function fails(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

const users = await Promise.all(
  ["brand@t.local", "c1@t.local", "c2@t.local", "c3@t.local", "c4@t.local"].map(async (email) => (await one("insert into auth.users (email) values ($1) returning id", [email])).id as string),
);
const [brand, c1, c2, c3, c4] = users;

const [t1, t2] = await Promise.all([
  one("insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline, spots) values ($1,$1,'Open','Sérum','B','2999-01-01',2) returning *", [brand]),
  one("insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline) values ($1,$1,'Other','Savon','B','2999-01-01') returning *", [brand]),
]);
check("a new campaign gets a token by default (43 url-safe characters), unique per campaign", isGiftShareToken(t1.share_token) && t1.share_token !== t2.share_token);
check("token format is enforced", /check/i.test(await fails("update public.gift_campaigns set share_token='bad token' where id=$1", [t1.id])));
check("tokens are unique", /unique|duplicate/i.test(await fails("update public.gift_campaigns set share_token=$1 where id=$2", [t1.share_token, t2.id])));
check("spots stay within 1..500", /check/i.test(await fails("update public.gift_campaigns set spots=0 where id=$1", [t1.id])));
check("platforms are tiktok/instagram only", /check/i.test(await fails("update public.gift_campaigns set platforms=array['youtube'] where id=$1", [t1.id])));
check("unknown mission status is refused", /check/i.test(await fails(
  "insert into public.gift_missions (campaign_id, user_id, creator_handle, creator_platform, contract_text, status) values ($1,$2,'z','tiktok','x','hacked')",
  [t1.id, brand],
)));

async function apply(campaignId: string, creator: string, handle: string, opts: { platform?: string; auto?: boolean; max?: number } = {}) {
  const row = await one("select public.gift_apply_to_campaign($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as r", [
    campaignId, creator, handle, opts.platform ?? "tiktok", `Contrat @${handle}`, "Salut", JSON.stringify({ followers: 1000 }), opts.auto ?? false, opts.max ?? GIFT_APPLY_MAX_PER_HOUR,
  ]);
  return row.r as { ok: boolean; code: string; status?: string; mission_id?: string };
}

const r1 = await apply(t1.id, c1, "lea");
check("apply creates an application (status applied, source link, applied_at set)", r1.ok && r1.status === "applied");
const m1 = await one("select * from public.gift_missions where id=$1", [r1.mission_id]);
check("the mission keeps the message, stats snapshot and frozen contract", m1.source === "link" && m1.application_message === "Salut" && (m1.creator_stats as Row)?.followers === 1000 && m1.contract_text === "Contrat @lea" && Boolean(m1.applied_at) && m1.revision === 0);
check("one application per creator per campaign", (await apply(t1.id, c1, "lea.two")).code === "already");
check("one mission per handle per campaign", (await apply(t1.id, c2, "lea")).code === "handle_taken");
check("unique (campaign, creator) index exists on a clean database", /unique|duplicate/i.test(await fails(
  "insert into public.gift_missions (campaign_id, user_id, creator_handle, creator_platform, creator_user_id, contract_text) values ($1,$2,'zz','instagram',$3,'x')",
  [t1.id, brand, c1],
)));
check("the brand cannot apply to its own campaign", (await apply(t1.id, brand, "brandy")).code === "own_campaign");
check("platform must be one the campaign accepts", (await (async () => {
  await q("update public.gift_campaigns set platforms=array['instagram'] where id=$1", [t2.id]);
  const r = await apply(t2.id, c2, "sam");
  await q("update public.gift_campaigns set platforms=array['tiktok','instagram'] where id=$1", [t2.id]);
  return r.code;
})()) === "platform");
check("auto-approve needs both the campaign setting and the caller's verdict", (await apply(t1.id, c2, "sam", { auto: true })).status === "applied");
await q("update public.gift_campaigns set auto_approve=true where id=$1", [t2.id]);
const auto = await apply(t2.id, c2, "sam2", { auto: true });
const autoRow = await one("select status, reviewed_at from public.gift_missions where id=$1", [auto.mission_id]);
check("auto-approved application goes straight to invited, reviewed now", auto.status === "invited" && autoRow.status === "invited" && Boolean(autoRow.reviewed_at));
const manualOnAuto = await apply(t2.id, c3, "kim", { auto: false });
check("on an auto-approve campaign, unknown stats still give a manual application", manualOnAuto.status === "applied");

// Closed states
await q("update public.gift_campaigns set share_enabled=false where id=$1", [t2.id]);
check("paused link refuses", (await apply(t2.id, c4, "noa")).code === "disabled");
await q("update public.gift_campaigns set share_enabled=true, status='completed' where id=$1", [t2.id]);
check("closed campaign refuses", (await apply(t2.id, c4, "noa")).code === "closed");
await q("update public.gift_campaigns set status='active', deadline='2020-01-01' where id=$1", [t2.id]);
check("expired campaign refuses", (await apply(t2.id, c4, "noa")).code === "expired");
await q("update public.gift_campaigns set deadline='2999-01-01' where id=$1", [t2.id]);
check("unknown campaign", (await apply("00000000-0000-4000-8000-000000000000", c4, "noa")).code === "not_found");

// Rate limit: c3 already applied once (kim) in the last hour.
check("rate limit per creator per hour", (await apply(t1.id, c3, "kim", { max: 1 })).code === "rate_limited");

// ── Brand review: revision lock and spots under the campaign lock ──
async function review(missionId: string, revision: number, decision: "approve_application" | "decline_application") {
  const row = await one("select status from public.gift_missions where id=$1", [missionId]);
  const current = { status: row.status, contractText: "x", signedName: null, signedAt: null, address: null, carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null, expectedCount: 1, contents: [], approvedAt: null } as GiftMission;
  const next = applyGiftAction(current, { type: decision }, new Date().toISOString());
  return (await one("select public.gift_review_application($1,$2,$3) as r", [missionId, revision, next.status])).r as string;
}
// t1 has 2 spots and two applications (lea by c1, sam by c2).
const sam = await one("select id, revision from public.gift_missions where campaign_id=$1 and creator_handle='sam'", [t1.id]);
check("stale revision is refused", (await review(r1.mission_id!, 7, "approve_application")) === "stale");
check("brand approves an application", (await review(r1.mission_id!, 0, "approve_application")) === "ok");
const approved = await one("select status, revision, reviewed_at from public.gift_missions where id=$1", [r1.mission_id]);
check("approved application becomes invited, revision +1", approved.status === "invited" && approved.revision === 1 && Boolean(approved.reviewed_at));
check("reviewing twice is refused", (await one("select public.gift_review_application($1,1,'invited') as r", [r1.mission_id])).r === "not_applied");
check("only invited or rejected may be written by a review", (await one("select public.gift_review_application($1,$2,'approved') as r", [sam.id, sam.revision])).r === "not_applied");
await q("update public.gift_campaigns set spots=1 where id=$1", [t1.id]);
check("approving past the last spot is refused", (await review(sam.id as string, sam.revision as number, "approve_application")) === "full");
check("applying to a full campaign is refused", (await apply(t1.id, c4, "noa")).code === "full");
check("declining still works when full", (await review(sam.id as string, sam.revision as number, "decline_application")) === "ok");
check("declined application is rejected", (await one("select status from public.gift_missions where id=$1", [sam.id])).status === "rejected");

// ── Permissions ──
async function asRole(role: string, sql: string) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${c1}', false);`);
  try {
    await db.query(sql);
    return "allowed";
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.exec("reset role;");
  }
}
check("browsers cannot call the apply function", /permission denied/i.test(await asRole("authenticated", `select public.gift_apply_to_campaign('${t1.id}','${c1}','x','tiktok','c','m',null,false,8)`)));
check("browsers cannot call the review function", /permission denied/i.test(await asRole("authenticated", `select public.gift_review_application('${r1.mission_id}',0,'invited')`)));
check("browsers cannot mint tokens", /permission denied/i.test(await asRole("anon", "select public.gift_new_share_token()")));
check("anonymous cannot read campaigns (tokens) directly", /permission denied/i.test(await asRole("anon", "select share_token from public.gift_campaigns")));
check("signed-in users cannot read missions directly", /permission denied/i.test(await asRole("authenticated", "select creator_stats from public.gift_missions")));
const grants = await one(
  "select has_function_privilege('service_role', 'public.gift_apply_to_campaign(uuid, uuid, text, text, text, text, jsonb, boolean, integer)', 'execute') as a, has_function_privilege('service_role', 'public.gift_review_application(uuid, integer, text)', 'execute') as b",
);
check("the service role may call both functions", grants.a === true && grants.b === true);
const bucket = await one("select public, file_size_limit, allowed_mime_types from storage.buckets where id='gift-products'");
check(
  "product photo bucket is public, 8 MB, JPEG/PNG/WebP",
  bucket?.public === true && Number(bucket?.file_size_limit) === 8388608 && [...(bucket?.allowed_mime_types as string[])].sort().join(",") === "image/jpeg,image/png,image/webp",
);
const videos = await one("select public from storage.buckets where id='gift-videos'");
check("the content bucket stays private", videos?.public === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
