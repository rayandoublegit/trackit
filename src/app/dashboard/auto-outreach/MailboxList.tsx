"use client";

import { useCallback, useEffect, useState } from "react";
import { MAILBOX_PRESETS, type PublicMailbox } from "@/lib/mailbox-providers";
import { useLang } from "@/lib/useLang";
import { aoError, aoFetch, IconAlert, IconMail, IconPlus, IconSend, IconTrash, Spinner, type Lang } from "./auto-outreach-client";
import { MailboxConnectModal } from "./MailboxConnectModal";
import "./auto-outreach.css";

function providerLabel(m: PublicMailbox): string {
  if (m.provider === "gmail") return MAILBOX_PRESETS.gmail.label;
  if (m.provider === "outlook") return MAILBOX_PRESETS.outlook.label;
  return m.smtp_host ?? "SMTP";
}

export function useMailboxes() {
  const [mailboxes, setMailboxes] = useState<PublicMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const res = await aoFetch<{ mailboxes?: PublicMailbox[] }>("/api/mailboxes");
    setLoading(false);
    if (!res.ok) {
      setError(res.data.error ?? "error");
      return;
    }
    setError(null);
    setMailboxes(res.data.mailboxes ?? []);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { mailboxes, loading, error, reload };
}

/** Connected mailboxes with connect / test / remove. Used in Settings and Outreach. */
export function MailboxList({ lang: langProp, embedded }: { lang?: Lang; embedded?: boolean }) {
  const appLang = useLang();
  const lang: Lang = langProp ?? (appLang === "fr" ? "fr" : "en");
  const fr = lang === "fr";
  const { mailboxes, loading, error, reload } = useMailboxes();
  const [connectOpen, setConnectOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const sendTest = async (m: PublicMailbox) => {
    setBusyId(m.id);
    setNotice(null);
    const res = await aoFetch<{ sentTo?: string }>("/api/mailboxes/test", { method: "POST", json: { id: m.id, lang } });
    setBusyId(null);
    setNotice({
      id: m.id,
      ok: res.ok,
      text: res.ok
        ? fr
          ? `E-mail de test envoyé à ${res.data.sentTo}. Vérifiez votre boîte de réception.`
          : `Test email sent to ${res.data.sentTo}. Check your inbox.`
        : aoError(res.data.error, lang),
    });
    void reload();
  };

  const remove = async (m: PublicMailbox) => {
    const ok = window.confirm(
      fr
        ? `Déconnecter ${m.from_email} ? Les campagnes actives qui l'utilisent seront mises en pause.`
        : `Disconnect ${m.from_email}? Active campaigns using it will be paused.`,
    );
    if (!ok) return;
    setBusyId(m.id);
    await aoFetch(`/api/mailboxes?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    setBusyId(null);
    void reload();
  };

  const body = (
    <>
      <div className="ao-card__head">
        <div>
          <h3 className="ao-title">{fr ? "Boîtes mail connectées" : "Connected mailboxes"}</h3>
          <p className="ao-sub">
            {fr
              ? "Envoyez vos campagnes automatiques depuis votre propre adresse (Gmail, Outlook, OVH ou tout domaine)."
              : "Send automatic campaigns from your own address (Gmail, Outlook, OVH or any domain)."}
          </p>
        </div>
        {error !== "plan_required" && (
          <button type="button" className="ao-btn ao-btn--primary" onClick={() => setConnectOpen(true)}>
            <IconPlus size={14} />
            {fr ? "Connecter une boîte" : "Connect a mailbox"}
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div className="ao-row ao-muted" style={{ fontSize: 13 }}>
            <Spinner /> {fr ? "Chargement…" : "Loading…"}
          </div>
        ) : error ? (
          <div className="ao-callout">{aoError(error, lang)}</div>
        ) : mailboxes.length === 0 ? (
          <div className="ao-callout">{fr ? "Aucune boîte connectée pour l'instant." : "No mailbox connected yet."}</div>
        ) : (
          <div className="ao-list">
            {mailboxes.map((m) => (
              <div key={m.id}>
                <div className="ao-list__row">
                  <span className="ao-icon-box">
                    <IconMail />
                  </span>
                  <div className="ao-grow">
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {m.from_name ? `${m.from_name} · ` : ""}
                      {m.from_email}
                    </div>
                    <div className="ao-hint">
                      {providerLabel(m)} · {fr ? `${m.sent_last_24h ?? 0} / ${m.daily_limit} envoyés sur 24 h` : `${m.sent_last_24h ?? 0} / ${m.daily_limit} sent in 24 h`}
                    </div>
                  </div>
                  {m.status === "connected" ? (
                    <span className="ao-badge ao-badge--ok">
                      <span className="ao-dot" />
                      {fr ? "Connectée" : "Connected"}
                    </span>
                  ) : (
                    <span className="ao-badge ao-badge--bad" title={m.last_error ?? ""}>
                      <IconAlert size={12} />
                      {fr ? "Erreur" : "Error"}
                    </span>
                  )}
                  <button type="button" className="ao-btn ao-btn--sm" disabled={busyId === m.id} onClick={() => void sendTest(m)}>
                    {busyId === m.id ? <Spinner /> : <IconSend size={13} />}
                    {fr ? "Envoyer un test" : "Send a test"}
                  </button>
                  <button type="button" className="ao-btn ao-btn--sm ao-btn--ghost ao-btn--danger" disabled={busyId === m.id} onClick={() => void remove(m)} aria-label={fr ? "Déconnecter" : "Disconnect"}>
                    <IconTrash size={13} />
                  </button>
                </div>
                {m.status === "error" && m.last_error && (
                  <div className="ao-hint" style={{ marginTop: -4, marginBottom: 8 }}>
                    {fr ? "Dernière erreur : " : "Last error: "}
                    {m.last_error}. {fr ? "Reconnectez la boîte avec le bon mot de passe." : "Reconnect the mailbox with the right password."}
                  </div>
                )}
                {notice?.id === m.id && (
                  <div className={`ao-result ${notice.ok ? "ao-result--ok" : "ao-result--bad"}`} style={{ marginBottom: 10 }} role="status">
                    <span>{notice.text}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {connectOpen && (
        <MailboxConnectModal
          lang={lang}
          onClose={() => {
            setConnectOpen(false);
            void reload();
          }}
          onConnected={() => void reload()}
        />
      )}
    </>
  );

  return embedded ? body : <div className="ao-card">{body}</div>;
}
