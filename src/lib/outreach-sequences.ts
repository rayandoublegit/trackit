// Automatic email outreach sequences: pure scheduling, threading and formatting
// logic (no I/O). Used by the API routes, the sender cron and the UI.

export type SequenceStatus = "draft" | "active" | "paused" | "done";
export type ContactStatus = "pending" | "sent" | "replied" | "bounced" | "unsubscribed" | "failed";
export type SequenceLang = "en" | "fr";
export type SequenceTone = "friendly" | "professional" | "casual" | "direct";

export type SequenceStep = {
  /** Days after the previous email (0 for the first email = as soon as the window opens). */
  delay_days: number;
};

export type SendWindow = {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** Local hour the window opens (inclusive), 0-23. */
  start_hour: number;
  /** Local hour the window closes (exclusive), 1-24. */
  end_hour: number;
  /** IANA time zone, e.g. Europe/Paris. */
  timezone: string;
};

export const MAX_FOLLOW_UPS = 3;
export const MAX_STEPS = 1 + MAX_FOLLOW_UPS;
export const MAX_SEND_ATTEMPTS = 3;
export const SPACING_MIN_SECONDS = 60;
export const SPACING_MAX_SECONDS = 180;
export const DEFAULT_STEPS: SequenceStep[] = [{ delay_days: 0 }, { delay_days: 3 }, { delay_days: 5 }];
export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  start_hour: 9,
  end_hour: 18,
  timezone: "Europe/Paris",
};
export const SEQUENCE_TONES: SequenceTone[] = ["friendly", "professional", "casual", "direct"];

// ── Normalisation ──────────────────────────────────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeSteps(raw: unknown): SequenceStep[] {
  const list = Array.isArray(raw) ? raw : [];
  const steps = list.slice(0, MAX_STEPS).map((s, i) => {
    const d = Math.round(Number((s as { delay_days?: unknown })?.delay_days));
    if (i === 0) return { delay_days: 0 };
    return { delay_days: Number.isFinite(d) ? Math.min(30, Math.max(1, d)) : 3 };
  });
  return steps.length ? steps : [{ delay_days: 0 }];
}

export function normalizeSendWindow(raw: unknown): SendWindow {
  const w = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SendWindow, unknown>>;
  const days = Array.isArray(w.days)
    ? Array.from(new Set(w.days.map((d) => Math.round(Number(d))).filter((d) => d >= 1 && d <= 7))).sort()
    : DEFAULT_SEND_WINDOW.days;
  let start = Math.round(Number(w.start_hour));
  let end = Math.round(Number(w.end_hour));
  if (!Number.isFinite(start) || start < 0 || start > 23) start = DEFAULT_SEND_WINDOW.start_hour;
  if (!Number.isFinite(end) || end < 1 || end > 24) end = DEFAULT_SEND_WINDOW.end_hour;
  if (end <= start) end = Math.min(24, start + 1);
  const tz = typeof w.timezone === "string" && isValidTimeZone(w.timezone) ? w.timezone : DEFAULT_SEND_WINDOW.timezone;
  return { days: days.length ? days : DEFAULT_SEND_WINDOW.days, start_hour: start, end_hour: end, timezone: tz };
}

export function normalizeTone(raw: unknown): SequenceTone {
  const t = String(raw ?? "").toLowerCase();
  return (SEQUENCE_TONES as string[]).includes(t) ? (t as SequenceTone) : "friendly";
}

export function normalizeLang(raw: unknown): SequenceLang {
  return String(raw ?? "").toLowerCase() === "fr" ? "fr" : "en";
}

// ── Send window ─────────────────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Local ISO weekday (1-7) and hour (0-23) of `date` in `timezone`. */
export function localWeekdayHour(date: Date, timezone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday, hour };
}

export function isWithinSendWindow(date: Date, window: SendWindow): boolean {
  const { weekday, hour } = localWeekdayHour(date, window.timezone);
  return window.days.includes(weekday) && hour >= window.start_hour && hour < window.end_hour;
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/**
 * First moment at or after `from` that falls inside the window, at quarter-hour
 * precision (windows open on the hour, so the result is exact on the hour).
 */
export function nextWindowOpening(from: Date, window: SendWindow): Date {
  if (isWithinSendWindow(from, window)) return from;
  let t = Math.ceil(from.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  // 8 days of quarter hours covers any weekly window.
  for (let i = 0; i < 8 * 24 * 4; i += 1) {
    const d = new Date(t);
    if (isWithinSendWindow(d, window)) return d;
    t += QUARTER_HOUR_MS;
  }
  return from;
}

/**
 * When the next step should go out: `delayDays` after `after`, moved forward
 * into the send window, plus up to `jitterMinutes` so a batch does not land on
 * the same minute. `random` is injectable for tests.
 */
export function computeNextSendAt(
  after: Date,
  delayDays: number,
  window: SendWindow,
  jitterMinutes = 0,
  random: () => number = Math.random,
): Date {
  const base = new Date(after.getTime() + Math.max(0, delayDays) * 24 * 60 * 60 * 1000);
  const jitter = Math.floor(random() * Math.max(0, jitterMinutes)) * 60 * 1000;
  return nextWindowOpening(new Date(base.getTime() + jitter), window);
}

// ── Pacing and daily limits ─────────────────────────────────────────────────────

export function randomSpacingSeconds(random: () => number = Math.random): number {
  return SPACING_MIN_SECONDS + Math.floor(random() * (SPACING_MAX_SECONDS - SPACING_MIN_SECONDS + 1));
}

export function remainingDailyCapacity(sentLast24h: number, dailyLimit: number): number {
  return Math.max(0, Math.floor(dailyLimit) - Math.max(0, Math.floor(sentLast24h)));
}

export type MailboxSendState = {
  id: string;
  status: string;
  daily_limit: number;
  next_send_at: string | null;
  sent_last_24h: number;
};

/** A mailbox may send now when connected, under its 24 h cap and past its spacing time. */
export function mailboxCanSendNow(m: MailboxSendState, now: Date): boolean {
  if (m.status !== "connected") return false;
  if (remainingDailyCapacity(m.sent_last_24h, m.daily_limit) <= 0) return false;
  if (m.next_send_at && new Date(m.next_send_at).getTime() > now.getTime()) return false;
  return true;
}

export type DueContactCandidate = {
  id: string;
  status: ContactStatus;
  next_send_at: string | null;
  step_index: number;
};

export function isContactDue(c: DueContactCandidate, now: Date, stepCount: number): boolean {
  if (c.status !== "pending" && c.status !== "sent") return false;
  if (!c.next_send_at) return false;
  if (c.step_index >= stepCount) return false;
  return new Date(c.next_send_at).getTime() <= now.getTime();
}

/** Oldest due contact first. */
export function pickDueContact<T extends DueContactCandidate>(contacts: T[], now: Date, stepCount: number): T | null {
  const due = contacts.filter((c) => isContactDue(c, now, stepCount));
  due.sort((a, b) => new Date(a.next_send_at!).getTime() - new Date(b.next_send_at!).getTime());
  return due[0] ?? null;
}

/** State of a contact after one of its steps was sent. */
export function advanceAfterSend(
  stepIndexSent: number,
  steps: SequenceStep[],
  sentAt: Date,
  window: SendWindow,
  random: () => number = Math.random,
): { step_index: number; next_send_at: string | null; status: ContactStatus } {
  const nextIndex = stepIndexSent + 1;
  if (nextIndex >= steps.length) return { step_index: nextIndex, next_send_at: null, status: "sent" };
  const next = computeNextSendAt(sentAt, steps[nextIndex].delay_days, window, 45, random);
  return { step_index: nextIndex, next_send_at: next.toISOString(), status: "sent" };
}

/** State after a failed send: retry later, or give up after MAX_SEND_ATTEMPTS. */
export function retryAfterFailure(
  attempts: number,
  now: Date,
  window: SendWindow,
): { attempts: number; status: ContactStatus | null; next_send_at: string | null } {
  const next = attempts + 1;
  if (next >= MAX_SEND_ATTEMPTS) return { attempts: next, status: "failed", next_send_at: null };
  const later = nextWindowOpening(new Date(now.getTime() + next * 60 * 60 * 1000), window);
  return { attempts: next, status: null, next_send_at: later.toISOString() };
}

// ── Threading ───────────────────────────────────────────────────────────────────

/** "Re: <subject>" without stacking prefixes. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

export function makeMessageId(fromEmail: string, uuid: string): string {
  const domain = (fromEmail.split("@")[1] || "trackit.local").toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return `<${uuid.replace(/[^a-zA-Z0-9-]/g, "")}.seq@${domain}>`;
}

export type ThreadHeaders = {
  subject: string;
  inReplyTo?: string;
  references?: string[];
};

/**
 * Headers for step `stepIndex`. The first email starts the thread; follow-ups
 * reply to the last email sent and reference every earlier one, with the same
 * subject prefixed "Re:", so they land in the same conversation.
 */
export function buildThreadHeaders(stepIndex: number, threadSubject: string, previousMessageIds: string[]): ThreadHeaders {
  const ids = previousMessageIds.filter(Boolean);
  if (stepIndex === 0 || ids.length === 0) return { subject: threadSubject };
  return { subject: replySubject(threadSubject), inReplyTo: ids[ids.length - 1], references: ids };
}

// ── Email body ──────────────────────────────────────────────────────────────────

export function optOutLine(lang: SequenceLang): string {
  return lang === "fr"
    ? "Si vous préférez ne plus recevoir nos messages, répondez simplement « stop » et nous ne vous écrirons plus."
    : "If you'd rather not hear from us, just reply \"stop\" and we won't email you again.";
}

/** Plain-text body: message, signature, then the opt-out sentence. */
export function composePlainText(body: string, signature: string, lang: SequenceLang): string {
  const parts = [body.trim()];
  if (signature.trim()) parts.push(signature.trim());
  parts.push(optOutLine(lang));
  return parts.join("\n\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Simple HTML version: paragraphs, line breaks, the opt-out line smaller and grey. */
export function composeHtml(body: string, signature: string, lang: SequenceLang): string {
  const para = (text: string) =>
    text
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px 0">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  const sig = signature.trim() ? para(signature) : "";
  return (
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">` +
    para(body) +
    sig +
    `<p style="margin:18px 0 0 0;font-size:12px;color:#8a8a8a">${escapeHtml(optOutLine(lang))}</p>` +
    `</div>`
  );
}

export function listUnsubscribeHeader(fromEmail: string): string {
  return `<mailto:${fromEmail}?subject=unsubscribe>`;
}

// ── Stats ───────────────────────────────────────────────────────────────────────

export type SequenceStats = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
  emails_sent: number;
};

export function summarizeContacts(contacts: Array<{ status: ContactStatus | string; sent_count?: number | null }>): SequenceStats {
  const stats: SequenceStats = { total: 0, pending: 0, sent: 0, replied: 0, bounced: 0, unsubscribed: 0, failed: 0, emails_sent: 0 };
  for (const c of contacts) {
    stats.total += 1;
    const s = c.status as ContactStatus;
    if (s in stats) (stats as Record<string, number>)[s] += 1;
    stats.emails_sent += Number(c.sent_count ?? 0) || 0;
  }
  return stats;
}

/** A sequence is finished when no contact has a step left to send. */
export function isSequenceFinished(contacts: Array<{ status: string; next_send_at: string | null }>): boolean {
  return contacts.every((c) => !((c.status === "pending" || c.status === "sent") && c.next_send_at));
}
