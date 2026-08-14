"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { MEETINGS_UPDATED_EVENT } from "@/lib/assistant-actions";
import { workspaceStorageKey } from "@/lib/workspaces";

type Meeting = {
  id: string;
  title: string;
  when: string;
  withWho: string;
  notes: string;
};

type Mode = "ai" | "calendar";

function storageKey(userId?: string) {
  return workspaceStorageKey(`trackit.planner.calls.${userId || "anon"}`);
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

export function MeetingsView({
  userId,
  isMobile,
  displayName,
}: {
  userId?: string;
  isMobile?: boolean;
  displayName?: string | null;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [mode, setMode] = useState<Mode>("ai");
  const [prompt, setPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftWhen, setDraftWhen] = useState("");
  const [draftWith, setDraftWith] = useState("");

  const firstName =
    (displayName || "").trim().split(/\s+/)[0] ||
    (fr ? "toi" : "there");

  const suggestions = useMemo(
    () =>
      fr
        ? [
            "Meeting demain à 14:00, appelle-le Brief campagne",
            "Call cuisine aujourd’hui à 16:30 avec @lena",
            "Follow-up payouts UI vendredi à 11:00",
          ]
        : [
            "Meeting tomorrow at 2pm, call it Campaign brief",
            "Kitchen call today at 4:30pm with @lena",
            "Follow-up on payouts UI Friday at 11am",
          ],
    [fr],
  );

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(storageKey(userId));
        if (raw) setMeetings(JSON.parse(raw) as Meeting[]);
      } catch {
        /* ignore */
      }
    };
    load();
    // Refresh when the assistant (Mino) adds a meeting while this view is kept alive.
    window.addEventListener(MEETINGS_UPDATED_EVENT, load);
    return () => window.removeEventListener(MEETINGS_UPDATED_EVENT, load);
  }, [userId]);

  const persist = (next: Meeting[]) => {
    setMeetings(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const addMeeting = (m: Omit<Meeting, "id">) => {
    persist([{ id: `${Date.now()}`, ...m }, ...meetings]);
  };

  const parsePrompt = async () => {
    const text = prompt.trim();
    if (!text || parsing) return;
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/parse-meeting", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        meeting?: { title: string; when: string; withWho: string; notes: string };
      };
      if (!res.ok || !data.ok || !data.meeting) {
        setError(data.error || (fr ? "Impossible de comprendre le meeting" : "Couldn’t parse the meeting"));
        return;
      }
      addMeeting({
        title: data.meeting.title,
        when: data.meeting.when,
        withWho: data.meeting.withWho,
        notes: data.meeting.notes,
      });
      setPrompt("");
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setParsing(false);
    }
  };

  const upcoming = useMemo(() => {
    return [...meetings]
      .map((m) => ({ ...m, ts: new Date(m.when).getTime() }))
      .filter((m) => !Number.isNaN(m.ts) && m.ts >= Date.now() - 60 * 60 * 1000)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 8);
  }, [meetings]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor]);

  const monthCells = useMemo(() => {
    const start = startOfMonth(monthAnchor);
    const gridStart = startOfWeek(start);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthAnchor]);

  const meetingsOnDay = (day: Date) =>
    meetings.filter((m) => {
      const d = new Date(m.when);
      return sameDay(d, day);
    });

  const meetingsByDayHour = (day: Date, hour: number) =>
    meetings.filter((m) => {
      const d = new Date(m.when);
      return sameDay(d, day) && d.getHours() === hour;
    });

  const openDraft = (slot: Date) => {
    setDraftWhen(toLocalInputValue(slot));
    setDraftTitle("");
    setDraftWith("");
    setDraftOpen(true);
  };

  const saveDraft = () => {
    if (!draftTitle.trim() || !draftWhen) return;
    addMeeting({
      title: draftTitle.trim(),
      when: draftWhen,
      withWho: draftWith.trim(),
      notes: "",
    });
    setDraftOpen(false);
  };

  return (
    <div className={`mtg-page${isMobile ? " is-mobile" : ""}`}>
      <div className="mtg-topbar">
        <div className="mtg-mode">
          <button type="button" className={mode === "ai" ? "is-active" : ""} onClick={() => setMode("ai")}>
            {fr ? "Prompt IA" : "AI prompt"}
          </button>
          <button
            type="button"
            className={mode === "calendar" ? "is-active" : ""}
            onClick={() => setMode("calendar")}
          >
            {fr ? "Manuel" : "Manual"}
          </button>
        </div>
      </div>

      {mode === "ai" ? (
        <div className="mtg-hero">
          <h1 className="mtg-hero__greet">
            {fr
              ? `Hey ${firstName} ! Prêt à plonger dans tes meetings ?`
              : `Hey ${firstName}! Ready to dive into your meetings?`}
          </h1>

          <div className="mtg-promptbox">
            <div className="mtg-promptbox__led" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </div>
            <div className="mtg-promptbox__glow" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </div>
            <div className="mtg-promptbox__inner">
              <div className="mtg-promptbox__row">
                <svg className="mtg-promptbox__search" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M16.2 16.2 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    fr
                      ? `Hey ${firstName}… décris ton meeting`
                      : `Hey ${firstName}… describe your meeting`
                  }
                  rows={isMobile ? 3 : 2}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void parsePrompt();
                    }
                  }}
                />
              </div>
              <div className="mtg-promptbox__bar">
                <span className="mtg-promptbox__meta">
                  {fr ? "Propulsé par" : "Powered by"}
                  <img src="/claude-logo.svg" alt="Claude" className="mtg-promptbox__claude" width={16} height={16} />
                </span>
                <button
                  type="button"
                  className="mtg-promptbox__send"
                  disabled={!prompt.trim() || parsing}
                  onClick={() => void parsePrompt()}
                  aria-label={fr ? "Ajouter le meeting" : "Add meeting"}
                >
                  {parsing ? (
                    "…"
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                      <path
                        d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error ? <p className="mtg-error">{error}</p> : null}

          <div className="mtg-chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="mtg-chip"
                onClick={() => {
                  setPrompt(s);
                  textareaRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mtg-upcoming">
            <div className="mtg-upcoming__label">{fr ? "À venir" : "Upcoming"}</div>
            {upcoming.length === 0 ? (
              <p className="mtg-upcoming__empty">
                {fr
                  ? "Il semblerait que vous n’ayez pas de meeting pour l’instant — le calendrier attend sa première entrée."
                  : "Looks like you don’t have any meetings yet — your calendar is waiting for its first one."}
              </p>
            ) : (
              <ul className="mtg-upcoming__list">
                {upcoming.map((m) => (
                  <li key={m.id}>
                    <time>
                      {new Date(m.when).toLocaleString(fr ? "fr-FR" : "en-US", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <div>
                      <strong>{m.title}</strong>
                      {m.withWho ? <span>{m.withWho}</span> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => persist(meetings.filter((x) => x.id !== m.id))}
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mtg-cal-wrap">
          <div className="mtg-cal-head">
            <h1>{fr ? "Calendrier" : "Calendar"}</h1>
            <p>
              {fr
                ? "Place tes meetings comme sur Google Calendar — clique un jour ou un créneau."
                : "Place meetings like Google Calendar — click a day or a time slot."}
            </p>
          </div>

          <div className="mtg-month">
            <div className="mtg-month__nav">
              <button type="button" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}>
                ←
              </button>
              <strong>
                {monthAnchor.toLocaleDateString(fr ? "fr-FR" : "en-US", { month: "long", year: "numeric" })}
              </strong>
              <button type="button" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}>
                →
              </button>
            </div>
            <div className="mtg-month__weekdays">
              {(fr ? ["L", "M", "M", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"]).map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
            </div>
            <div className="mtg-month__grid">
              {monthCells.map((day) => {
                const inMonth = day.getMonth() === monthAnchor.getMonth();
                const items = meetingsOnDay(day);
                const isToday = sameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`mtg-month__cell${!inMonth ? " is-muted" : ""}${isToday ? " is-today" : ""}`}
                    onClick={() => {
                      const slot = new Date(day);
                      slot.setHours(10, 0, 0, 0);
                      openDraft(slot);
                      setWeekAnchor(startOfWeek(day));
                    }}
                  >
                    <span className="mtg-month__num">{day.getDate()}</span>
                    {items.slice(0, 2).map((m) => (
                      <span key={m.id} className="mtg-month__dot" title={m.title}>
                        {m.title}
                      </span>
                    ))}
                    {items.length > 2 ? <span className="mtg-month__more">+{items.length - 2}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mtg-week">
            <div className="mtg-week__nav">
              <button type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
                ←
              </button>
              <button type="button" onClick={() => setWeekAnchor(startOfWeek(new Date()))}>
                {fr ? "Cette semaine" : "This week"}
              </button>
              <button type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
                →
              </button>
              <span>
                {weekDays[0].toLocaleDateString(fr ? "fr-FR" : "en-US", { day: "numeric", month: "short" })}
                {" – "}
                {weekDays[6].toLocaleDateString(fr ? "fr-FR" : "en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>

            <div className="mtg-week__grid">
              <div className="mtg-week__corner" />
              {weekDays.map((day) => (
                <div key={day.toISOString()} className={`mtg-week__dayhead${sameDay(day, new Date()) ? " is-today" : ""}`}>
                  <span>{day.toLocaleDateString(fr ? "fr-FR" : "en-US", { weekday: "short" })}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
              {HOURS.map((hour) => (
                <div key={hour} className="mtg-week__row">
                  <div className="mtg-week__hour">{`${String(hour).padStart(2, "0")}:00`}</div>
                  {weekDays.map((day) => {
                    const items = meetingsByDayHour(day, hour);
                    return (
                      <button
                        key={`${day.toISOString()}-${hour}`}
                        type="button"
                        className="mtg-week__cell"
                        onClick={() => {
                          const slot = new Date(day);
                          slot.setHours(hour, 0, 0, 0);
                          openDraft(slot);
                        }}
                      >
                        {items.map((m) => (
                          <span key={m.id} className="mtg-week__event">
                            {m.title}
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {draftOpen ? (
        <div className="mtg-draft" role="dialog" aria-modal="true">
          <div className="mtg-draft__card">
            <h3>{fr ? "Nouveau meeting" : "New meeting"}</h3>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={fr ? "Titre" : "Title"}
              autoFocus
            />
            <input type="datetime-local" value={draftWhen} onChange={(e) => setDraftWhen(e.target.value)} />
            <input
              value={draftWith}
              onChange={(e) => setDraftWith(e.target.value)}
              placeholder={fr ? "Avec qui ?" : "With whom?"}
            />
            <div className="mtg-draft__actions">
              <button type="button" onClick={() => setDraftOpen(false)}>
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button type="button" className="is-primary" disabled={!draftTitle.trim() || !draftWhen} onClick={saveDraft}>
                {fr ? "Ajouter" : "Add"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
