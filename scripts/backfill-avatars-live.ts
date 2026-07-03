/**
 * Proactive avatar repair for creators_index:
 * - Find creators with missing / ui-avatars / expired TikTok CDN avatars
 * - Scrape each TikTok profile live (ScrapeCreators)
 * - Download the real profile photo
 * - Store permanently in Supabase Storage (creator-avatars / avatars)
 * - Update creators_index.avatar_url (+ clear avatar_refresh_failed_at)
 *
 * Usage:
 *   npx tsx scripts/backfill-avatars-live.ts
 *   npx tsx scripts/backfill-avatars-live.ts --limit=100
 *   npx tsx scripts/backfill-avatars-live.ts --lang=fr
 *   npx tsx scripts/backfill-avatars-live.ts --force   # ignore 7d fail cooldown
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { refreshAndPersistCreatorAvatar, isUiAvatarsUrl } from "@/lib/tiktok-avatar";

config({ path: ".env.local" });

const BATCH_SIZE = 1000;
const CONCURRENCY = 5;
const PROGRESS_EVERY = 10;
const FAIL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type CreatorRow = {
  username: string;
  avatar_url: string | null;
  avatar_refresh_failed_at?: string | null;
};

type FailedEntry = { username: string; error: string };

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let lang: string | null = null;
  let force = false;
  for (const a of args) {
    if (a.startsWith("--limit=")) limit = Number(a.slice("--limit=".length)) || Infinity;
    if (a.startsWith("--lang=")) lang = a.slice("--lang=".length).trim() || null;
    if (a === "--force") force = true;
  }
  return { limit, lang, force };
}

function isStableSupabaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isUiAvatarsUrl(url)) return false;
  return url.includes("supabase.co/storage") || url.includes("/storage/v1/object/public/");
}

function needsRepair(row: CreatorRow, force: boolean): boolean {
  if (!force && row.avatar_refresh_failed_at) {
    const ts = new Date(row.avatar_refresh_failed_at).getTime();
    if (!Number.isNaN(ts) && Date.now() - ts < FAIL_COOLDOWN_MS) return false;
  }
  return !isStableSupabaseUrl(row.avatar_url);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!process.env.SCRAPECREATORS_API_KEY) {
    console.error("Missing SCRAPECREATORS_API_KEY — cannot scrape live TikTok profiles");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchCandidates(
  supa: ReturnType<typeof getSupabase>,
  lang: string | null,
  force: boolean,
  limit: number
): Promise<CreatorRow[]> {
  const all: CreatorRow[] = [];

  for (let page = 0; ; page += 1) {
    let q = supa
      .from("creators_index")
      .select("username, avatar_url, avatar_refresh_failed_at")
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

    if (lang) q = q.eq("language", lang);

    const { data, error } = await q;
    if (error) {
      // Column may not exist yet — retry without it.
      if (error.message.includes("avatar_refresh_failed_at")) {
        let q2 = supa
          .from("creators_index")
          .select("username, avatar_url")
          .order("username", { ascending: true })
          .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);
        if (lang) q2 = q2.eq("language", lang);
        const retry = await q2;
        if (retry.error) {
          console.error("Query failed:", retry.error.message);
          process.exit(1);
        }
        const rows = (retry.data ?? []) as CreatorRow[];
        for (const row of rows) {
          if (needsRepair(row, force)) all.push(row);
          if (all.length >= limit) return all.slice(0, limit);
        }
        console.log(`Fetched page ${page + 1}: ${rows.length} rows (${all.length} need repair)`);
        if (rows.length < BATCH_SIZE) break;
        continue;
      }
      console.error("Query failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (needsRepair(row, force)) all.push(row);
      if (all.length >= limit) return all.slice(0, limit);
    }

    console.log(`Fetched page ${page + 1}: ${rows.length} rows (${all.length} need repair)`);
    if (rows.length < BATCH_SIZE) break;
  }

  return all.slice(0, limit);
}

async function markFailed(supa: ReturnType<typeof getSupabase>, username: string): Promise<void> {
  const { error } = await supa
    .from("creators_index")
    .update({ avatar_refresh_failed_at: new Date().toISOString() })
    .eq("username", username);
  if (error && !error.message.includes("avatar_refresh_failed_at")) {
    console.warn(`  warn markFailed @${username}: ${error.message}`);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await worker(items[current], current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );
}

async function main() {
  const { limit, lang, force } = parseArgs();
  const supa = getSupabase();

  console.log("=== LIVE AVATAR BACKFILL ===");
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Language filter: ${lang ?? "all"}`);
  console.log(`Force (ignore fail cooldown): ${force}`);
  console.log(`Limit: ${Number.isFinite(limit) ? limit : "none"}`);
  console.log("");

  console.log("Loading creators that need a permanent profile photo…");
  const candidates = await fetchCandidates(supa, lang, force, limit);
  const total = candidates.length;

  if (total === 0) {
    console.log("Nothing to repair — all matching creators already have Supabase avatars.");
    process.exit(0);
  }

  console.log(`\nRepairing ${total} creators (TikTok live scrape → Storage → DB)…\n`);

  let processed = 0;
  let succeeded = 0;
  const failed: FailedEntry[] = [];
  const started = Date.now();

  await runWithConcurrency(candidates, CONCURRENCY, async (row) => {
    const username = row.username;
    try {
      // Always scrape live TikTok (ignore expired stored CDN as primary source).
      const result = await refreshAndPersistCreatorAvatar(supa, username, null);
      processed += 1;

      if (result && result.permanentUrl.includes("supabase.co")) {
        succeeded += 1;
      } else if (result) {
        // Got bytes but storage didn't return a permanent URL — count as partial fail.
        failed.push({ username, error: "stored-bytes-only" });
        await markFailed(supa, username);
      } else {
        failed.push({ username, error: "scrape-or-download-failed" });
        await markFailed(supa, username);
      }
    } catch (err) {
      processed += 1;
      const msg = err instanceof Error ? err.message : "unknown";
      failed.push({ username, error: msg });
      await markFailed(supa, username);
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

  console.log("\n========== LIVE BACKFILL REPORT ==========");
  console.log(`Total processed : ${processed}`);
  console.log(`Re-hosted (ok)  : ${succeeded}`);
  console.log(`Failed          : ${failed.length}`);
  console.log(`Duration        : ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);

  if (failed.length > 0) {
    const byError: Record<string, number> = {};
    for (const f of failed) {
      byError[f.error] = (byError[f.error] || 0) + 1;
    }
    console.log("\nFailures by reason:");
    for (const [err, n] of Object.entries(byError).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}×  ${err}`);
    }
    console.log("\nFailed usernames (first 50):");
    for (const entry of failed.slice(0, 50)) {
      console.log(`  @${entry.username}  →  ${entry.error}`);
    }
    if (failed.length > 50) console.log(`  … and ${failed.length - 50} more`);
  }

  console.log("==========================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
