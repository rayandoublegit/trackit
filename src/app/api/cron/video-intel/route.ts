import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { supabaseIntelStore } from "@/lib/video-intel/store";
import { intelLlmClient, runBatchCollector, runBatchSubmitter, runEnqueue, runNicheRefresh, runTranscriptWorker } from "@/lib/video-intel/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/cron/video-intel?stage=… — the video intelligence pipeline
 * (docs/VIDEO_INTEL.md). `Authorization: Bearer $CRON_SECRET`.
 *
 *   stage=enqueue      new tracked videos → transcript jobs (database only)    ?limit=20000
 *   stage=transcripts  transcript jobs (free captions first, then paid)        ?budget=400 (max 1000)
 *   stage=submit       pending analyses, then creator syntheses → LLM via lib/llm.ts (Cheaper Inference):
 *                      concurrent calls stored in the same pass (default), or a gateway batch
 *                      (VIDEO_INTEL_LLM_MODE=batch, collected by stage=collect)
 *   stage=collect      ended batches → insights (resumable, chunked)
 *   stage=niche        niche-level pattern table (SQL)
 *
 * Every stage is idempotent and time-boxed (~240 s); an empty queue costs nothing.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (process.env.VIDEO_INTEL_ENABLED === "0") return NextResponse.json({ ok: true, idle: true, reason: "VIDEO_INTEL_ENABLED=0" });

  const params = new URL(request.url).searchParams;
  const stage = params.get("stage") || "";
  const store = supabaseIntelStore(admin);
  const num = (name: string, fallback: number, max: number) => Math.min(Math.max(Number(params.get(name) || fallback) || fallback, 1), max);
  try {
    switch (stage) {
      case "enqueue":
        return NextResponse.json(await runEnqueue(store, { limit: num("limit", 20_000, 100_000) }));
      case "transcripts": {
        const concurrency = Math.min(Math.max(Number(process.env.VIDEO_INTEL_TRANSCRIPT_CONCURRENCY ?? 8) || 8, 1), 16);
        return NextResponse.json(await runTranscriptWorker(store, { budget: num("budget", Number(process.env.VIDEO_INTEL_TRANSCRIPT_BATCH) || 400, 1000), concurrency }));
      }
      case "submit": {
        const client = intelLlmClient();
        // Sync mode makes the calls inside this pass: analyses get ~170 s, syntheses what is left.
        const analyze = await runBatchSubmitter(store, client, { kind: "analyze", timeBudgetMs: 170_000 });
        // Syntheses read a few rows per creator: smaller batches keep the pass short.
        const synthesize = await runBatchSubmitter(store, client, { kind: "synthesize", limit: client?.mode === "sync" ? 150 : 1_000, timeBudgetMs: 60_000 });
        return NextResponse.json({ ok: true, analyze, synthesize });
      }
      case "collect":
        return NextResponse.json(await runBatchCollector(store, intelLlmClient()));
      case "niche":
        return NextResponse.json(await runNicheRefresh(store));
      default:
        return NextResponse.json({ error: "stage must be enqueue, transcripts, submit, collect or niche" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
