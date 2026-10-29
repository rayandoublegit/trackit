import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/scraper/http";
import { CallMeter } from "@/lib/scraper/types";
import { MemoryStore } from "./testing/memory-store";
import { runBatchCollector, runBatchSubmitter, runTranscriptWorker, syncLlmClient, type BatchClient } from "./pipeline";
import { LlmError } from "@/lib/llm";
import {
  embeddedVttSource,
  fetchTranscript,
  metadataSource,
  parseScInstagramTranscript,
  parseScTikTokTranscript,
  parseScYouTubeTranscript,
  scrapeCreatorsTranscriptSource,
  gatewaySpeechToText,
  sttSource,
  TranscriptDeferred,
  type TranscriptSource,
} from "./transcripts";
import type { IntelLlmRequest, IntelLlmResult, IntelVideo } from "./types";

const VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nWait for the end\n\n00:00:02.000 --> 00:00:05.000\nthis cream changed my skin\n";

function vid(id: string, patch: Partial<IntelVideo> = {}): IntelVideo {
  return {
    platform: "tiktok",
    video_id: id,
    username: "luna",
    caption: "caption " + id,
    hashtags: [],
    duration_seconds: 30,
    media_type: "video",
    share_url: `https://www.tiktok.com/@luna/video/${id}`,
    music_title: null,
    is_ad: false,
    has_product_link: false,
    views: 1000,
    likes: 0,
    comments: 0,
    shares: 0,
    posted_at: null,
    median_views: 1000,
    ...patch,
  };
}

beforeEach(() => {
  process.env.SCRAPECREATORS_API_KEY = "test";
});
afterEach(() => {
  delete process.env.SCRAPECREATORS_API_KEY;
  delete process.env.VIDEO_INTEL_DAILY_MAX_TRANSCRIPT_CREDITS;
  delete process.env.VIDEO_INTEL_DAILY_MAX_USD;
  delete process.env.VIDEO_INTEL_BATCH_SIZE;
  delete process.env.VIDEO_INTEL_MAX_OPEN_BATCHES;
});

describe("transcript sources", () => {
  it("free first: embedded VTT wins and no paid call is made", async () => {
    const scGet = vi.fn();
    const sources = [metadataSource, embeddedVttSource(async () => ({ status: 200, text: VTT })), scrapeCreatorsTranscriptSource(scGet)];
    const t = await fetchTranscript(vid("1", { subtitle_url: "https://v16.tiktokcdn.com/a.vtt", subtitle_lang: "en" }), sources, { meter: new CallMeter() });
    expect(t).toMatchObject({ status: "ok", source: "embedded-vtt", language: "en", credits: 0 });
    expect(t.text).toBe("Wait for the end this cream changed my skin");
    expect(scGet).not.toHaveBeenCalled();
  });

  it("an expired caption URL falls through to the paid endpoint, credits counted", async () => {
    const scGet = vi.fn(async (_path: string, _p: Record<string, string>, meter: CallMeter) => {
      meter.record("scrapecreators-transcript", 1);
      return { success: true, transcript: VTT, transcript_with_timestamp: null };
    });
    const sources = [metadataSource, embeddedVttSource(async () => ({ status: 403, text: "" })), scrapeCreatorsTranscriptSource(scGet)];
    const meter = new CallMeter();
    const t = await fetchTranscript(vid("1", { subtitle_url: "https://v16.tiktokcdn.com/expired.vtt" }), sources, { meter });
    expect(t).toMatchObject({ status: "ok", source: "scrapecreators", credits: 1 });
    expect(scGet.mock.calls[0][0]).toBe("/v1/tiktok/video/transcript");
    expect(scGet.mock.calls[0][1]).toMatchObject({ url: "https://www.tiktok.com/@luna/video/1", use_ai_as_fallback: "true" });
  });

  it("no audio track = no speech, decided without any call", async () => {
    const scGet = vi.fn();
    const t = await fetchTranscript(vid("1", { platform: "instagram", audio_kind: "none" }), [metadataSource, scrapeCreatorsTranscriptSource(scGet)], { meter: new CallMeter() });
    expect(t.status).toBe("no_speech");
    expect(scGet).not.toHaveBeenCalled();
  });

  it("a provider out of credits is paused and the job is deferred (no retry storm)", async () => {
    const down = vi.fn();
    const paused = new Set<string>();
    const scGet = vi.fn(async () => {
      throw new ProviderError("scrapecreators-transcript", "no_credits", "HTTP 402", 402);
    });
    await expect(fetchTranscript(vid("1"), [metadataSource, scrapeCreatorsTranscriptSource(scGet)], { meter: new CallMeter(), paused, onProviderDown: down })).rejects.toBeInstanceOf(TranscriptDeferred);
    expect(down).toHaveBeenCalledOnce();
    expect(paused.has("scrapecreators")).toBe(true);
    // Next video in the same pass: skipped at once.
    await expect(fetchTranscript(vid("2"), [metadataSource, scrapeCreatorsTranscriptSource(scGet)], { meter: new CallMeter(), paused })).rejects.toBeInstanceOf(TranscriptDeferred);
    expect(scGet).toHaveBeenCalledOnce();
  });

  it("Instagram videos over 120 s are not sent to paid AI transcription", async () => {
    const scGet = vi.fn();
    const t = await fetchTranscript(vid("1", { platform: "instagram", duration_seconds: 300 }), [metadataSource, scrapeCreatorsTranscriptSource(scGet)], { meter: new CallMeter() });
    expect(t.status).toBe("unavailable");
    expect(scGet).not.toHaveBeenCalled();
  });

  it("parses the three ScrapeCreators transcript shapes", () => {
    expect(parseScTikTokTranscript({ transcript_with_timestamp: [{ start: 0.1, end: 1.5, text: "hey" }, { start: 1.5, end: 3, text: "you" }] }, 1, "en", true)).toMatchObject({ status: "ok", text: "hey you", credits: 1 });
    expect(parseScTikTokTranscript({ transcript: null, transcript_with_timestamp: null }, 0, null, true).status).toBe("no_speech");
    expect(parseScTikTokTranscript({ transcript: null }, 0, null, false).status).toBe("unavailable");
    const yt = parseScYouTubeTranscript({ transcript: [{ text: "welcome back", startMs: "160", startTimeText: "0:00" }, { text: "to the farm", startMs: "1920" }], transcript_only_text: "welcome back to the farm", language: "English" }, 1);
    expect(yt).toMatchObject({ status: "ok", language: "en", text: "welcome back to the farm" });
    expect(yt.segments[0]).toEqual({ text: "welcome back", start: 0.16, end: 1.92 });
    expect(parseScYouTubeTranscript({ transcript: null }, 0).status).toBe("unavailable");
    expect(parseScInstagramTranscript({ transcripts: [{ id: "1", shortcode: "C1", text: "Let's fry it up", transcript_with_timestamp: null }] }, 1)).toMatchObject({ status: "ok", text: "Let's fry it up" });
    expect(parseScInstagramTranscript({ transcripts: [] }, 0).status).toBe("no_speech");
  });
});

describe("transcript worker", () => {
  it("claims by priority, stores transcripts, queues analyses and respects the credit cap", async () => {
    process.env.VIDEO_INTEL_DAILY_MAX_TRANSCRIPT_CREDITS = "1";
    const store = new MemoryStore();
    store.addVideo({ ...vid("low"), subtitle_url: undefined });
    store.addVideo({ ...vid("high") });
    store.addVideo({ ...vid("free"), subtitle_url: "https://v16.tiktokcdn.com/free.vtt" });
    store.addJob("transcript", "tiktok", "low", 5);
    store.addJob("transcript", "tiktok", "high", 1);
    store.addJob("transcript", "tiktok", "free", 3);
    const paid: TranscriptSource = {
      name: "scrapecreators",
      paid: true,
      maxCredits: () => 1,
      applies: () => true,
      fetch: async (_v, { meter }) => {
        meter.record("scrapecreators-transcript", 1);
        return { status: "ok", source: "scrapecreators", language: "en", text: "paid words here", segments: [], wordCount: 3, credits: 1 };
      },
    };
    const sources = [metadataSource, embeddedVttSource(async () => ({ status: 200, text: VTT })), paid];
    const s = await runTranscriptWorker(store, { sources, concurrency: 1 });
    expect(s.claimed).toBe(3);
    expect(s.credits).toBe(1);
    // high (priority 1) took the only paid credit; free used the caption track; low waits for tomorrow.
    expect(store.transcriptRows.get("tiktok:high")?.source).toBe("scrapecreators");
    expect(store.transcriptRows.get("tiktok:free")?.source).toBe("embedded-vtt");
    expect(store.transcriptRows.has("tiktok:low")).toBe(false);
    expect(store.job("transcript", "low")).toMatchObject({ status: "queued", attempts: 0 });
    expect(store.job("analyze", "high")).toMatchObject({ status: "queued", priority: 1 });
    expect(store.job("analyze", "free")).toBeTruthy();
    expect(store.runs[0]).toMatchObject({ stage: "transcripts", credits: 1 });
  });

  it("a transient error retries with backoff; after the last attempt the video is analysed from its caption", async () => {
    const store = new MemoryStore();
    store.addVideo(vid("a"));
    store.addJob("transcript", "tiktok", "a", 5);
    const flaky: TranscriptSource = { name: "scrapecreators", paid: false, maxCredits: () => 0, applies: () => true, fetch: async () => { throw new ProviderError("sc", "server", "HTTP 500", 500); } };
    await runTranscriptWorker(store, { sources: [flaky] });
    const j = store.job("transcript", "a")!;
    expect(j.status).toBe("queued");
    expect(Date.parse(j.run_after)).toBeGreaterThan(Date.now());
    j.run_after = new Date(0).toISOString();
    j.attempts = 3;
    await runTranscriptWorker(store, { sources: [flaky] });
    expect(store.transcriptRows.get("tiktok:a")?.status).toBe("unavailable");
    expect(store.job("analyze", "a")).toBeTruthy();
  });
});

// ── Fake LLM transports ──────────────────────────────────────────────────────
type Answer = Omit<IntelLlmResult, "id">;
function fakeClient(answer: (id: string, req: IntelLlmRequest) => Answer) {
  const created: { id: string; requests: IntelLlmRequest[] }[] = [];
  let ended = false;
  const client: BatchClient & { created: typeof created; end: () => void; failWith?: unknown } = {
    mode: "batch",
    created,
    modelFor: (m) => `${m}-batch`,
    end: () => {
      ended = true;
    },
    async create(requests) {
      if (client.failWith) throw client.failWith;
      const id = `batch_${created.length + 1}`;
      created.push({ id, requests });
      return { id, status: "pending", terminal: false, counts: { total: requests.length, pending: requests.length, completed: 0, failed: 0 } };
    },
    async retrieve(id) {
      const b = created.find((c) => c.id === id)!;
      return { id, status: ended ? "completed" : "pending", terminal: ended, counts: { total: b.requests.length, pending: ended ? 0 : b.requests.length, completed: ended ? b.requests.length : 0, failed: 0 } };
    },
    async results(id) {
      const b = created.find((c) => c.id === id)!;
      return (async function* () {
        for (const r of b.requests) yield { id: r.id, ...answer(r.id, r) };
      })();
    },
  };
  return client;
}

const ok = (json: unknown): Answer => ({ ok: true, text: JSON.stringify(json), usage: { inputTokens: 400, outputTokens: 300, costUsd: 0.0002 }, finishReason: "stop", error: null });
const analysisJson = (hookType: string) => ({ hook: "Wait for the end", hook_type: hookType, format: "talking_head", topic: "skincare", key_message: "x", beats: ["hook"], cta: { present: false, type: "none", text: "" }, product: { mentioned: false, brand: "", promotion: "none" }, tone: "calm", language: "en", signals: { positive: ["early payoff"], negative: [] } });

describe("batch submitter and collector", () => {
  function storeWithAnalyses(n: number) {
    const store = new MemoryStore();
    for (let i = 1; i <= n; i++) {
      store.addVideo(vid(String(i), { views: i * 1000, median_views: 3000 }));
      store.addJob("analyze", "tiktok", String(i), i === n ? 1 : 5);
      store.transcriptRows.set(`tiktok:${i}`, { status: "ok", source: "embedded-vtt", language: "en", text: "Wait for the end", segments: [{ start: 0, end: 2, text: "Wait for the end" }], wordCount: 4, credits: 0 });
    }
    return store;
  }

  it("submits one batch of pending analyses (priority first), records it and marks jobs submitted", async () => {
    process.env.VIDEO_INTEL_BATCH_SIZE = "3";
    const store = storeWithAnalyses(4);
    const client = fakeClient(() => ok(analysisJson("question")));
    const s = await runBatchSubmitter(store, client, { kind: "analyze" });
    expect(s.done).toBe(3);
    expect(client.created).toHaveLength(1);
    const reqs = client.created[0].requests;
    expect(reqs[0].id).toBe(`j${store.job("analyze", "4")!.id}`); // priority 1 first
    expect(reqs[0].model).toBe("claude-haiku-5.5-batch");
    const b = store.batches.get("batch_1")!;
    expect(b).toMatchObject({ kind: "analyze", model: "claude-haiku-5.5-batch", request_count: 3, status: "in_progress" });
    expect(b.est_cost_usd).toBeGreaterThan(0);
    expect(store.jobs.filter((j) => j.status === "submitted")).toHaveLength(3);
    // Max open batches reached → the next pass is idle.
    process.env.VIDEO_INTEL_MAX_OPEN_BATCHES = "1";
    expect((await runBatchSubmitter(store, client, { kind: "analyze" })).reason).toMatch(/still processing/);
  });

  it("provider out of credit: pauses, hands every job back untouched, resumes after the pause", async () => {
    const store = storeWithAnalyses(2);
    const client = fakeClient(() => ok(analysisJson("question")));
    client.failWith = new LlmError("credit", "cheaperinference: HTTP 402 insufficient balance", 402);
    const s = await runBatchSubmitter(store, client, { kind: "analyze" });
    expect(s.reason).toMatch(/out of credit/);
    expect(store.pauses.get("anthropic")?.until).toBeTruthy();
    expect(store.jobs.every((j) => j.status === "queued" && j.attempts === 0)).toBe(true);
    // While paused: no claim at all.
    expect((await runBatchSubmitter(store, client, { kind: "analyze" })).reason).toMatch(/paused until/);
    // Credit topped up and the pause expired: the batch goes through and the pause is cleared.
    client.failWith = undefined;
    store.pauses.set("anthropic", { until: new Date(Date.now() - 1000).toISOString(), reason: "credit" });
    for (const j of store.jobs) j.run_after = new Date(0).toISOString();
    const done = await runBatchSubmitter(store, client, { kind: "analyze" });
    expect(done.done).toBe(2);
    expect(store.pauses.get("anthropic")?.until).toBeNull();
  });

  it("caps the batch to the daily dollars left", async () => {
    process.env.VIDEO_INTEL_DAILY_MAX_USD = "0.0002";
    const store = storeWithAnalyses(5);
    const client = fakeClient(() => ok(analysisJson("question")));
    const s = await runBatchSubmitter(store, client, { kind: "analyze" });
    expect(s.done).toBeGreaterThan(0);
    expect(s.done).toBeLessThan(5);
    expect(s.deferred).toBe(5 - s.done);
  });

  it("collects results: valid answers stored with computed performance, bad ones retried, expired requeued, real cost recorded", async () => {
    const store = storeWithAnalyses(4);
    const client = fakeClient((id) => {
      const target = store.jobs.find((j) => j.id === Number(id.slice(1)))!.target;
      if (target === "2") return { ...ok({}), text: "sorry, no JSON" };
      if (target === "3") return { ok: false, text: "", usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, finishReason: null, error: { type: "expired", message: "expired" } };
      if (target === "4") return { ok: false, text: "", usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, finishReason: null, error: { type: "server", message: "busy" } };
      return ok(analysisJson("Question"));
    });
    await runBatchSubmitter(store, client, { kind: "analyze" });
    expect((await runBatchCollector(store, client)).batches).toEqual([]); // still processing
    client.end();
    const s = await runBatchCollector(store, client);
    expect(s.batches).toEqual(["batch_1"]);
    const ins = store.insights.get("tiktok:1")!;
    expect(ins).toMatchObject({ hook_type: "question", content_format: "talking_head", band: "under", performance_ratio: 0.333, model: "claude-haiku-5.5-batch", prompt_version: 1 });
    expect(store.job("analyze", "1")!.status).toBe("done");
    expect(store.job("analyze", "2")!.status).toBe("queued"); // invalid JSON → retry later
    expect(store.job("analyze", "3")).toMatchObject({ status: "queued", attempts: 0 }); // expired: refunded
    expect(store.job("analyze", "4")!.status).toBe("queued");
    const b = store.batches.get("batch_1")!;
    expect(b.status).toBe("processed");
    expect(b.results_processed).toBe(4);
    expect(b.input_tokens).toBe(800);
    expect(Number(b.actual_cost_usd)).toBeCloseTo(0.0004, 6);
  });

  it("resumes a half-processed batch without redoing the first results", async () => {
    const store = storeWithAnalyses(4);
    const client = fakeClient(() => ok(analysisJson("story")));
    await runBatchSubmitter(store, client, { kind: "analyze" });
    client.end();
    // The clock jumps past the time budget once the first chunk of 2 results is read.
    let now = 0;
    const results = client.results.bind(client);
    client.results = async (id: string) => {
      const it = (await results(id)) as AsyncIterable<IntelLlmResult>;
      return (async function* () {
        let n = 0;
        for await (const r of it) {
          if (++n === 2) now += 600_000;
          yield r;
        }
      })();
    };
    const first = await runBatchCollector(store, client, { chunk: 2, timeBudgetMs: 1000, nowMs: () => now });
    client.results = results;
    expect(first.done).toBe(2);
    expect(store.batches.get("batch_1")!).toMatchObject({ status: "ended", results_processed: 2 });
    const second = await runBatchCollector(store, client, { chunk: 2 });
    expect(second.done).toBe(2);
    expect(store.insights.size).toBe(4);
    expect(store.batches.get("batch_1")!.status).toBe("processed");
  });

  it("sync mode: concurrent calls through lib/llm, stored in the same pass", async () => {
    const store = storeWithAnalyses(3);
    const call = vi.fn(async (_m: unknown, o: any) => ({ text: JSON.stringify(analysisJson("list")), model: o.model, provider: "cheaperinference" as const, usage: { inputTokens: 1472, outputTokens: 256, costUsd: 0.00023 }, finishReason: "stop" }));
    const client = syncLlmClient({ call: call as any, concurrency: 2 });
    const s = await runBatchSubmitter(store, client, { kind: "analyze" });
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls[0][1]).toMatchObject({ model: "claude-haiku-5.5", json: true });
    expect(s.details?.stored).toBe(3);
    expect(store.insights.size).toBe(3);
    const b = [...store.batches.values()][0];
    expect(b.status).toBe("processed");
    expect(Number(b.actual_cost_usd)).toBeCloseTo(0.00069, 6);
    expect(s.usd).toBeCloseTo(0.00069, 6);
  });

  it("sync mode: out of credit on the first calls pauses and hands everything back", async () => {
    const store = storeWithAnalyses(2);
    const call = vi.fn(async () => {
      throw new LlmError("credit", "cheaperinference: HTTP 402 wallet empty", 402);
    });
    const s = await runBatchSubmitter(store, syncLlmClient({ call: call as any }), { kind: "analyze" });
    expect(s.reason).toMatch(/out of credit/);
    expect(store.pauses.get("anthropic")?.until).toBeTruthy();
    expect(store.jobs.every((j) => j.status === "queued" && j.attempts === 0)).toBe(true);
  });

  it("enough analysed videos queue a creator synthesis, which is written with computed stats", async () => {
    const store = new MemoryStore();
    const ratios = [3, 2.5, 2, 1, 0.9, 0.4, 0.3, 1.1];
    ratios.forEach((r, i) => {
      store.addVideo(vid(String(i + 1), { views: r * 10_000, median_views: 10_000 }));
      store.addJob("analyze", "tiktok", String(i + 1), 5);
    });
    const client = fakeClient((id, req) => {
      if (req.user.startsWith("creator:")) {
        return ok({ summary_en: "Question hooks win in 3 videos.", summary_fr: "Les questions gagnent.", patterns: [{ stat_id: "hook_type:question", title_en: "Open with a question", title_fr: "Ouvrir par une question", recommendation_en: "Ask for it.", recommendation_fr: "Demandez-le." }] });
      }
      const target = Number(store.jobs.find((j) => j.id === Number(id.slice(1)))!.target);
      return ok(analysisJson(target <= 3 ? "question" : "story"));
    });
    await runBatchSubmitter(store, client, { kind: "analyze" });
    client.end();
    const c = await runBatchCollector(store, client);
    expect(c.details?.synthesesQueued).toBe(1);
    expect(store.job("synthesize", "luna")).toBeTruthy();
    await runBatchSubmitter(store, client, { kind: "synthesize" });
    expect(client.created[1].requests[0].model).toBe("claude-sonnet-5.5-batch");
    await runBatchCollector(store, client);
    const ci = store.creatorInsights.get("tiktok:luna") as any;
    expect(ci.summary_en).toBe("Question hooks win in 3 videos.");
    expect(ci.patterns[0]).toMatchObject({ id: "hook_type:question", videos: 3, medianRatio: 2.5 });
    expect(ci.videos_analysed).toBe(8);
    expect(ci.stats.best[0].videoId).toBe("1");
  });
});

describe("speech to text fallback (gateway)", () => {
  it("transcribes from the captured media URL within its daily budget, then stops", async () => {
    const budget = { left: 1, calls: 0, usd: 0 };
    const transcribe = vi.fn(async () => ({ text: "hello there friends", segments: [{ start: 0, end: 2, text: "hello there friends" }], language: "en", costUsd: 0.003 }));
    const stt = sttSource(gatewaySpeechToText(budget, { download: async () => new Blob(["x"]), transcribe: transcribe as any }));
    const v = vid("1", { platform: "instagram", duration_seconds: 150, media_url: "https://scontent.cdninstagram.com/v.mp4" });
    const t = await fetchTranscript(v, [metadataSource, stt], { meter: new CallMeter() });
    expect(t).toMatchObject({ status: "ok", source: "stt", text: "hello there friends" });
    expect(budget).toMatchObject({ left: 0, calls: 1, usd: 0.003 });
    // Budget used: nothing more is sent.
    expect((await fetchTranscript(vid("2", { media_url: "https://x/v.mp4" }), [stt], { meter: new CallMeter() })).status).toBe("unavailable");
    expect(transcribe).toHaveBeenCalledOnce();
  });

  it("gateway out of credit pauses speech to text without holding the video back", async () => {
    const stt = sttSource(gatewaySpeechToText({ left: 5, calls: 0, usd: 0 }, { download: async () => new Blob(["x"]), transcribe: (async () => { throw new LlmError("credit", "HTTP 402", 402); }) as any }));
    const paused = new Set<string>();
    const t = await fetchTranscript(vid("1", { media_url: "https://x/v.mp4" }), [stt], { meter: new CallMeter(), paused });
    expect(t.status).toBe("unavailable");
    expect(paused.has("stt:gateway")).toBe(true);
  });
});
