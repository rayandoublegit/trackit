// Video intelligence: shared shapes and the closed vocabularies the analysis
// is clamped to. Design and cost math: docs/VIDEO_INTEL.md.

export type IntelPlatform = "tiktok" | "instagram" | "youtube";

/** Job kinds of video_intel_jobs. */
export type IntelJobKind = "transcript" | "analyze" | "synthesize";

export type IntelJob = {
  id: number;
  kind: IntelJobKind;
  platform: string;
  /** video_id for transcript / analyze, the creator storage key for synthesize. */
  target: string;
  priority: number;
  attempts: number;
  status?: string;
  batch_id?: string | null;
};

/** One timed piece of a transcript (seconds from the start of the video). */
export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscriptStatus = "ok" | "no_speech" | "unavailable";

export type Transcript = {
  status: TranscriptStatus;
  /** "embedded-vtt", "scrapecreators", "stt", "metadata" (decided without a call). */
  source: string;
  language: string | null;
  text: string;
  segments: TranscriptSegment[];
  wordCount: number;
  /** Provider credits this transcript cost (0 for the free sources). */
  credits: number;
};

/** What the transcript sources and the analysis read about a stored video. */
export type IntelVideo = {
  platform: string;
  video_id: string;
  username: string;
  caption: string | null;
  hashtags: string[] | null;
  duration_seconds: number | null;
  media_type: string | null;
  share_url: string | null;
  music_title: string | null;
  is_ad: boolean | null;
  has_product_link: boolean | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  posted_at: string | null;
  subtitle_url?: string | null;
  subtitle_lang?: string | null;
  /** "original" (own voice / original sound), "music" (licensed track), "none" (no audio track). */
  audio_kind?: string | null;
  /** Short-lived media file URL captured at the last scrape (speech to text). */
  media_url?: string | null;
  /** creators_index.median_video_views of the creator, when known. */
  median_views?: number | null;
};

// ── Closed vocabularies (the model must pick one of these; anything else is clamped) ──

export const HOOK_TYPES = [
  "question",
  "bold_claim",
  "story",
  "pov",
  "tutorial",
  "list",
  "reaction",
  "trend_sound",
  "product_reveal",
  "before_after",
  "challenge",
  "controversy",
  "relatable",
  "statistic",
  "visual_only",
  "other",
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const CONTENT_FORMATS = [
  "talking_head",
  "voiceover",
  "skit",
  "tutorial",
  "unboxing",
  "grwm",
  "vlog",
  "review",
  "haul",
  "routine",
  "interview",
  "duet_stitch",
  "slideshow",
  "montage",
  "asmr",
  "other",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CTA_TYPES = ["none", "follow", "comment", "like_share", "link_in_bio", "shop_product", "discount_code", "visit_profile", "watch_more", "other"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const PROMOTION_TYPES = ["none", "paid_partnership", "affiliate", "gifted", "own_brand", "organic_mention"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const TONES = ["funny", "inspirational", "educational", "emotional", "calm", "energetic", "dramatic", "sarcastic", "neutral"] as const;
export type Tone = (typeof TONES)[number];

/** Performance bands, computed in code / SQL, never by the model. */
export const BANDS = ["flop", "under", "normal", "over", "viral"] as const;
export type Band = (typeof BANDS)[number];

/** The validated per-video analysis stored in creator_video_insights.analysis. */
export type VideoAnalysis = {
  hook: string;
  hook_type: HookType;
  format: ContentFormat;
  topic: string;
  key_message: string;
  beats: string[];
  cta: { present: boolean; type: CtaType; text: string };
  product: { mentioned: boolean; brand: string; promotion: PromotionType };
  tone: Tone;
  language: string;
  /** Qualitative reasons the content may have helped or hurt; no numbers. */
  signals: { positive: string[]; negative: string[] };
};

/** One LLM request of the pipeline, provider-neutral (lib/llm.ts sends it as a batch item or a chat call). */
export type IntelLlmRequest = { id: string; model: string; system: string; user: string; maxTokens: number; schema?: Record<string, unknown> };

/** One LLM answer, whatever the transport. */
export type IntelLlmResult = {
  id: string;
  ok: boolean;
  text: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  finishReason: string | null;
  error: { type: string; message: string } | null;
};
