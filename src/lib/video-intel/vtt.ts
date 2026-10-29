import type { TranscriptSegment } from "./types";

// WEBVTT (TikTok captions, ScrapeCreators' TikTok transcript) to timed text.
// Tolerant: cue ids, settings after the timing, <c>/<v> tags, NOTE / STYLE /
// REGION blocks, CRLF, "mm:ss.mmm" or "hh:mm:ss.mmm" timings, commas as the
// decimal mark (SRT habit). Consecutive duplicate lines (rolling captions) are
// dropped.

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;

export function vttTime(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

export function parseVtt(raw: string): TranscriptSegment[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const blocks = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const out: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => TIMING.test(l));
    if (at < 0) continue; // header, NOTE, STYLE, REGION
    const m = lines[at].match(TIMING)!;
    const start = vttTime(m[1]);
    const end = vttTime(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text = decodeEntities(
      lines
        .slice(at + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (!text) continue;
    if (out.length && out[out.length - 1].text === text) {
      out[out.length - 1].end = Math.max(out[out.length - 1].end, end);
      continue;
    }
    out.push({ start: round(start), end: round(Math.max(end, start)), text });
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function segmentsText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // CJK has no spaces: count characters / 2 as a rough word count.
  const cjk = (t.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length;
  const spaced = t.replace(/[぀-ヿ㐀-鿿가-힯]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return spaced + Math.round(cjk / 2);
}

/**
 * Speaking pace in words per second, from the timed segments (speech time
 * only, first cue to last cue). Null when there is no timing or too little
 * speech to say anything (under 3 s or 5 words).
 */
export function speakingPace(segments: TranscriptSegment[]): number | null {
  if (!segments.length) return null;
  const words = wordCount(segmentsText(segments));
  const span = segments[segments.length - 1].end - segments[0].start;
  if (words < 5 || !(span >= 3)) return null;
  return Math.round((words / span) * 100) / 100;
}

/** The first ~3 seconds of speech (the spoken hook), or the first cue. */
export function openingText(segments: TranscriptSegment[], seconds = 3): string {
  if (!segments.length) return "";
  const t0 = segments[0].start;
  const first = segments.filter((s) => s.start - t0 < seconds);
  return segmentsText(first.length ? first : segments.slice(0, 1));
}
