// Mailbox presets and the provider model. Pure: safe in the browser and the server.
//
// Today every mailbox connects with SMTP (send) + IMAP (reply detection) and a
// password (an app password for Gmail / Google Workspace). The stored `provider`
// is 'gmail' | 'outlook' | 'smtp' and `auth_type` is 'password'. OAuth sending
// (Gmail API / Microsoft Graph) can be added later as auth_type 'oauth' with its
// own driver in src/lib/mailbox-driver.ts; nothing else has to change.

export type MailboxProvider = "gmail" | "outlook" | "smtp";
export type MailboxAuthType = "password" | "oauth";
export type MailboxPresetId = "gmail" | "outlook" | "ovh" | "zoho" | "custom";

export type MailboxServerSettings = {
  smtpHost: string;
  smtpPort: number;
  /** true = implicit TLS (465); false = STARTTLS (587). */
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
};

export type MailboxPreset = MailboxServerSettings & {
  id: MailboxPresetId;
  provider: MailboxProvider;
  label: string;
  /** Recommended daily cap for cold outreach from a single mailbox. */
  suggestedDailyLimit: number;
  helpUrl?: string;
};

export const MAILBOX_PRESETS: Record<MailboxPresetId, MailboxPreset> = {
  gmail: {
    id: "gmail",
    provider: "gmail",
    label: "Gmail / Google Workspace",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    suggestedDailyLimit: 40,
    helpUrl: "https://myaccount.google.com/apppasswords",
  },
  outlook: {
    id: "outlook",
    provider: "outlook",
    label: "Outlook / Microsoft 365",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    suggestedDailyLimit: 40,
  },
  ovh: {
    id: "ovh",
    provider: "smtp",
    label: "OVHcloud",
    smtpHost: "ssl0.ovh.net",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "ssl0.ovh.net",
    imapPort: 993,
    suggestedDailyLimit: 40,
  },
  zoho: {
    id: "zoho",
    provider: "smtp",
    label: "Zoho Mail",
    smtpHost: "smtp.zoho.eu",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.zoho.eu",
    imapPort: 993,
    suggestedDailyLimit: 40,
  },
  custom: {
    id: "custom",
    provider: "smtp",
    label: "Custom (SMTP + IMAP)",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "",
    imapPort: 993,
    suggestedDailyLimit: 30,
  },
};

export const MAILBOX_DAILY_LIMIT_MIN = 1;
export const MAILBOX_DAILY_LIMIT_MAX = 500;
export const MAILBOX_DAILY_LIMIT_DEFAULT = 40;

/** Picks a preset from an email domain (gmail.com → gmail, outlook/hotmail/live → outlook). */
export function guessPresetFromEmail(email: string): MailboxPresetId {
  const domain = (email.split("@")[1] ?? "").trim().toLowerCase();
  if (["gmail.com", "googlemail.com"].includes(domain)) return "gmail";
  if (/^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(domain)) return "outlook";
  return "custom";
}

export function clampDailyLimit(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAILBOX_DAILY_LIMIT_DEFAULT;
  return Math.min(MAILBOX_DAILY_LIMIT_MAX, Math.max(MAILBOX_DAILY_LIMIT_MIN, n));
}

function validHost(host: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !host.includes("..");
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port < 65536;
}

export type MailboxConnectInput = {
  preset: MailboxPresetId;
  fromEmail: string;
  fromName: string;
  username: string;
  password: string;
  dailyLimit: number;
  signature: string;
} & MailboxServerSettings;

/** Validates and normalises the connect form. Returns an error code on failure. */
export function normalizeMailboxConnectInput(
  body: Record<string, unknown>,
): { ok: true; value: MailboxConnectInput & { provider: MailboxProvider } } | { ok: false; error: string } {
  const presetId = (String(body.preset ?? "custom") as MailboxPresetId);
  const preset = MAILBOX_PRESETS[presetId] ?? MAILBOX_PRESETS.custom;
  const fromEmail = String(body.fromEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return { ok: false, error: "invalid_email" };
  const password = String(body.password ?? "");
  if (!password.trim()) return { ok: false, error: "missing_password" };
  if (password.length > 512) return { ok: false, error: "invalid_password" };

  const pick = <T,>(value: unknown, fallback: T): T =>
    value === undefined || value === null || value === "" ? fallback : (value as T);
  const smtpHost = String(pick(body.smtpHost, preset.smtpHost)).trim().toLowerCase();
  const imapHost = String(pick(body.imapHost, preset.imapHost)).trim().toLowerCase();
  const smtpPort = Number(pick(body.smtpPort, preset.smtpPort));
  const imapPort = Number(pick(body.imapPort, preset.imapPort));
  const smtpSecure =
    body.smtpSecure === undefined || body.smtpSecure === null
      ? smtpPort === 465
      : Boolean(body.smtpSecure);
  if (!validHost(smtpHost) || !validPort(smtpPort)) return { ok: false, error: "invalid_smtp" };
  if (!validHost(imapHost) || !validPort(imapPort)) return { ok: false, error: "invalid_imap" };

  return {
    ok: true,
    value: {
      preset: preset.id,
      provider: preset.provider,
      fromEmail,
      fromName: String(body.fromName ?? "").replace(/["<>\r\n]/g, "").trim().slice(0, 120),
      username: String(body.username ?? "").trim() || fromEmail,
      password,
      dailyLimit: clampDailyLimit(body.dailyLimit ?? preset.suggestedDailyLimit),
      signature: String(body.signature ?? "").slice(0, 2000),
      smtpHost,
      smtpPort,
      smtpSecure,
      imapHost,
      imapPort,
    },
  };
}

/** Columns of email_mailboxes that may be returned to the browser (never the secret). */
export const MAILBOX_PUBLIC_COLUMNS =
  "id, provider, auth_type, from_name, from_email, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, username, daily_limit, signature, status, last_error, last_checked_at, created_at";

export type PublicMailbox = {
  id: string;
  provider: MailboxProvider;
  auth_type: MailboxAuthType;
  from_name: string;
  from_email: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  imap_host: string | null;
  imap_port: number | null;
  username: string | null;
  daily_limit: number;
  signature: string;
  status: "connected" | "error";
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
  sent_last_24h?: number;
};

/** Short, user-facing explanation for common SMTP/IMAP failures. */
export function friendlyMailboxError(raw: string, lang: "en" | "fr" = "en"): string {
  const msg = raw.toLowerCase();
  const fr = lang === "fr";
  if (/application-specific password|app password|534-5\.7\.9|webloginrequired/.test(msg)) {
    return fr
      ? "Google demande un mot de passe d'application (pas votre mot de passe habituel)."
      : "Google requires an app password (not your usual password).";
  }
  if (/smtp auth.*disabled|smtpclientauthentication|5\.7\.139|5\.7\.3/.test(msg)) {
    return fr
      ? "L'envoi SMTP authentifié est désactivé pour ce compte Microsoft 365. Votre administrateur doit l'activer."
      : "Authenticated SMTP is disabled for this Microsoft 365 account. Your admin must enable it.";
  }
  if (/invalid login|authentication failed|auth.*fail|535|badcredentials|username and password not accepted|authenticationfailed/.test(msg)) {
    return fr ? "Identifiant ou mot de passe refusé par le serveur." : "The server rejected the username or password.";
  }
  if (/enotfound|getaddrinfo/.test(msg)) {
    return fr ? "Serveur introuvable : vérifiez l'adresse du serveur." : "Server not found: check the server address.";
  }
  if (/etimedout|timeout|econnrefused|econnreset/.test(msg)) {
    return fr
      ? "Le serveur ne répond pas sur ce port. Vérifiez le port et le chiffrement."
      : "The server did not answer on this port. Check the port and encryption.";
  }
  if (/certificate|self signed|ssl|tls|wrong version number/.test(msg)) {
    return fr
      ? "Problème de chiffrement : essayez 465 (SSL) ou 587 (STARTTLS)."
      : "Encryption problem: try 465 (SSL) or 587 (STARTTLS).";
  }
  return raw.slice(0, 200);
}
