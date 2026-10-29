import { llmModel } from "@/lib/llm";
import { normalizeLang } from "./captions";
import { openingText, speakingPace } from "./vtt";
import {
  CONTENT_FORMATS,
  CTA_TYPES,
  HOOK_TYPES,
  PROMOTION_TYPES,
  TONES,
  type IntelLlmRequest,
  type IntelVideo,
  type Transcript,
  type VideoAnalysis,
} from "./types";

// Per-video extraction with Claude Haiku through lib/llm.ts (Cheaper Inference
// gateway: batch API or concurrent calls). One request per video; the shared
// instructions are the system message (same bytes for every request), the
// video itself goes in the user turn. JSON mode is asked (plus the schema on
// the batch API), then the answer is validated and clamped here anyway:
// unknown enum values become "other" / "none", lengths are capped, and no
// number the model writes is ever stored (pace and performance are computed in code).

/** Bump when the prompt or schema changes: the enqueue re-analyses older rows, lowest priority first. */
export const ANALYSIS_PROMPT_VERSION = 1;

export function analysisModel(): string {
  return (process.env.VIDEO_INTEL_ANALYSIS_MODEL || llmModel("fast")).trim();
}

/** Max transcript characters sent per video (~1,500 tokens); long videos keep the start and the end. */
const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_CAPTION_CHARS = 1_200;

export const ANALYSIS_SYSTEM = `You analyse short-form social videos (TikTok, Instagram Reels, YouTube Shorts and videos) for a creator-marketing platform used by brands.
You receive one video: its platform, length, caption, hashtags, sound, sponsorship flags and, when available, its spoken transcript with timestamps in seconds.
Return one JSON object that matches the schema. Describe only what is in the material. Never invent facts, never estimate views, likes or any number, never guess the creator's audience.

Fields:
- hook: the opening line the viewer hears or reads in the first ~3 seconds, quoted or closely paraphrased from the transcript (else from the caption's first line). Max 160 characters, in the video's language.
- hook_type, one of:
  question (opens with a question to the viewer), bold_claim (strong statement or promise), story (starts a personal story), pov ("POV:" or role-play framing),
  tutorial (announces how to do something), list ("3 things…", ranked or numbered), reaction (reacts to something on screen or another video),
  trend_sound (rides a trending sound / meme format, little or no speech), product_reveal (shows or names a product at once), before_after (transformation),
  challenge (dare or challenge format), controversy (hot take, unpopular opinion), relatable (everyday situation the viewer recognises),
  statistic (opens with a fact or figure stated in the video), visual_only (no speech and no text hook in the material), other.
- format, one of:
  talking_head (creator speaks to camera), voiceover (narration over footage), skit (acted scene, characters), tutorial (step-by-step how-to),
  unboxing, grwm (get ready with me), vlog (day in the life, moments), review (opinion on a product or place), haul (several purchases shown),
  routine (morning / skincare / workout routine), interview (questions to someone, street interview), duet_stitch (built on another video),
  slideshow (photos or text slides), montage (edited clips with music, little speech), asmr, other.
- topic: 2 to 5 words, lowercase, in English (for example "skincare for acne", "budget travel europe").
- key_message: one sentence, in English, what the viewer is meant to take away.
- beats: 2 to 6 short English phrases, the structure in order (for example "hook question", "shows problem", "demo", "result", "cta").
- cta: present (true only if the creator explicitly asks the viewer to do something), type, one of:
  none, follow, comment, like_share, link_in_bio, shop_product, discount_code, visit_profile, watch_more, other; text: the call to action as said or written (max 120 characters, empty if none).
- product: mentioned (a product, brand or service is shown or named), brand (the brand name if stated, else empty), promotion, one of:
  none, paid_partnership (marked as ad / sponsored / paid partnership, or the sponsorship flag is true), affiliate (affiliate link, code, shop link or "link in bio" to buy),
  gifted (says it was sent or gifted), own_brand (the creator's own product or shop), organic_mention (named with no sign of a deal).
- tone, one of: funny, inspirational, educational, emotional, calm, energetic, dramatic, sarcastic, neutral.
- language: ISO 639-1 code of the spoken language (else the caption language), for example "en", "fr".
- signals.positive: 1 to 4 short English phrases on craft choices that tend to hold attention or drive action in this video (for example "question hook in first second", "clear payoff shown early", "on-screen result").
- signals.negative: 0 to 4 short English phrases on craft choices that tend to lose viewers (for example "slow intro before the point", "no clear takeaway", "audio hard to follow").
Signals must be about the content itself and must not mention numbers, views or performance.
If the transcript is missing or says no speech, rely on the caption, hashtags and sound, and prefer visual_only / trend_sound / montage / slideshow when nothing indicates speech.
Answer with that one JSON object only: no prose, no code fence.`;

export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "hook_type", "format", "topic", "key_message", "beats", "cta", "product", "tone", "language", "signals"],
  properties: {
    hook: { type: "string" },
    hook_type: { type: "string", enum: [...HOOK_TYPES] },
    format: { type: "string", enum: [...CONTENT_FORMATS] },
    topic: { type: "string" },
    key_message: { type: "string" },
    beats: { type: "array", items: { type: "string" } },
    cta: {
      type: "object",
      additionalProperties: false,
      required: ["present", "type", "text"],
      properties: { present: { type: "boolean" }, type: { type: "string", enum: [...CTA_TYPES] }, text: { type: "string" } },
    },
    product: {
      type: "object",
      additionalProperties: false,
      required: ["mentioned", "brand", "promotion"],
      properties: { mentioned: { type: "boolean" }, brand: { type: "string" }, promotion: { type: "string", enum: [...PROMOTION_TYPES] } },
    },
    tone: { type: "string", enum: [...TONES] },
    language: { type: "string" },
    signals: {
      type: "object",
      additionalProperties: false,
      required: ["positive", "negative"],
      properties: { positive: { type: "array", items: { type: "string" } }, negative: { type: "array", items: { type: "string" } } },
    },
  },
} as const;

function timedTranscript(t: Transcript | null): string {
  if (!t) return "(no transcript fetched)";
  if (t.status === "no_speech") return "(no speech in this video)";
  if (t.status !== "ok" || !t.text) return "(transcript unavailable)";
  const lines = t.segments.length ? t.segments.map((s) => `[${s.start.toFixed(1)}] ${s.text}`) : [t.text];
  const full = lines.join("\n");
  if (full.length <= MAX_TRANSCRIPT_CHARS) return full;
  // Long video: the opening carries the hook, the ending the CTA.
  const head = full.slice(0, Math.floor(MAX_TRANSCRIPT_CHARS * 0.8));
  const tail = full.slice(-Math.floor(MAX_TRANSCRIPT_CHARS * 0.2));
  return `${head}\n[…]\n${tail}`;
}

/** The user turn for one video: facts only, no performance numbers. */
export function analysisUserText(v: IntelVideo, t: Transcript | null): string {
  const caption = (v.caption ?? "").slice(0, MAX_CAPTION_CHARS);
  const facts = [
    `platform: ${v.platform}`,
    `media: ${v.media_type ?? "video"}${v.duration_seconds ? `, ${v.duration_seconds} s` : ""}`,
    `sound: ${v.music_title || "unknown"}${v.audio_kind ? ` (${v.audio_kind})` : ""}`,
    `sponsorship flag: ${v.is_ad ? "true" : "false"}`,
    `product link on the post: ${v.has_product_link ? "true" : "false"}`,
    `hashtags: ${(v.hashtags ?? []).slice(0, 20).map((h) => `#${h}`).join(" ") || "none"}`,
    `caption:\n${caption || "(empty)"}`,
    `transcript${t?.language ? ` (${t.language})` : ""}:\n${timedTranscript(t)}`,
  ];
  return facts.join("\n");
}

/** One LLM request (id "j<job id>"). */
export function analysisRequest(jobId: number, v: IntelVideo, t: Transcript | null, model = analysisModel()): IntelLlmRequest {
  return { id: `j${jobId}`, model, system: ANALYSIS_SYSTEM, user: analysisUserText(v, t), maxTokens: 1_500, schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown> };
}

// ── Validation ───────────────────────────────────────────────────────────────

const clampText = (v: unknown, max: number): string =>
  (typeof v === "string" ? v : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

const textList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => clampText(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

/** Numbers have no place in signals (the model must not invent performance): drop phrases with digits about views. */
const noNumbers = (list: string[]) => list.filter((s) => !/\d/.test(s) || !/(view|like|share|follower|%|percent|million|k\b)/i.test(s));

/** The first JSON object in a text (the schema makes this the whole text; this tolerates fences). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * A model answer to a stored VideoAnalysis, or null when it is not an object
 * at all. Never throws; every field is clamped to the vocabulary and limits.
 */
export function validateAnalysis(raw: unknown, fallback: { transcript?: Transcript | null; caption?: string | null } = {}): VideoAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, any>;
  const ctaType = pick(o.cta?.type, CTA_TYPES, "none");
  const ctaPresent = Boolean(o.cta?.present) && ctaType !== "none";
  const promotion = pick(o.product?.promotion, PROMOTION_TYPES, "none");
  const mentioned = Boolean(o.product?.mentioned) || promotion !== "none";
  let hook = clampText(o.hook, 160);
  if (!hook) {
    hook = clampText(openingText(fallback.transcript?.segments ?? []), 160) || clampText((fallback.caption ?? "").split("\n")[0], 160);
  }
  return {
    hook,
    hook_type: pick(o.hook_type, HOOK_TYPES, "other"),
    format: pick(o.format, CONTENT_FORMATS, "other"),
    topic: clampText(o.topic, 60).toLowerCase(),
    key_message: clampText(o.key_message, 240),
    beats: textList(o.beats, 6, 60),
    cta: { present: ctaPresent, type: ctaPresent ? ctaType : "none", text: ctaPresent ? clampText(o.cta?.text, 120) : "" },
    product: { mentioned, brand: mentioned ? clampText(o.product?.brand, 60) : "", promotion: mentioned ? promotion : "none" },
    tone: pick(o.tone, TONES, "neutral"),
    language: normalizeLang(o.language) || normalizeLang(fallback.transcript?.language) || "",
    signals: { positive: noNumbers(textList(o.signals?.positive, 4, 90)), negative: noNumbers(textList(o.signals?.negative, 4, 90)) },
  };
}

/** Columns of creator_video_insights extracted from an analysis (for filters and joins). */
export function insightColumns(a: VideoAnalysis, t: Transcript | null) {
  return {
    hook: a.hook || null,
    hook_type: a.hook_type,
    content_format: a.format,
    topic: a.topic || null,
    cta_type: a.cta.type,
    has_cta: a.cta.present,
    has_product: a.product.mentioned,
    promotion_type: a.product.promotion,
    tone: a.tone,
    language: a.language || null,
    pace_wps: t?.status === "ok" ? speakingPace(t.segments) : null,
  };
}
