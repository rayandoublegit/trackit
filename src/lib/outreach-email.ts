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

/** Opens the user's mail client for the brand address (Gmail / Outlook / mailto). */
export function buildEmailComposeUrl(options: {
  fromEmail: string;
  recipients: string[];
  subject: string;
  body: string;
}): { mode: EmailComposeMode; url: string } | null {
  const batch = splitBatchEmailRecipients(options.recipients);
  if (!batch) return null;

  const domain = senderEmailDomain(options.fromEmail);
  const subject = options.subject.trim();
  const body = options.body.trim();

  if (domain === "gmail.com" || domain === "googlemail.com") {
    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: batch.to,
      su: subject,
      body,
    });
    if (batch.cc.length > 0) params.set("cc", batch.cc.join(","));
    return { mode: "gmail", url: `https://mail.google.com/mail/?${params.toString()}` };
  }

  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    const params = new URLSearchParams({
      to: batch.to,
      subject,
      body,
    });
    if (batch.cc.length > 0) params.set("cc", batch.cc.join(","));
    return {
      mode: "outlook",
      url: `https://outlook.live.com/mail/0/deeplink/compose?${params.toString()}`,
    };
  }

  const mailtoUrl = buildOutreachMailtoUrl({
    recipients: options.recipients,
    subject,
    body,
  });
  if (!mailtoUrl) return null;
  return { mode: "mailto", url: mailtoUrl };
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
