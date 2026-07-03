// One-off: re-host creator profile photos from expiring TikTok CDN URLs into
// Supabase Storage (bucket "creator-avatars") and update creators_index.avatar_url.
//
// Usage: npx tsx scripts/backfill-avatars.ts
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BUCKET = "creator-avatars";
const BATCH_SIZE = 1000;
const CONCURRENCY = 5;
const PROGRESS_EVERY = 50;
const FETCH_TIMEOUT_MS = 20_000;

const FETCH_HEADERS: Record<string, string> = {
  Referer: "https://www.tiktok.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/*,*/*",
};

type CreatorRow = { username: string; avatar_url: string };
type FailedEntry = { username: string; error: string };

function isAlreadyOnSupabase(url: string): boolean {
  return url.includes("supabase.co/storage");
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchCandidates(supa: ReturnType<typeof getSupabase>): Promise<CreatorRow[]> {
  const all: CreatorRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, avatar_url")
      .in("language", ["fr", "en"])
      .not("avatar_url", "is", null)
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const avatarUrl = row.avatar_url?.trim() || "";
      if (!avatarUrl || isAlreadyOnSupabase(avatarUrl)) continue;
      all.push({ username: row.username, avatar_url: avatarUrl });
    }

    console.log(`Fetched page ${page + 1}: ${rows.length} rows (${all.length} candidates so far)`);
    if (rows.length < BATCH_SIZE) break;
  }

  return all;
}

async function downloadAvatar(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return { error: String(res.status) };

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!contentType.startsWith("image/")) {
      return { error: `not-image:${contentType || "unknown"}` };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return { error: "empty-body" };

    return { buffer, contentType };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return { error: "timeout" };
    return { error: err instanceof Error ? err.message : "fetch-error" };
  }
}

async function rehostAvatar(
  supa: ReturnType<typeof getSupabase>,
  row: CreatorRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { username, avatar_url } = row;

  try {
    const downloaded = await downloadAvatar(avatar_url);
    if ("error" in downloaded) {
      return { ok: false, error: downloaded.error };
    }

    const objectPath = `${username}.jpg`;
    const { error: uploadError } = await supa.storage
      .from(BUCKET)
      .upload(objectPath, downloaded.buffer, {
        contentType: downloaded.contentType,
        upsert: true,
      });

    if (uploadError) {
      return { ok: false, error: `upload:${uploadError.message}` };
    }

    const { data: publicData } = supa.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = publicData?.publicUrl?.trim() || "";
    if (!publicUrl) {
      return { ok: false, error: "no-public-url" };
    }

    const { error: updateError } = await supa
      .from("creators_index")
      .update({ avatar_url: publicUrl })
      .eq("username", username);

    if (updateError) {
      return { ok: false, error: `update:${updateError.message}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
}

async function main() {
  const supa = getSupabase();
  console.log("Loading creators_index candidates (fr/en, non-Supabase avatar_url)…");

  const candidates = await fetchCandidates(supa);
  const total = candidates.length;

  if (total === 0) {
    console.log("Nothing to migrate — all matching avatars are already on Supabase Storage.");
    process.exit(0);
  }

  console.log(`\nProcessing ${total} creators (${CONCURRENCY} concurrent)…\n`);

  let processed = 0;
  let succeeded = 0;
  const failed: FailedEntry[] = [];

  await runWithConcurrency(candidates, CONCURRENCY, async (row) => {
    const result = await rehostAvatar(supa, row);
    processed += 1;

    if (result.ok) {
      succeeded += 1;
    } else {
      failed.push({ username: row.username, error: result.error });
    }

    if (processed % PROGRESS_EVERY === 0 || processed === total) {
      console.log(`Progress: ${processed}/${total} (${succeeded} ok, ${failed.length} failed)`);
    }
  });

  console.log("\n========== BACKFILL REPORT ==========");
  console.log(`Total processed : ${processed}`);
  console.log(`Re-hosted (ok)  : ${succeeded}`);
  console.log(`Failed          : ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed usernames:");
    for (const entry of failed) {
      console.log(`  @${entry.username}  →  ${entry.error}`);
    }
  }

  console.log("=====================================\n");
  process.exit(failed.length > 0 ? 0 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
