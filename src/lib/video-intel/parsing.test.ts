import { describe, expect, it } from "vitest";
import { openingText, parseVtt, segmentsText, speakingPace, wordCount } from "./vtt";
import { audioKindOf, bestCaptionTrack, captionFieldsOf, captionTracksOf, mediaUrlOf, normalizeLang } from "./captions";
import { parseRapidVideos, parseScrapeCreatorsTikTokVideos } from "@/lib/scraper/sources";
import { parseInstagramPosts } from "@/lib/scraper/sources-instagram";

const VTT = `WEBVTT

NOTE made by TikTok

1
00:00:00.120 --> 00:00:01.840 align:start position:0%
Alright, <c.yellow>pizza</c> review time.

00:00:01.841 --> 00:00:03.761
Sal&#39;s Pizza Factory. Oh,

00:00:03.762 --> 00:00:05.721
Sal&#39;s Pizza Factory. Oh,

00:00:05.800 --> 00:00:09.000
it is honestly the best slice in town, you need to try it.
`;

describe("WEBVTT parsing", () => {
  it("reads cues, strips tags and settings, merges repeated rolling lines", () => {
    const segs = parseVtt(VTT);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ start: 0.12, end: 1.84, text: "Alright, pizza review time." });
    expect(segs[1].text).toBe("Sal's Pizza Factory. Oh,");
    expect(segs[1].end).toBe(5.721);
    expect(segmentsText(segs)).toMatch(/^Alright, pizza review time\. Sal's/);
  });

  it("accepts mm:ss timings, CRLF and comma decimals", () => {
    const segs = parseVtt("WEBVTT\r\n\r\n00:01,500 --> 00:03,000\r\nhello there\r\n");
    expect(segs).toEqual([{ start: 1.5, end: 3, text: "hello there" }]);
  });

  it("returns nothing for empty or non-VTT text", () => {
    expect(parseVtt("")).toEqual([]);
    expect(parseVtt("<html>expired</html>")).toEqual([]);
  });

  it("computes pace from speech time and the 3-second opening", () => {
    const segs = parseVtt(VTT);
    const words = wordCount(segmentsText(segs));
    expect(speakingPace(segs)).toBeCloseTo(words / (9 - 0.12), 2);
    expect(openingText(segs)).toBe("Alright, pizza review time. Sal's Pizza Factory. Oh,");
    expect(speakingPace([{ start: 0, end: 1, text: "hi" }])).toBeNull();
  });
});

describe("caption tracks in platform payloads", () => {
  const aweme = {
    aweme_id: "7499229683859426602",
    desc: "Pizza review",
    create_time: 1_790_000_000,
    statistics: { play_count: 1000 },
    music: { title: "original sound - stool", is_original_sound: true },
    video: {
      duration: 9000,
      cover: { url_list: ["https://p16-sign.tiktokcdn.com/obj/c.jpeg"] },
      cla_info: {
        original_language_info: { language_code: "en", lang: "eng-US" },
        caption_infos: [
          { lang: "fra-FR", language_code: "fr", url: "https://v16.tiktokcdn.com/fr.vtt", caption_format: "webvtt", is_auto_generated: true, is_translated: true },
          { lang: "eng-US", language_code: "en", url: "", url_list: ["https://v16.tiktokcdn.com/en.vtt"], caption_format: "webvtt", is_auto_generated: true },
        ],
      },
    },
  };

  it("picks the spoken-language track and never a machine translation (app shape)", () => {
    expect(captionFieldsOf(aweme)).toEqual({ subtitleUrl: "https://v16.tiktokcdn.com/en.vtt", subtitleLang: "en", audioKind: "original" });
  });

  it("reads the TikTok web shape (video.subtitleInfos)", () => {
    const web = { video: { subtitleInfos: [{ Url: "https://v19.tiktokcdn.com/mt.vtt", LanguageCodeName: "spa-ES", Format: "webvtt", Source: "MT" }, { Url: "https://v19.tiktokcdn.com/asr.vtt", LanguageCodeName: "eng-US", Format: "webvtt", Source: "ASR" }] } };
    const tracks = captionTracksOf(web);
    expect(tracks.map((t) => t.lang)).toEqual(["es", "en"]);
    expect(bestCaptionTrack(tracks)?.url).toBe("https://v19.tiktokcdn.com/asr.vtt");
  });

  it("goes through the ScrapeCreators and RapidAPI TikTok parsers", () => {
    const [v] = parseScrapeCreatorsTikTokVideos({ aweme_list: [aweme] }, "stool");
    expect(v.subtitleUrl).toBe("https://v16.tiktokcdn.com/en.vtt");
    expect(v.subtitleLang).toBe("en");
    const [r] = parseRapidVideos({ data: { videos: [{ video_id: "1", title: "x", play_count: 1, music_info: { title: "song", original: false }, subtitles: [{ url: "https://x.tiktokcdn.com/a.vtt", language_code: "fr", caption_format: "webvtt" }] }] } }, "a");
    expect(r.subtitleUrl).toBe("https://x.tiktokcdn.com/a.vtt");
    expect(r.audioKind).toBe("music");
  });

  it("leaves the fields out when the payload has no caption (fixtures stay identical)", () => {
    const [v] = parseScrapeCreatorsTikTokVideos({ aweme_list: [{ aweme_id: "2", desc: "", statistics: {}, video: { duration: 1000 } }] }, "a");
    expect(v.subtitleUrl).toBeUndefined();
    expect("audioKind" in v).toBe(false);
  });

  it("Instagram: no caption track; has_audio / clips_metadata.audio_type give the audio kind (real payload keys)", () => {
    expect(audioKindOf({ has_audio: false })).toBe("none");
    expect(audioKindOf({ has_audio: true, clips_metadata: { audio_type: "licensed_music" } })).toBe("music");
    expect(audioKindOf({ has_audio: true, clips_metadata: { audio_type: "original_sounds" } })).toBe("original");
    const posts = parseInstagramPosts({ items: [{ code: "C1", media_type: 2, caption: { text: "hi" }, has_audio: true, clips_metadata: { audio_type: "original_sounds" } }, { code: "P1", media_type: 1 }] });
    expect(posts[0].audioKind).toBe("original");
    expect(posts[1].audioKind).toBeUndefined();
  });

  it("captures a media URL for speech to text (TikTok play_addr, RapidAPI play, Instagram video_versions)", () => {
    expect(mediaUrlOf({ video: { play_addr: { url_list: ["https://v16.tiktokcdn.com/p.mp4"] } } })).toBe("https://v16.tiktokcdn.com/p.mp4");
    expect(mediaUrlOf({ play: "https://v.tiktokcdn.com/a.mp4" })).toBe("https://v.tiktokcdn.com/a.mp4");
    expect(mediaUrlOf({ video_versions: [{ url: "https://scontent.cdninstagram.com/v.mp4" }] })).toBe("https://scontent.cdninstagram.com/v.mp4");
    expect(mediaUrlOf({})).toBeUndefined();
  });

  it("normalizes language codes", () => {
    expect(normalizeLang("eng-US")).toBe("en");
    expect(normalizeLang("fra-FR")).toBe("fr");
    expect(normalizeLang("pt_BR")).toBe("pt");
    expect(normalizeLang("")).toBe("");
  });
});
