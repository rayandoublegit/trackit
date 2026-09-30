// `npm run test:db` (third part) — every catalog and video library filter on a
// real Postgres, through the app's own query code (lib/catalog-query,
// lib/creator-intel-read) and a PostgREST stand-in (postgrest-pglite.mts).
//
// Four databases:
//   A. every migration                      (platform normalized by 000046)
//   B. 000047 without 000046                (production today + this change:
//                                            'TikTok' and 'tiktok' side by side)
//   C. neither 000046 nor 000047            (production today, code deployed first)
//   D. every migration, no tracked video    (fallback to stored top videos)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, migrate, readMigration } from "./db.mts";
import { pgliteClient } from "./postgrest-pglite.mts";
import { queryCatalog, resetCatalogSchemaCache, type CatalogQuery } from "@/lib/catalog-query";
import { readCreatorProfile, readVideoLibrary, type VideoQuery } from "@/lib/creator-intel-read";

type Row = Record<string, unknown>;
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: string[], b: string[]) => same([...a].sort(), [...b].sort());
const names = (list: { username: string }[]) => list.map((c) => c.username);
const ids = (list: { id: string }[]) => list.map((v) => v.id);

const NORMALIZE = "20261001_000046_creator_platform_normalize.sql";
const FILTERS = "20261002_000047_catalog_video_filters.sql";
const day = 86_400;
const nowS = Math.floor(Date.now() / 1000);
const isoDay = (d: number) => new Date(Date.now() - d * day * 1000).toISOString().slice(0, 10);

async function database(skip: string[]): Promise<PGlite> {
  const db = await freshDb();
  const failures = await migrate(db, (f) => skip.includes(f));
  check(`migrations apply${skip.length ? ` (without ${skip.map((s) => s.slice(16, 22)).join(", ")})` : ""}`, failures.length === 0, failures.map((f) => `${f.file}: ${f.error}`).join(" | "));
  return db;
}

/**
 * Creators with both platform spellings, some with nothing measured.
 * `mixedVideos`: store one video as 'TikTok' (impossible once 000046 applies).
 */
async function seed(db: PGlite, opts: { videos: boolean; productUrl: boolean; mixedVideos: boolean }) {
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const top = (views: number[], ageDays: number[]) =>
    JSON.stringify(
      views.map((v, i) => ({
        id: `t${i}`,
        cover: "",
        shareUrl: `https://www.tiktok.com/@alpha/video/t${i}`,
        playUrl: "",
        playCount: v,
        likeCount: Math.round(v / 10),
        commentCount: 5,
        shareCount: 2,
        createTime: nowS - ageDays[i] * day,
        desc: i === 0 ? "My best #gym day" : "leg day",
      })),
    );
  // alpha: legacy spelling, measured, no tracked videos; one stored top video far above its median (viral).
  await q(
    `insert into creators_index (username, platform, followers, engagement_rate, avg_views, avg_likes, avg_comments, avg_shares, views_per_follower, posts_analyzed,
       last_post_at, authenticity_score, email, primary_niche, niches, country_code, language, is_curated, top_videos, display_name)
     values ('alpha', 'TikTok', 50000, 8, 40000, 3000, 120, 80, 0.8, 12, now() - interval '3 days', 80, 'alpha@mail.test', 'fitness', '{fitness}', 'FR', 'fr', false, $1::jsonb, 'Alpha')`,
    [top([400000, 45000, 38000], [5, 12, 20])],
  );
  // bravo: new spelling, tracked videos, history and growth.
  await q(`insert into creators_index (username, platform, followers, engagement_rate, avg_views, avg_likes, avg_comments, avg_shares, views_per_follower, posts_analyzed,
       last_post_at, authenticity_score, email, primary_niche, niches, country_code, language, growth_score, followers_growth_pct_30d, history_days, display_name)
     values ('bravo', 'tiktok', 250000, 3, 20000, 800, 30, 5, 0.08, 12, now() - interval '40 days', 40, null, 'fitness', '{fitness,gym}', 'US', 'en', 50, 12, 31, 'Bravo')`);
  // charlie: curated, country unknown but French content, empty email.
  await q(`insert into creators_index (username, platform, followers, engagement_rate, avg_views, avg_likes, avg_comments, avg_shares, views_per_follower, posts_analyzed,
       last_post_at, authenticity_score, email, primary_niche, niches, country_code, language, is_curated, display_name)
     values ('charlie', 'TikTok', 8000, 12, 15000, 1500, 200, 300, 1.9, 12, now() - interval '1 day', 70, '', 'beauty', '{skincare}', null, 'fr', true, 'Charlie')`);
  // delta: a seeded row — estimated views, nothing measured, no history.
  await q(`insert into creators_index (username, platform, followers, engagement_rate, avg_views, niches, display_name)
     values ('delta', 'tiktok', 1200000, 2, 96000, '{food}', 'Delta')`);
  // echo: Instagram (storage key with its prefix).
  await q(`insert into creators_index (username, platform, followers, engagement_rate, avg_views, posts_analyzed, primary_niche, niches, display_name)
     values ('ig_echo', 'Instagram', 30000, 5, 9000, 10, 'fitness', '{fitness}', 'Echo')`);
  // hotel: YouTube, one Short and one long video.
  await q(`insert into creators_index (username, platform, followers, engagement_rate, avg_views, posts_analyzed, primary_niche, niches, display_name)
     values ('yt_hotel', 'youtube', 90000, 4, 30000, 6, 'tech', '{tech}', 'Hotel')`);

  if (!opts.videos) return;
  const upsert = `insert into creator_videos (platform, video_id, username, posted_at, caption, hashtags, duration_seconds, media_type, has_product_link, ${opts.productUrl ? "product_url" : "is_ad"}, views, likes, comments, shares, engagement_rate)
    values ($1, $2, $3, now() - ($4::int * interval '1 day'), $5, $6, $7, $8, $9, ${opts.productUrl ? "$10" : "$10::text is not null and false"}, $11, $12, $13, $14, $15)
    on conflict (platform, video_id) do update set views = excluded.views, likes = excluded.likes`;
  const vids: unknown[][] = [
    // platform, id, key, age days, caption, hashtags, duration, media, product flag, product url, views, likes, comments, shares, er%
    ["tiktok", "b1", "bravo", 2, "Morning run", ["running"], 30, "video", false, null, 20000, 900, 20, 4, 4.62],
    ["tiktok", "b2", "bravo", 5, "Leg day", ["gym"], 70, "video", false, null, 22000, 1000, 30, 5, 4.7],
    ["tiktok", "b3", "bravo", 9, "Protein shake", ["food"], 40, "video", true, null, 25000, 700, 10, 2, 2.85],
    ["tiktok", "b4", "bravo", 20, "Stretching", [], 20, "video", false, null, 30000, 800, 15, 3, 2.73],
    ["tiktok", "b5", "bravo", 25, "The workout that blew up", ["gym"], 50, "video", false, null, 900000, 90000, 900, 400, 10.14],
    [opts.mixedVideos ? "TikTok" : "tiktok", "c1", "charlie", 2, "Glow routine", ["skincare"], null, "photo", false, null, 12000, 1500, 60, 30, 13.25],
    ["tiktok", "c2", "charlie", 6, "Five serums compared", ["skincare"], null, "carousel", false, null, 14000, 1600, 80, 40, 12.29],
    ["tiktok", "c3", "charlie", 10, "This serum changed my skin", ["skincare"], 45, "video", true, "https://shop.example.com/serum", 16000, 2100, 150, 90, 14.6],
    ["tiktok", "c4", "charlie", 100, "Gym skincare", ["gym"], 8, "video", false, null, 10000, 900, 40, 20, 9.6],
    ["tiktok", "g1", "ghost", 1, "Unknown creator", [], 12, "video", false, "javascript:alert(1)", 5000000, 10, 1, 1, 0],
    ["youtube", "h1", "yt_hotel", 3, "Full setup tour", ["tech"], 600, "video", false, null, 80000, 4000, 300, 50, 5.4],
    ["youtube", "h2", "yt_hotel", 4, "Desk in 40 seconds", ["tech"], 40, "video", false, null, 60000, 3000, 100, 20, 5.2],
  ];
  // One statement per video, re-sent once like a second scrape (update path).
  for (const v of vids) await q(upsert, v);
  for (const v of vids.filter((x) => x[2] === "bravo")) await q(upsert, v);
  await q("update creator_videos set views_gained_7d = 250000 where video_id = 'b5'");
  await q("update creator_videos set views_gained_7d = 3000 where video_id = 'c3'");
}

/** Stats triggers, every catalog filter and sort, the video library and the creator page. */
async function fullSuite(label: string, db: PGlite) {
  const t = (name: string, ok: boolean, detail = "") => check(`[${label}] ${name}`, ok, detail);
  const client = pgliteClient(db) as unknown as SupabaseClient;
  const one = async (sql: string) => (await db.query(sql)).rows[0] as Row;

  // ── Stats kept by the triggers
  const bravo = await one("select videos_tracked, median_video_views, max_video_views, viral_videos, last_viral_at from creators_index where username = 'bravo'");
  t("tracked videos: count, median, best video", Number(bravo.videos_tracked) === 5 && Number(bravo.median_video_views) === 25000 && Number(bravo.max_video_views) === 900000, JSON.stringify(bravo));
  t("tracked videos: one viral (900K >= 5 x 25K median)", Number(bravo.viral_videos) === 1 && bravo.last_viral_at != null);
  const charlie = await one("select videos_tracked, median_video_views, viral_videos from creators_index where username = 'charlie'");
  t("every video of a creator counts, whatever the platform spelling", Number(charlie.videos_tracked) === 4 && Number(charlie.median_video_views) === 13000, JSON.stringify(charlie));
  t("no video above the 100K floor = zero viral videos", Number(charlie.viral_videos) === 0);
  const alpha = await one("select videos_tracked, median_video_views, max_video_views, viral_videos, last_viral_at from creators_index where username = 'alpha'");
  t("without tracked videos, stats come from the stored top videos", Number(alpha.videos_tracked) === 0 && Number(alpha.median_video_views) === 40000 && Number(alpha.max_video_views) === 400000 && Number(alpha.viral_videos) === 1 && alpha.last_viral_at != null, JSON.stringify(alpha));
  const delta = await one("select median_video_views, max_video_views, viral_videos from creators_index where username = 'delta'");
  t("nothing measured = viral unknown (null), not zero", delta.viral_videos === null && delta.median_video_views === null && delta.max_video_views === null);

  await db.query(`insert into creators_index (username, platform, followers, avg_views, posts_analyzed, top_videos) values ('golf', 'TikTok', 5000, 3000, 5, '[{"playCount": 200000, "createTime": ${nowS}}]'::jsonb)`);
  t("stored top videos: 200K >= max(100K, 5 x 3K) is viral", Number((await one("select viral_videos from creators_index where username = 'golf'")).viral_videos) === 1);
  await db.query(`insert into creator_videos (platform, video_id, username, views) values ('tiktok','g-1','golf',1000),('tiktok','g-2','golf',1200),('tiktok','g-3','golf',1100)`);
  let golf = await one("select videos_tracked, median_video_views, viral_videos from creators_index where username = 'golf'");
  t("first tracked videos replace the stored-top-video stats", Number(golf.videos_tracked) === 3 && Number(golf.median_video_views) === 1100 && Number(golf.viral_videos) === 0, JSON.stringify(golf));
  await db.query("update creator_videos set views = 150000 where video_id = 'g-3'");
  golf = await one("select viral_videos, max_video_views from creators_index where username = 'golf'");
  t("an update that makes a video blow up is counted", Number(golf.viral_videos) === 1 && Number(golf.max_video_views) === 150000, JSON.stringify(golf));
  let rollupOk = true;
  try {
    await db.query("select refresh_creator_rollup('tiktok', 'golf')");
  } catch (e) {
    rollupOk = false;
    console.log("   ", (e as Error).message);
  }
  t("the growth rollup still runs with the stats triggers", rollupOk);
  await db.query("delete from creator_videos where username = 'golf'");
  golf = await one("select videos_tracked, viral_videos from creators_index where username = 'golf'");
  t("deleting every tracked video falls back to the stored top videos", Number(golf.videos_tracked) === 0 && Number(golf.viral_videos) === 1);
  await db.query("delete from creators_index where username = 'golf'");

  // ── Catalog
  resetCatalogSchemaCache();
  const cat = async (q: CatalogQuery) => {
    const r = await queryCatalog({ platform: "TikTok", limit: 50, ...q }, client);
    if (r.error) console.log("    error:", r.error);
    return r;
  };
  let r = await cat({});
  t("platform TikTok: both spellings, no other platform", sameSet(names(r.creators), ["alpha", "bravo", "charlie", "delta"]), names(r.creators).join(","));
  t("rows read back with one platform name", r.creators.every((c) => c.platform === "TikTok"));
  t("default browse: curated first, then by followers", same(names(r.creators), ["charlie", "delta", "bravo", "alpha"]), names(r.creators).join(","));
  t("video stats reach the cards", r.creators.find((c) => c.username === "bravo")?.videoStats?.viralVideos === 1);
  r = await queryCatalog({ platform: "Instagram" }, client);
  t("platform Instagram", same(names(r.creators), ["echo"]), names(r.creators).join(","));
  r = await queryCatalog({ platform: "YouTube" }, client);
  t("platform YouTube", same(names(r.creators), ["hotel"]), names(r.creators).join(","));
  r = await cat({ minFollowers: 10_001, maxFollowers: 100_000 });
  t("followers 10K–100K", same(names(r.creators), ["alpha"]), names(r.creators).join(","));
  r = await cat({ minFollowers: 500_001 });
  t("followers 500K+ keeps a creator with nothing measured", same(names(r.creators), ["delta"]));
  r = await cat({ minViews: 10_000 });
  t("avg views 10K+: measured views only (seeded estimate excluded)", sameSet(names(r.creators), ["alpha", "bravo", "charlie"]), names(r.creators).join(","));
  r = await cat({ minViews: 10_000, maxViews: 30_000 });
  t("avg views between two bounds", sameSet(names(r.creators), ["bravo", "charlie"]));
  r = await cat({ minEngagement: 6 });
  t("engagement 6%+ (stored in percent)", sameSet(names(r.creators), ["alpha", "charlie"]), names(r.creators).join(","));
  r = await cat({ minReach: 0.5 });
  t("reach 50%+ of followers (avg views / followers)", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ minLikes: 1_000 });
  t("avg likes 1K+", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ minComments: 100 });
  t("avg comments 100+", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ minShares: 50 });
  t("avg shares 50+", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ viral: true });
  t("has a viral video (tracked or stored top videos)", sameSet(names(r.creators), ["alpha", "bravo"]), names(r.creators).join(","));
  r = await cat({ sort: "viral" });
  t("sort by biggest video", same(names(r.creators), ["bravo", "alpha", "charlie", "delta"]), names(r.creators).join(","));
  r = await cat({ hasEmail: true });
  t("with email (an empty string is no email)", same(names(r.creators), ["alpha"]));
  r = await cat({ verified: true });
  t("verified (authenticity 60+)", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ activeWithinDays: 7 });
  t("posted in the last 7 days (unknown last post excluded)", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ country: "FR" });
  t("country FR: FR, or unknown country with French content", sameSet(names(r.creators), ["alpha", "charlie"]), names(r.creators).join(","));
  r = await cat({ country: "US" });
  t("country US: known country only", same(names(r.creators), ["bravo"]));
  r = await cat({ language: "FR" });
  t("language, without case", sameSet(names(r.creators), ["alpha", "charlie"]));
  r = await cat({ niche: "fitness" });
  t("niche fitness", sameSet(names(r.creators), ["alpha", "bravo"]));
  r = await cat({ niche: "beauty" });
  t("niche beauty matches the skincare tag", same(names(r.creators), ["charlie"]));
  r = await cat({ niche: "fitness", country: "FR" });
  t("niche and country together (both groups apply)", same(names(r.creators), ["alpha"]), names(r.creators).join(","));
  r = await cat({ niche: "vegan food" });
  t("a free-text niche uses the tags of its words", same(names(r.creators), ["delta"]), names(r.creators).join(","));
  r = await cat({ niche: "underwater basket" });
  t("a niche with no tag matches nobody", r.creators.length === 0 && !r.error);
  r = await cat({ search: "rav" });
  t("name search", same(names(r.creators), ["bravo"]));
  r = await cat({ sort: "growth" });
  t("top scaling: tracked growth first, then reach", same(names(r.creators), ["bravo", "charlie", "alpha", "delta"]), names(r.creators).join(","));
  r = await cat({ minGrowthPct30d: 10 });
  t("30-day growth 10%+", same(names(r.creators), ["bravo"]));
  r = await cat({ sort: "engagement" });
  t("sort by engagement: a pure ranking, curated not forced first", same(names(r.creators), ["charlie", "alpha", "bravo", "delta"]), names(r.creators).join(","));
  r = await cat({ sort: "reach" });
  t("sort by reach, unknown last", same(names(r.creators), ["charlie", "alpha", "bravo", "delta"]));
  r = await cat({ sort: "views" });
  t("sort by average views", names(r.creators)[0] === "delta" && names(r.creators)[1] === "alpha");
  r = await cat({ sort: "recent" });
  t("sort by latest post, unknown last", same(names(r.creators), ["charlie", "alpha", "bravo", "delta"]));
  const pages: string[] = [];
  for (let offset = 0; offset < 6; offset += 2) {
    const page = await cat({ limit: 2, offset });
    pages.push(...names(page.creators));
    if (offset === 0) t("page 1 says more pages exist", page.hasMore);
  }
  t("pages never skip nor repeat a creator (curated included)", same(pages, ["charlie", "delta", "bravo", "alpha"]), pages.join(","));

  // ── Video library
  const lib = (q: VideoQuery) => readVideoLibrary(client, { platform: "tiktok", ...q });
  let v = await lib({});
  t("library: tracked videos, most viewed first", v.source === "tracked" && same(ids(v.videos).slice(0, 3), ["g1", "b5", "b4"]), ids(v.videos).join(","));
  t("library: a video whose creator is unknown still shows", v.videos.some((x) => x.id === "g1" && x.displayName === "ghost"));
  t("library: only http(s) product links are shown", v.videos.find((x) => x.id === "g1")?.productUrl === null && v.videos.find((x) => x.id === "g1")?.hasProductLink === false);
  t("library: creator fields on the card", v.videos.find((x) => x.id === "b5")?.displayName === "Bravo" && v.videos.find((x) => x.id === "b5")?.followers === 250000);
  v = await lib({ platform: "TikTok" });
  t("library: platform without case", v.videos.length === 10, String(v.videos.length));
  v = await lib({ minViews: 100_000 });
  t("library: views 100K+", same(ids(v.videos), ["g1", "b5"]));
  v = await lib({ minViews: 20_000, maxViews: 25_000 });
  t("library: views between two bounds", sameSet(ids(v.videos), ["b1", "b2", "b3"]));
  v = await lib({ niche: "fitness" });
  t("library: niche = the creator's niche or the video's hashtags", sameSet(ids(v.videos), ["b1", "b2", "b3", "b4", "b5", "c4"]), ids(v.videos).join(","));
  v = await lib({ postedWithinDays: 7 });
  t("library: published in the last 7 days", sameSet(ids(v.videos), ["b1", "b2", "c1", "c2", "g1"]), ids(v.videos).join(","));
  v = await lib({ postedFrom: isoDay(11), postedTo: isoDay(8) });
  t("library: published between two dates", sameSet(ids(v.videos), ["b3", "c3"]), ids(v.videos).join(","));
  v = await lib({ mediaType: "photo" });
  t("library: photo posts (single and carousel)", sameSet(ids(v.videos), ["c1", "c2"]));
  v = await lib({ mediaType: "carousel" });
  t("library: carousels", same(ids(v.videos), ["c2"]));
  v = await lib({ mediaType: "video" });
  t("library: videos only", v.videos.length === 8 && v.videos.every((x) => x.mediaType === "video"));
  v = await lib({ mediaType: "short" });
  t("library: short videos (every TikTok video)", v.videos.length === 8 && v.videos.every((x) => x.format === "short"));
  v = await readVideoLibrary(client, { platform: "youtube", mediaType: "long" });
  t("library: long videos (YouTube over 3 min)", same(ids(v.videos), ["h1"]) && v.videos[0].format === "long");
  v = await readVideoLibrary(client, { platform: "youtube", mediaType: "short" });
  t("library: YouTube Shorts", same(ids(v.videos), ["h2"]));
  v = await lib({ duration: "short" });
  t("library: under 15 s", sameSet(ids(v.videos), ["c4", "g1"]));
  v = await lib({ duration: "medium" });
  t("library: 15 s to 60 s", sameSet(ids(v.videos), ["b1", "b3", "b4", "b5", "c3"]));
  v = await lib({ duration: "long" });
  t("library: over 60 s", same(ids(v.videos), ["b2"]));
  v = await lib({ hasProduct: true });
  t("library: with a product (flag or link)", sameSet(ids(v.videos), ["b3", "c3"]), ids(v.videos).join(","));
  t("library: the product link is on the card", v.videos.find((x) => x.id === "c3")?.productUrl === "https://shop.example.com/serum");
  v = await lib({ viral: true });
  t("library: viral videos only (unknown creator median = not viral)", same(ids(v.videos), ["b5"]), ids(v.videos).join(","));
  t("library: viral flag on the card", v.videos[0]?.isViral === true);
  v = await lib({ country: "FR" });
  t("library: creator country (French content counts)", sameSet(ids(v.videos), ["c1", "c2", "c3", "c4"]), ids(v.videos).join(","));
  v = await lib({ language: "en" });
  t("library: creator language", v.videos.length === 5 && v.videos.every((x) => x.username === "bravo"));
  v = await lib({ q: "serum" });
  t("library: caption search (whole words)", same(ids(v.videos), ["c3"]), ids(v.videos).join(","));
  v = await lib({ sort: "gained" });
  t("library: fastest growing this week first", same(ids(v.videos).slice(0, 2), ["b5", "c3"]));
  v = await lib({ sort: "recent" });
  t("library: newest first", ids(v.videos)[0] === "g1" && ids(v.videos)[v.videos.length - 1] === "c4");
  v = await lib({ sort: "engagement", minViews: 10_000 });
  t("library: best engagement", ids(v.videos)[0] === "c3");
  const vp1 = await lib({ limit: 4 });
  const vp2 = await lib({ limit: 4, offset: 4 });
  const vp3 = await lib({ limit: 4, offset: 8 });
  t(
    "library: pages cover every video once",
    vp1.hasMore && !vp3.hasMore && same([...ids(vp1.videos), ...ids(vp2.videos), ...ids(vp3.videos)].sort(), ["b1", "b2", "b3", "b4", "b5", "c1", "c2", "c3", "c4", "g1"]),
  );
  v = await lib({ minViews: 50_000_000 });
  t("library: no tracked match -> stored top videos of untracked creators, filtered the same way", v.source === "snapshot" && v.videos.length === 0);
  v = await lib({ viral: true, niche: "fitness", postedWithinDays: 7 });
  t("library: viral + niche + date reaches alpha's stored viral video", v.source === "snapshot" && same(ids(v.videos), ["t0"]), `${v.source} ${ids(v.videos).join(",")}`);
  v = await lib({ hasProduct: true, niche: "gaming" });
  t("library: a product filter with no tracked match says tracking is needed", v.needsTracking === true && v.videos.length === 0);

  // ── Creator page
  const pb = await readCreatorProfile(client, "bravo");
  t("profile: tracked depth, videos and viral count", pb?.depth === "tracked" && pb.videos.length === 5 && pb.mix.viralVideos === 1 && pb.videos.find((x) => x.id === "b5")?.isViral === true);
  t("profile: platform shown as TikTok", pb?.creator.platform === "TikTok");
  t("profile: similar creators stay on the creator's platform", Boolean(pb) && pb!.similar.every((s) => s.platform === "TikTok"));
  const pc = await readCreatorProfile(client, "charlie");
  t("profile: product link and formats of tracked videos", pc?.videos.find((x) => x.id === "c3")?.productUrl === "https://shop.example.com/serum" && pc.mix.photos === 2 && pc.mix.productLinkShare === 25);
  const pa = await readCreatorProfile(client, "alpha");
  t(
    "profile: stored top videos carry likes, dates and the viral flag",
    pa?.depth === "snapshot" && pa.videos.length === 3 && pa.videos[0].likes === 40000 && pa.videos[0].postedAt != null && pa.videos[0].isViral === true && pa.mix.viralVideos === 1,
  );
  const pd = await readCreatorProfile(client, "delta");
  t("profile: a creator with nothing measured still loads", pd?.creator.username === "delta" && pd.videos.length === 0 && pd.mix.viralVideos === null);
  const pe = await readCreatorProfile(client, "echo");
  t("profile: Instagram creator by its handle", pe?.creator.username === "echo" && pe.creator.platform === "Instagram");

  // ── Browser roles see nothing new
  for (const [role, sql, what] of [
    ["authenticated", "select * from public.creator_video_library limit 1", "the video library view"],
    ["anon", "select * from public.creator_video_library limit 1", "the video library view"],
    ["anon", "select refresh_creator_video_stats('tiktok','bravo')", "the stats function"],
  ] as const) {
    let blocked = false;
    try {
      await db.exec(`set role ${role}`);
      await db.query(sql);
    } catch {
      blocked = true;
    } finally {
      await db.exec("reset role");
    }
    t(`${role} cannot use ${what}`, blocked);
  }
}

// ── A. Every migration
const a = await database([]);
await seed(a, { videos: true, productUrl: true, mixedVideos: false });
const spellings = (await a.query("select distinct platform from creators_index order by 1")).rows.map((x: Row) => x.platform);
check("[A] 000046 stores one spelling per platform", same(spellings as string[], ["instagram", "tiktok", "youtube"]), (spellings as string[]).join(","));
await fullSuite("A", a);

// ── B. 000047 before 000046: both spellings in every table
const b = await database([NORMALIZE]);
await seed(b, { videos: true, productUrl: true, mixedVideos: true });
const bSpellings = (await b.query("select distinct platform from creators_index where platform ilike 'tiktok' order by 1")).rows.map((x: Row) => x.platform);
check("[B] both spellings stored ('TikTok' and 'tiktok')", same(bSpellings as string[], ["TikTok", "tiktok"]));
await fullSuite("B", b);
// Then 000046 lands on top (production order if 000047 goes first).
let lateNormalize = "";
try {
  await b.exec(readMigration(NORMALIZE));
} catch (e) {
  lateNormalize = (e as Error).message;
}
check("[B] 000046 applies after 000047, on data", lateNormalize === "", lateNormalize);
resetCatalogSchemaCache();
const bClient = pgliteClient(b) as unknown as SupabaseClient;
const bAfter = await queryCatalog({ platform: "TikTok", viral: true, limit: 50 }, bClient);
check("[B] after 000046: viral creators and their stats survive", sameSet(names(bAfter.creators), ["alpha", "bravo"]), names(bAfter.creators).join(","));
const bStats = (await b.query("select videos_tracked, viral_videos from creators_index where username = 'charlie'")).rows[0] as Row;
check("[B] after 000046: stats of a creator whose videos were renamed", Number(bStats.videos_tracked) === 4 && Number(bStats.viral_videos) === 0, JSON.stringify(bStats));
const bLib = await readVideoLibrary(bClient, { platform: "tiktok", country: "FR" });
check("[B] after 000046: library joins creators on the normalized keys", sameSet(ids(bLib.videos), ["c1", "c2", "c3", "c4"]));

// ── C. Neither migration: the code must degrade, never break or show wrong rows
const c = await database([NORMALIZE, FILTERS]);
await seed(c, { videos: true, productUrl: false, mixedVideos: true });
const cClient = pgliteClient(c) as unknown as SupabaseClient;
resetCatalogSchemaCache();
let r = await queryCatalog({ platform: "TikTok", limit: 50 }, cClient);
check("[C] catalog answers, both spellings", !r.error && sameSet(names(r.creators), ["alpha", "bravo", "charlie", "delta"]), r.error ?? names(r.creators).join(","));
r = await queryCatalog({ platform: "TikTok", minComments: 100, minShares: 50, minViews: 10_000 }, cClient);
check("[C] comments, shares and views filters", !r.error && sameSet(names(r.creators), ["alpha", "charlie"]));
r = await queryCatalog({ platform: "TikTok", viral: true }, cClient);
check("[C] the viral filter matches nobody (not everybody) until 000047", !r.error && r.creators.length === 0);
r = await queryCatalog({ platform: "TikTok", sort: "viral", minEngagement: 6 }, cClient);
check("[C] the viral sort falls back to average views", !r.error && same(names(r.creators), ["alpha", "charlie"]));
let v = await readVideoLibrary(cClient, { platform: "tiktok", niche: "beauty", mediaType: "photo" });
check("[C] library reads creator_videos directly (niche via creators, both spellings)", v.source === "tracked" && sameSet(ids(v.videos), ["c1", "c2"]), ids(v.videos).join(","));
v = await readVideoLibrary(cClient, { platform: "tiktok", hasProduct: true });
check("[C] library product filter on the flag", sameSet(ids(v.videos), ["b3", "c3"]));
v = await readVideoLibrary(cClient, { platform: "tiktok", viral: true });
check("[C] library viral filter: only videos judged viral", v.videos.length > 0 && v.videos.every((x) => x.isViral === true));
const pcC = await readCreatorProfile(cClient, "charlie");
check("[C] creator page reads 'TikTok' and 'tiktok' videos", pcC?.depth === "tracked" && pcC.videos.length === 4);

// ── D. Nothing tracked yet
const d = await database([]);
await seed(d, { videos: false, productUrl: true, mixedVideos: false });
const dClient = pgliteClient(d) as unknown as SupabaseClient;
v = await readVideoLibrary(dClient, { platform: "tiktok" });
check("[D] the library shows stored top videos", v.source === "snapshot" && v.videos.length === 3 && v.videos[0].views === 400000);
v = await readVideoLibrary(dClient, { platform: "tiktok", viral: true });
check("[D] viral filter on stored videos", same(ids(v.videos), ["t0"]));
v = await readVideoLibrary(dClient, { platform: "tiktok", postedWithinDays: 7 });
check("[D] published date on stored videos", same(ids(v.videos), ["t0"]));
v = await readVideoLibrary(dClient, { platform: "tiktok", q: "leg" });
check("[D] caption search on stored videos", sameSet(ids(v.videos), ["t1", "t2"]));
v = await readVideoLibrary(dClient, { platform: "tiktok", mediaType: "carousel" });
check("[D] a format filter asks for tracking instead of showing wrong videos", v.needsTracking === true && v.videos.length === 0);
resetCatalogSchemaCache();
r = await queryCatalog({ platform: "TikTok", viral: true }, dClient);
check("[D] viral creators from stored top videos", same(names(r.creators), ["alpha"]));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
