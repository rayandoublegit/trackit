/**
 * Proactive video preview repair for creators_index:
 * - Find creators missing permanent video covers in top_videos
 * - Fetch live TikTok videos (ScrapeCreators)
 * - Download covers, store in Supabase Storage, update top_videos
 *
 * Usage:
 *   npx tsx scripts/backfill-video-thumbs.ts
 *   npx tsx scripts/backfill-video-thumbs.ts --limit=100
 *   npx tsx scripts/backfill-video-thumbs.ts --lang=fr
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { refreshAndPersistCreatorVideoThumbs } from "@/lib/tiktok-video-thumbs";
import type { TopVideo } from "@/lib/creator-enrichment";

config({ path: ".env.local" });

const BATCH_SIZE = 1000;
const CONCURRENCY = 4;
const PROGRESS_EVERY = 10;
const MAX_THUMBS = 3;

type CreatorRow = {
  username: string;
  top_videos: TopVideo[] | null;
};

type FailedEntry = { username: string; error: string };

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let lang: string | null = null;
  for (const a of args) {
    if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length)) || Infinity;
    if (a.startsWith("--lang=")) lang = a.slice("--lang=".length).trim() || null;
  }
  return { limit, lang };
}

function needsRepair(row: CreatorRow): boolean {
  const videos = Array.isArray(row.top_videos) ? row.top_videos : [];
  const stable = videos.filter((v) => v?.cover && isStablePublicImageUrl(v.cover));
  return stable.length < MAX_THUMBS;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!process.env.SCRAPECREATORS_API_KEY) {
    console.error("Missing SCRAPECREATORS_API_KEY");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchCandidates(
  supa: ReturnType<typeof getSupabase>,
  lang: string | null,
  limit: number
): Promise<CreatorRow[]> {
  const all: CreatorRow[] = [];

  for (let page = 0; ; page += 1) {
    let q = supa
      .from("creators_index")
      .select("username, top_videos")
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);
    if (lang) q = q.eq("language", lang);

    const { data, error } = await q;
    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (needsRepair(row)) all.push(row);
      if (all.length >= limit) return all.slice(0, limit);
    }

    console.log(`Fetched page ${page + 1}: ${rows.length} rows (${all.length} need repair)`);
    if (rows.length < BATCH_SIZE) break;
  }

  return all.slice(0, limit);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await worker(items[current]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );
}

async function main() {
  const { limit, lang } = parseArgs();
  const supa = getSupabase();

  console.log("=== LIVE VIDEO THUMB BACKFILL ===");
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Language filter: ${lang ?? "all"}`);
  console.log(`Limit: ${Number.isFinite(limit) ? limit : "none"}`);
  console.log("");

  console.log("Loading creators that need permanent video previews…");
  const candidates = await fetchCandidates(supa, lang, limit);
  const total = candidates.length;

  if (total === 0) {
    console.log("Nothing to repair — all matching creators already have permanent video covers.");
    process.exit(0);
  }

  console.log(`\nRepairing ${total} creators (TikTok videos → Storage → top_videos)…\n`);

  let processed = 0;
  let succeeded = 0;
  const failed: FailedEntry[] = [];
  const started = Date.now();

  await runWithConcurrency(candidates, CONCURRENCY, async (row) => {
    try {
      const result = await refreshAndPersistCreatorVideoThumbs(
        supa,
        row.username,
        row.top_videos
      );
      processed += 1;
      const ok =
        result &&
        result.thumbs.filter((t) => isStablePublicImageUrl(t.thumbnail)).length > 0;
      if (ok) succeeded += 1;
      else failed.push({ username: row.username, error: "no-permanent-thumbs" });
    } catch (err) {
      processed += 1;
      failed.push({
        username: row.username,
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    if (processed % PROGRESS_EVERY === 0 || processed === total) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      const rate = processed / Math.max(1, (Date.now() - started) / 1000);
      const eta = rate > 0 ? ((total - processed) / rate / 60).toFixed(1) : "?";
      console.log(
        `Progress: ${processed}/${total} (${succeeded} ok, ${failed.length} failed) — ${elapsed}s elapsed, ~${eta} min left`
      );
    }
  });

  console.log("\n========== VIDEO THUMB BACKFILL REPORT ==========");
  console.log(`Total processed : ${processed}`);
  console.log(`Re-hosted (ok)  : ${succeeded}`);
  console.log(`Failed          : ${failed.length}`);
  console.log(`Duration        : ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);

  if (failed.length > 0) {
    const byError: Record<string, number> = {};
    for (const f of failed) byError[f.error] = (byError[f.error] || 0) + 1;
    console.log("\nFailures by reason:");
    for (const [err, n] of Object.entries(byError).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}×  ${err}`);
    }
    console.log("\nFailed usernames (first 40):");
    for (const entry of failed.slice(0, 40)) {
      console.log(`  @${entry.username}  →  ${entry.error}`);
    }
    if (failed.length > 40) console.log(`  … and ${failed.length - 40} more`);
  }

  console.log("=================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
