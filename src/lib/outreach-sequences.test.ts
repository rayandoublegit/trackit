import { describe, expect, it } from "vitest";
import { friendlyMailboxError, guessPresetFromEmail, normalizeMailboxConnectInput } from "./mailbox-providers";
import {
  advanceAfterSend,
  buildThreadHeaders,
  composeHtml,
  composePlainText,
  computeNextSendAt,
  isSequenceFinished,
  isWithinSendWindow,
  localWeekdayHour,
  mailboxCanSendNow,
  makeMessageId,
  MAX_SEND_ATTEMPTS,
  nextWindowOpening,
  normalizeSendWindow,
  normalizeSteps,
  pickDueContact,
  randomSpacingSeconds,
  remainingDailyCapacity,
  replySubject,
  retryAfterFailure,
  summarizeContacts,
  type SendWindow,
} from "./outreach-sequences";

// Paris is UTC+2 in summer (CEST). 2026-10-07 is a Wednesday, 2026-10-10 a Saturday.
const PARIS: SendWindow = { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 18, timezone: "Europe/Paris" };
const at = (iso: string) => new Date(iso);

describe("send window", () => {
  it("reads the local weekday and hour in the window's time zone", () => {
    expect(localWeekdayHour(at("2026-10-07T07:30:00Z"), "Europe/Paris")).toEqual({ weekday: 3, hour: 9 });
    expect(localWeekdayHour(at("2026-10-07T07:30:00Z"), "America/New_York")).toEqual({ weekday: 3, hour: 3 });
  });

  it("is inside on a weekday during working hours only", () => {
    expect(isWithinSendWindow(at("2026-10-07T07:00:00Z"), PARIS)).toBe(true); // Wed 09:00
    expect(isWithinSendWindow(at("2026-10-07T06:59:00Z"), PARIS)).toBe(false); // Wed 08:59
    expect(isWithinSendWindow(at("2026-10-07T16:00:00Z"), PARIS)).toBe(false); // Wed 18:00 (end exclusive)
    expect(isWithinSendWindow(at("2026-10-10T10:00:00Z"), PARIS)).toBe(false); // Saturday
  });

  it("moves to the next opening: same day morning, next day, or Monday after a weekend", () => {
    expect(nextWindowOpening(at("2026-10-07T05:10:00Z"), PARIS).toISOString()).toBe("2026-10-07T07:00:00.000Z");
    expect(nextWindowOpening(at("2026-10-07T17:00:00Z"), PARIS).toISOString()).toBe("2026-10-08T07:00:00.000Z");
    expect(nextWindowOpening(at("2026-10-09T16:30:00Z"), PARIS).toISOString()).toBe("2026-10-12T07:00:00.000Z");
    const inside = at("2026-10-07T10:17:00Z");
    expect(nextWindowOpening(inside, PARIS)).toBe(inside);
  });

  it("normalises bad windows to safe defaults", () => {
    const w = normalizeSendWindow({ days: [9, 0, 2, 2], start_hour: 20, end_hour: 8, timezone: "Not/AZone" });
    expect(w.days).toEqual([2]);
    expect(w.end_hour).toBeGreaterThan(w.start_hour);
    expect(w.timezone).toBe("Europe/Paris");
    expect(normalizeSendWindow(null).days).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("next_send_at", () => {
  it("adds the step delay then lands inside the window", () => {
    // Sent Thursday 15:00 Paris, follow-up in 3 days -> Sunday 15:00 -> Monday 09:00.
    const next = computeNextSendAt(at("2026-10-08T13:00:00Z"), 3, PARIS, 0);
    expect(next.toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });

  it("keeps the same local time when that day is open, plus bounded jitter", () => {
    const base = computeNextSendAt(at("2026-10-05T08:00:00Z"), 2, PARIS, 0, () => 0);
    expect(base.toISOString()).toBe("2026-10-07T08:00:00.000Z");
    const jittered = computeNextSendAt(at("2026-10-05T08:00:00Z"), 2, PARIS, 45, () => 0.999);
    expect(jittered.getTime() - base.getTime()).toBe(44 * 60 * 1000);
  });

  it("advances step by step and stops after the last one", () => {
    const steps = normalizeSteps([{ delay_days: 0 }, { delay_days: 3 }]);
    const afterFirst = advanceAfterSend(0, steps, at("2026-10-07T08:00:00Z"), PARIS, () => 0);
    expect(afterFirst).toEqual({ step_index: 1, next_send_at: "2026-10-12T07:00:00.000Z", status: "sent" });
    // 3 days after Wed 10:00 = Sat -> Monday opening.
    const afterLast = advanceAfterSend(1, steps, at("2026-10-12T07:00:00Z"), PARIS);
    expect(afterLast).toEqual({ step_index: 2, next_send_at: null, status: "sent" });
  });

  it("caps steps at the first email + 3 follow-ups, first delay is always 0", () => {
    const steps = normalizeSteps([{ delay_days: 5 }, { delay_days: 0 }, { delay_days: 99 }, { delay_days: 2 }, { delay_days: 2 }]);
    expect(steps).toEqual([{ delay_days: 0 }, { delay_days: 1 }, { delay_days: 30 }, { delay_days: 2 }]);
    expect(normalizeSteps(undefined)).toEqual([{ delay_days: 0 }]);
  });

  it("retries failures a few times then gives up", () => {
    const now = at("2026-10-07T08:00:00Z");
    const first = retryAfterFailure(0, now, PARIS);
    expect(first.status).toBeNull();
    expect(first.attempts).toBe(1);
    expect(new Date(first.next_send_at!).getTime()).toBeGreaterThan(now.getTime());
    const last = retryAfterFailure(MAX_SEND_ATTEMPTS - 1, now, PARIS);
    expect(last).toEqual({ attempts: MAX_SEND_ATTEMPTS, status: "failed", next_send_at: null });
  });
});

describe("pacing and daily limit", () => {
  const now = at("2026-10-07T08:00:00Z");
  const mailbox = { id: "m", status: "connected", daily_limit: 40, next_send_at: null as string | null, sent_last_24h: 0 };

  it("spaces sends by 60 to 180 seconds", () => {
    expect(randomSpacingSeconds(() => 0)).toBe(60);
    expect(randomSpacingSeconds(() => 0.9999)).toBe(180);
    for (let i = 0; i < 200; i += 1) {
      const s = randomSpacingSeconds();
      expect(s).toBeGreaterThanOrEqual(60);
      expect(s).toBeLessThanOrEqual(180);
    }
  });

  it("respects the 24 h cap, the spacing time and the mailbox status", () => {
    expect(remainingDailyCapacity(39, 40)).toBe(1);
    expect(remainingDailyCapacity(45, 40)).toBe(0);
    expect(mailboxCanSendNow(mailbox, now)).toBe(true);
    expect(mailboxCanSendNow({ ...mailbox, sent_last_24h: 40 }, now)).toBe(false);
    expect(mailboxCanSendNow({ ...mailbox, next_send_at: "2026-10-07T08:01:00Z" }, now)).toBe(false);
    expect(mailboxCanSendNow({ ...mailbox, next_send_at: "2026-10-07T07:59:00Z" }, now)).toBe(true);
    expect(mailboxCanSendNow({ ...mailbox, status: "error" }, now)).toBe(false);
  });

  it("picks the oldest due contact that still has a step to send", () => {
    const contacts = [
      { id: "later", status: "pending" as const, next_send_at: "2026-10-07T07:50:00Z", step_index: 0 },
      { id: "future", status: "pending" as const, next_send_at: "2026-10-07T09:00:00Z", step_index: 0 },
      { id: "replied", status: "replied" as const, next_send_at: "2026-10-01T07:00:00Z", step_index: 1 },
      { id: "oldest", status: "sent" as const, next_send_at: "2026-10-07T07:00:00Z", step_index: 1 },
      { id: "finished", status: "sent" as const, next_send_at: "2026-10-01T07:00:00Z", step_index: 3 },
    ];
    expect(pickDueContact(contacts, now, 3)?.id).toBe("oldest");
    expect(pickDueContact(contacts.slice(1, 3), now, 3)).toBeNull();
  });

  it("summarises statuses and knows when a sequence is finished", () => {
    const rows = [
      { status: "sent", sent_count: 2, next_send_at: null },
      { status: "replied", sent_count: 1, next_send_at: null },
      { status: "pending", sent_count: 0, next_send_at: "2026-10-08T07:00:00Z" },
    ];
    expect(summarizeContacts(rows)).toMatchObject({ total: 3, sent: 1, replied: 1, pending: 1, emails_sent: 3 });
    expect(isSequenceFinished(rows)).toBe(false);
    expect(isSequenceFinished(rows.slice(0, 2))).toBe(true);
  });
});

describe("threading headers", () => {
  it("starts the thread with the first email", () => {
    expect(buildThreadHeaders(0, "Partnership idea", [])).toEqual({ subject: "Partnership idea" });
  });

  it("replies to the last email and references all earlier ones", () => {
    const ids = ["<a.seq@brand.com>", "<b.seq@brand.com>"];
    expect(buildThreadHeaders(2, "Partnership idea", ids)).toEqual({
      subject: "Re: Partnership idea",
      inReplyTo: "<b.seq@brand.com>",
      references: ids,
    });
  });

  it("never stacks Re: prefixes", () => {
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
    expect(replySubject("RE:Hello")).toBe("RE:Hello");
    expect(replySubject("Hello")).toBe("Re: Hello");
  });

  it("makes RFC-style Message-IDs on the sender's domain", () => {
    expect(makeMessageId("alex@Brand.com", "1234-abcd")).toBe("<1234-abcd.seq@brand.com>");
  });
});

describe("email body", () => {
  it("adds the signature and an opt-out sentence in the email language", () => {
    const en = composePlainText("Hi Mia,\n\nLove your routines.", "Alex\nBrand", "en");
    expect(en).toContain("Alex\nBrand");
    expect(en.endsWith("just reply \"stop\" and we won't email you again.")).toBe(true);
    expect(composePlainText("Bonjour", "", "fr")).toContain("répondez simplement « stop »");
  });

  it("escapes HTML and keeps paragraphs", () => {
    const html = composeHtml("Hi <b>Mia</b>,\n\nLine 2", "", "en");
    expect(html).toContain("&lt;b&gt;Mia&lt;/b&gt;");
    expect(html.match(/<p /g)?.length).toBe(3); // 2 paragraphs + opt-out
  });
});

describe("mailbox presets", () => {
  it("guesses the provider from the address", () => {
    expect(guessPresetFromEmail("a@gmail.com")).toBe("gmail");
    expect(guessPresetFromEmail("a@hotmail.fr")).toBe("outlook");
    expect(guessPresetFromEmail("a@brand.com")).toBe("custom");
  });

  it("fills preset servers, defaults the username and clamps the daily limit", () => {
    const res = normalizeMailboxConnectInput({ preset: "outlook", fromEmail: " Alex@Brand.com ", password: "pw", dailyLimit: 9999 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      provider: "outlook",
      fromEmail: "alex@brand.com",
      username: "alex@brand.com",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
      imapHost: "outlook.office365.com",
      dailyLimit: 500,
    });
  });

  it("rejects missing passwords and bad hosts", () => {
    expect(normalizeMailboxConnectInput({ preset: "gmail", fromEmail: "a@gmail.com" })).toEqual({ ok: false, error: "missing_password" });
    expect(normalizeMailboxConnectInput({ preset: "custom", fromEmail: "a@b.com", password: "x", smtpHost: "localhost" })).toEqual({ ok: false, error: "invalid_smtp" });
  });

  it("explains common SMTP failures", () => {
    expect(friendlyMailboxError("534-5.7.9 Application-specific password required")).toMatch(/app password/);
    expect(friendlyMailboxError("Invalid login: 535 Authentication failed", "fr")).toMatch(/mot de passe/);
  });
});
