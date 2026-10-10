// Which mail app opens when a brand contacts a creator, and the compose links
// for each one. Pure helpers (no DOM) except the localStorage accessors.

export type MailClient = "gmail" | "outlook" | "outlook365" | "yahoo" | "mailto";

export const MAIL_CLIENTS: MailClient[] = ["gmail", "outlook", "outlook365", "yahoo", "mailto"];

export function mailClientLabel(client: MailClient, lang: "en" | "fr"): string {
  switch (client) {
    case "gmail":
      return "Gmail";
    case "outlook":
      return "Outlook.com";
    case "outlook365":
      return "Outlook (Microsoft 365)";
    case "yahoo":
      return "Yahoo Mail";
    case "mailto":
      return lang === "fr" ? "Apple Mail / app par défaut" : "Apple Mail / default app";
  }
}

/** Short name used in buttons and toasts ("Open in Gmail"). */
export function mailClientShortName(client: MailClient, lang: "en" | "fr"): string {
  switch (client) {
    case "gmail":
      return "Gmail";
    case "outlook":
    case "outlook365":
      return "Outlook";
    case "yahoo":
      return "Yahoo Mail";
    case "mailto":
      return lang === "fr" ? "votre app mail" : "your mail app";
  }
}

export function isWebMailClient(client: MailClient): boolean {
  return client !== "mailto";
}

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Mail app guessed from the signed-in address. Null for custom domains
 * (Google Workspace, Microsoft 365, OVH…): we cannot tell, so the user picks once.
 */
export function detectMailClient(email: string | null | undefined): MailClient | null {
  const domain = emailDomain(email ?? "");
  if (!domain) return null;
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (/^(outlook|hotmail|live|msn|windowslive)\.[a-z.]+$/.test(domain)) return "outlook";
  if (/^(yahoo|ymail|rocketmail)\.[a-z.]+$/.test(domain)) return "yahoo";
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return "mailto";
  return null;
}

const STORAGE_KEY = "trackit:mail-client";

export function readStoredMailClient(): MailClient | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && (MAIL_CLIENTS as string[]).includes(raw) ? (raw as MailClient) : null;
  } catch {
    return null;
  }
}

export function storeMailClient(client: MailClient | null): void {
  try {
    if (client) window.localStorage.setItem(STORAGE_KEY, client);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** Saved choice first, then the guess from the address; null means "ask". */
export function resolveMailClient(email: string | null | undefined): MailClient | null {
  return readStoredMailClient() ?? detectMailClient(email);
}

/** mailto: links stop working in some apps (Outlook desktop, Windows) past ~2,000 chars. */
export const MAILTO_MAX_URL_LENGTH = 1800;
/** Web compose links accept much more; stay well under server URL limits. */
export const WEB_MAX_URL_LENGTH = 7000;

function query(params: Array<[string, string]>): string {
  return params
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

function rawComposeUrl(client: MailClient, to: string, subject: string, body: string, fromEmail: string, cc: string): string {
  switch (client) {
    case "gmail":
      // authuser picks the right Google account when several are signed in.
      return `https://mail.google.com/mail/?${query([
        ["authuser", fromEmail],
        ["view", "cm"],
        ["fs", "1"],
        ["to", to],
        ["cc", cc],
        ["su", subject],
        ["body", body],
      ])}`;
    case "outlook":
      return `https://outlook.live.com/mail/0/deeplink/compose?${query([["to", to], ["cc", cc], ["subject", subject], ["body", body]])}`;
    case "outlook365":
      return `https://outlook.office.com/mail/deeplink/compose?${query([["to", to], ["cc", cc], ["subject", subject], ["body", body]])}`;
    case "yahoo":
      return `https://compose.mail.yahoo.com/?${query([["to", to], ["cc", cc], ["subject", subject], ["body", body]])}`;
    case "mailto": {
      // encodeURIComponent (%20), not URLSearchParams (+): many mail apps show "+" literally.
      const q = query([["cc", cc], ["subject", subject], ["body", body]]);
      return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}${q ? `?${q}` : ""}`;
    }
  }
}

const TRUNCATION_NOTE = {
  en: "[…] (full message copied to your clipboard: paste it here)",
  fr: "[…] (message complet copié dans votre presse-papiers : collez-le ici)",
};

function cutAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const para = slice.lastIndexOf("\n\n");
  if (para > max * 0.6) return slice.slice(0, para);
  const line = slice.lastIndexOf("\n");
  if (line > max * 0.6) return slice.slice(0, line);
  const space = slice.lastIndexOf(" ");
  return space > max * 0.5 ? slice.slice(0, space) : slice;
}

export type ComposeLink = {
  client: MailClient;
  url: string;
  /** True when the body was shortened to keep the link under the length limit. */
  truncated: boolean;
};

/** Compose link for the chosen app. Over-long bodies are cut at a paragraph or word. */
export function buildMailComposeLink(options: {
  client: MailClient;
  to: string;
  subject: string;
  body: string;
  fromEmail?: string;
  /** Extra recipients (batch outreach). */
  cc?: string[];
  lang?: "en" | "fr";
  maxLength?: number;
}): ComposeLink {
  const { client } = options;
  const to = options.to.trim();
  const subject = options.subject.trim();
  const body = options.body.trim();
  const fromEmail = (options.fromEmail ?? "").trim();
  const cc = (options.cc ?? []).map((e) => e.trim()).filter(Boolean).join(",");
  const max = options.maxLength ?? (client === "mailto" ? MAILTO_MAX_URL_LENGTH : WEB_MAX_URL_LENGTH);

  const full = rawComposeUrl(client, to, subject, body, fromEmail, cc);
  if (full.length <= max) return { client, url: full, truncated: false };

  const note = TRUNCATION_NOTE[options.lang ?? "en"];
  // Largest body prefix (cut at a boundary) whose link fits.
  let lo = 0;
  let hi = body.length;
  let best = rawComposeUrl(client, to, subject, note, fromEmail, cc);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = rawComposeUrl(client, to, subject, `${cutAtBoundary(body, mid).trimEnd()}\n\n${note}`, fromEmail, cc);
    if (candidate.length <= max) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { client, url: best, truncated: true };
}
