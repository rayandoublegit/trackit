/**
 * Create / raise the creator-content Storage bucket to 1 GB.
 *
 * Prerequisite: in Supabase Dashboard → Storage → Configuration,
 * set "Global file size limit" to at least 1 GB (Pro plans), then run:
 *   npx tsx scripts/raise-creator-content-limit.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const TARGET = 1024 * 1024 * 1024; // 1 GB
const FALLBACKS = [TARGET, 500 * 1024 * 1024, 200 * 1024 * 1024, 100 * 1024 * 1024, 50 * 1024 * 1024];

const TRACKIT_REF = "tokpuhzjhysqxwjkxfya";
const ZESCALE_REF = "utqlwiksnimfbuylzwzi";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  if (url.includes(ZESCALE_REF) || !url.includes(TRACKIT_REF)) {
    console.error(
      `Refusing to run: this script is Trackit-only (${TRACKIT_REF}.supabase.co).\n` +
        `Current NEXT_PUBLIC_SUPABASE_URL=${url}\n` +
        `Restore Trackit .env.local (e.g. cp .env.local.backup .env.local) and retry.`,
    );
    process.exit(1);
  }
  const sb = createClient(url, key);

  for (const limit of FALLBACKS) {
    const existing = await sb.storage.getBucket("creator-content");
    const op = existing.data
      ? sb.storage.updateBucket("creator-content", { public: true, fileSizeLimit: limit })
      : sb.storage.createBucket("creator-content", { public: true, fileSizeLimit: limit });
    const { error } = await op;
    if (!error) {
      const got = await sb.storage.getBucket("creator-content");
      console.log(`✓ creator-content file_size_limit = ${got.data?.file_size_limit} bytes`);
      if ((got.data?.file_size_limit ?? 0) < TARGET) {
        console.log(
          "\nProject global Storage limit is still below 1 GB.\n" +
            "Raise it here, then re-run this script:\n" +
            "  Supabase Dashboard → Storage → Configuration → Global file size limit → 1 GB\n",
        );
      }
      return;
    }
    console.log(`… ${limit} bytes rejected (${error.message})`);
  }
  process.exit(1);
}

void main();
