// Sender cron (every 10 minutes, vercel.json). For each connected mailbox with
// active sequences: inside the send window, under its 24 h cap and past its
// random 60-180 s spacing time, send ONE due step. Pacing is spread across runs
// (no long sleeps): a mailbox sends at most one email per run.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { credentialsFromRow, getMailboxDriver } from "@/lib/mailbox-driver";
import {
  advanceAfterSend,
  buildThreadHeaders,
  composeHtml,
  composePlainText,
  isSequenceFinished,
  isWithinSendWindow,
  listUnsubscribeHeader,
  mailboxCanSendNow,
  makeMessageId,
  MAX_SEND_ATTEMPTS,
  normalizeLang,
  normalizeSendWindow,
  normalizeSteps,
  normalizeTone,
  pickDueContact,
  randomSpacingSeconds,
  retryAfterFailure,
  type ContactStatus,
  type SendWindow,
  type SequenceStep,
} from "@/lib/outreach-sequences";
import type { CreatorFacts } from "@/lib/outreach-sequences-prompt";
import {
  generateSequenceEmail,
  GenerationError,
  insertHistoryRow,
  loadCreatorFacts,
  planForOwner,
  type SavedFallback,
} from "@/lib/outreach-sequences-server";
import { canUseAIOutreach } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isMissingRelation } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RUN_BUDGET_MS = 240_000;
const CLAIM_MINUTES = 15;

type SequenceRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  mailbox_id: string | null;
  brand_pitch: string;
  tone: string;
  lang: string;
  steps: unknown;
  send_window: unknown;
};

type ContactRow = {
  id: string;
  sequence_id: string;
  creator_username: string;
  platform: string;
  creator_email: string;
  creator_name: string;
  personalization: Record<string, unknown> | null;
  step_index: number;
  next_send_at: string | null;
  status: ContactStatus;
  thread_subject: string | null;
  sent_count: number;
  attempts: number;
  history_id: string | null;
  first_sent_at: string | null;
};

function dateOnly(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

async function sentLast24h(admin: SupabaseClient, mailboxId: string, now: Date): Promise<number> {
  const { count } = await admin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("mailbox_id", mailboxId)
    .not("sent_at", "is", null)
    .gte("sent_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  return count ?? 0;
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const started = Date.now();
  const summary = { mailboxes: 0, sent: 0, failed: 0, skipped: 0, paused_for_plan: 0, finished: 0 };

  const { data: sequences, error } = await admin
    .from("outreach_sequences")
    .select("id, user_id, workspace_id, mailbox_id, brand_pitch, tone, lang, steps, send_window")
    .eq("status", "active")
    .not("mailbox_id", "is", null)
    .limit(1000);
  // Auto outreach is parked: before its migration runs the tables do not exist. No-op quietly.
  if (error && isMissingRelation(error)) return NextResponse.json({ ok: true, skipped: "not_set_up" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!sequences?.length) return NextResponse.json({ ok: true, ...summary });

  // Plans can lapse: pause the sequences of owners who lost AI outreach.
  const allowedOwners = new Set<string>();
  for (const owner of new Set(sequences.map((s) => s.user_id as string))) {
    if (canUseAIOutreach(await planForOwner(admin, owner))) allowedOwners.add(owner);
  }
  const blocked = sequences.filter((s) => !allowedOwners.has(s.user_id as string)).map((s) => s.id as string);
  if (blocked.length) {
    await admin.from("outreach_sequences").update({ status: "paused", updated_at: new Date().toISOString() }).in("id", blocked);
    summary.paused_for_plan = blocked.length;
  }
  const live = (sequences as SequenceRow[]).filter((s) => allowedOwners.has(s.user_id));

  const byMailbox = new Map<string, SequenceRow[]>();
  for (const s of live) {
    const list = byMailbox.get(s.mailbox_id!) ?? [];
    list.push(s);
    byMailbox.set(s.mailbox_id!, list);
  }
  const { data: mailboxes } = await admin.from("email_mailboxes").select("*").in("id", Array.from(byMailbox.keys()));

  for (const mailbox of (mailboxes ?? []).sort(() => Math.random() - 0.5)) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    summary.mailboxes += 1;
    const now = new Date();
    const state = {
      id: mailbox.id as string,
      status: mailbox.status as string,
      daily_limit: Number(mailbox.daily_limit) || 40,
      next_send_at: (mailbox.next_send_at as string | null) ?? null,
      sent_last_24h: await sentLast24h(admin, mailbox.id, now),
    };
    if (!mailboxCanSendNow(state, now)) {
      summary.skipped += 1;
      continue;
    }

    // Only sequences that belong to the mailbox's owner and are inside their window now.
    const open = (byMailbox.get(mailbox.id) ?? []).filter(
      (s) => s.user_id === mailbox.user_id && isWithinSendWindow(now, normalizeSendWindow(s.send_window)),
    );
    if (!open.length) continue;
    const seqById = new Map(open.map((s) => [s.id, s]));
    const stepsById = new Map(open.map((s) => [s.id, normalizeSteps(s.steps)]));

    const { data: due } = await admin
      .from("outreach_sequence_contacts")
      .select("*")
      .in("sequence_id", open.map((s) => s.id))
      .in("status", ["pending", "sent"])
      .lte("next_send_at", now.toISOString())
      .order("next_send_at", { ascending: true })
      .limit(10);
    const candidates = ((due ?? []) as ContactRow[]).filter(
      (c) => c.step_index < (stepsById.get(c.sequence_id)?.length ?? 0),
    );
    const contact = pickDueContact(candidates, now, Number.MAX_SAFE_INTEGER);
    if (!contact) continue;

    // Claim the contact so an overlapping run cannot send the same step twice.
    const claimUntil = new Date(now.getTime() + CLAIM_MINUTES * 60 * 1000).toISOString();
    const { data: claimed } = await admin
      .from("outreach_sequence_contacts")
      .update({ next_send_at: claimUntil })
      .eq("id", contact.id)
      .eq("next_send_at", contact.next_send_at!)
      .select("id");
    if (!claimed?.length) continue;

    const sequence = seqById.get(contact.sequence_id)!;
    const steps = stepsById.get(contact.sequence_id)!;
    const window = normalizeSendWindow(sequence.send_window);
    const result = await sendStep(admin, mailbox, sequence, steps, window, contact, now);
    if (result === "sent") summary.sent += 1;
    else summary.failed += 1;
  }

  // Close sequences with nothing left to send.
  for (const s of live) {
    const { data: rest } = await admin
      .from("outreach_sequence_contacts")
      .select("status, next_send_at")
      .eq("sequence_id", s.id)
      .in("status", ["pending", "sent"])
      .not("next_send_at", "is", null)
      .limit(1);
    if (isSequenceFinished((rest ?? []) as Array<{ status: string; next_send_at: string | null }>)) {
      const { count } = await admin
        .from("outreach_sequence_contacts")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", s.id);
      if ((count ?? 0) > 0) {
        await admin.from("outreach_sequences").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", s.id).eq("status", "active");
        summary.finished += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary, ms: Date.now() - started });
}

async function sendStep(
  admin: SupabaseClient,
  mailbox: Record<string, unknown>,
  sequence: SequenceRow,
  steps: SequenceStep[],
  window: SendWindow,
  contact: ContactRow,
  now: Date,
): Promise<"sent" | "failed"> {
  const stepIndex = contact.step_index;
  const lang = normalizeLang(sequence.lang);
  const p = { ...(contact.personalization ?? {}) };

  // Earlier emails of this thread (for the follow-up prompt and threading headers).
  const { data: previous } = await admin
    .from("outreach_messages")
    .select("step_index, subject, body, message_id")
    .eq("contact_id", contact.id)
    .not("sent_at", "is", null)
    .order("step_index", { ascending: true });
  const sentBefore = previous ?? [];
  const first = sentBefore.find((m) => m.step_index === 0);

  let subject = "";
  let body = "";
  let optOutLang = lang;
  try {
    const facts: CreatorFacts =
      (p.facts as CreatorFacts | undefined) ??
      (await loadCreatorFacts(admin, contact.creator_username, contact.platform, lang, (p.saved as SavedFallback | null) ?? null));
    const draft = p.draft as { subject?: string; body?: string; optOutLang?: "en" | "fr" } | undefined;
    if (stepIndex === 0 && draft?.subject && draft?.body) {
      subject = draft.subject;
      body = draft.body;
      optOutLang = draft.optOutLang ?? lang;
    } else {
      const generated = await generateSequenceEmail({
        facts,
        brandPitch: sequence.brand_pitch,
        tone: normalizeTone(sequence.tone),
        sequenceLang: lang,
        senderName: String(mailbox.from_name ?? ""),
        stepIndex,
        firstSubject: first?.subject ?? contact.thread_subject ?? "",
        firstBody: first?.body ?? "",
      });
      subject = generated.subject;
      body = generated.body;
      optOutLang = generated.optOutLang;
    }
    if (!p.facts) p.facts = facts;
  } catch (e) {
    const permanent = e instanceof GenerationError && (e.code === "unsupported_numbers" || e.code === "ai_refused");
    return recordFailure(admin, contact, window, now, (e as Error).message, permanent, null, stepIndex);
  }

  const threadSubject = contact.thread_subject || subject;
  const headers = buildThreadHeaders(
    stepIndex,
    threadSubject,
    sentBefore.map((m) => String(m.message_id ?? "")).filter(Boolean),
  );
  const signature = String(mailbox.signature ?? "");
  const messageId = makeMessageId(String(mailbox.from_email), randomUUID());

  let creds: ReturnType<typeof credentialsFromRow>;
  try {
    creds = credentialsFromRow(mailbox as Parameters<typeof credentialsFromRow>[0]);
  } catch (e) {
    // Missing or undecryptable password (e.g. MAILBOX_ENCRYPTION_KEY changed).
    await admin
      .from("email_mailboxes")
      .update({ status: "error", last_error: (e as Error).message.slice(0, 500), last_checked_at: now.toISOString() })
      .eq("id", mailbox.id as string);
    await admin.from("outreach_sequence_contacts").update({ next_send_at: contact.next_send_at }).eq("id", contact.id);
    return "failed";
  }

  try {
    await getMailboxDriver(String(mailbox.auth_type ?? "password")).send(creds, {
      to: contact.creator_email,
      toName: contact.creator_name || undefined,
      subject: headers.subject,
      text: composePlainText(body, signature, optOutLang),
      html: composeHtml(body, signature, optOutLang),
      messageId,
      inReplyTo: headers.inReplyTo,
      references: headers.references,
      listUnsubscribe: listUnsubscribeHeader(String(mailbox.from_email)),
    });
  } catch (e) {
    const err = e as Error & { code?: string; responseCode?: number };
    const authProblem = err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534;
    if (authProblem) {
      // Credentials stopped working: stop this mailbox until the brand reconnects it.
      await admin
        .from("email_mailboxes")
        .update({ status: "error", last_error: err.message.slice(0, 500), last_checked_at: now.toISOString() })
        .eq("id", mailbox.id as string);
      await admin.from("outreach_sequence_contacts").update({ next_send_at: contact.next_send_at }).eq("id", contact.id);
      return "failed";
    }
    // 5xx recipient errors (550 user unknown…) are permanent for this address.
    const permanent = typeof err.responseCode === "number" && err.responseCode >= 550 && err.responseCode < 560;
    return recordFailure(admin, contact, window, now, err.message, permanent, mailbox.id as string, stepIndex, {
      subject: headers.subject,
      body,
    });
  }

  const sentAt = new Date();
  const next = advanceAfterSend(stepIndex, steps, sentAt, window);
  await admin.from("outreach_messages").insert({
    contact_id: contact.id,
    mailbox_id: mailbox.id,
    step_index: stepIndex,
    subject: headers.subject,
    body,
    message_id: messageId,
    sent_at: sentAt.toISOString(),
  });

  let historyId = contact.history_id;
  if (!historyId) {
    historyId = await insertHistoryRow(admin, {
      user_id: sequence.user_id,
      workspace_id: sequence.workspace_id,
      creator_username: contact.creator_username,
      creator_display_name: contact.creator_name,
      message: `${headers.subject}\n\n${body}`,
      follow_up_date: dateOnly(next.next_send_at),
    });
  } else {
    await admin
      .from("outreach_history")
      .update({ follow_up_date: dateOnly(next.next_send_at), updated_at: sentAt.toISOString() })
      .eq("id", historyId)
      .eq("user_id", sequence.user_id);
  }

  await admin
    .from("outreach_sequence_contacts")
    .update({
      ...next,
      personalization: p,
      last_message_id: messageId,
      thread_subject: threadSubject,
      sent_count: (contact.sent_count ?? 0) + 1,
      attempts: 0,
      last_error: null,
      history_id: historyId,
      first_sent_at: contact.first_sent_at ?? sentAt.toISOString(),
      last_sent_at: sentAt.toISOString(),
      updated_at: sentAt.toISOString(),
    })
    .eq("id", contact.id);

  await admin
    .from("email_mailboxes")
    .update({ next_send_at: new Date(sentAt.getTime() + randomSpacingSeconds() * 1000).toISOString() })
    .eq("id", mailbox.id as string);
  return "sent";
}

async function recordFailure(
  admin: SupabaseClient,
  contact: ContactRow,
  window: SendWindow,
  now: Date,
  message: string,
  permanent: boolean,
  mailboxId: string | null,
  stepIndex: number,
  attempted?: { subject: string; body: string },
): Promise<"failed"> {
  // A follow-up that cannot go out ends the sequence for this contact; the
  // earlier emails were delivered, so the contact stays "sent".
  const giveUpStatus: ContactStatus = (contact.sent_count ?? 0) > 0 ? "sent" : "failed";
  let retry = permanent
    ? { attempts: MAX_SEND_ATTEMPTS, status: giveUpStatus as ContactStatus | null, next_send_at: null as string | null }
    : retryAfterFailure(contact.attempts ?? 0, now, window);
  if (retry.status === "failed" && giveUpStatus === "sent") retry = { ...retry, status: "sent" };
  await admin.from("outreach_messages").insert({
    contact_id: contact.id,
    mailbox_id: mailboxId,
    step_index: stepIndex,
    subject: attempted?.subject ?? "",
    body: attempted?.body ?? "",
    error: message.slice(0, 1000),
  });
  await admin
    .from("outreach_sequence_contacts")
    .update({
      attempts: retry.attempts,
      ...(retry.status ? { status: retry.status } : {}),
      next_send_at: retry.next_send_at,
      last_error: message.slice(0, 500),
      updated_at: now.toISOString(),
    })
    .eq("id", contact.id);
  return "failed";
}
