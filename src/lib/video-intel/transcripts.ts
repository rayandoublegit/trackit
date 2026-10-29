import { ProviderError, providerGet } from "@/lib/scraper/http";
import { LlmError, transcribeAudio } from "@/lib/llm";
import { CallMeter } from "@/lib/scraper/types";
import { normalizeLang } from "./captions";
import { parseVtt, segmentsText, wordCount } from "./vtt";
import type { IntelVideo, Transcript, TranscriptSegment } from "./types";

// Transcripts, cheapest source first, behind one interface:
//   1. metadata        free, no call: no audio track → no speech; not a video → nothing to transcribe
//   2. embedded-vtt    free: the WEBVTT caption track the platform put in the payload we already
//                      fetched (captured at ingest in creator_videos.subtitle_url; TikTok)
//   3. scrapecreators  paid, 1 credit per transcript returned, 0 when there is none:
//                        TikTok    GET /v1/tiktok/video/transcript?url=   native captions, AI fallback ≤ 120 s (use_ai_as_fallback)
//                        YouTube   GET /v1/youtube/video/transcript?url=  caption track; null at no charge
//                        Instagram GET /v2/instagram/media/transcript?url= AI transcription, ≤ 120 s at 1 credit
//                      Videos over 120 s are not sent to AI transcription (10 credits per started
//                      minute with allow_long_transcription); they keep the caption-only analysis.
//   4. stt (optional)  speech to text on the Cheaper Inference gateway (/audio/transcriptions,
//                      VIDEO_INTEL_STT_MODEL, default whisper-1 for timed segments) from the
//                      short-lived media URL captured at the scrape. Off by default
//                      (VIDEO_INTEL_STT_DAILY_MAX = 0); capped per day.
// A source returns null when it has nothing ("try the next one"); a provider
// out of credits throws a ProviderError with providerDown, which the worker
// turns into a pause of that source (no retry storm).

export type SourceContext = { meter: CallMeter };

export interface TranscriptSource {
  readonly name: string;
  readonly paid: boolean;
  /** Credits one attempt may cost at most (reserved against the daily credit cap before the call). */
  maxCredits(v: IntelVideo): number;
  applies(v: IntelVideo): boolean;
  fetch(v: IntelVideo, ctx: SourceContext): Promise<Transcript | null>;
}

const AI_MAX_SECONDS = 120;

export function transcriptFromSegments(source: string, segments: TranscriptSegment[], language: string | null, credits = 0, fallbackText = ""): Transcript {
  const text = segments.length ? segmentsText(segments) : fallbackText.replace(/\s+/g, " ").trim();
  const words = wordCount(text);
  return {
    status: words > 0 ? "ok" : "no_speech",
    source,
    language: language || null,
    text,
    segments,
    wordCount: words,
    credits,
  };
}

export const noSpeech = (source: string, credits = 0): Transcript => ({ status: "no_speech", source, language: null, text: "", segments: [], wordCount: 0, credits });
export const unavailable = (source: string, credits = 0): Transcript => ({ status: "unavailable", source, language: null, text: "", segments: [], wordCount: 0, credits });

// ── 1. Metadata (no call) ────────────────────────────────────────────────────
export const metadataSource: TranscriptSource = {
  name: "metadata",
  paid: false,
  maxCredits: () => 0,
  applies: () => true,
  async fetch(v) {
    if (v.media_type && v.media_type !== "video") return noSpeech("metadata");
    if (v.audio_kind === "none") return noSpeech("metadata");
    return null;
  },
};

// ── 2. Embedded WEBVTT caption track (free) ──────────────────────────────────
export type TextFetcher = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetcher: TextFetcher = async (url) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "text/vtt,text/plain,*/*" } });
  const text = res.ok ? (await res.text()).slice(0, 1_000_000) : "";
  return { status: res.status, text };
};

export function embeddedVttSource(fetcher: TextFetcher = defaultFetcher): TranscriptSource {
  return {
    name: "embedded-vtt",
    paid: false,
    maxCredits: () => 0,
    applies: (v) => Boolean(v.subtitle_url && /^https?:\/\//i.test(v.subtitle_url)),
    async fetch(v) {
      try {
        const { status, text } = await fetcher(v.subtitle_url!);
        // Signed caption URLs expire (403 / 404 / 410): fall through to the next source.
        if (status < 200 || status >= 300) return null;
        const segments = parseVtt(text);
        if (!segments.length) return null;
        return transcriptFromSegments("embedded-vtt", segments, normalizeLang(v.subtitle_lang) || null);
      } catch {
        return null;
      }
    },
  };
}

// ── 3. ScrapeCreators transcript endpoints (paid) ────────────────────────────
const SC = "https://api.scrapecreators.com";
const PROVIDER = "scrapecreators-transcript";

type ScGet = (path: string, params: Record<string, string>, meter: CallMeter) => Promise<any>;

const defaultScGet: ScGet = (path, params, meter) => {
  const url = new URL(`${SC}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
  return providerGet({ provider: PROVIDER, url: url.toString(), headers: { "x-api-key": process.env.SCRAPECREATORS_API_KEY ?? "" }, meter, timeoutMs: 60_000 });
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** transcript_with_timestamp ([{ start, end, text }] in seconds) → segments. */
export function segmentsFromTimestamped(list: unknown): TranscriptSegment[] {
  if (!Array.isArray(list)) return [];
  const out: TranscriptSegment[] = [];
  for (const s of list) {
    const text = typeof s?.text === "string" ? s.text.replace(/\s+/g, " ").trim() : "";
    const start = num(s?.start ?? s?.startTime ?? s?.offset);
    const end = num(s?.end ?? s?.endTime);
    if (!text || !Number.isFinite(start)) continue;
    out.push({ start, end: Number.isFinite(end) ? end : start, text });
  }
  return out;
}

/** YouTube transcript ([{ text, startMs, endMs? }]) → segments. */
export function segmentsFromYouTube(list: unknown): TranscriptSegment[] {
  if (!Array.isArray(list)) return [];
  const rows = list
    .map((s: any) => ({ text: typeof s?.text === "string" ? s.text.replace(/\s+/g, " ").trim() : "", start: num(s?.startMs) / 1000, end: num(s?.endMs) / 1000 }))
    .filter((s) => s.text && Number.isFinite(s.start));
  return rows.map((s, i) => ({ text: s.text, start: s.start, end: Number.isFinite(s.end) ? s.end : (rows[i + 1]?.start ?? s.start + 2) }));
}

/** "English" / "French (auto-generated)" / "fr" → ISO code. */
export function languageName(v: unknown): string {
  const t = String(v ?? "").trim().toLowerCase();
  const byName: Record<string, string> = { english: "en", french: "fr", spanish: "es", german: "de", italian: "it", portuguese: "pt", dutch: "nl", arabic: "ar", turkish: "tr", russian: "ru", japanese: "ja", korean: "ko", chinese: "zh", polish: "pl", hindi: "hi", indonesian: "id", vietnamese: "vi", thai: "th" };
  const word = t.split(/[\s(]/)[0];
  return byName[word] ?? normalizeLang(t);
}

export function parseScTikTokTranscript(raw: any, credits: number, fallbackLang: string | null, aiAllowed: boolean): Transcript {
  let segments = segmentsFromTimestamped(raw?.transcript_with_timestamp);
  if (!segments.length && typeof raw?.transcript === "string") segments = parseVtt(raw.transcript);
  if (!segments.length) return aiAllowed ? noSpeech("scrapecreators", credits) : unavailable("scrapecreators", credits);
  return transcriptFromSegments("scrapecreators", segments, normalizeLang(raw?.language) || fallbackLang, credits);
}

export function parseScYouTubeTranscript(raw: any, credits: number): Transcript {
  const segments = segmentsFromYouTube(raw?.transcript);
  const text = typeof raw?.transcript_only_text === "string" ? raw.transcript_only_text : "";
  if (!segments.length && !text.trim()) return unavailable("scrapecreators", credits);
  return transcriptFromSegments("scrapecreators", segments, languageName(raw?.language) || null, credits, text);
}

export function parseScInstagramTranscript(raw: any, credits: number): Transcript {
  const items: any[] = Array.isArray(raw?.transcripts) ? raw.transcripts : [];
  const first = items[0];
  if (!first) return noSpeech("scrapecreators", credits);
  const segments = segmentsFromTimestamped(first.transcript_with_timestamp);
  return transcriptFromSegments("scrapecreators", segments, normalizeLang(first.language) || null, credits, String(first.text ?? ""));
}

const flag = (name: string, fallback: boolean) => {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return !(v === "0" || v === "false" || v === "off");
};

export function scrapeCreatorsTranscriptSource(get: ScGet = defaultScGet): TranscriptSource {
  const cacheAge = (process.env.VIDEO_INTEL_SC_CACHE_MAX_AGE ?? "").trim();
  const short = (v: IntelVideo) => v.duration_seconds == null || v.duration_seconds <= AI_MAX_SECONDS;
  return {
    name: "scrapecreators",
    paid: true,
    maxCredits: () => 1,
    applies: (v) => Boolean(process.env.SCRAPECREATORS_API_KEY) && flag("VIDEO_INTEL_PAID_TRANSCRIPTS", true) && Boolean(v.share_url) && (v.platform !== "instagram" || short(v)),
    async fetch(v, { meter }) {
      const before = meter.credits;
      const extra: Record<string, string> = cacheAge ? { cache_max_age: cacheAge } : {};
      try {
        if (v.platform === "tiktok") {
          const ai = flag("VIDEO_INTEL_TIKTOK_AI_FALLBACK", true) && short(v);
          const raw = await get("/v1/tiktok/video/transcript", { url: v.share_url!, use_ai_as_fallback: ai ? "true" : "false", ...(v.subtitle_lang ? { language: normalizeLang(v.subtitle_lang) } : {}), ...extra }, meter);
          return parseScTikTokTranscript(raw, meter.credits - before, normalizeLang(v.subtitle_lang) || null, ai);
        }
        if (v.platform === "youtube") {
          const raw = await get("/v1/youtube/video/transcript", { url: v.share_url!, ...extra }, meter);
          return parseScYouTubeTranscript(raw, meter.credits - before);
        }
        if (v.platform === "instagram") {
          const raw = await get("/v2/instagram/media/transcript", { url: v.share_url!, ...extra }, meter);
          return parseScInstagramTranscript(raw, meter.credits - before);
        }
        return null;
      } catch (e) {
        // "Not found": the post is gone or private. An answer, not a failure: nothing to transcribe.
        if (e instanceof ProviderError && e.kind === "not_found") return unavailable("scrapecreators", meter.credits - before);
        throw e;
      }
    },
  };
}

// ── 4. Optional speech-to-text ───────────────────────────────────────────────
/** Plug a speech-to-text provider here (Whisper, Deepgram…). Not enabled by default. */
export interface SpeechToTextProvider {
  readonly name: string;
  /** Credits (or cents) one transcription may cost, for the daily cap. */
  maxCredits(v: IntelVideo): number;
  /** Needs a downloadable media URL; returns timed segments, [] for no speech, null when it cannot. */
  transcribe(v: IntelVideo): Promise<{ segments: TranscriptSegment[]; language: string | null; credits: number } | null>;
}

export function sttSource(provider: SpeechToTextProvider): TranscriptSource {
  return {
    name: `stt:${provider.name}`,
    // Billed in dollars by its own daily cap, not in ScrapeCreators credits.
    paid: false,
    maxCredits: (v) => provider.maxCredits(v),
    applies: (v) => v.media_type === "video",
    async fetch(v) {
      try {
        const out = await provider.transcribe(v);
        if (!out) return null;
        return transcriptFromSegments("stt", out.segments, out.language, out.credits);
      } catch (e) {
        // Gateway out of credit / bad key: surfaces as a provider-down error (paused by the worker).
        if (e instanceof LlmError && e.providerDown) throw new ProviderError(`stt:${provider.name}`, e.kind === "credit" ? "no_credits" : "unauthorized", e.message);
        if (e instanceof LlmError && e.kind === "invalid") return null; // unsupported file: nothing to transcribe
        throw e;
      }
    },
  };
}

/** Shared counter of speech-to-text calls still allowed (the worker sets it from the daily cap). */
export type SttBudget = { left: number; calls: number; usd: number };

/**
 * Speech to text through lib/llm.ts (gateway /audio/transcriptions). Downloads the media
 * file (≤ 25 MB, the API limit) from the URL the scrape captured; expired URLs give nothing.
 */
export function gatewaySpeechToText(budget: SttBudget, opts: { download?: (url: string) => Promise<Blob | null>; transcribe?: typeof transcribeAudio } = {}): SpeechToTextProvider {
  const maxSeconds = Number(process.env.VIDEO_INTEL_STT_MAX_SECONDS ?? 180) || 180;
  const model = (process.env.VIDEO_INTEL_STT_MODEL || "whisper-1").trim();
  const download =
    opts.download ??
    (async (url: string) => {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      const size = Number(res.headers.get("content-length") ?? 0);
      if (size > 25_000_000) return null;
      const blob = await res.blob();
      return blob.size > 25_000_000 ? null : blob;
    });
  const transcribe = opts.transcribe ?? transcribeAudio;
  return {
    name: "gateway",
    maxCredits: () => 0,
    async transcribe(v) {
      if (budget.left <= 0 || !v.media_url || (v.duration_seconds != null && v.duration_seconds > maxSeconds)) return null;
      budget.left -= 1;
      const file = await download(v.media_url).catch(() => null);
      if (!file) return null;
      budget.calls += 1;
      const r = await transcribe(file, { model, fileName: `${v.video_id}.mp4` });
      // The transcription answer carries no usage.cost (checked 2026-10-29): estimate at whisper's $0.006 / minute.
      const seconds = v.duration_seconds ?? (r.segments.length ? r.segments[r.segments.length - 1].end : 60);
      budget.usd += r.costUsd ?? Math.round((seconds / 60) * 0.006 * 100_000) / 100_000;
      return { segments: r.segments.length ? r.segments : r.text ? [{ start: 0, end: v.duration_seconds ?? 0, text: r.text }] : [], language: r.language ? String(r.language).slice(0, 2).toLowerCase() : null, credits: 0 };
    },
  };
}

/** The default chain. A speech-to-text provider is appended only when one is passed in. */
export function defaultTranscriptSources(opts: { stt?: SpeechToTextProvider; fetcher?: TextFetcher; scGet?: ScGet } = {}): TranscriptSource[] {
  return [metadataSource, embeddedVttSource(opts.fetcher), scrapeCreatorsTranscriptSource(opts.scGet), ...(opts.stt ? [sttSource(opts.stt)] : [])];
}

export type ChainOptions = {
  meter: CallMeter;
  /** Sources paused (out of credits): skipped. */
  paused?: Set<string>;
  /** Paid credits still allowed today; a paid source whose maxCredits exceeds it is skipped. */
  creditsLeft?: number;
  onProviderDown?: (source: string, error: ProviderError) => void;
};

/**
 * First transcript any source gives. Never throws for provider trouble:
 * a source out of credits is reported through onProviderDown and skipped.
 * Other errors (server, network, rate limit) are rethrown so the job retries later.
 */
export async function fetchTranscript(v: IntelVideo, sources: TranscriptSource[], opts: ChainOptions): Promise<Transcript> {
  let lastError: unknown = null;
  let skippedPaid = false;
  for (const s of sources) {
    if (!s.applies(v)) continue;
    if (opts.paused?.has(s.name)) {
      if (s.paid) skippedPaid = true;
      continue;
    }
    if (s.paid && opts.creditsLeft != null && s.maxCredits(v) > opts.creditsLeft) {
      skippedPaid = true;
      continue;
    }
    try {
      const t = await s.fetch(v, { meter: opts.meter });
      if (t) return t;
    } catch (e) {
      if (e instanceof ProviderError && e.providerDown) {
        opts.onProviderDown?.(s.name, e);
        opts.paused?.add(s.name);
        // A paid credit source down: the job waits for it. Speech to text down: caption-only analysis.
        if (s.paid) skippedPaid = true;
        continue;
      }
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  // A paid source exists but was skipped (pause or cap): not final, try again later.
  if (skippedPaid) throw new TranscriptDeferred("paid transcript source paused or capped");
  return unavailable("none");
}

/** The job should come back later untouched (paid source paused or daily credits used). */
export class TranscriptDeferred extends Error {}
