"use client";

// Email composer opened by every "Contact" button of the brand dashboard.
// Flow: click Contact -> this sheet opens at once with a draft (AI when the
// plan allows it, else a template with the creator's real data) -> the brand
// checks it and clicks "Open in Gmail". That second click opens the mail app
// synchronously, so popup blockers never get in the way (opening a tab after
// an await is blocked). Then the outreach is logged in the history.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./contact-creator.css";
import { saveOutreach } from "@/lib/db";
import { listSaved, setCrm } from "@/lib/workspace-client";
import { buildCreatorEmailMap, crmFromSnapshot } from "@/lib/creator-crm";
import { generateCreatorEmailDraft, buildTemplateEmailDraft, type EmailDraft } from "@/lib/creator-email-draft";
import { CONTACT_CREATOR_EVENT, type ContactCreatorTarget } from "@/lib/contact-creator-events";
import {
  MAIL_CLIENTS,
  buildMailComposeLink,
  mailClientLabel,
  mailClientShortName,
  resolveMailClient,
  storeMailClient,
  type MailClient,
} from "@/lib/mail-client";
import { isValidEmailAddress, normalizeOutreachEmail, openComposeLink } from "@/lib/outreach-email";
import { appendStoredOutreachEntry } from "@/lib/outreach-history-storage";
import { dispatchOutreachHistoryUpdated, followUpIn3Days } from "@/lib/outreach-history-events";
import { notifyOutreachSent } from "@/lib/notifications-storage";
import { canUseAIOutreach, canUseAutoFollowUp, type PlanTier } from "@/lib/plan-limits";
import { useLang } from "@/lib/useLang";

type Lang = "en" | "fr";

function copy(lang: Lang) {
  const fr = lang === "fr";
  return {
    title: fr ? "Contacter" : "Contact",
    close: fr ? "Fermer" : "Close",
    to: fr ? "À" : "To",
    subject: fr ? "Objet" : "Subject",
    message: fr ? "Message" : "Message",
    emailPlaceholder: fr ? "adresse@exemple.com" : "name@example.com",
    noEmail: (h: string) => (fr ? `Aucun e-mail connu pour @${h} : ajoutez-le` : `No email on file for @${h}: add it`),
    noEmailHint: fr
      ? "Vous pouvez aussi laisser vide et l’ajouter dans votre messagerie."
      : "You can also leave it empty and add it in your mail app.",
    invalidEmail: fr ? "Cette adresse e-mail n’est pas valide." : "This email address is not valid.",
    saveEmail: fr ? "Enregistrer cet e-mail sur la fiche du créateur" : "Save this email on the creator’s profile",
    writing: fr ? "Rédaction d’un e-mail personnalisé…" : "Writing a personalised email…",
    aiDraft: fr ? "Brouillon rédigé par l’IA à partir du profil. Relisez avant d’envoyer." : "AI draft based on the profile. Review it before sending.",
    templateDraft: fr ? "Modèle rempli avec les infos du profil. Modifiez-le librement." : "Template filled from the profile. Edit it freely.",
    open: (app: string) => (fr ? `Ouvrir dans ${app}` : `Open in ${app}`),
    openDefault: fr ? "Ouvrir dans l’app mail" : "Open in mail app",
    changeApp: fr ? "Changer d’app mail" : "Change mail app",
    pickTitle: fr ? "Quelle messagerie utilisez-vous ?" : "Which mail app do you use?",
    pickHint: fr ? "Choix enregistré sur cet appareil, modifiable à tout moment." : "Saved on this device, change it any time.",
    blocked: fr ? "Votre navigateur a bloqué le nouvel onglet." : "Your browser blocked the new tab.",
    openLink: fr ? "Ouvrir l’e-mail" : "Open the email",
    ready: (app: string) => (fr ? `Votre e-mail est prêt dans ${app}` : `Your email is ready in ${app}`),
    readyTruncated: fr
      ? "Message long : le texte complet est copié dans le presse-papiers."
      : "Long message: the full text is copied to your clipboard.",
    longWarning: fr
      ? "Message long pour votre app mail : il sera raccourci et le texte complet copié dans le presse-papiers."
      : "Long message for your mail app: it will be shortened and the full text copied to your clipboard.",
  };
}

function cleanHandle(username: string): string {
  return username.replace(/^@/, "").trim();
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Radio-style list of mail apps (sheet first-run picker and Settings). */
export function MailClientChoices({
  lang,
  value,
  onChange,
}: {
  lang: Lang;
  value: MailClient | null;
  onChange: (client: MailClient) => void;
}) {
  return (
    <div className="cc-choices" role="radiogroup">
      {MAIL_CLIENTS.map((client) => (
        <button
          key={client}
          type="button"
          role="radio"
          aria-checked={value === client}
          className={`cc-choice${value === client ? " is-active" : ""}`}
          onClick={() => onChange(client)}
        >
          {mailClientLabel(client, lang)}
        </button>
      ))}
    </div>
  );
}

type SavedLookup = { emails: Record<string, string>; saved: Set<string> };

async function loadSavedLookup(): Promise<SavedLookup> {
  const rows = await listSaved();
  const emails = buildCreatorEmailMap(rows);
  const saved = new Set<string>();
  for (const row of rows) {
    const key = cleanHandle(row.creator_username).toLowerCase();
    saved.add(key);
    if (!emails[key]) {
      const last = crmFromSnapshot(row.snapshot).lastEmail?.trim();
      if (last && isValidEmailAddress(last)) emails[key] = last;
    }
  }
  return { emails, saved };
}

export function ContactCreatorHost({
  userId,
  userEmail,
  brandName,
  plan,
}: {
  userId: string;
  userEmail: string;
  brandName: string;
  plan: PlanTier;
}) {
  const appLang = useLang();
  const lang: Lang = appLang === "fr" ? "fr" : "en";
  const t = copy(lang);

  const [target, setTarget] = useState<ContactCreatorTarget | null>(null);
  const [knownEmail, setKnownEmail] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftSource, setDraftSource] = useState<EmailDraft["source"] | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saveEmail, setSaveEmail] = useState(true);
  const [client, setClient] = useState<MailClient | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const requestId = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    requestId.current += 1;
    setTarget(null);
    setMenuOpen(false);
    setBlockedUrl(null);
  }, []);

  const open = useCallback(
    (next: ContactCreatorTarget) => {
      const id = ++requestId.current;
      const handle = cleanHandle(next.username);
      const direct = (next.email ?? "").trim();
      setTarget(next);
      setKnownEmail(isValidEmailAddress(direct) ? direct : "");
      setTo(isValidEmailAddress(direct) ? direct : "");
      setIsSaved(false);
      setSaveEmail(true);
      setBlockedUrl(null);
      setMenuOpen(false);
      setClient(resolveMailClient(userEmail));

      const allowAI = canUseAIOutreach(plan);
      const template = buildTemplateEmailDraft({ creator: next, brandName, lang });
      if (next.draft?.body?.trim()) {
        setSubject(next.draft.subject?.trim() || template.subject);
        setBody(next.draft.body.trim());
        setDraftSource(null);
        setLoadingDraft(false);
      } else if (allowAI && brandName.trim()) {
        setSubject("");
        setBody("");
        setDraftSource(null);
        setLoadingDraft(true);
        void generateCreatorEmailDraft({ creator: next, brandName, lang, allowAI }).then((draft) => {
          if (requestId.current !== id) return;
          setSubject(draft.subject);
          setBody(draft.body);
          setDraftSource(draft.source);
          setLoadingDraft(false);
        });
      } else {
        setSubject(template.subject);
        setBody(template.body);
        setDraftSource("template");
        setLoadingDraft(false);
      }

      void loadSavedLookup().then(({ emails, saved }) => {
        if (requestId.current !== id) return;
        const key = handle.toLowerCase();
        setIsSaved(saved.has(key));
        const stored = emails[key];
        if (!direct && stored) {
          setKnownEmail(stored);
          setTo((current) => current || stored);
        }
      });
    },
    [brandName, lang, plan, userEmail],
  );

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<ContactCreatorTarget>).detail;
      if (detail?.username) open(detail);
    };
    window.addEventListener(CONTACT_CREATOR_EVENT, onRequest);
    return () => window.removeEventListener(CONTACT_CREATOR_EVENT, onRequest);
  }, [open]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, menuOpen, close]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handle = target ? cleanHandle(target.username) : "";
  const trimmedTo = to.trim();
  const toInvalid = trimmedTo !== "" && !isValidEmailAddress(trimmedTo);
  const canOpen = !!target && !!client && !loadingDraft && !toInvalid && !!subject.trim() && !!body.trim();

  const link = useMemo(() => {
    if (!client || !target) return null;
    return buildMailComposeLink({ client, to: trimmedTo, subject, body, fromEmail: userEmail, lang });
  }, [client, target, trimmedTo, subject, body, userEmail, lang]);

  const chooseClient = (next: MailClient) => {
    storeMailClient(next);
    setClient(next);
    setMenuOpen(false);
    setBlockedUrl(null);
  };

  const recordOutreach = async (current: ContactCreatorTarget, sentTo: string) => {
    const name = current.displayName?.trim() || cleanHandle(current.username);
    const payload = {
      creator_username: cleanHandle(current.username),
      creator_display_name: name,
      creator_avatar: current.avatarUrl ?? "",
      platform: "Email",
      message: `${lang === "fr" ? "Objet" : "Subject"}: ${subject.trim()}\n\n${body.trim()}`,
      status: "sent",
      follow_up_date: canUseAutoFollowUp(plan) ? followUpIn3Days() : null,
    };
    const saved = await saveOutreach(userId, payload);
    if (!saved) appendStoredOutreachEntry(userId, payload);
    notifyOutreachSent(lang, name, userId);
    dispatchOutreachHistoryUpdated();

    // A typed address is kept on the saved creator (CRM email field).
    const typed = normalizeOutreachEmail(sentTo);
    if (saveEmail && isSaved && typed && isValidEmailAddress(typed) && typed !== normalizeOutreachEmail(knownEmail)) {
      void setCrm(cleanHandle(current.username), { lastEmail: typed }).catch(() => undefined);
    }
  };

  // Synchronous on purpose: the tab must open inside the click.
  const handleOpen = () => {
    if (!canOpen || !link || !target || !client) return;
    if (link.truncated) {
      const full = `${subject.trim()}\n\n${body.trim()}`;
      void navigator.clipboard?.writeText(full).catch(() => undefined);
    }
    const result = openComposeLink(link.url);
    if (result === "blocked") {
      setBlockedUrl(link.url);
      return;
    }
    finish(target, client, link.truncated);
  };

  const finish = (current: ContactCreatorTarget, used: MailClient, truncated: boolean) => {
    void recordOutreach(current, trimmedTo);
    const app = mailClientShortName(used, lang);
    setToast(truncated ? `${t.ready(app)}. ${t.readyTruncated}` : t.ready(app));
    close();
  };

  const toastNode = toast ? (
    <div className="cc-toast" role="status">
      {toast}
    </div>
  ) : null;

  if (!target) return toastNode;

  const appName = client ? mailClientShortName(client, lang) : "";
  const primaryLabel = client === "mailto" ? t.openDefault : t.open(appName);

  return (
    <>
      {toastNode}
      <div className="cc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <div className="cc-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-title">
          <div className="cc-head">
            <div className="cc-head__text">
              <h2 id="cc-title" className="cc-title">
                {t.title} {target.displayName?.trim() || `@${handle}`}
              </h2>
              <div className="cc-sub">@{handle}</div>
            </div>
            <button type="button" className="cc-icon-btn" onClick={close} aria-label={t.close}>
              <CloseIcon />
            </button>
          </div>

          <div className="cc-body">
            <label className="cc-field">
              <span className="cc-label">{t.to}</span>
              <input
                className={`cc-input${toInvalid ? " is-invalid" : ""}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={to}
                placeholder={t.emailPlaceholder}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            {!knownEmail && (
              <div className="cc-note">
                <strong>{t.noEmail(handle)}</strong>
                <span>{t.noEmailHint}</span>
              </div>
            )}
            {toInvalid && <div className="cc-error">{t.invalidEmail}</div>}
            {isSaved && trimmedTo && !toInvalid && normalizeOutreachEmail(trimmedTo) !== normalizeOutreachEmail(knownEmail) && (
              <label className="cc-check">
                <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} />
                {t.saveEmail}
              </label>
            )}

            {loadingDraft ? (
              <div className="cc-loading" aria-live="polite">
                <span className="cc-spinner" aria-hidden />
                {t.writing}
              </div>
            ) : (
              <>
                <label className="cc-field">
                  <span className="cc-label">{t.subject}</span>
                  <input className="cc-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="cc-field">
                  <span className="cc-label">{t.message}</span>
                  <textarea className="cc-textarea" rows={11} value={body} onChange={(e) => setBody(e.target.value)} />
                </label>
                {draftSource && <div className="cc-hint">{draftSource === "ai" ? t.aiDraft : t.templateDraft}</div>}
                {link?.truncated && <div className="cc-hint">{t.longWarning}</div>}
              </>
            )}

            {!client && (
              <div className="cc-picker">
                <div className="cc-picker__title">{t.pickTitle}</div>
                <MailClientChoices lang={lang} value={client} onChange={chooseClient} />
                <div className="cc-hint">{t.pickHint}</div>
              </div>
            )}

            {blockedUrl && (
              <div className="cc-note">
                <strong>{t.blocked}</strong>
                <a
                  className="cc-link"
                  href={blockedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => client && finish(target, client, !!link?.truncated)}
                >
                  {t.openLink}
                </a>
              </div>
            )}
          </div>

          {client && (
            <div className="cc-foot">
              <div className="cc-split" ref={menuRef}>
                <button type="button" className="cc-btn cc-btn--primary cc-split__main" disabled={!canOpen} onClick={handleOpen}>
                  {primaryLabel}
                </button>
                <button
                  type="button"
                  className="cc-btn cc-btn--primary cc-split__toggle"
                  aria-label={t.changeApp}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <ChevronDown />
                </button>
                {menuOpen && (
                  <div className="cc-menu" role="menu">
                    <div className="cc-menu__title">{t.changeApp}</div>
                    {MAIL_CLIENTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="menuitemradio"
                        aria-checked={c === client}
                        className={`cc-menu__item${c === client ? " is-active" : ""}`}
                        onClick={() => chooseClient(c)}
                      >
                        {mailClientLabel(c, lang)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
