// Free transcripts: caption tracks the platforms already put in the video
// objects the scraper fetches. Captured at ingest (creator_videos.subtitle_url
// / subtitle_lang / audio_kind) so the transcript worker can download the
// WEBVTT later without any paid call.
//
// Shapes read (field names from the platforms' own objects):
//   TikTok app / ScrapeCreators aweme  video.cla_info.caption_infos[]
//       { url, url_list[], language_code: "en", lang: "eng-US", caption_format: "webvtt", is_auto_generated, sub_id }
//   TikTok web itemStruct              video.subtitleInfos[]
//       { Url, LanguageCodeName: "eng-US", Format: "webvtt", Source: "ASR" | "MT" | … }
//   RapidAPI tiktok-scraper7 (flat)    subtitles[] / subtitle_infos[] when present (same keys, any case)
//   YouTube (when a payload carries it) captions.playerCaptionsTracklistRenderer.captionTracks[]
//       { baseUrl, languageCode, kind: "asr" }
// Instagram payloads carry no caption track (checked on real
// instagram-scraper-stable-api answers, 2026-10-29): only `has_audio` and
// `clips_metadata.audio_type` ("original_sounds" | "licensed_music"), which
// give audio_kind. Machine-translated tracks (TikTok Source "MT") are skipped:
// we want what was said, in the language it was said.

export type CaptionTrack = { url: string; lang: string; auto: boolean; translated: boolean };

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const firstHttp = (v: unknown): string => {
  if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && /^https?:\/\//i.test(x)) return x;
  return "";
};

/** "eng-US" → "en", "fra-FR" → "fr", "en" → "en", "zh-Hans" → "zh". */
export function normalizeLang(raw: unknown): string {
  const t = s(raw).trim().toLowerCase().replace(/_/g, "-");
  if (!t) return "";
  const head = t.split("-")[0];
  const iso3: Record<string, string> = {
    eng: "en", fra: "fr", fre: "fr", spa: "es", deu: "de", ger: "de", ita: "it", por: "pt", nld: "nl", dut: "nl",
    ara: "ar", tur: "tr", rus: "ru", jpn: "ja", kor: "ko", cmn: "zh", zho: "zh", chi: "zh", ind: "id", vie: "vi",
    tha: "th", pol: "pl", ron: "ro", rum: "ro", hin: "hi", msa: "ms", may: "ms", fil: "fil", tgl: "tl", ukr: "uk",
  };
  if (head.length === 3 && iso3[head]) return iso3[head];
  return head.length === 2 ? head : head.slice(0, 3);
}

function trackFrom(o: any): CaptionTrack | null {
  if (!o || typeof o !== "object") return null;
  const url = firstHttp(o.url) || firstHttp(o.Url) || firstHttp(o.url_list) || firstHttp(o.UrlList) || firstHttp(o.baseUrl) || firstHttp(o.base_url);
  if (!url) return null;
  const format = s(o.caption_format ?? o.Format ?? o.format).toLowerCase();
  if (format && !/vtt|webvtt/.test(format) && !o.baseUrl) return null; // only WEBVTT is parsed (YouTube baseUrl gets fmt=vtt)
  const lang = normalizeLang(o.language_code ?? o.languageCode ?? o.LanguageCodeName ?? o.lang ?? o.language ?? o.Lang);
  const source = s(o.Source ?? o.source ?? o.kind).toUpperCase();
  return {
    url,
    lang,
    auto: Boolean(o.is_auto_generated) || source === "ASR",
    translated: source === "MT" || Boolean(o.is_translated) || Boolean(o.translation),
  };
}

/** Every caption track found in one raw video object (any of the shapes above). */
export function captionTracksOf(raw: any): CaptionTrack[] {
  if (!raw || typeof raw !== "object") return [];
  const v = raw.video ?? {};
  const lists: unknown[] = [
    v?.cla_info?.caption_infos,
    raw?.cla_info?.caption_infos,
    v?.subtitleInfos,
    v?.subtitle_infos,
    raw?.subtitleInfos,
    raw?.subtitle_infos,
    raw?.subtitles,
    raw?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
    raw?.captionTracks,
  ];
  const out: CaptionTrack[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      const t = trackFrom(o);
      if (t && !seen.has(t.url)) {
        seen.add(t.url);
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * The track to keep: never machine translations; the original-language one
 * when the payload says which language was spoken, else the first.
 */
export function bestCaptionTrack(tracks: CaptionTrack[], spokenLang?: string | null): CaptionTrack | null {
  const usable = tracks.filter((t) => !t.translated);
  if (!usable.length) return null;
  const want = normalizeLang(spokenLang);
  return (want && usable.find((t) => t.lang === want)) || usable[0];
}

/** The language TikTok says was spoken (cla_info.original_language_info / video_language). */
export function spokenLanguageOf(raw: any): string {
  const v = raw?.video ?? {};
  return normalizeLang(
    v?.cla_info?.original_language_info?.language_code ??
      v?.cla_info?.original_language_info?.lang ??
      raw?.cla_info?.original_language_info?.language_code ??
      v?.video_language ??
      raw?.video_language,
  );
}

export type AudioKind = "original" | "music" | "none";

/**
 * Audio of a post when the payload says: "none" (no audio track), "music"
 * (a licensed / catalogue track), "original" (own sound). Undefined when unknown.
 */
export function audioKindOf(raw: any): AudioKind | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.has_audio === false) return "none";
  const igType = s(raw?.clips_metadata?.audio_type).toLowerCase();
  if (igType === "licensed_music") return "music";
  if (igType === "original_sounds") return "original";
  const music = raw.music ?? raw.music_info ?? null;
  if (music && typeof music === "object") {
    const original = music.is_original_sound ?? music.is_original ?? music.original;
    if (original === true) return "original";
    if (original === false) return "music";
  }
  return undefined;
}

/**
 * A downloadable media file of the video (for speech to text), when the payload has one:
 * TikTok app video.play_addr / download_addr url_list, RapidAPI flat `play`, Instagram
 * video_versions[0].url. Signed and short-lived: only useful soon after the scrape.
 */
export function mediaUrlOf(raw: any): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw.video ?? {};
  const url =
    firstHttp(v?.play_addr?.url_list) ||
    firstHttp(v?.download_addr?.url_list) ||
    firstHttp(v?.playAddr) ||
    firstHttp(raw?.play) ||
    firstHttp(raw?.video_versions?.[0]?.url) ||
    firstHttp(raw?.video_url);
  return url || undefined;
}

/** Caption fields of a scraped video, ready for ScrapedVideo (undefined fields left out). */
export function captionFieldsOf(raw: any): { subtitleUrl?: string; subtitleLang?: string; audioKind?: AudioKind; mediaUrl?: string } {
  const track = bestCaptionTrack(captionTracksOf(raw), spokenLanguageOf(raw));
  const audio = audioKindOf(raw);
  const media = mediaUrlOf(raw);
  return {
    ...(track ? { subtitleUrl: track.url } : {}),
    ...(track?.lang ? { subtitleLang: track.lang } : {}),
    ...(audio ? { audioKind: audio } : {}),
    ...(media ? { mediaUrl: media } : {}),
  };
}
