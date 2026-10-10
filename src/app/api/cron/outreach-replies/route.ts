// Reply detection cron (every 20 minutes, vercel.json). For each mailbox with
// contacts already emailed, reads INBOX over IMAP since the first send and
// matches messages to contacts (In-Reply-To / References with our Message-IDs,
// else the sender address). Replies stop the sequence for that contact; "stop"
// replies and bounces also suppress the address in every sequence of the brand.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { credentialsFromRow, getMailboxDriver } from "@/lib/mailbox-driver";
import { isBounceMessage, matchInboxMessages, type TrackedContact } from "@/lib/outreach-sequences-replies";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isMissingRelation } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RUN_BUDGET_MS = 240_000;
const LOOKBACK_DAYS = 45;

type ContactJoin = {
  id: string;
  creator_email: string;
  first_sent_at: string | null;
  history_id: string | null;
  sequence_id: string;
  outreach_sequences: { mailbox_id: string | null; user_id: string } | Array<{ mailbox_id: string | null; user_id: string }>;
};

function seqOf(c: ContactJoin) {
  return Array.isArray(c.outreach_sequences) ? c.outreach_sequences[0] : c.outreach_sequences;
}

async function suppressEverywhere(admin: SupabaseClient, ownerId: string, email: string, status: "unsubscribed" | "bounced") {
  const { data: seqs } = await admin.from("outreach_sequences").select("id").eq("user_id", ownerId);
  const ids = (seqs ?? []).map((s) => s.id as string);
  if (!ids.length) return;
  await admin
    .from("outreach_sequence_contacts")
    .update({ status, next_send_at: null, updated_at: new Date().toISOString() })
    .in("sequence_id", ids)
    .eq("creator_email", email)
    .in("status", ["pending", "sent"]);
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const started = Date.now();
  const now = new Date();
  const summary = { mailboxes: 0, messages: 0, replied: 0, unsubscribed: 0, bounced: 0, errors: 0 };

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: contacts, error } = await admin
    .from("outreach_sequence_contacts")
    .select("id, creator_email, first_sent_at, history_id, sequence_id, outreach_sequences!inner(mailbox_id, user_id)")
    .eq("status", "sent")
    .gte("first_sent_at", since)
    .limit(5000);
  // Auto outreach is parked: before its migration runs the tables do not exist. No-op quietly.
  if (error && isMissingRelation(error)) return NextResponse.json({ ok: true, skipped: "not_set_up" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const byMailbox = new Map<string, ContactJoin[]>();
  for (const c of (contacts ?? []) as unknown as ContactJoin[]) {
    const mailboxId = seqOf(c)?.mailbox_id;
    if (!mailboxId) continue;
    const list = byMailbox.get(mailboxId) ?? [];
    list.push(c);
    byMailbox.set(mailboxId, list);
  }
  if (!byMailbox.size) return NextResponse.json({ ok: true, ...summary });

  const { data: mailboxes } = await admin.from("email_mailboxes").select("*").in("id", Array.from(byMailbox.keys()));

  for (const mailbox of mailboxes ?? []) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const list = (byMailbox.get(mailbox.id as string) ?? []).filter((c) => seqOf(c)?.user_id === mailbox.user_id);
    if (!list.length) continue;
    summary.mailboxes += 1;

    const ids = list.map((c) => c.id);
    const messageIds = new Map<string, string[]>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: msgs } = await admin
        .from("outreach_messages")
        .select("contact_id, message_id")
        .in("contact_id", ids.slice(i, i + 300))
        .not("message_id", "is", null);
      for (const m of msgs ?? []) {
        const arr = messageIds.get(m.contact_id as string) ?? [];
        arr.push(String(m.message_id));
        messageIds.set(m.contact_id as string, arr);
      }
    }
    const tracked: TrackedContact[] = list.map((c) => ({
      id: c.id,
      email: c.creator_email.toLowerCase(),
      messageIds: messageIds.get(c.id) ?? [],
      firstSentAt: new Date(c.first_sent_at ?? now.toISOString()),
    }));
    const emails = new Set(tracked.map((t) => t.email));

    // Read from the earliest first send, but no further back than 2 days before the last check.
    const earliest = Math.min(...tracked.map((t) => t.firstSentAt.getTime()));
    const lastChecked = mailbox.last_checked_at ? new Date(mailbox.last_checked_at as string).getTime() - 2 * 86_400_000 : 0;
    const searchSince = new Date(Math.max(earliest - 86_400_000, lastChecked));

    try {
      const creds = credentialsFromRow(mailbox as Parameters<typeof credentialsFromRow>[0]);
      const inbox = await getMailboxDriver(String(mailbox.auth_type ?? "password")).fetchInbox(creds, {
        since: searchSince,
        maxMessages: 400,
        wantText: (m) => isBounceMessage(m) || emails.has(m.fromAddress),
      });
      summary.messages += inbox.length;
      const matches = matchInboxMessages(inbox, tracked);
      const contactById = new Map(list.map((c) => [c.id, c]));
      for (const match of matches) {
        const c = contactById.get(match.contactId);
        if (!c) continue;
        const at = (match.at ?? now).toISOString();
        await admin
          .from("outreach_sequence_contacts")
          .update({
            status: match.kind,
            next_send_at: null,
            replied_at: match.kind === "bounced" ? null : at,
            last_error: match.kind === "bounced" ? "Bounced" : null,
            updated_at: now.toISOString(),
          })
          .eq("id", c.id)
          .eq("status", "sent");
        if (c.history_id) {
          await admin
            .from("outreach_history")
            .update({
              status: match.kind === "bounced" ? "no_response" : "replied",
              follow_up_date: null,
              updated_at: now.toISOString(),
            })
            .eq("id", c.history_id)
            .eq("user_id", mailbox.user_id as string);
        }
        if (match.kind !== "replied") await suppressEverywhere(admin, mailbox.user_id as string, c.creator_email, match.kind);
        summary[match.kind] += 1;
      }
      await admin
        .from("email_mailboxes")
        .update({ last_checked_at: now.toISOString(), ...(mailbox.status === "connected" ? { last_error: null } : {}) })
        .eq("id", mailbox.id as string);
    } catch (e) {
      summary.errors += 1;
      await admin
        .from("email_mailboxes")
        .update({ last_error: `IMAP: ${(e as Error).message}`.slice(0, 500) })
        .eq("id", mailbox.id as string);
    }
  }

  return NextResponse.json({ ok: true, ...summary, ms: Date.now() - started });
}
