/**
 * Audit & clean creators_index rows in niches "e-commerce" and "saas".
 * Keeps only content creators (tips/education), removes shops/brands/product accounts.
 * Never touches rows tagged "curated".
 *
 * Usage:
 *   npx tsx scripts/audit-niche-creators.ts              # dry-run (default)
 *   AUDIT_APPLY=1 npx tsx scripts/audit-niche-creators.ts  # apply deletes/updates
 */
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BATCH_SIZE = 1000;
const CONCURRENCY = 5;
const PROGRESS_EVERY = 25;
const APPLY = process.env.AUDIT_APPLY === "1";
const TARGET_NICHES = ["e-commerce", "saas"] as const;

type TargetNiche = (typeof TARGET_NICHES)[number];

type CreatorRow = {
  username: string;
  display_name: string | null;
  bio: string | null;
  primary_niche: string | null;
  language: string | null;
  niches: string[] | null;
};

type AuditResult = {
  relevant: boolean;
  language: string | null;
};

type Outcome = "kept" | "deleted" | "language_fixed" | "error";

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
  return {
    relevant: obj.relevant === true,
    language,
  };
}

function buildAuditPrompt(row: CreatorRow, niche: TargetNiche): string {
  const nicheHint =
    niche === "e-commerce"
      ? "ecommerce / e-commerce / dropshipping / Shopify / online selling education"
      : "SaaS / startups / build-in-public / indie hacking / software products education";

  return `You audit creators for a brand-partnership discovery database.

Niche being audited: "${niche}" (${nicheHint})

Username: @${row.username}
Display name: ${row.display_name || row.username}
Bio: ${row.bio || "(empty)"}

Decide if this account is a CONTENT creator who teaches, advises, documents, or educates about ${nicheHint}.

relevant = true ONLY for content creators (tips, tutorials, formations, documentation, build-in-public, reviews of tools/methods for that niche).
relevant = false for: online shops, product brands, storefronts, single-product accounts, pure sellers, company pages that only promote their own product without educational content.

Return ONLY a JSON object, no prose:
{
  "relevant": boolean,
  "language": string | null
}

language = ISO 639-1 code of the creator's content language (e.g. "fr", "en"), or null if unknown.`;
}

async function auditCreator(
  client: Anthropic,
  row: CreatorRow,
  niche: TargetNiche
): Promise<AuditResult> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages: [{ role: "user", content: buildAuditPrompt(row, niche) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseAuditResult(text);
}

async function fetchCandidates(supa: ReturnType<typeof getSupabase>): Promise<CreatorRow[]> {
  const all: CreatorRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supa
      .from("creators_index")
      .select("username, display_name, bio, primary_niche, language, niches")
      .in("primary_niche", [...TARGET_NICHES])
      .not("niches", "cs", "{curated}")
      .order("username", { ascending: true })
      .range(page * BATCH_SIZE, page * BATCH_SIZE + BATCH_SIZE - 1);

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as CreatorRow[];
    if (rows.length === 0) break;

    // Extra guard: never touch curated even if PostgREST filter is quirky with null niches.
    for (const row of rows) {
      const niches = Array.isArray(row.niches) ? row.niches.map((n) => String(n).toLowerCase()) : [];
      if (niches.includes("curated")) continue;
      all.push(row);
    }

    console.log(`Fetched page ${page + 1}: ${rows.length} rows (${all.length} candidates)`);
    if (rows.length < BATCH_SIZE) break;
  }

  return all;
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

  console.log("=== AUDIT NICHE CREATORS (e-commerce / saas) ===");
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
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
  let languageFixed = 0;
  let errors = 0;
  const deletedUsernames: string[] = [];
  const languageFixes: Array<{ username: string; from: string | null; to: string }> = [];

  await runWithConcurrency(candidates, CONCURRENCY, async (row) => {
    const niche = (row.primary_niche || "").toLowerCase() as TargetNiche;
    if (niche !== "e-commerce" && niche !== "saas") {
      processed += 1;
      kept += 1;
      return;
    }

    try {
      const result = await auditCreator(anthropic, row, niche);

      if (!result.relevant) {
        deleted += 1;
        deletedUsernames.push(row.username);
        if (APPLY) {
          const { error } = await supa.from("creators_index").delete().eq("username", row.username);
          if (error) throw new Error(`delete: ${error.message}`);
        }
      } else {
        kept += 1;
        const detected = result.language?.toLowerCase().trim() || null;
        const current = row.language?.toLowerCase().trim() || null;
        if (detected && detected !== "unknown" && detected !== current) {
          languageFixed += 1;
          languageFixes.push({ username: row.username, from: current, to: detected });
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
      console.warn(
        `  error @${row.username}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    processed += 1;
    if (processed % PROGRESS_EVERY === 0 || processed === total) {
      console.log(
        `Progress: ${processed}/${total} (kept ${kept}, delete ${deleted}, lang ${languageFixed}, err ${errors})`
      );
    }
  });

  console.log("\n========== AUDIT REPORT ==========");
  console.log(`Mode             : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Total audited    : ${processed}`);
  console.log(`Kept (relevant)  : ${kept}`);
  console.log(`Deleted          : ${deleted}`);
  console.log(`Languages fixed  : ${languageFixed}`);
  console.log(`Errors           : ${errors}`);

  if (deletedUsernames.length > 0) {
    console.log("\nWould delete / deleted (first 40):");
    for (const u of deletedUsernames.slice(0, 40)) console.log(`  @${u}`);
    if (deletedUsernames.length > 40) console.log(`  … and ${deletedUsernames.length - 40} more`);
  }

  if (languageFixes.length > 0) {
    console.log("\nLanguage fixes (first 20):");
    for (const f of languageFixes.slice(0, 20)) {
      console.log(`  @${f.username}: ${f.from ?? "null"} → ${f.to}`);
    }
    if (languageFixes.length > 20) console.log(`  … and ${languageFixes.length - 20} more`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with AUDIT_APPLY=1 to apply deletes/updates.");
  }
  console.log("==================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
