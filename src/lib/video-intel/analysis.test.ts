import { describe, expect, it } from "vitest";
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, analysisRequest, analysisUserText, extractJson, insightColumns, validateAnalysis } from "./analysis";
import { BAND_EDGES, isViral, performanceBand, performanceRatio } from "./performance";
import { allowedNumbers, computeCreatorStats, keepCitedNumbers, synthesisDue, synthesisRequest, validateSynthesis, type InsightRow } from "./synthesis";
import { classifyLlmError, modelPrice, usageCost } from "./budget";
import { LlmError, anthropicModelId, batchModel, parseBatchItem, parseBatchResultsBody, toBatchPrompt, toOpenAiMessages } from "@/lib/llm";
import type { IntelVideo, Transcript } from "./types";

const video: IntelVideo = {
  platform: "tiktok",
  video_id: "111",
  username: "luna.beauty",
  caption: "Morning routine #skincare",
  hashtags: ["skincare", "grwm"],
  duration_seconds: 34,
  media_type: "video",
  share_url: "https://www.tiktok.com/@luna.beauty/video/111",
  music_title: "original sound",
  is_ad: false,
  has_product_link: true,
  views: 90_000,
  likes: 9000,
  comments: 120,
  shares: 80,
  posted_at: "2026-10-01T00:00:00Z",
  median_views: 30_000,
};
const transcript: Transcript = {
  status: "ok",
  source: "embedded-vtt",
  language: "en",
  text: "Do you also wake up with puffy eyes? Here is my five minute fix.",
  segments: [
    { start: 0.2, end: 2.5, text: "Do you also wake up with puffy eyes?" },
    { start: 2.6, end: 5.2, text: "Here is my five minute fix." },
  ],
  wordCount: 14,
  credits: 0,
};

describe("analysis request", () => {
  it("builds one provider-neutral request per video, same system text for all", () => {
    const r = analysisRequest(42, video, transcript, "claude-haiku-5.5");
    expect(r.id).toBe("j42");
    expect(r.model).toBe("claude-haiku-5.5");
    expect(r.system).toBe(ANALYSIS_SYSTEM);
    expect(r.system).toMatch(/JSON object only/);
    expect(r.user).toBe(analysisUserText(video, transcript));
    expect(r.schema).toBe(ANALYSIS_SCHEMA);
  });

  it("sends facts and the timed transcript, never view counts", () => {
    const text = analysisUserText(video, transcript);
    expect(text).toContain("[0.2] Do you also wake up with puffy eyes?");
    expect(text).toContain("#skincare");
    expect(text).not.toContain("90000");
    expect(text).not.toMatch(/views/i);
    expect(analysisUserText(video, { ...transcript, status: "no_speech", text: "", segments: [] })).toContain("(no speech in this video)");
  });

  it("schema enums match the clamped vocabularies", () => {
    expect(ANALYSIS_SCHEMA.properties.hook_type.enum).toContain("question");
    expect(ANALYSIS_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("analysis validation", () => {
  it("clamps unknown enums, caps lengths and keeps CTA / product consistent", () => {
    const a = validateAnalysis({
      hook: "x".repeat(400),
      hook_type: "Question",
      format: "dance-challenge",
      topic: "Skincare For Puffy Eyes",
      key_message: "Cold spoons fix puffy eyes.",
      beats: ["hook", "demo", "result", "cta", "a", "b", "c", "d"],
      cta: { present: true, type: "nonsense", text: "follow me" },
      product: { mentioned: false, brand: "Acme", promotion: "affiliate" },
      tone: "chill",
      language: "eng-US",
      signals: { positive: ["question hook in first second", "got 2 million views"], negative: [] },
    })!;
    expect(a.hook).toHaveLength(160);
    expect(a.hook_type).toBe("question");
    expect(a.format).toBe("other");
    expect(a.topic).toBe("skincare for puffy eyes");
    expect(a.beats).toHaveLength(6);
    expect(a.cta).toEqual({ present: false, type: "none", text: "" });
    expect(a.product).toEqual({ mentioned: true, brand: "Acme", promotion: "affiliate" });
    expect(a.tone).toBe("neutral");
    expect(a.language).toBe("en");
    // A number about views is the model inventing performance: dropped.
    expect(a.signals.positive).toEqual(["question hook in first second"]);
  });

  it("falls back to the spoken opening when the hook is empty, rejects non-objects", () => {
    const a = validateAnalysis({ hook: "" }, { transcript })!;
    // Both cues start in the first 3 seconds: the spoken hook is the two of them.
    expect(a.hook).toBe("Do you also wake up with puffy eyes? Here is my five minute fix.");
    expect(validateAnalysis(null)).toBeNull();
    expect(validateAnalysis([1, 2])).toBeNull();
    expect(validateAnalysis("text")).toBeNull();
  });

  it("tolerates code fences and prose around the JSON", () => {
    expect(extractJson("```json {\"hook\":\"hi\"} ```")).toEqual({ hook: "hi" });
    expect(extractJson("Sure! {\"hook\":\"hi\"} done")).toEqual({ hook: "hi" });
    expect(extractJson("not json")).toBeNull();
  });

  it("extracts filter columns, with pace from the transcript timing (not the model)", () => {
    const a = validateAnalysis({ hook: "Do you?", hook_type: "question", format: "talking_head", cta: { present: true, type: "follow", text: "follow" }, product: { mentioned: true, promotion: "affiliate" } })!;
    const cols = insightColumns(a, transcript);
    expect(cols).toMatchObject({ hook_type: "question", content_format: "talking_head", cta_type: "follow", has_cta: true, has_product: true });
    expect(cols.pace_wps).toBeCloseTo(14 / 5, 1);
    expect(insightColumns(a, null).pace_wps).toBeNull();
  });
});

describe("performance bands", () => {
  it("computes ratio and bands from the creator median", () => {
    expect(performanceRatio(90_000, 30_000)).toBe(3);
    expect(performanceRatio(10, null)).toBeNull();
    expect(performanceBand(600_000, 100_000)).toBe("viral");
    expect(performanceBand(400_000, 100_000)).toBe("over");
    expect(performanceBand(60_000, 10_000)).toBe("over"); // 6x but under the 100K floor
    expect(performanceBand(120_000, 20_000)).toBe("viral");
    expect(performanceBand(40_000, 10_000)).toBe("over"); // 4x but under 5x
    expect(performanceBand(15_000, 10_000)).toBe("over");
    expect(performanceBand(10_000, 10_000)).toBe("normal");
    expect(performanceBand(5_000, 10_000)).toBe("under");
    expect(performanceBand(1_000, 10_000)).toBe("flop");
    expect(performanceBand(1_000, 0)).toBeNull();
    expect(isViral(99_999, 10_000)).toBe(false);
    expect(BAND_EDGES.over).toBe(1.5);
  });
});

function row(i: number, ratio: number, patch: Partial<InsightRow> = {}): InsightRow {
  const band = performanceBand(ratio * 10_000, 10_000);
  return { video_id: String(i), views: ratio * 10_000, performance_ratio: ratio, band, hook: `hook ${i}`, hook_type: "story", content_format: "vlog", cta_type: "none", has_cta: false, has_product: false, tone: "calm", topic: "daily life", pace_wps: 2.5, duration_seconds: 40, ...patch };
}

describe("creator synthesis stats", () => {
  const rows = [
    row(1, 3, { hook_type: "question" }),
    row(2, 2.5, { hook_type: "question" }),
    row(3, 2, { hook_type: "question" }),
    row(4, 1),
    row(5, 0.9),
    row(6, 0.4, { has_product: true }),
    row(7, 0.3, { has_product: true }),
    row(8, 1.1),
  ];

  it("computes lifts against the creator median and win / lose shares", () => {
    const s = computeCreatorStats(rows);
    expect(s.videos).toBe(8);
    expect(s.overallMedianRatio).toBe(1.05);
    const q = s.features.find((f) => f.id === "hook_type:question")!;
    expect(q.videos).toBe(3);
    expect(q.medianRatio).toBe(2.5);
    expect(q.lift).toBeCloseTo(2.5 / 1.05, 2);
    expect(q.winShare).toBe(1);
    const p = s.features.find((f) => f.id === "product:with_product")!;
    expect(p.lift).toBeLessThan(0.5);
    expect(p.loseShare).toBe(1);
    // Strongest patterns first; tone is the same everywhere, so it is not a feature.
    expect(s.top.slice(0, 2).map((f) => f.id).sort()).toEqual(["hook_type:question", "product:with_product"]);
    expect(s.features.some((f) => f.dimension === "tone")).toBe(false);
    expect(s.best.map((v) => v.videoId)).toEqual(["1", "2", "3"]);
    expect(s.worst.map((v) => v.videoId)).toEqual(["7", "6", "5"]);
  });

  it("keeps only patterns citing a known stat and sentences quoting known numbers", () => {
    const s = computeCreatorStats(rows);
    const allowed = allowedNumbers(s);
    expect(keepCitedNumbers("Questions do 2.38x better. They reach 9 million people.", allowed)).toBe("Questions do 2.38x better.");
    const out = validateSynthesis(
      {
        summary_en: "Question hooks win: 3 videos, lift 2.38x. Their audience is 80% women.",
        summary_fr: "Les accroches en question gagnent.",
        patterns: [
          { stat_id: "hook_type:question", title_en: "Open with a question", title_fr: "Ouvrir par une question", recommendation_en: "Ask for a question hook.", recommendation_fr: "Demandez une accroche en question." },
          { stat_id: "made:up", title_en: "x", title_fr: "x", recommendation_en: "", recommendation_fr: "" },
          { stat_id: "hook_type:question", title_en: "dup", title_fr: "dup", recommendation_en: "", recommendation_fr: "" },
        ],
      },
      s,
    )!;
    expect(out.summary_en).toBe("Question hooks win: 3 videos, lift 2.38x.");
    expect(out.patterns).toHaveLength(1);
    expect(out.patterns[0]).toMatchObject({ id: "hook_type:question", videos: 3, medianRatio: 2.5 });
    expect(validateSynthesis("garbage", s)).toBeNull();
  });

  it("builds a synthesis request and decides when a refresh is due", () => {
    const s = computeCreatorStats(rows);
    const r = synthesisRequest(7, { username: "ig_mia", platform: "instagram" }, s, "claude-sonnet-5.5");
    expect(r.id).toBe("j7");
    expect(r.user).toContain("@mia on instagram");
    expect(synthesisDue(null, 5)).toBe(false);
    expect(synthesisDue(null, 6)).toBe(true);
    expect(synthesisDue({ videos_analysed: 10, prompt_version: 1, updated_at: new Date().toISOString() }, 12)).toBe(false);
    expect(synthesisDue({ videos_analysed: 10, prompt_version: 1, updated_at: new Date().toISOString() }, 13)).toBe(true);
    expect(synthesisDue({ videos_analysed: 10, prompt_version: 0, updated_at: new Date().toISOString() }, 10)).toBe(true);
  });
});

describe("cost and errors", () => {
  it("uses the gateway's real cost when given, else the price list (batch models at half)", () => {
    expect(usageCost("claude-haiku-5.5", { inputTokens: 1472, outputTokens: 256, costUsd: 0.00023 })).toBe(0.00023);
    expect(usageCost("claude-haiku-5.5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6, 5);
    expect(modelPrice("claude-haiku-5.5-batch")).toMatchObject({ input: 0.05, output: 0.25 });
  });

  it("recognises a provider out of credit (gateway LlmError or Anthropic text)", () => {
    expect(classifyLlmError(new LlmError("credit", "cheaperinference: HTTP 402 insufficient balance", 402))).toBe("credit");
    expect(classifyLlmError(new LlmError("network", "fetch failed"))).toBe("server");
    const e = Object.assign(new Error("Your credit balance is too low to access the Anthropic API."), { status: 400 });
    expect(classifyLlmError(e)).toBe("credit");
    expect(classifyLlmError(Object.assign(new Error("x"), { status: 401 }))).toBe("auth");
    expect(classifyLlmError(Object.assign(new Error("x"), { status: 529 }))).toBe("server");
    expect(classifyLlmError(Object.assign(new Error("bad"), { status: 400 }))).toBe("invalid");
  });
});

describe("lib/llm shapes", () => {
  it("maps models and messages for the gateway, its batch API and the Anthropic fallback", () => {
    expect(batchModel("claude-haiku-5.5")).toBe("claude-haiku-5.5-batch");
    expect(batchModel("claude-haiku-5.5-batch")).toBe("claude-haiku-5.5-batch");
    expect(anthropicModelId("claude-haiku-5.5-batch")).toBe("claude-haiku-5-5");
    expect(anthropicModelId("claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
    const msgs = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: [{ type: "text" as const, text: "hi" }, { type: "image" as const, mediaType: "image/png", data: "AAAA" }] }];
    expect(toOpenAiMessages(msgs)[1]).toEqual({ role: "user", content: [{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] });
    expect(toBatchPrompt(msgs)[0]).toEqual({ role: "system", content: "sys" });
    expect((toBatchPrompt(msgs)[1] as any).content[0]).toEqual({ type: "text", text: "hi" });
  });

  it("reads batch results tolerantly", () => {
    expect(parseBatchItem({ id: "j1", status: "completed", result: { text: '{"a":1}', usage: { inputTokens: 10, outputTokens: 5 }, finishReason: "stop" } })).toMatchObject({ id: "j1", ok: true, text: '{"a":1}', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(parseBatchItem({ id: "j2", status: "failed", error: { type: "invalid_request_error", message: "bad" } })).toMatchObject({ id: "j2", ok: false, error: { type: "invalid_request_error" } });
    expect(parseBatchItem({ id: "j3", response: { choices: [{ message: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0.0001 } } })).toMatchObject({ ok: true, text: "x", usage: { costUsd: 0.0001 } });
  });
  it("reads the gateway's JSON-lines batch results (real shape, 2026-10-29)", () => {
    const line = JSON.stringify({ type: "text", id: "j7", status: "succeeded", result: { content: [{ type: "text", text: '{"ok":true}' }], finishReason: { unified: "stop", raw: "end_turn" }, usage: { inputTokens: { total: 29, noCache: 29, cacheRead: 0 }, outputTokens: { total: 9, text: 9 } }, response: { modelId: "claude-haiku-5.5-batch" } } });
    const failed = JSON.stringify({ type: "text", id: "j8", status: "failed", error: { type: "overloaded", message: "busy" } });
    const items = parseBatchResultsBody(line + "\n" + failed + "\nnot json\n");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: "j7", ok: true, text: '{"ok":true}', usage: { inputTokens: 29, outputTokens: 9, costUsd: null }, finishReason: "stop", error: null });
    expect(items[1]).toMatchObject({ id: "j8", ok: false, error: { type: "overloaded" } });
  });
});
