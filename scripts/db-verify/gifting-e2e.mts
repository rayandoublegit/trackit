// `npm run test:db` — every migration on a real Postgres (PGlite), then a full
// gifting run that replays what /api/gifting does: the domain rules from
// src/lib/gifting.ts and persistence through gift_commit_mission_action.
// Finally the manual production script is applied on a production-like database.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshDb, migrate, readMigration } from "./db.mts";
import {
  applyGiftAction,
  buildGiftContract,
  giftActionPosition,
  giftExpectedCount,
  GiftRuleError,
  type GiftAction,
  type GiftContent,
  type GiftMission,
} from "../../src/lib/gifting.ts";

const MULTI_CONTENT = "20261001_000045_gifting_multi_content.sql";

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
check("all migrations apply on a fresh database", failures.length === 0, failures.map((f) => f.file).join(", "));

const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];

// ── Accounts: a paying brand, its linked creator, a stranger creator, another brand
const [brand, creator, stranger, otherBrand] = await Promise.all(
  ["brand@test.local", "creator@test.local", "stranger@test.local", "other@test.local"].map(async (email) =>
    (await one("insert into auth.users (email) values ($1) returning id", [email])).id as string,
  ),
);
await q("insert into public.profiles (id, username, full_name, account_type, plan) values ($1,'brand','Maison Test','brand','pro'),($2,'lea','Léa Test','creator','free'),($3,'sam','Sam Test','creator','free'),($4,'other','Other Brand','brand','pro')", [brand, creator, stranger, otherBrand]);
await q("insert into public.workspaces (id, owner_id, name) values ($1,$1,'Maison Test'),($2,$2,'Other')", [brand, otherBrand]);
await q("insert into public.creators (user_id, workspace_id, handle, platform, linked_user_id) values ($1,$1,'lea.test','tiktok',$2)", [brand, creator]);
await q("insert into public.creator_links (creator_id, brand_id, status) values ($1,$2,'active')", [creator, brand]);

// ── Campaign + invite (same lookups as the route)
const campaign = await one(
  `insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline, allow_ads, rights_days, territories)
   values ($1,$1,'Routine du matin','Sérum','Montrer la texture le matin.','2026-10-30',true,90,'France, Belgique') returning *`,
  [brand],
);
const linked = await one(
  "select linked_user_id from public.creators where user_id=$1 and workspace_id=$1 and platform='tiktok' and handle='lea.test'",
  [brand],
);
const link = await one("select id from public.creator_links where creator_id=$1 and brand_id=$2 and status='active'", [linked?.linked_user_id, brand]);
check("invite finds the creator through creators + active creator_links", Boolean(link));
const strangerLinked = await one("select linked_user_id from public.creators where user_id=$1 and handle='sam.test'", [brand]);
check("a creator who never joined the brand cannot be invited", !strangerLinked);

const contract = buildGiftContract({
  lang: "fr",
  brandName: "Maison Test",
  creatorHandle: "lea.test",
  campaignName: String(campaign.name),
  product: String(campaign.product),
  brief: String(campaign.brief),
  videoCount: Number(campaign.video_count),
  deadline: "2026-10-30",
  fixedFeeCents: 0,
  allowAds: true,
  rightsDays: 90,
  territories: "France, Belgique",
});
let mission = await one(
  `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id, contract_text)
   values ($1,$2,$2,'lea.test','tiktok',$3,$4) returning *`,
  [campaign.id, brand, creator, contract],
);
check("mission starts invited at revision 0", mission.status === "invited" && mission.revision === 0);

let dup = "";
try {
  await q(
    `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id, contract_text)
     values ($1,$2,$2,'lea.test','tiktok',$3,'x')`,
    [campaign.id, brand, creator],
  );
} catch (e) {
  dup = (e as Error).message;
}
check("one mission per creator per campaign", /unique|duplicate/i.test(dup), dup.slice(0, 60));

// ── Helper: exactly what actOnMission does after its permission checks
async function act(action: GiftAction, storagePath: string | null = null, expectedRevision?: number) {
  const row = await one("select * from public.gift_missions where id=$1", [mission.id]);
  const contents = await q("select * from public.gift_videos where mission_id=$1 order by position", [mission.id]);
  const campaignRow = await one("select video_count from public.gift_campaigns where id=$1", [row.campaign_id]);
  const current: GiftMission = {
    status: row.status as GiftMission["status"],
    contractText: String(row.contract_text),
    signedName: (row.signed_name as string) ?? null,
    signedAt: row.signed_at ? new Date(row.signed_at as string).toISOString() : null,
    address: (row.address as GiftMission["address"]) ?? null,
    carrier: (row.carrier as string) ?? null,
    trackingNumber: (row.tracking_number as string) ?? null,
    shippedAt: row.shipped_at ? new Date(row.shipped_at as string).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at as string).toISOString() : null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string).toISOString() : null,
    expectedCount: giftExpectedCount(campaignRow?.video_count),
    contents: contents.map((c) => ({
      position: Number(c.position),
      name: String(c.name),
      kind: c.kind === "photo" ? "photo" : "video",
      status: c.status as GiftContent["status"],
      feedback: String(c.feedback ?? ""),
      approvedAt: c.approved_at ? new Date(c.approved_at as string).toISOString() : null,
      storagePath: (c.storage_path as string) ?? null,
    })),
  };
  const next = applyGiftAction(current, action, new Date().toISOString());
  const isContent = action.type === "submit" || action.type === "approve" || action.type === "request_changes";
  const position = isContent ? giftActionPosition(action) : 1;
  const changed = isContent ? next.contents.find((c) => c.position === position) : undefined;
  const res = await one("select public.gift_commit_mission_action($1,$2,$3::jsonb,$4::jsonb) as ok", [
    mission.id,
    expectedRevision ?? row.revision,
    JSON.stringify({
      status: next.status,
      signed_name: next.signedName,
      signed_at: next.signedAt,
      address: next.address,
      carrier: next.carrier,
      tracking_number: next.trackingNumber,
      shipped_at: next.shippedAt,
      delivered_at: next.deliveredAt,
      approved_at: next.approvedAt,
    }),
    changed
      ? JSON.stringify({
          position: changed.position,
          kind: changed.kind,
          name: changed.name,
          status: changed.status,
          feedback: changed.feedback,
          approved_at: changed.approvedAt,
          storage_path: storagePath,
        })
      : null,
  ]);
  mission = await one("select * from public.gift_missions where id=$1", [mission.id]);
  return res.ok as boolean;
}

async function rejects(name: string, action: GiftAction) {
  try {
    await act(action);
    check(name, false, "was accepted");
  } catch (e) {
    check(name, e instanceof GiftRuleError, (e as Error).message);
  }
}

// ── Happy path with every guard on the way
await rejects("cannot ship before the contract is signed", { type: "ship", carrier: "Colissimo", trackingNumber: "6A1" });
await rejects("cannot sign before accepting", { type: "sign", name: "Léa Test", consent: true, address: { name: "Léa Test", line: "1 rue Test", postalCode: "75001", city: "Paris", country: "France" } });
check("creator accepts", await act({ type: "accept" }));
check("status accepted", mission.status === "accepted");
await rejects("signing needs consent", { type: "sign", name: "Léa Test", consent: false, address: { name: "Léa Test", line: "1 rue Test", postalCode: "75001", city: "Paris", country: "France" } });
check("creator signs with address", await act({ type: "sign", name: "Léa Test", consent: true, address: { name: "Léa Test", line: "1 rue Test", postalCode: "75001", city: "Paris", country: "France" } }));
check("signature, date and address stored", mission.status === "signed" && mission.signed_name === "Léa Test" && Boolean(mission.signed_at) && (mission.address as Row)?.city === "Paris");

// Frozen contract: editing the campaign later does not rewrite the signed text
await q("update public.gift_campaigns set brief='Nouveau brief', rights_days=365 where id=$1", [campaign.id]);
const frozen = await one("select contract_text from public.gift_missions where id=$1", [mission.id]);
check("signed contract stays the accepted text after a campaign edit", frozen.contract_text === contract && !String(frozen.contract_text).includes("Nouveau brief"));

// Concurrency: a stale revision is refused and changes nothing
const before = mission.revision as number;
check("stale revision is refused (409 in the API)", (await act({ type: "ship", carrier: "UPS", trackingNumber: "1Z" }, null, before - 1)) === false);
check("…and the mission did not move", mission.status === "signed" && mission.revision === before);

check("brand ships with carrier and tracking", await act({ type: "ship", carrier: "Colissimo", trackingNumber: "6A19283746" }));
check("tracking stored", mission.status === "shipped" && mission.carrier === "Colissimo" && mission.tracking_number === "6A19283746");
check("parcel marked received", await act({ type: "deliver" }));
await rejects("cannot approve before any video", { type: "approve" });

const path1 = `${mission.id}/first.mp4`;
check("creator submits a video", await act({ type: "submit", videoName: "first.mp4", storagePath: path1 }, path1));
let video = await one("select * from public.gift_videos where mission_id=$1", [mission.id]);
check("video pending with its private storage path", mission.status === "submitted" && video.status === "pending" && video.storage_path === path1);
check("brand asks for changes", await act({ type: "request_changes", feedback: "Plus de lumière" }));
video = await one("select * from public.gift_videos where mission_id=$1", [mission.id]);
check("feedback kept, contract and parcel untouched", video.status === "changes_requested" && video.feedback === "Plus de lumière" && mission.carrier === "Colissimo" && mission.signed_name === "Léa Test");
const path2 = `${mission.id}/second.mp4`;
check("creator resubmits", await act({ type: "submit", videoName: "second.mp4", storagePath: path2 }, path2));
check("brand approves", await act({ type: "approve" }));
video = await one("select * from public.gift_videos where mission_id=$1", [mission.id]);
const approvedAt = video.approved_at;
check("approved with approvedAt set (start of ad rights)", mission.status === "approved" && video.status === "approved" && Boolean(approvedAt));
check("single-video mission: row at position 1, kind video, mission approved_at stored", video.position === 1 && video.kind === "video" && Boolean(mission.approved_at));
await rejects("an approved mission cannot be approved again", { type: "approve" });

// ── Declined path
const m2 = await one(
  `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id, contract_text)
   values ($1,$2,$2,'lea.other','instagram',$3,$4) returning *`,
  [campaign.id, brand, creator, contract],
);
const saved = mission;
mission = m2;
check("creator can decline", await act({ type: "decline" }));
await rejects("a declined mission is final", { type: "accept" });
mission = saved;

// ── Several contents: a campaign asking for 3 (videos or photos)
const trio = await one(
  `insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline, video_count, allow_ads, rights_days, territories)
   values ($1,$1,'Trois contenus','Sérum','Une vidéo, une photo, une vidéo.','2026-11-30',3,true,30,'France') returning *`,
  [brand],
);
const trioContract = buildGiftContract({
  lang: "fr", brandName: "Maison Test", creatorHandle: "lea.test", campaignName: String(trio.name), product: String(trio.product),
  brief: String(trio.brief), videoCount: Number(trio.video_count), deadline: "2026-11-30", fixedFeeCents: 0, allowAds: true, rightsDays: 30, territories: "France",
});
check("contract states the 3 expected contents", trioContract.includes("Contenus attendus : 3 (vidéos ou photos)."));
const multi = await one(
  `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id, contract_text, status)
   values ($1,$2,$2,'lea.test','tiktok',$3,$4,'delivered') returning *`,
  [trio.id, brand, creator, trioContract],
);
mission = multi;
const slotPath = (n: number, ext: string) => `${multi.id}/slot-${n}.${ext}`;
const rows = async () => q("select * from public.gift_videos where mission_id=$1 order by position", [multi.id]);

check("slot 1: a video", await act({ type: "submit", position: 1, name: "one.mp4", kind: "video", storagePath: slotPath(1, "mp4") }, slotPath(1, "mp4")));
check("slot 3: a photo", await act({ type: "submit", position: 3, name: "three.jpg", kind: "photo", storagePath: slotPath(3, "jpg") }, slotPath(3, "jpg")));
check("2 of 3 sent: the mission waits in delivered", mission.status === "delivered" && (await rows()).length === 2);
await rejects("a 4th content is refused", { type: "submit", position: 4, name: "four.mp4", storagePath: slotPath(4, "mp4") });
check("the brand can approve slot 1 before the rest arrives", await act({ type: "approve", position: 1 }));
check("slot 2: a video", await act({ type: "submit", position: 2, name: "two.mp4", kind: "video", storagePath: slotPath(2, "mp4") }, slotPath(2, "mp4")));
let items = await rows();
check(
  "3 rows at positions 1..3 with their kinds and paths; mission submitted",
  mission.status === "submitted"
    && items.map((r) => `${r.position}:${r.kind}:${r.status}`).join(",") === "1:video:approved,2:video:pending,3:photo:pending"
    && items.every((r) => String(r.storage_path).startsWith(`${multi.id}/slot-${r.position}.`)),
  items.map((r) => `${r.position}:${r.kind}:${r.status}`).join(","),
);
check("brand asks for changes on slot 3 only", await act({ type: "request_changes", position: 3, feedback: "Plus nette" }));
items = await rows();
check("slot 3 has the feedback, slots 1 and 2 untouched", items[2].status === "changes_requested" && items[2].feedback === "Plus nette" && items[0].status === "approved" && items[1].status === "pending");
await rejects("an approved content cannot be replaced", { type: "submit", position: 1, name: "again.mp4", storagePath: slotPath(1, "mp4") });
check("creator re-sends slot 3", await act({ type: "submit", position: 3, name: "three-b.png", kind: "photo", storagePath: slotPath(3, "png") }, slotPath(3, "png")));
items = await rows();
check("re-sent slot 3 is pending again with its new file, still a photo", items[2].status === "pending" && items[2].feedback === "" && items[2].storage_path === slotPath(3, "png") && items[2].kind === "photo");
check("approve slot 2", await act({ type: "approve", position: 2 }));
check("not every slot approved: no ad-rights date yet", mission.status === "submitted" && mission.approved_at === null);
check("approve slot 3", await act({ type: "approve", position: 3 }));
items = await rows();
check("all 3 approved: mission approved with its ad-rights date", mission.status === "approved" && Boolean(mission.approved_at) && items.every((r) => r.status === "approved" && r.approved_at));
const firstApproval = String(mission.approved_at);
check("an approval with no date passed never clears the ad-rights date", await one(
  "select public.gift_commit_mission_action($1,$2,$3::jsonb,null) as ok", [multi.id, mission.revision, JSON.stringify({ status: "approved" })],
).then((r) => r.ok === true));
mission = await one("select * from public.gift_missions where id=$1", [multi.id]);
check("…the date is unchanged", String(mission.approved_at) === firstApproval);

let dupSlot = "";
try {
  await q("insert into public.gift_videos (mission_id, position, name) values ($1, 2, 'dup')", [multi.id]);
} catch (e) {
  dupSlot = (e as Error).message;
}
check("one content per mission slot (unique mission_id, position)", /unique|duplicate/i.test(dupSlot), dupSlot.slice(0, 60));
let badKind = "";
try {
  await q("insert into public.gift_videos (mission_id, position, name, kind) values ($1, 5, 'x', 'audio')", [multi.id]);
} catch (e) {
  badKind = (e as Error).message;
}
check("kind is video or photo only", /check/i.test(badKind), badKind.slice(0, 60));

// An older caller (no position, no kind) still writes slot 1 and keeps its kind.
const legacyCall = await one("select public.gift_commit_mission_action($1,$2,$3::jsonb,$4::jsonb) as ok", [
  multi.id, mission.revision, JSON.stringify({ status: "approved" }),
  JSON.stringify({ name: "one-renamed.mp4", status: "approved", feedback: "", approved_at: items[0].approved_at, storage_path: null }),
]);
items = await rows();
check(
  "an RPC call without position updates slot 1 and keeps its kind and file",
  legacyCall.ok === true && items.length === 3 && items[0].name === "one-renamed.mp4" && items[0].kind === "video" && items[0].storage_path === slotPath(1, "mp4"),
);
mission = saved;

// ── Database permissions: browsers never touch gift tables directly
async function asRole(role: string, sub: string, sql: string) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub}', false);`);
  try {
    await db.query(sql);
    return "allowed";
  } catch (e) {
    return (e as Error).message;
  } finally {
    await db.exec("reset role;");
  }
}
check("signed-in creator cannot read gift_missions directly", /permission denied/i.test(await asRole("authenticated", creator, "select address from public.gift_missions")));
check("signed-in brand cannot update gift_missions directly", /permission denied/i.test(await asRole("authenticated", brand, "update public.gift_missions set status='approved'")));
check("anonymous cannot read gift_videos", /permission denied/i.test(await asRole("anon", "", "select * from public.gift_videos")));
check(
  "only the service role may call the commit function",
  /permission denied/i.test(await asRole("authenticated", creator, `select public.gift_commit_mission_action('${mission.id}', 0, '{}'::jsonb, null)`)),
);
const bucket = await one("select public, file_size_limit, allowed_mime_types from storage.buckets where id='gift-videos'");
check(
  "content bucket is private, 500 MB, MP4/MOV/WebM videos and JPEG/PNG/WebP photos",
  bucket?.public === false
    && Number(bucket?.file_size_limit) === 524288000
    && [...(bucket?.allowed_mime_types as string[])].sort().join(",") === "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm",
);

// Control: with Supabase defaults a table without the revoke IS readable, so the checks above prove the revoke works.
check("control: a regular table stays readable by a signed-in user", (await asRole("authenticated", brand, "select 1 from public.niche_requests")) === "allowed");

// ── Audit log table from the admin migration
check("admin_audit_log exists and is closed to browsers", /permission denied/i.test(await asRole("authenticated", brand, "select * from public.admin_audit_log")));

// ── Manual production script on a production-like database (the 4 migrations missing in prod)
const MANUAL = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "manual", "2026-09-29_enable_gifting_audit_sessions.sql");
const prodLike = await freshDb();
// The multi-content migration comes after: it needs the gift tables from the manual script.
const missingInProd = ["user_sessions", "_gifting.sql", "gifting_private_media", "admin_audit_log", MULTI_CONTENT];
const prodFailures = await migrate(prodLike, (f) => missingInProd.some((m) => f.includes(m)));
let scriptError = "";
try {
  await prodLike.exec(readFileSync(MANUAL, "utf8"));
} catch (e) {
  scriptError = (e as Error).message;
}
const created = (
  await prodLike.query(
    "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('user_sessions','gift_wishlists','gift_wishlist_creators','gift_campaigns','gift_missions','gift_videos','admin_audit_log')",
  )
).rows[0] as { n: number };
check("manual production script applies on a production-like database", prodFailures.length === 0 && !scriptError && created.n === 7, scriptError);

// ── Multi-content migration on live data: production state (manual script) with an old single-video mission
async function legacyMission(target: typeof prodLike) {
  const tq = async (sql: string, params: unknown[] = []) => (await target.query(sql, params)).rows as Row[];
  const [owner] = await tq("insert into auth.users (email) values ('legacy@test.local') returning id");
  const [c] = await tq(
    "insert into public.gift_campaigns (user_id, workspace_id, name, product, brief, deadline, video_count) values ($1,$1,'Old','P','B','2026-10-01',2) returning id",
    [owner.id],
  );
  const [m] = await tq(
    `insert into public.gift_missions (campaign_id, user_id, workspace_id, creator_handle, creator_platform, contract_text, status)
     values ($1,$2,$2,'old.one','tiktok','Videos: 2.','approved') returning id`,
    [c.id, owner.id],
  );
  await tq(
    "insert into public.gift_videos (mission_id, name, status, approved_at, storage_path) values ($1,'old.mp4','approved','2026-09-01T10:00:00Z',$2)",
    [m.id, `${m.id}/old.mp4`],
  );
  return { tq, missionId: m.id as string };
}
const legacy = await legacyMission(prodLike);
let multiError = "";
try {
  await prodLike.exec(readMigration(MULTI_CONTENT));
  await prodLike.exec(readMigration(MULTI_CONTENT)); // idempotent
} catch (e) {
  multiError = (e as Error).message;
}
check("multi-content migration applies twice on top of the production script", !multiError, multiError);
const [oldRow] = await legacy.tq("select position, kind, name, created_at, updated_at from public.gift_videos where mission_id=$1", [legacy.missionId]);
const [oldMission] = await legacy.tq("select approved_at from public.gift_missions where id=$1", [legacy.missionId]);
check(
  "the existing video becomes slot 1 (kind video) and the approved mission gets its ad-rights date",
  oldRow?.position === 1 && oldRow?.kind === "video" && oldRow?.name === "old.mp4" && Boolean(oldRow?.updated_at)
    && new Date(oldMission?.approved_at as string).toISOString() === "2026-09-01T10:00:00.000Z",
);
let secondSlot = "";
try {
  await legacy.tq("insert into public.gift_videos (mission_id, position, name) values ($1, 2, 'second.mp4')", [legacy.missionId]);
} catch (e) {
  secondSlot = (e as Error).message;
}
check("the old one-video-per-mission rule is gone (slot 2 can be added)", !secondSlot, secondSlot);
const prodBucket = (await prodLike.query("select allowed_mime_types from storage.buckets where id='gift-videos'")).rows[0] as { allowed_mime_types: string[] };
check("production bucket now takes photos too", prodBucket.allowed_mime_types.includes("image/webp") && prodBucket.allowed_mime_types.includes("video/mp4"));
const grants = (await prodLike.query(
  "select has_function_privilege('authenticated', 'public.gift_commit_mission_action(uuid, integer, jsonb, jsonb)', 'execute') as auth, has_function_privilege('service_role', 'public.gift_commit_mission_action(uuid, integer, jsonb, jsonb)', 'execute') as svc",
)).rows[0] as { auth: boolean; svc: boolean };
check("the replaced commit function stays service-role only", grants.auth === false && grants.svc === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
