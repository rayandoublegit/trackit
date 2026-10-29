"use client";

import { useEffect, useRef, useState } from "react";
import { openPlanUpgrade } from "@/lib/plan-upgrade-events";
import type { Lang } from "@/lib/useLang";
import {
  BAND_LABELS,
  DIMENSION_LABELS,
  FORMAT_LABELS,
  HOOK_LABELS,
  insightLabel,
  type CreatorInsightsResponse,
  type InsightPattern,
  type InsightVideoRef,
  type TranscriptResponse,
  type VideoInsightBrief,
} from "@/lib/video-intel/client-types";
import "./creator-insights.css";

// "Why their videos work" on the creator page, plus the small pieces the video
// cards reuse (insight badges, transcript viewer). Real data only
// (/api/creator-insights); honest "analysis in progress" states; Free sees a
// blurred block and the upgrade modal.

const label = (table: Record<string, [string, string]>, key: string, fr: boolean) => (table[key] ?? [key.replace(/_/g, " "), key.replace(/_/g, " ")])[fr ? 1 : 0];

function ratioText(r: number | null | undefined, fr: boolean): string {
  if (r == null || !Number.isFinite(r)) return "—";
  const v = r >= 10 ? Math.round(r).toString() : r.toFixed(1);
  return `×${fr ? v.replace(".", ",") : v}`;
}

function Icon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Hook type and format badges (+ how the video did against the creator's usual views). */
export function VideoInsightBadges({ insight, lang, showHook = true }: { insight: VideoInsightBrief; lang: Lang; showHook?: boolean }) {
  const fr = lang === "fr";
  return (
    <span className="ci-badges">
      {showHook && insight.hook ? <span className="ci-hook" title={fr ? "Accroche" : "Hook"}>“{insight.hook}”</span> : null}
      <span className="ci-badge is-hook">{label(HOOK_LABELS, insight.hookType, fr)}</span>
      <span className="ci-badge">{label(FORMAT_LABELS, insight.format, fr)}</span>
      {insight.band ? (
        <span className={`ci-badge is-band is-${insight.band}`} title={fr ? "Vues comparées aux vues habituelles du créateur" : "Views against the creator's usual views"}>
          {label(BAND_LABELS, insight.band, fr)} {insight.ratio != null ? ratioText(insight.ratio, fr) : ""}
        </span>
      ) : null}
    </span>
  );
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Transcript of one video, loaded when opened. */
export function TranscriptViewer({ platform, videoId, lang, onClose }: { platform: string; videoId: string; lang: Lang; onClose: () => void }) {
  const fr = lang === "fr";
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "locked">("loading");
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let off = false;
    fetch(`/api/creator-insights?transcript=${encodeURIComponent(`${platform}:${videoId}`)}`)
      .then(async (r) => {
        if (off) return;
        if (r.status === 402) return setState("locked");
        if (!r.ok) return setState("none");
        setData((await r.json()) as TranscriptResponse);
        setState("ready");
      })
      .catch(() => !off && setState("none"));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      off = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [platform, videoId]);
  return (
    <div className="ci-modal" role="dialog" aria-modal="true" aria-label={fr ? "Transcription" : "Transcript"} onClick={onClose}>
      <div className="ci-modal__card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{fr ? "Transcription" : "Transcript"}</h3>
          <button type="button" onClick={onClose} aria-label={fr ? "Fermer" : "Close"}>
            <Icon d="M18 6 6 18M6 6l12 12" size={16} />
          </button>
        </header>
        {state === "loading" ? <div className="ci-skel"><i /><i /><i /></div> : null}
        {state === "locked" ? <p className="ci-muted">{fr ? "Les transcriptions sont incluses dès Growth." : "Transcripts are included from Growth."}</p> : null}
        {state === "none" ? <p className="ci-muted">{fr ? "Pas encore de transcription pour cette vidéo." : "No transcript for this video yet."}</p> : null}
        {state === "ready" && data ? (
          data.status !== "ok" ? (
            <p className="ci-muted">
              {data.status === "no_speech" ? (fr ? "Pas de parole dans cette vidéo (musique ou visuel seul)." : "No speech in this video (music or visuals only).") : fr ? "Transcription indisponible pour cette vidéo." : "Transcript unavailable for this video."}
            </p>
          ) : (
            <>
              <p className="ci-muted">
                {data.wordCount} {fr ? "mots" : "words"}
                {data.language ? ` · ${data.language.toUpperCase()}` : ""}
              </p>
              <ol className="ci-transcript">
                {(data.segments.length ? data.segments : [{ start: 0, end: 0, text: data.text }]).map((s, i) => (
                  <li key={i}>
                    {data.segments.length ? <time>{fmtTime(s.start)}</time> : null}
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

function PatternRow({ p, fr, i }: { p: InsightPattern; fr: boolean; i: number }) {
  const up = p.lift >= 1;
  const title = (fr ? p.title_fr : p.title_en) || `${label(DIMENSION_LABELS, p.dimension, fr)} : ${insightLabel(p.dimension, p.value, fr)}`;
  const rec = fr ? p.recommendation_fr : p.recommendation_en;
  return (
    <li className="ci-pattern" style={{ ["--i" as string]: i }}>
      <span className={`ci-lift${up ? " is-up" : " is-down"}`} title={fr ? "Vues médianes de ces vidéos comparées à la médiane du créateur" : "Median views of these videos against the creator's median"}>
        {ratioText(p.lift, fr)}
      </span>
      <div className="ci-pattern__body">
        <strong>{title}</strong>
        <span className="ci-pattern__meta">
          {label(DIMENSION_LABELS, p.dimension, fr)} · {insightLabel(p.dimension, p.value, fr)} · {p.videos} {fr ? (p.videos < 2 ? "vidéo" : "vidéos") : p.videos < 2 ? "video" : "videos"} ·{" "}
          {fr ? `${Math.round(p.winShare * 100)} % au-dessus de l'habitude` : `${Math.round(p.winShare * 100)}% above usual`}
        </span>
        {rec ? <span className="ci-pattern__rec">{rec}</span> : null}
      </div>
    </li>
  );
}

function VideoRefRow({ v, fr, kind, onTranscript }: { v: InsightVideoRef; fr: boolean; kind: "best" | "worst"; onTranscript: (id: string) => void }) {
  return (
    <li className={`ci-ref is-${kind}`}>
      <span className={`ci-ref__ratio is-${v.band ?? "normal"}`}>{ratioText(v.ratio, fr)}</span>
      <div className="ci-ref__body">
        {v.hook ? <span className="ci-hook">“{v.hook}”</span> : <span className="ci-muted">{fr ? "Pas d'accroche parlée" : "No spoken hook"}</span>}
        <span className="ci-badges">
          <span className="ci-badge is-hook">{label(HOOK_LABELS, v.hookType, fr)}</span>
          <span className="ci-badge">{label(FORMAT_LABELS, v.format, fr)}</span>
        </span>
      </div>
      <span className="ci-ref__actions">
        <button type="button" onClick={() => onTranscript(v.videoId)} title={fr ? "Voir la transcription" : "See the transcript"}>
          <Icon d="M4 6h16M4 12h16M4 18h10" />
        </button>
        {v.shareUrl ? (
          <a href={v.shareUrl} target="_blank" rel="noreferrer" title={fr ? "Ouvrir la vidéo" : "Open video"}>
            <Icon d="M7 17L17 7M9 7h8v8" />
          </a>
        ) : null}
      </span>
    </li>
  );
}

export function CreatorContentInsights({ username, lang, onInsights }: { username: string; lang: Lang; onInsights?: (videos: Record<string, VideoInsightBrief>, platform: string) => void }) {
  const fr = lang === "fr";
  const [data, setData] = useState<CreatorInsightsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setData(null);
    setFailed(false);
    fetch(`/api/creator-insights?username=${encodeURIComponent(username)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as CreatorInsightsResponse;
        if (off) return;
        setData(d);
        onInsights?.(d.videos ?? {}, d.platform);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
    // onInsights is a setter from the parent; reloading on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  if (failed) return null;
  const title = fr ? "Pourquoi ses vidéos marchent" : "Why their videos work";

  return (
    <section className="cp-card ci">
      <header className="cp-card__head">
        <h2>
          <Icon d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" size={15} /> {title}
        </h2>
        {data?.synthesis ? (
          <span className="cp-card__note">
            {data.synthesis.videosAnalysed} {fr ? "vidéos analysées" : "videos analysed"}
          </span>
        ) : null}
      </header>

      {!data ? (
        <div className="ci-skel"><i /><i /><i /></div>
      ) : data.locked ? (
        <div className="ci-locked">
          <div className="ci-locked__blur" aria-hidden>
            <p>████████ ██████ ████ ███████ ██ ████████ ████ ███ ██████████ ███████.</p>
            <ul>
              <li>×█,█ ███████ ██████ ████</li>
              <li>×█,█ ████ ██ ███████████</li>
              <li>×█,█ ██████ ███████</li>
            </ul>
          </div>
          <div className="ci-locked__cta">
            <strong>{fr ? "Accroches, formats et tendances mesurés sur ses propres vues" : "Hooks, formats and patterns measured on their own views"}</strong>
            <span>
              {data.teaser?.analysed
                ? fr
                  ? `${data.teaser.analysed} vidéos de ce créateur déjà analysées.`
                  : `${data.teaser.analysed} of this creator's videos already analysed.`
                : fr
                  ? "Transcriptions et analyse de chaque vidéo, dès Growth."
                  : "Transcripts and analysis of every video, from Growth."}
            </span>
            <button type="button" className="ci-btn" onClick={() => openPlanUpgrade("video-insights")}>
              {fr ? "Débloquer avec Growth" : "Unlock with Growth"}
            </button>
          </div>
        </div>
      ) : !data.synthesis ? (
        <div className="ci-pending">
          <span className="ci-pulse" aria-hidden />
          <div>
            <strong>{fr ? "Analyse en cours" : "Analysis in progress"}</strong>
            <span>
              {data.progress.analysed
                ? fr
                  ? `${data.progress.analysed} vidéos analysées sur ${Math.max(data.progress.tracked, data.progress.analysed)}. La synthèse apparaît à partir de 6 vidéos analysées.`
                  : `${data.progress.analysed} of ${Math.max(data.progress.tracked, data.progress.analysed)} videos analysed. The summary appears once 6 videos are analysed.`
                : fr
                  ? "Les vidéos de ce créateur sont en file d'attente : transcription puis analyse de chaque vidéo."
                  : "This creator's videos are queued: each one is transcribed, then analysed."}
            </span>
            {data.progress.tracked ? (
              <span className="ci-progress"><i style={{ width: `${Math.min(100, Math.round((data.progress.analysed / Math.max(1, data.progress.tracked)) * 100))}%` }} /></span>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {(fr ? data.synthesis.summaryFr : data.synthesis.summaryEn) ? <p className="ci-summary">{fr ? data.synthesis.summaryFr : data.synthesis.summaryEn}</p> : null}
          {data.synthesis.patterns.length ? (
            <ol className="ci-patterns">
              {data.synthesis.patterns.map((p, i) => (
                <PatternRow key={p.id} p={p} fr={fr} i={i} />
              ))}
            </ol>
          ) : null}
          <div className="ci-refs">
            {data.synthesis.best.length ? (
              <div>
                <h3>{fr ? "Ses meilleures vidéos" : "Best videos"}</h3>
                <ul>
                  {data.synthesis.best.map((v) => (
                    <VideoRefRow key={v.videoId} v={v} fr={fr} kind="best" onTranscript={setTranscript} />
                  ))}
                </ul>
              </div>
            ) : null}
            {data.synthesis.worst.length ? (
              <div>
                <h3>{fr ? "Ses vidéos les moins vues" : "Weakest videos"}</h3>
                <ul>
                  {data.synthesis.worst.map((v) => (
                    <VideoRefRow key={v.videoId} v={v} fr={fr} kind="worst" onTranscript={setTranscript} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <p className="ci-muted">
            {fr
              ? "×1 = les vues habituelles du créateur (médiane de ses vidéos). Chiffres calculés sur ses vidéos suivies ; le texte les explique."
              : "×1 = the creator's usual views (median of their videos). Numbers are computed from their tracked videos; the text explains them."}
          </p>
        </>
      )}
      {transcript && data ? <TranscriptViewer platform={data.platform} videoId={transcript} lang={lang} onClose={() => setTranscript(null)} /> : null}
    </section>
  );
}
