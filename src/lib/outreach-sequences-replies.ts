// Reply and bounce matching for sequence emails. Pure: the IMAP fetching lives in
// src/lib/mailbox-driver.ts; this decides what an inbox message means.

export type InboxMessage = {
  uid: number;
  date: Date | null;
  fromAddress: string;
  subject: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  /** Raw "References" header (space-separated message ids). */
  references?: string | null;
  /** Start of the decoded text (only fetched for bounce candidates and opt-out checks). */
  textSnippet?: string | null;
};

export type TrackedContact = {
  id: string;
  email: string;
  /** Message-IDs of every email we sent this contact. */
  messageIds: string[];
  firstSentAt: Date;
};

export type ReplyMatch = {
  contactId: string;
  kind: "replied" | "unsubscribed" | "bounced";
  uid: number;
  at: Date | null;
};

export function normalizeMessageId(id: string): string {
  const t = id.trim().toLowerCase();
  if (!t) return "";
  return t.startsWith("<") ? t : `<${t.replace(/>$/, "")}>`;
}

export function parseMessageIdList(header: string | null | undefined): string[] {
  if (!header) return [];
  const found = header.match(/<[^<>\s]+>/g);
  if (found && found.length) return found.map(normalizeMessageId);
  return header.split(/\s+/).filter(Boolean).map(normalizeMessageId);
}

export function isBounceMessage(m: Pick<InboxMessage, "fromAddress" | "subject">): boolean {
  const from = m.fromAddress.toLowerCase();
  if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(from)) return true;
  return /undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery (failed|subsystem)|returned mail|delivery has failed|non remis|échec de (la )?remise/i.test(
    m.subject,
  );
}

export function isAutoReply(m: Pick<InboxMessage, "subject">): boolean {
  return /^(auto(matic)? ?reply|out of (the )?office|absence|réponse automatique|automatische antwort)/i.test(m.subject.trim());
}

const QUOTE_MARKERS = [
  /^on .{3,200} wrote:\s*$/i,
  /^le .{3,200} a écrit\s*:?\s*$/i,
  /^-{2,}\s*(original message|message d'origine)\s*-{2,}/i,
  /^(from|de)\s*:\s/i,
  /^_{5,}/,
];

/** The new text of a reply: stops at the first quoted line or "On … wrote:" marker. */
export function stripQuotedReply(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(">")) break;
    if (QUOTE_MARKERS.some((re) => re.test(t))) break;
    out.push(line);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** "stop", "unsubscribe", "désinscrire"… in the new text of the reply (not the quoted email). */
export function isOptOutText(text: string | null | undefined): boolean {
  const head = stripQuotedReply(String(text ?? "")).slice(0, 300).toLowerCase();
  // Whole words, or French stems ("désinscrivez-moi", "désabonnez-moi").
  const word = /(^|[^\p{L}])(stop|unsubscribe|remove me|ne plus (me )?(contacter|écrire|ecrire))([^\p{L}]|$)/u;
  const stem = /(^|[^\p{L}])(désinscri|desinscri|désabonn|desabonn)/u;
  return word.test(head) || stem.test(head);
}

/**
 * Matches inbox messages to contacts:
 * 1. a message whose In-Reply-To / References contain one of our Message-IDs;
 * 2. otherwise a message from the contact's address sent after our first email;
 * 3. bounces (mailer-daemon…) matched by our Message-ID or the contact's address in the text.
 * Auto-replies (out of office) are ignored. One result per contact, earliest wins.
 */
export function matchInboxMessages(messages: InboxMessage[], contacts: TrackedContact[]): ReplyMatch[] {
  const byMessageId = new Map<string, TrackedContact>();
  const byEmail = new Map<string, TrackedContact>();
  for (const c of contacts) {
    for (const id of c.messageIds) {
      const n = normalizeMessageId(id);
      if (n) byMessageId.set(n, c);
    }
    byEmail.set(c.email.trim().toLowerCase(), c);
  }

  const results = new Map<string, ReplyMatch>();
  const record = (c: TrackedContact, kind: ReplyMatch["kind"], m: InboxMessage) => {
    const prev = results.get(c.id);
    if (prev && prev.at && m.date && prev.at <= m.date) return;
    results.set(c.id, { contactId: c.id, kind, uid: m.uid, at: m.date });
  };

  for (const m of messages) {
    // Our own copies (e.g. a Sent copy filed in INBOX) are not replies.
    if (m.messageId && byMessageId.has(normalizeMessageId(m.messageId))) continue;

    const refs = [...parseMessageIdList(m.inReplyTo), ...parseMessageIdList(m.references)];

    if (isBounceMessage(m)) {
      const text = (m.textSnippet ?? "").toLowerCase();
      let contact = refs.map((r) => byMessageId.get(r)).find(Boolean);
      if (!contact && text) {
        contact =
          contacts.find((c) => c.messageIds.some((id) => text.includes(normalizeMessageId(id)))) ??
          contacts.find((c) => text.includes(c.email.toLowerCase()));
      }
      if (contact) record(contact, "bounced", m);
      continue;
    }

    if (isAutoReply(m)) continue;

    let contact = refs.map((r) => byMessageId.get(r)).find(Boolean);
    if (!contact) {
      const c = byEmail.get(m.fromAddress.trim().toLowerCase());
      if (c && (!m.date || m.date.getTime() >= c.firstSentAt.getTime() - 60_000)) contact = c;
    }
    if (!contact) continue;
    record(contact, isOptOutText(m.textSnippet) ? "unsubscribed" : "replied", m);
  }
  return Array.from(results.values());
}

function decodeQuotedPrintable(s: string): string {
  const src = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const hex = src.slice(i + 1, i + 3);
    if (src[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(src[i], "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodePart(partHeaders: string, partBody: string): string {
  if (/content-transfer-encoding:\s*base64/i.test(partHeaders)) {
    try {
      return Buffer.from(partBody.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  if (/content-transfer-encoding:\s*quoted-printable/i.test(partHeaders)) return decodeQuotedPrintable(partBody);
  return partBody;
}

function splitHeadersBody(raw: string): [string, string] | null {
  const m = /\r?\n\r?\n/.exec(raw);
  if (!m) return null;
  return [raw.slice(0, m.index), raw.slice(m.index + m[0].length)];
}

/**
 * Best-effort plain text from a raw RFC 822 message (first text/plain part, or
 * the body of a single-part message). Good enough for opt-out and bounce checks.
 */
export function extractPlainText(raw: string, maxLength = 4000): string {
  const top = splitHeadersBody(raw);
  if (!top) return "";
  const [headers, body] = top;
  if (!/boundary=/i.test(headers)) return decodePart(headers, body).slice(0, maxLength);
  // Nested multiparts: scan every part for the first text/plain.
  for (const part of raw.split(/\r?\n--[^\r\n]+/)) {
    const hb = splitHeadersBody(part.replace(/^\r?\n/, ""));
    if (!hb) continue;
    if (!/content-type:\s*text\/plain/i.test(hb[0])) continue;
    return decodePart(hb[0], hb[1]).slice(0, maxLength);
  }
  // Bounces are often text/plain + message/delivery-status: fall back to the raw body.
  return body.slice(0, maxLength);
}
