// Server-only mailbox drivers. One interface, so OAuth providers (Gmail API,
// Microsoft Graph) can be added later as another driver without touching the
// routes or the crons. Today: SMTP (nodemailer) to send + IMAP (imapflow) to
// verify the login and detect replies.
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { decryptSecret } from "@/lib/mailbox-crypto";
import type { MailboxAuthType, MailboxProvider } from "@/lib/mailbox-providers";
import { extractPlainText, isBounceMessage, type InboxMessage } from "@/lib/outreach-sequences-replies";

export type MailboxCredentials = {
  provider: MailboxProvider;
  authType: MailboxAuthType;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
};

export type OutgoingEmail = {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  listUnsubscribe?: string;
};

export type FetchInboxOptions = {
  since: Date;
  /** Safety cap on messages read per run. */
  maxMessages?: number;
  /** Fetch the start of the body for these messages (bounces, possible opt-outs). */
  wantText?: (m: InboxMessage) => boolean;
};

export interface MailboxDriver {
  verifySmtp(c: MailboxCredentials): Promise<void>;
  verifyImap(c: MailboxCredentials): Promise<void>;
  send(c: MailboxCredentials, email: OutgoingEmail): Promise<{ messageId: string }>;
  fetchInbox(c: MailboxCredentials, options: FetchInboxOptions): Promise<InboxMessage[]>;
}

export type MailboxRow = {
  provider: string;
  auth_type?: string | null;
  from_email: string;
  from_name?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  imap_host?: string | null;
  imap_port?: number | null;
  username?: string | null;
  secret_encrypted?: string | null;
};

export function credentialsFromRow(row: MailboxRow): MailboxCredentials {
  if (!row.secret_encrypted) throw new Error("Mailbox has no stored password");
  return {
    provider: (row.provider as MailboxProvider) || "smtp",
    authType: (row.auth_type as MailboxAuthType) || "password",
    fromEmail: row.from_email,
    fromName: row.from_name || "",
    smtpHost: row.smtp_host || "",
    smtpPort: Number(row.smtp_port) || 465,
    smtpSecure: row.smtp_secure !== false,
    imapHost: row.imap_host || "",
    imapPort: Number(row.imap_port) || 993,
    username: row.username || row.from_email,
    password: decryptSecret(row.secret_encrypted),
  };
}

const TIMEOUT_MS = 15_000;

function smtpTransport(c: MailboxCredentials) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    requireTLS: !c.smtpSecure,
    auth: { user: c.username, pass: c.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: 30_000,
  });
}

function imapClient(c: MailboxCredentials) {
  return new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: true,
    auth: { user: c.username, pass: c.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: 60_000,
  });
}

function headerValue(raw: string, name: string): string | null {
  // Unfold continuation lines, then read "Name: value".
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  return unfolded.match(re)?.[1]?.trim() || null;
}

const smtpImapDriver: MailboxDriver = {
  async verifySmtp(c) {
    const transport = smtpTransport(c);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
  },

  async verifyImap(c) {
    const client = imapClient(c);
    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      lock.release();
    } finally {
      await client.logout().catch(() => undefined);
    }
  },

  async send(c, email) {
    const transport = smtpTransport(c);
    try {
      const info = await transport.sendMail({
        from: { name: c.fromName || c.fromEmail.split("@")[0], address: c.fromEmail },
        to: email.toName ? { name: email.toName.replace(/["<>]/g, ""), address: email.to } : email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        list: email.listUnsubscribe ? { unsubscribe: email.listUnsubscribe.replace(/^<|>$/g, "") } : undefined,
      });
      const rejected = Array.isArray(info.rejected) ? info.rejected : [];
      if (rejected.length > 0) throw new Error(`Recipient rejected: ${rejected.map(String).join(", ")}`);
      return { messageId: info.messageId || email.messageId };
    } finally {
      transport.close();
    }
  },

  async fetchInbox(c, options) {
    const max = options.maxMessages ?? 300;
    const client = imapClient(c);
    await client.connect();
    const out: InboxMessage[] = [];
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const found = await client.search({ since: options.since }, { uid: true });
        const uids = (Array.isArray(found) ? found : []).slice(-max);
        if (uids.length === 0) return out;
        for await (const msg of client.fetch(uids, { uid: true, envelope: true, headers: ["references", "in-reply-to"] }, { uid: true })) {
          const headers = msg.headers ? msg.headers.toString("utf8") : "";
          const env = msg.envelope;
          out.push({
            uid: msg.uid,
            date: env?.date ? new Date(env.date) : null,
            fromAddress: env?.from?.[0]?.address?.toLowerCase() ?? "",
            subject: env?.subject ?? "",
            messageId: env?.messageId ?? null,
            inReplyTo: env?.inReplyTo ?? headerValue(headers, "In-Reply-To"),
            references: headerValue(headers, "References"),
          });
        }
        // Second pass for the few messages whose text matters (bounces, opt-outs).
        const wanted = out.filter((m) => (options.wantText ? options.wantText(m) : isBounceMessage(m)));
        for (const m of wanted.slice(0, 40)) {
          const full = await client.fetchOne(String(m.uid), { source: { start: 0, maxLength: 64 * 1024 } }, { uid: true });
          if (full && full.source) m.textSnippet = extractPlainText(full.source.toString("utf8"));
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return out;
  },
};

export function getMailboxDriver(authType: MailboxAuthType | string | null | undefined): MailboxDriver {
  if (authType === "oauth") {
    // Placeholder for Gmail API / Microsoft Graph drivers (needs app verification).
    throw new Error("OAuth mailboxes are not supported yet");
  }
  return smtpImapDriver;
}
