/**
 * Audit v2 — clean shops/brands from ecommerce/saas tags and false-positive curated rows.
 *
 * Scope:
 *   - niches contains any of: e-commerce, ecommerce, ecom, dropshipping, shopify, saas, startup
 *   - OR is_curated = true
 *
 * Actions (never touches PROTECTED usernames):
 *   - !is_content_creator && !is_curated → DELETE
 *   - !is_content_creator && is_curated  → is_curated=false, remove "curated" from niches (no delete)
 *   - is_content_creator                → fix language if different
 *
 * Usage:
 *   npx tsx scripts/audit-v2.ts
 *   AUDIT_APPLY=1 npx tsx scripts/audit-v2.ts
 */
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BATCH_SIZE = 1000;
const CONCURRENCY = 5;
const PROGRESS_EVERY = 25;
const APPLY = process.env.AUDIT_APPLY === "1";

const NICHE_TAGS = [
  "e-commerce",
  "ecommerce",
  "ecom",
  "dropshipping",
  "shopify",
  "saas",
  "startup",
] as const;

/** Never modify these accounts, regardless of Claude's judgment. */
const PROTECTED = new Set([
  "alice.isna",
  "callmeejb",
  "0xsully",
  "yp_busy",
  "mexed14",
  "ibra92bs",
  "cook.with.love13",
]);

type CreatorRow = {
  username: string;
  display_name: string | null;
  bio: string | null;
  primary_niche: string | null;
  language: string | null;
  niches: string[] | null;
  is_curated: boolean | null;
};

type AuditResult = {
  is_content_creator: boolean;
  relevant_niches: string[];
  language: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }
  return new Anthropic({ apiKey });
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in model output");
  return body.slice(start, end + 1);
}

function parseAuditResult(text: string): AuditResult {
  const obj = JSON.parse(extractJson(text)) as Record<string, unknown>;
  const languageRaw = obj.language;
  const language =
    languageRaw == null || languageRaw === ""
      ? null
      : String(languageRaw).toLowerCase().trim().slice(0, 8) || null;
  const relevant_niches = Array.isArray(obj.relevant_niches)
    ? obj.relevant_niches.map((n) => String(n).toLowerCase().trim()).filter(Boolean)
    : [];
  return {
    is_content_creator: obj.is_content_creator === true,
    relevant_niches,
    language,
  };
}

function buildAuditPrompt(row: CreatorRow): string {
  const niches = Array.isArray(row.niches) ? row.niches.join(", ") : "";
  return `You audit TikTok accounts for a brand-partnership discovery database.

Username: @${row.username}
Display name: ${row.display_name || row.username}
Bio: ${row.bio || "(empty)"}
Current primary_niche: ${row.primary_niche || "(none)"}
Current niches tags: ${niches || "(none)"}
is_curated flag: ${row.is_curated === true}

Decide if this is a CONTENT creator (person who posts educational/entertaining content, tips, tutorials, formations, build-in-public, reviews of methods/tools).

is_content_creator = false for:
- online shops / storefronts
- product brands / single-product accounts
- official brand/enseigne accounts
- pure sellers promoting only their own products
- company pages without educational content

is_content_creator = true for people who teach, advise, document, or create content about ecommerce, saas, startups, lifestyle, fitness, etc.

relevant_niches = 0-4 lowercase niche tags that fit their content (e.g. "e-commerce", "saas", "fitness"). Empty array if not a content creator.

language = ISO 639-1 of their content (e.g. "fr", "en"), or null if unknown.

Return ONLY a JSON object, no prose:
{
  "is_content_creator": boolean,
  "relevant_niches": string[],
  "language": string | null
}`;
}

async function auditCreator(client: Anthropic, row: CreatorRow): Promise<AuditResult> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 160,
    messages: [{ role: "user", content: buildAuditPrompt(row) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseAuditResult(text);
}

function isCuratedRow(row: CreatorRow): boolean {
  if (row.is_curated === true) return true;
  const niches = Array.isArray(row.niches) ? row.niches.map((n) => String(n).toLowerCase()) : [];
  return niches.includes("curated");
}

function normalizeHandle(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

async function fetchCandidates(supa: ReturnType<typeof getSupabase>): Promise<CreatorRow[]> {
  const byUsername = new Map<string, CreatorRow>();

  // 1) is_curated = true
  for (let page = 0; ; page += 1) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, display_name, bio, primary_niche, language, niches, is_curated")
      .eq("is_curated", true)
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

    if (error) {
      // Column may not exist on older DBs — fall back to niches tag only.
      if (error.message.includes("is_curated")) {
        console.warn("is_curated column missing — using niches.cs.{curated} only for curated set");
        break;
      }
      console.error("Query is_curated failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;
    for (const row of rows) byUsername.set(normalizeHandle(row.username), row);
    console.log(`Fetched curated page ${page + 1}: ${rows.length} (total unique ${byUsername.size})`);
    if (rows.length < BATCH_SIZE) break;
  }

  // 1b) niches contains "curated" (legacy signature)
  for (let page = 0; ; page += 1) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, display_name, bio, primary_niche, language, niches, is_curated")
      .contains("niches", ["curated"])
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

    if (error) {
      console.error("Query niches curated failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;
    for (const row of rows) byUsername.set(normalizeHandle(row.username), row);
    console.log(`Fetched niches-curated page ${page + 1}: ${rows.length} (total unique ${byUsername.size})`);
    if (rows.length < BATCH_SIZE) break;
  }

  // 2) niches contains ecommerce/saas tags
  for (const tag of NICHE_TAGS) {
    for (let page = 0; ; page += 1) {
      const { data, error } = await supa
        .from("creators_index")
        .select("username, display_name, bio, primary_niche, language, niches, is_curated")
        .contains("niches", [tag])
        .order("username", { ascending: true })
        .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

      if (error) {
        console.error(`Query niches ${tag} failed:`, error.message);
        process.exit(1);
      }

      const rows = (data ?? []) as CreatorRow[];
      if (rows.length === 0) break;
      for (const row of rows) byUsername.set(normalizeHandle(row.username), row);
      if (rows.length < BATCH_SIZE) break;
    }
    console.log(`After tag "${tag}": ${byUsername.size} unique candidates`);
  }

  return [...byUsername.values()].sort((a, b) => a.username.localeCompare(b.username));
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
  const supa = getSupabase();
  const anthropic = getAnthropic();

  console.log("=== AUDIT V2 (ecommerce/saas tags + curated false positives) ===");
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`Protected: ${[...PROTECTED].join(", ")}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("");

  const candidates = await fetchCandidates(supa);
  const total = candidates.length;

  if (total === 0) {
    console.log("Nothing to audit.");
    process.exit(0);
  }

  console.log(`\nAuditing ${total} creators…\n`);

  let processed = 0;
  let kept = 0;
  let deleted = 0;
  let decurated = 0;
  let languageFixed = 0;
  let skippedProtected = 0;
  let errors = 0;

  const deletedUsernames: string[] = [];
  const decuratedUsernames: string[] = [];
  const languageFixes: Array<{ username: string; from: string | null; to: string }> = [];

  await runWithConcurrency(candidates, CONCURRENCY, async (row) => {
    const handle = normalizeHandle(row.username);

    if (PROTECTED.has(handle)) {
      skippedProtected += 1;
      kept += 1;
      processed += 1;
      if (processed % PROGRESS_EVERY === 0 || processed === total) {
        console.log(
          `Progress: ${processed}/${total} (kept ${kept}, del ${deleted}, de-cur ${decurated}, lang ${languageFixed}, prot ${skippedProtected}, err ${errors})`
        );
      }
      return;
    }

    const curated = isCuratedRow(row);

    try {
      const result = await auditCreator(anthropic, row);

      if (!result.is_content_creator && !curated) {
        deleted += 1;
        deletedUsernames.push(handle);
        if (APPLY) {
          const { error } = await supa.from("creators_index").delete().eq("username", row.username);
          if (error) throw new Error(`delete: ${error.message}`);
        }
      } else if (!result.is_content_creator && curated) {
        decurated += 1;
        decuratedUsernames.push(handle);
        if (APPLY) {
          const niches = Array.isArray(row.niches)
            ? row.niches.map((n) => String(n)).filter((n) => n.toLowerCase() !== "curated")
            : [];
          const { error } = await supa
            .from("creators_index")
            .update({ is_curated: false, niches })
            .eq("username", row.username);
          if (error) throw new Error(`de-curate: ${error.message}`);
        }
      } else {
        kept += 1;
        const detected = result.language?.toLowerCase().trim() || null;
        const current = row.language?.toLowerCase().trim() || null;
        if (detected && detected !== "unknown" && detected !== current) {
          languageFixed += 1;
          languageFixes.push({ username: handle, from: current, to: detected });
          if (APPLY) {
            const { error } = await supa
              .from("creators_index")
              .update({ language: detected })
              .eq("username", row.username);
            if (error) throw new Error(`update language: ${error.message}`);
          }
        }
      }
    } catch (err) {
      errors += 1;
      console.warn(`  error @${handle}: ${err instanceof Error ? err.message : String(err)}`);
    }

    processed += 1;
    if (processed % PROGRESS_EVERY === 0 || processed === total) {
      console.log(
        `Progress: ${processed}/${total} (kept ${kept}, del ${deleted}, de-cur ${decurated}, lang ${languageFixed}, prot ${skippedProtected}, err ${errors})`
      );
    }
  });

  console.log("\n========== AUDIT V2 REPORT ==========");
  console.log(`Mode              : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Total audited     : ${processed}`);
  console.log(`Kept              : ${kept}`);
  console.log(`Deleted           : ${deleted}`);
  console.log(`De-curated        : ${decurated}`);
  console.log(`Languages fixed   : ${languageFixed}`);
  console.log(`Protected skipped : ${skippedProtected}`);
  console.log(`Errors            : ${errors}`);

  if (deletedUsernames.length > 0) {
    console.log("\nWould delete / deleted (first 50):");
    for (const u of deletedUsernames.slice(0, 50)) console.log(`  @${u}`);
    if (deletedUsernames.length > 50) console.log(`  … and ${deletedUsernames.length - 50} more`);
  }

  if (decuratedUsernames.length > 0) {
    console.log("\nWould de-curate / de-curated (first 50):");
    for (const u of decuratedUsernames.slice(0, 50)) console.log(`  @${u}`);
    if (decuratedUsernames.length > 50) console.log(`  … and ${decuratedUsernames.length - 50} more`);
  }

  if (languageFixes.length > 0) {
    console.log("\nLanguage fixes (first 20):");
    for (const f of languageFixes.slice(0, 20)) {
      console.log(`  @${f.username}: ${f.from ?? "null"} → ${f.to}`);
    }
    if (languageFixes.length > 20) console.log(`  … and ${languageFixes.length - 20} more`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with AUDIT_APPLY=1 to apply changes.");
  }
  console.log("====================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
