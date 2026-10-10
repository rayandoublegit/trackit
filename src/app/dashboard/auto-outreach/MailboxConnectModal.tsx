"use client";

import { useState } from "react";
import {
  clampDailyLimit,
  guessPresetFromEmail,
  MAILBOX_PRESETS,
  type MailboxPresetId,
  type PublicMailbox,
} from "@/lib/mailbox-providers";
import { aoError, aoFetch, IconAlert, IconCheck, IconClose, Spinner, type Lang } from "./auto-outreach-client";
import "./auto-outreach.css";

const PRESET_ORDER: MailboxPresetId[] = ["gmail", "outlook", "ovh", "zoho", "custom"];

function presetLabel(id: MailboxPresetId, lang: Lang): string {
  if (id === "custom") return lang === "fr" ? "Autre (SMTP + IMAP)" : "Other (SMTP + IMAP)";
  return MAILBOX_PRESETS[id].label;
}

function HowTo({ preset, lang }: { preset: MailboxPresetId; lang: Lang }) {
  const fr = lang === "fr";
  if (preset === "gmail") {
    return (
      <div className="ao-callout">
        <strong>{fr ? "Gmail demande un mot de passe d'application" : "Gmail needs an app password"}</strong>
        <ol>
          <li>{fr ? "Activez la validation en deux étapes sur votre compte Google." : "Turn on 2-Step Verification on your Google account."}</li>
          <li>
            {fr ? "Ouvrez " : "Open "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer noopener">
              myaccount.google.com/apppasswords
            </a>
            {fr ? " et créez un mot de passe nommé « Trackit »." : " and create a password named \"Trackit\"."}
          </li>
          <li>{fr ? "Collez ici les 16 caractères affichés (sans espaces)." : "Paste the 16 characters shown here (no spaces)."}</li>
        </ol>
        <div style={{ marginTop: 6 }}>
          {fr
            ? "Google Workspace : votre administrateur doit autoriser les mots de passe d'application."
            : "Google Workspace: your admin must allow app passwords."}
        </div>
      </div>
    );
  }
  if (preset === "outlook") {
    return (
      <div className="ao-callout">
        {fr
          ? "Microsoft 365 : l'envoi SMTP authentifié doit être activé pour cette boîte par votre administrateur. Outlook.com avec validation en deux étapes : utilisez un mot de passe d'application (compte Microsoft > Sécurité)."
          : "Microsoft 365: authenticated SMTP must be enabled for this mailbox by your admin. Outlook.com with two-step verification: use an app password (Microsoft account > Security)."}
      </div>
    );
  }
  if (preset === "custom") {
    return (
      <div className="ao-callout">
        {fr
          ? "Les réglages SMTP et IMAP sont indiqués par votre hébergeur mail (rubrique « configurer un logiciel de messagerie »)."
          : "Your email host lists the SMTP and IMAP settings (look for \"set up a mail app\")."}
      </div>
    );
  }
  return (
    <div className="ao-callout">
      {fr ? "Utilisez l'adresse complète et le mot de passe de la boîte." : "Use the full address and the mailbox password."}
    </div>
  );
}

export function MailboxConnectModal({
  lang,
  onClose,
  onConnected,
}: {
  lang: Lang;
  onClose: () => void;
  onConnected: (mailbox: PublicMailbox) => void;
}) {
  const fr = lang === "fr";
  const [preset, setPreset] = useState<MailboxPresetId>("gmail");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [dailyLimit, setDailyLimit] = useState(MAILBOX_PRESETS.gmail.suggestedDailyLimit);
  const [signature, setSignature] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [server, setServer] = useState(() => ({ ...MAILBOX_PRESETS.gmail }));
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const choosePreset = (id: MailboxPresetId) => {
    setPreset(id);
    setServer({ ...MAILBOX_PRESETS[id] });
    setDailyLimit(MAILBOX_PRESETS[id].suggestedDailyLimit);
    setAdvanced(id === "custom");
    setResult(null);
  };

  const onEmailBlur = () => {
    if (!email.includes("@")) return;
    const guess = guessPresetFromEmail(email);
    if (guess !== "custom" && guess !== preset) choosePreset(guess);
  };

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const res = await aoFetch<{ mailbox?: PublicMailbox; step?: string }>("/api/mailboxes", {
      method: "POST",
      json: {
        lang,
        preset,
        fromEmail: email,
        fromName: name,
        username: username || email,
        // Google shows app passwords in groups of four; other passwords are sent as typed.
        password: preset === "gmail" ? password.replace(/\s+/g, "") : password,
        dailyLimit: clampDailyLimit(dailyLimit),
        signature,
        smtpHost: server.smtpHost,
        smtpPort: server.smtpPort,
        smtpSecure: server.smtpSecure,
        imapHost: server.imapHost,
        imapPort: server.imapPort,
      },
    });
    setBusy(false);
    if (res.ok && res.data.mailbox) {
      setResult({
        ok: true,
        text: fr
          ? "Connexion réussie : envoi (SMTP) et lecture des réponses (IMAP) vérifiés."
          : "Connected: sending (SMTP) and reply reading (IMAP) both verified.",
      });
      setPassword("");
      onConnected(res.data.mailbox);
      return;
    }
    const step = res.data.step === "smtp" ? (fr ? "Envoi (SMTP) : " : "Sending (SMTP): ") : res.data.step === "imap" ? (fr ? "Lecture (IMAP) : " : "Reading (IMAP): ") : "";
    setResult({ ok: false, text: step + aoError(res.data.error, lang) });
  };

  return (
    <div className="ao-overlay" onClick={onClose} role="presentation">
      <div className="ao-modal" role="dialog" aria-modal="true" aria-labelledby="ao-connect-title" onClick={(e) => e.stopPropagation()}>
        <div className="ao-modal__head">
          <div>
            <h2 id="ao-connect-title" className="ao-title" style={{ fontSize: 17 }}>
              {fr ? "Connecter votre boîte mail" : "Connect your mailbox"}
            </h2>
            <p className="ao-sub">
              {fr
                ? "Les e-mails partent de votre propre adresse, et les réponses arrivent dans votre boîte. Votre mot de passe est chiffré et n'est jamais affiché."
                : "Emails go out from your own address and replies land in your inbox. Your password is encrypted and never shown again."}
            </p>
          </div>
          <button type="button" className="ao-close" onClick={onClose} aria-label={fr ? "Fermer" : "Close"}>
            <IconClose />
          </button>
        </div>

        <div className="ao-stack">
          <div className="ao-presets" role="radiogroup" aria-label={fr ? "Fournisseur" : "Provider"}>
            {PRESET_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={preset === id}
                className={`ao-chip${preset === id ? " is-active" : ""}`}
                onClick={() => choosePreset(id)}
              >
                {presetLabel(id, lang)}
              </button>
            ))}
          </div>

          <HowTo preset={preset} lang={lang} />

          <div className="ao-grid2">
            <label className="ao-field">
              <span className="ao-label">{fr ? "Adresse e-mail" : "Email address"}</span>
              <input className="ao-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={onEmailBlur} placeholder="you@brand.com" />
            </label>
            <label className="ao-field">
              <span className="ao-label">{fr ? "Nom affiché" : "Display name"}</span>
              <input className="ao-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={fr ? "Camille de Marque" : "Alex from Brand"} />
            </label>
          </div>
          <label className="ao-field">
            <span className="ao-label">{preset === "gmail" ? (fr ? "Mot de passe d'application" : "App password") : fr ? "Mot de passe" : "Password"}</span>
            <input className="ao-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="ao-grid2">
            <label className="ao-field">
              <span className="ao-label">{fr ? "Limite d'envoi par jour" : "Daily sending limit"}</span>
              <input className="ao-input" type="number" min={1} max={500} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
              <span className="ao-hint">
                {fr ? "30 à 50 par jour et par boîte protège votre réputation d'envoi." : "30 to 50 a day per mailbox protects your sender reputation."}
              </span>
            </label>
            <label className="ao-field">
              <span className="ao-label">{fr ? "Signature (optionnelle)" : "Signature (optional)"}</span>
              <textarea className="ao-textarea" style={{ minHeight: 64 }} value={signature} onChange={(e) => setSignature(e.target.value)} />
            </label>
          </div>

          <button type="button" className="ao-btn ao-btn--ghost ao-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdvanced((v) => !v)}>
            {advanced ? (fr ? "Masquer les réglages serveur" : "Hide server settings") : fr ? "Réglages serveur" : "Server settings"}
          </button>
          {advanced && (
            <div className="ao-stack">
              <div className="ao-grid3">
                <label className="ao-field">
                  <span className="ao-label">SMTP</span>
                  <input className="ao-input" value={server.smtpHost} onChange={(e) => setServer({ ...server, smtpHost: e.target.value })} placeholder="smtp.example.com" />
                </label>
                <label className="ao-field">
                  <span className="ao-label">Port</span>
                  <input
                    className="ao-input"
                    type="number"
                    value={server.smtpPort}
                    onChange={(e) => {
                      const port = Number(e.target.value);
                      setServer({ ...server, smtpPort: port, smtpSecure: port === 465 });
                    }}
                  />
                </label>
                <label className="ao-field">
                  <span className="ao-label">{fr ? "Chiffrement" : "Encryption"}</span>
                  <select className="ao-select" value={server.smtpSecure ? "ssl" : "starttls"} onChange={(e) => setServer({ ...server, smtpSecure: e.target.value === "ssl" })}>
                    <option value="ssl">SSL/TLS</option>
                    <option value="starttls">STARTTLS</option>
                  </select>
                </label>
              </div>
              <div className="ao-grid3">
                <label className="ao-field">
                  <span className="ao-label">IMAP</span>
                  <input className="ao-input" value={server.imapHost} onChange={(e) => setServer({ ...server, imapHost: e.target.value })} placeholder="imap.example.com" />
                </label>
                <label className="ao-field">
                  <span className="ao-label">Port</span>
                  <input className="ao-input" type="number" value={server.imapPort} onChange={(e) => setServer({ ...server, imapPort: Number(e.target.value) })} />
                </label>
                <label className="ao-field">
                  <span className="ao-label">{fr ? "Identifiant" : "Username"}</span>
                  <input className="ao-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={email || (fr ? "adresse complète" : "full address")} />
                </label>
              </div>
            </div>
          )}

          {result && (
            <div className={`ao-result ${result.ok ? "ao-result--ok" : "ao-result--bad"}`} role="status">
              {result.ok ? <IconCheck /> : <IconAlert />}
              <span>{result.text}</span>
            </div>
          )}

          <div className="ao-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ao-btn" onClick={onClose}>
              {result?.ok ? (fr ? "Terminé" : "Done") : fr ? "Annuler" : "Cancel"}
            </button>
            {!result?.ok && (
              <button type="button" className="ao-btn ao-btn--primary" disabled={busy || !email || !password} onClick={() => void submit()}>
                {busy ? <Spinner /> : null}
                {busy ? (fr ? "Vérification…" : "Checking…") : fr ? "Tester et connecter" : "Test and connect"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
