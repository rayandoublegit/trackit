"use client";

// Shared client bits for the mailbox + automatic campaign UI: fetch helper,
// small SVG icons (never emoji), and FR/EN error texts.
import type { ReactNode } from "react";

export type Lang = "en" | "fr";

export async function aoFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; status: number; data: T & { ok?: boolean; error?: string } }> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data = {} as T & { ok?: boolean; error?: string };
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

const ERRORS: Record<string, { en: string; fr: string }> = {
  plan_required: { en: "Automatic email campaigns are part of the Pro and Scale plans.", fr: "Les campagnes e-mail automatiques sont incluses dans les offres Pro et Scale." },
  encryption_not_configured: {
    en: "Mailbox connection is not configured on the server yet (MAILBOX_ENCRYPTION_KEY).",
    fr: "La connexion de boîte mail n'est pas encore configurée sur le serveur (MAILBOX_ENCRYPTION_KEY).",
  },
  invalid_email: { en: "Enter a valid email address.", fr: "Saisissez une adresse e-mail valide." },
  missing_password: { en: "Enter the password (or app password).", fr: "Saisissez le mot de passe (ou mot de passe d'application)." },
  invalid_password: { en: "This password is not valid.", fr: "Ce mot de passe n'est pas valide." },
  invalid_smtp: { en: "Check the SMTP server and port.", fr: "Vérifiez le serveur et le port SMTP." },
  invalid_imap: { en: "Check the IMAP server and port.", fr: "Vérifiez le serveur et le port IMAP." },
  missing_pitch: { en: "Describe what you offer before previewing or launching.", fr: "Décrivez votre offre avant l'aperçu ou le lancement." },
  missing_mailbox: { en: "Choose a connected mailbox.", fr: "Choisissez une boîte mail connectée." },
  mailbox_error: { en: "The mailbox has an error. Reconnect it in Settings.", fr: "La boîte mail est en erreur. Reconnectez-la dans les Paramètres." },
  mailbox_not_found: { en: "This mailbox no longer exists.", fr: "Cette boîte mail n'existe plus." },
  no_contacts: { en: "Add at least one creator with an email.", fr: "Ajoutez au moins un créateur avec un e-mail." },
  pause_first: { en: "Pause the campaign before editing it.", fr: "Mettez la campagne en pause avant de la modifier." },
  not_found: { en: "Not found.", fr: "Introuvable." },
  ai_not_configured: { en: "AI writing is not configured on the server (ANTHROPIC_API_KEY).", fr: "La rédaction IA n'est pas configurée sur le serveur (ANTHROPIC_API_KEY)." },
  ai_refused: { en: "The AI declined to write this email. Rephrase your offer.", fr: "L'IA a refusé d'écrire cet e-mail. Reformulez votre offre." },
  ai_bad_output: { en: "The AI answer could not be read. Try again.", fr: "La réponse de l'IA est illisible. Réessayez." },
  ai_error: { en: "The email could not be written. Try again.", fr: "L'e-mail n'a pas pu être rédigé. Réessayez." },
  unsupported_numbers: {
    en: "The AI used figures that are not in this creator's data, so the draft was rejected. Regenerate it.",
    fr: "L'IA a utilisé des chiffres absents des données du créateur : le brouillon a été rejeté. Régénérez-le.",
  },
  folder_not_found: { en: "This list no longer exists.", fr: "Cette liste n'existe plus." },
};

export function aoError(code: string | undefined, lang: Lang, fallback?: string): string {
  if (code && ERRORS[code]) return ERRORS[code][lang];
  if (code && !/^[a-z_]+$/.test(code)) return code;
  return fallback ?? (lang === "fr" ? "Une erreur est survenue." : "Something went wrong.");
}

type IconProps = { size?: number };
const svg = (path: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

export const IconMail = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>,
    size,
  );
export const IconCheck = ({ size }: IconProps) => svg(<path d="M5 12l5 5L20 7" />, size);
export const IconAlert = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>,
    size,
  );
export const IconClose = ({ size }: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, size);
export const IconPlus = ({ size }: IconProps) => svg(<path d="M12 5v14M5 12h14" />, size);
export const IconPause = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>,
    size,
  );
export const IconPlay = ({ size }: IconProps) => svg(<path d="M7 5l12 7-12 7z" />, size);
export const IconSend = ({ size }: IconProps) => svg(<path d="M4 12l16-8-6 16-2-6-8-2z" />, size);
export const IconRefresh = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>,
    size,
  );
export const IconTrash = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>,
    size,
  );
export const IconSpark = ({ size }: IconProps) =>
  svg(<path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z" />, size);
export const IconBack = ({ size }: IconProps) => svg(<path d="M15 6l-6 6 6 6" />, size);
export const Spinner = () => <span className="ao-spin" aria-hidden="true" />;
