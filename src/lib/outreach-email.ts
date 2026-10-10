import { buildMailComposeLink, detectMailClient, resolveMailClient, type MailClient } from "@/lib/mail-client";

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeOutreachEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function senderEmailDomain(fromEmail: string): string {
  return normalizeOutreachEmail(fromEmail).split("@")[1] ?? "";
}

export function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = normalizeOutreachEmail(raw);
    if (!email || !isValidEmailAddress(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export type BatchEmailRecipients = {
  to: string;
  cc: string[];
  all: string[];
};

/** First recipient in To, remaining in CC (batch outreach). */
export function splitBatchEmailRecipients(emails: string[]): BatchEmailRecipients | null {
  const all = dedupeEmails(emails);
  if (all.length === 0) return null;
  const [to, ...cc] = all;
  return { to, cc, all };
}

export function resolveCreatorEmail(
  handle: string,
  emailMap: Record<string, string>,
  overrides?: Record<string, string>,
): string {
  const key = handle.replace(/^@/, "").trim().toLowerCase();
  const override = overrides?.[key]?.trim();
  if (override && isValidEmailAddress(override)) return normalizeOutreachEmail(override);
  const fromMap = emailMap[key]?.trim();
  if (fromMap && isValidEmailAddress(fromMap)) return normalizeOutreachEmail(fromMap);
  return "";
}

export function resolveSelectedCreatorEmails(
  handles: string[],
  emailMap: Record<string, string>,
  overrides?: Record<string, string>,
): { handle: string; email: string }[] {
  return handles
    .map((handle) => ({
      handle,
      email: resolveCreatorEmail(handle, emailMap, overrides),
    }))
    .filter((row) => row.email);
}

export function buildOutreachMailtoUrl(options: {
  recipients: string[];
  subject: string;
  body: string;
}): string | null {
  const batch = splitBatchEmailRecipients(options.recipients);
  if (!batch) return null;

  const params = new URLSearchParams();
  params.set("subject", options.subject);
  params.set("body", options.body);
  if (batch.cc.length > 0) {
    params.set("cc", batch.cc.join(","));
  }

  return `mailto:${encodeURIComponent(batch.to)}?${params.toString()}`;
}

export type EmailComposeMode = "gmail" | "outlook" | "mailto";

/**
 * Opens the user's mail client for the brand address (Gmail / Outlook / mailto).
 * Uses the app the user picked (Settings / contact sheet) when there is one.
 */
export function buildEmailComposeUrl(options: {
  fromEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  lang?: "en" | "fr";
}): { mode: EmailComposeMode; url: string; truncated: boolean } | null {
  const batch = splitBatchEmailRecipients(options.recipients);
  if (!batch) return null;
  const client: MailClient =
    (typeof window !== "undefined" ? resolveMailClient(options.fromEmail) : detectMailClient(options.fromEmail)) ?? "mailto";
  const link = buildMailComposeLink({
    client,
    to: batch.to,
    cc: batch.cc,
    subject: options.subject,
    body: options.body,
    fromEmail: options.fromEmail,
    lang: options.lang,
  });
  const mode: EmailComposeMode = client === "gmail" ? "gmail" : client === "mailto" ? "mailto" : "outlook";
  return { mode, url: link.url, truncated: link.truncated };
}

/**
 * Opens a compose link. Must run synchronously inside the click handler (no
 * await before it) or browsers block the new tab. mailto: never opens a tab.
 */
export function openComposeLink(url: string): "opened" | "blocked" {
  if (typeof window === "undefined") return "blocked";
  if (url.startsWith("mailto:")) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "opened";
  }
  const w = window.open(url, "_blank");
  if (!w) return "blocked";
  try {
    w.opener = null;
  } catch {
    /* cross-origin already */
  }
  return "opened";
}

/**
 * True only when the server can send directly from this address
 * (RESEND_API_KEY + OUTREACH_DIRECT_SEND_DOMAINS). Otherwise compose in the mail app.
 */
export async function fetchDirectSendAvailable(fromEmail: string): Promise<boolean> {
  if (!isValidEmailAddress(fromEmail)) return false;
  try {
    // The server checks the signed-in account's address; nothing goes in the URL.
    const res = await fetch("/api/outreach/send-email", {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { directSend?: boolean };
    return res.ok && data.directSend === true;
  } catch {
    return false;
  }
}

export type OutreachEmailSendResult =
  | { ok: true; mode: "api"; recipientCount: number }
  | { ok: true; mode: EmailComposeMode; composeUrl: string; recipientCount: number }
  | { ok: false; error: string };

export async function sendOutreachEmail(params: {
  fromEmail: string;
  subject: string;
  body: string;
  recipients: string[];
}): Promise<OutreachEmailSendResult> {
  const recipients = dedupeEmails(params.recipients);
  if (recipients.length === 0) {
    return { ok: false, error: "No valid recipient emails" };
  }
  if (!isValidEmailAddress(params.fromEmail)) {
    return { ok: false, error: "Invalid sender email" };
  }
  if (!params.subject.trim() || !params.body.trim()) {
    return { ok: false, error: "Subject and message are required" };
  }

  const compose = buildEmailComposeUrl({
    fromEmail: params.fromEmail,
    recipients,
    subject: params.subject.trim(),
    body: params.body.trim(),
  });
  if (!compose) {
    return { ok: false, error: "Could not build email compose link" };
  }

  try {
    const res = await fetch("/api/outreach/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fromEmail: normalizeOutreachEmail(params.fromEmail),
        subject: params.subject.trim(),
        body: params.body.trim(),
        recipients,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      recipientCount?: number;
    };

    if (res.ok && data.ok) {
      return {
        ok: true,
        mode: "api",
        recipientCount: data.recipientCount ?? recipients.length,
      };
    }
  } catch {
    /* fall through to compose */
  }

  return {
    ok: true,
    mode: compose.mode,
    composeUrl: compose.url,
    recipientCount: recipients.length,
  };
}
