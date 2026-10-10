"use client";

// Automatic, personalised email campaigns from the brand's own mailbox.
// Entry card (in Outreach) -> builder -> review 2-3 personalised drafts -> launch
// -> progress per creator (sent / replied / pending), pause / resume.
import { useCallback, useEffect, useMemo, useState } from "react";
import { canUseAIOutreach, type PlanTier } from "@/lib/plan-limits";
import { useLang } from "@/lib/useLang";
import {
  aoError,
  aoFetch,
  IconAlert,
  IconBack,
  IconClose,
  IconMail,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconSpark,
  IconTrash,
  Spinner,
  type Lang,
} from "./auto-outreach-client";
import { MailboxList, useMailboxes } from "./MailboxList";
import { MailboxConnectModal } from "./MailboxConnectModal";
import "./auto-outreach.css";

type Stats = {
  total: number;
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
  emails_sent: number;
};

type Step = { delay_days: number };
type SendWin = { days: number[]; start_hour: number; end_hour: number; timezone: string };

type Sequence = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "done";
  mailbox_id: string | null;
  brand_pitch: string;
  tone: string;
  lang: string;
  steps: Step[];
  send_window: SendWin;
  created_at: string;
  launched_at: string | null;
  stats?: Stats;
};

type Contact = {
  id: string;
  creator_username: string;
  creator_email: string;
  creator_name: string;
  status: "pending" | "sent" | "replied" | "bounced" | "unsubscribed" | "failed";
  step_index: number;
  next_send_at: string | null;
  sent_count: number;
  last_error: string | null;
};

type Audience = {
  saved: { total: number; withEmail: number };
  folders: Array<{ id: string; name: string; total: number; withEmail: number }>;
  creators: Array<{ username: string; platform: string; name: string; hasEmail: boolean }>;
};

type Preview = {
  contactId: string;
  name: string;
  email: string;
  username: string;
  facts: string[];
  subject?: string;
  body?: string;
  fullText?: string;
  error?: string;
};

const TONES = ["friendly", "professional", "casual", "direct"] as const;

function toneLabel(t: string, fr: boolean): string {
  const map: Record<string, [string, string]> = {
    friendly: ["Friendly", "Chaleureux"],
    professional: ["Professional", "Professionnel"],
    casual: ["Casual", "Décontracté"],
    direct: ["Direct", "Direct"],
  };
  const pair = map[t] ?? map.friendly;
  return fr ? pair[1] : pair[0];
}

function sequenceStatusBadge(s: Sequence["status"], fr: boolean) {
  const label = {
    draft: fr ? "Brouillon" : "Draft",
    active: fr ? "En cours" : "Running",
    paused: fr ? "En pause" : "Paused",
    done: fr ? "Terminée" : "Finished",
  }[s];
  return <span className={`ao-badge${s === "active" ? " ao-badge--live" : ""}`}>{s === "active" && <span className="ao-dot" />}{label}</span>;
}

function contactStatusBadge(s: Contact["status"], fr: boolean) {
  const label = {
    pending: fr ? "En attente" : "Pending",
    sent: fr ? "Envoyé" : "Sent",
    replied: fr ? "A répondu" : "Replied",
    bounced: fr ? "Rejeté" : "Bounced",
    unsubscribed: fr ? "Désinscrit" : "Opted out",
    failed: fr ? "Échec" : "Failed",
  }[s];
  const cls = s === "replied" ? " ao-badge--ok" : s === "bounced" || s === "failed" ? " ao-badge--bad" : "";
  return <span className={`ao-badge${cls}`}>{label}</span>;
}

function formatDateTime(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
}

// ── Entry card ──────────────────────────────────────────────────────────────────

export function AutoOutreachEntry({ plan, onUpgrade }: { plan: PlanTier; onUpgrade?: () => void }) {
  const appLang = useLang();
  const lang: Lang = appLang === "fr" ? "fr" : "en";
  const fr = lang === "fr";
  const allowed = canUseAIOutreach(plan);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(allowed);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [mailboxesOpen, setMailboxesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await aoFetch<{ sequences?: Sequence[] }>("/api/outreach/sequences");
    setLoading(false);
    if (res.ok) setSequences(res.data.sequences ?? []);
  }, []);
  useEffect(() => {
    if (allowed) void reload();
  }, [allowed, reload]);

  if (!allowed) {
    return (
      <div className="ao-card" style={{ marginBottom: 20 }}>
        <div className="ao-card__head">
          <div className="ao-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <span className="ao-icon-box"><IconMail /></span>
            <div>
              <h3 className="ao-title">{fr ? "Campagnes e-mail automatiques" : "Automatic email campaigns"}</h3>
              <p className="ao-sub">
                {fr
                  ? "Connectez votre boîte mail et laissez Trackit écrire et envoyer un e-mail personnalisé à chaque créateur, avec relances et suivi des réponses. Inclus dans les offres Pro et Scale."
                  : "Connect your mailbox and let Trackit write and send a personalised email to every creator, with follow-ups and reply tracking. Included in Pro and Scale."}
              </p>
            </div>
          </div>
          {onUpgrade && (
            <button type="button" className="ao-btn ao-btn--primary" onClick={onUpgrade}>
              {fr ? "Passer à Pro" : "Upgrade to Pro"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ao-card" style={{ marginBottom: 20 }}>
      <div className="ao-card__head">
        <div className="ao-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <span className="ao-icon-box"><IconMail /></span>
          <div>
            <h3 className="ao-title">{fr ? "Campagnes e-mail automatiques" : "Automatic email campaigns"}</h3>
            <p className="ao-sub">
              {fr
                ? "Un e-mail personnalisé par créateur, écrit à partir de ses vraies données, envoyé depuis votre boîte, avec relances automatiques."
                : "One personalised email per creator, written from their real data, sent from your mailbox, with automatic follow-ups."}
            </p>
          </div>
        </div>
        <div className="ao-row">
          <button type="button" className="ao-btn" onClick={() => setMailboxesOpen(true)}>
            {fr ? "Boîtes mail" : "Mailboxes"}
          </button>
          <button type="button" className="ao-btn ao-btn--primary" onClick={() => setBuilderOpen(true)}>
            <IconPlus size={14} />
            {fr ? "Nouvelle campagne" : "New campaign"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="ao-row ao-muted" style={{ fontSize: 13 }}><Spinner /> {fr ? "Chargement…" : "Loading…"}</div>
        ) : sequences.length === 0 ? (
          <div className="ao-hint">{fr ? "Aucune campagne pour l'instant." : "No campaigns yet."}</div>
        ) : (
          <div className="ao-list">
            {sequences.map((s) => {
              const st = s.stats;
              return (
                <div key={s.id} className="ao-list__row ao-list__row--click" role="button" tabIndex={0} onClick={() => setDetailId(s.id)} onKeyDown={(e) => e.key === "Enter" && setDetailId(s.id)}>
                  <div className="ao-grow">
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s.name || (fr ? "Campagne" : "Campaign")}</div>
                    <div className="ao-hint">
                      {st
                        ? fr
                          ? `${st.total} créateurs · ${st.emails_sent} e-mails envoyés · ${st.replied} réponses`
                          : `${st.total} creators · ${st.emails_sent} emails sent · ${st.replied} replies`
                        : ""}
                    </div>
                  </div>
                  {sequenceStatusBadge(s.status, fr)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mailboxesOpen && (
        <div className="ao-overlay" onClick={() => setMailboxesOpen(false)} role="presentation">
          <div className="ao-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="ao-modal__head" style={{ marginBottom: 0, justifyContent: "flex-end" }}>
              <button type="button" className="ao-close" onClick={() => setMailboxesOpen(false)} aria-label={fr ? "Fermer" : "Close"}><IconClose /></button>
            </div>
            <MailboxList lang={lang} embedded />
          </div>
        </div>
      )}
      {builderOpen && (
        <SequenceBuilder
          lang={lang}
          onClose={() => setBuilderOpen(false)}
          onCreated={(id) => {
            setBuilderOpen(false);
            setDetailId(id);
            void reload();
          }}
        />
      )}
      {detailId && (
        <SequenceDetail
          lang={lang}
          id={detailId}
          onClose={() => {
            setDetailId(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ── Builder ─────────────────────────────────────────────────────────────────────

function SequenceBuilder({ lang, onClose, onCreated }: { lang: Lang; onClose: () => void; onCreated: (id: string) => void }) {
  const fr = lang === "fr";
  const { mailboxes, loading: mailboxesLoading, error: mailboxesError, reload: reloadMailboxes } = useMailboxes();
  const [connectOpen, setConnectOpen] = useState(false);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mailboxId, setMailboxId] = useState("");
  const [source, setSource] = useState<"saved" | "folder" | "creators">("saved");
  const [folderId, setFolderId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pitch, setPitch] = useState("");
  const [tone, setTone] = useState<string>("friendly");
  const [seqLang, setSeqLang] = useState<Lang>(lang);
  const [steps, setSteps] = useState<Step[]>([{ delay_days: 0 }, { delay_days: 3 }, { delay_days: 5 }]);
  const [sendWin, setSendWin] = useState<SendWin>({ days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 18, timezone: defaultTimeZone() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void aoFetch<Audience>("/api/outreach/sequences/contacts?audience=1").then((res) => {
      if (res.ok) {
        setAudience(res.data);
        if (res.data.folders[0]) setFolderId(res.data.folders[0].id);
      } else {
        setAudienceError(aoError(res.data.error, lang));
      }
    });
  }, [lang]);
  useEffect(() => {
    if (!mailboxId) {
      const first = mailboxes.find((m) => m.status === "connected");
      if (first) setMailboxId(first.id);
    }
  }, [mailboxes, mailboxId]);

  const recipients = useMemo(() => {
    if (!audience) return 0;
    if (source === "saved") return audience.saved.withEmail;
    if (source === "folder") return audience.folders.find((f) => f.id === folderId)?.withEmail ?? 0;
    return selected.size;
  }, [audience, source, folderId, selected]);

  const dayLabels = fr ? ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const canSubmit = Boolean(mailboxId && pitch.trim().length >= 20 && recipients > 0 && sendWin.days.length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const created = await aoFetch<{ sequence?: { id: string } }>("/api/outreach/sequences", {
      method: "POST",
      json: {
        name: name.trim() || (fr ? "Campagne" : "Campaign"),
        mailboxId,
        brandPitch: pitch,
        tone,
        lang: seqLang,
        steps,
        sendWindow: sendWin,
      },
    });
    const id = created.data.sequence?.id;
    if (!created.ok || !id) {
      setBusy(false);
      setError(aoError(created.data.error, lang));
      return;
    }
    const creatorsPayload =
      source === "creators"
        ? (audience?.creators ?? []).filter((c) => selected.has(c.username)).map((c) => ({ username: c.username, platform: c.platform }))
        : undefined;
    const added = await aoFetch<{ added?: number }>("/api/outreach/sequences/contacts", {
      method: "POST",
      json: { sequenceId: id, source, folderId: source === "folder" ? folderId : undefined, creators: creatorsPayload },
    });
    setBusy(false);
    if (!added.ok) {
      setError(aoError(added.data.error, lang));
      return;
    }
    onCreated(id);
  };

  return (
    <div className="ao-overlay" onClick={onClose} role="presentation">
      <div className="ao-modal ao-modal--wide" role="dialog" aria-modal="true" aria-labelledby="ao-builder-title" onClick={(e) => e.stopPropagation()}>
        <div className="ao-modal__head">
          <div>
            <h2 id="ao-builder-title" className="ao-title" style={{ fontSize: 17 }}>{fr ? "Nouvelle campagne automatique" : "New automatic campaign"}</h2>
            <p className="ao-sub">
              {fr
                ? "Vous relirez 2 ou 3 e-mails personnalisés avant le lancement."
                : "You will review 2 or 3 personalised emails before anything is sent."}
            </p>
          </div>
          <button type="button" className="ao-close" onClick={onClose} aria-label={fr ? "Fermer" : "Close"}><IconClose /></button>
        </div>

        <label className="ao-field">
          <span className="ao-label">{fr ? "Nom de la campagne" : "Campaign name"}</span>
          <input className="ao-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={fr ? "Lancement printemps" : "Spring launch"} />
        </label>

        <div className="ao-section">
          <h4 className="ao-section__title"><span className="ao-num">1</span>{fr ? "Boîte d'envoi" : "Sending mailbox"}</h4>
          {mailboxesLoading ? (
            <Spinner />
          ) : mailboxesError ? (
            <div className="ao-callout">{aoError(mailboxesError, lang)}</div>
          ) : mailboxes.length === 0 ? (
            <div className="ao-row">
              <span className="ao-hint">{fr ? "Connectez d'abord votre boîte mail." : "Connect your mailbox first."}</span>
              <button type="button" className="ao-btn ao-btn--sm ao-btn--primary" onClick={() => setConnectOpen(true)}>
                {fr ? "Connecter une boîte" : "Connect a mailbox"}
              </button>
            </div>
          ) : (
            <select className="ao-select" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id} disabled={m.status !== "connected"}>
                  {m.from_email} {m.status !== "connected" ? (fr ? "(erreur)" : "(error)") : `(${m.daily_limit}/${fr ? "jour" : "day"})`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="ao-section">
          <h4 className="ao-section__title"><span className="ao-num">2</span>{fr ? "Créateurs" : "Creators"}</h4>
          {audienceError ? (
            <div className="ao-callout">{audienceError}</div>
          ) : !audience ? (
            <Spinner />
          ) : (
            <div className="ao-stack">
              <div className="ao-presets">
                <button type="button" className={`ao-chip${source === "saved" ? " is-active" : ""}`} onClick={() => setSource("saved")}>
                  {fr ? `Tous mes créateurs (${audience.saved.withEmail} avec e-mail sur ${audience.saved.total})` : `All saved creators (${audience.saved.withEmail} with an email of ${audience.saved.total})`}
                </button>
                <button type="button" className={`ao-chip${source === "folder" ? " is-active" : ""}`} onClick={() => setSource("folder")} disabled={audience.folders.length === 0}>
                  {fr ? "Une liste" : "A list"}
                </button>
                <button type="button" className={`ao-chip${source === "creators" ? " is-active" : ""}`} onClick={() => setSource("creators")}>
                  {fr ? "Choisir des créateurs" : "Pick creators"}
                </button>
              </div>
              {source === "folder" && (
                <select className="ao-select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                  {audience.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {fr ? `${f.withEmail} avec e-mail sur ${f.total}` : `${f.withEmail} with an email of ${f.total}`}
                    </option>
                  ))}
                </select>
              )}
              {source === "creators" && (
                <div className="ao-checklist">
                  {audience.creators.length === 0 && <div className="ao-hint" style={{ padding: 12 }}>{fr ? "Aucun créateur enregistré." : "No saved creators."}</div>}
                  {audience.creators.map((c) => (
                    <label key={c.username} className={c.hasEmail ? "" : "is-disabled"}>
                      <input
                        type="checkbox"
                        disabled={!c.hasEmail}
                        checked={selected.has(c.username)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(c.username);
                          else next.delete(c.username);
                          setSelected(next);
                        }}
                      />
                      <span className="ao-grow">{c.name} <span className="ao-dim">@{c.username}</span></span>
                      {!c.hasEmail && <span className="ao-hint">{fr ? "pas d'e-mail" : "no email"}</span>}
                    </label>
                  ))}
                </div>
              )}
              <div className="ao-hint">
                {fr
                  ? `${recipients} créateur(s) recevront la campagne. Les créateurs sans e-mail, désinscrits ou rejetés sont ignorés.`
                  : `${recipients} creator(s) will get the campaign. Creators without an email, who opted out or bounced are skipped.`}
              </div>
            </div>
          )}
        </div>

        <div className="ao-section">
          <h4 className="ao-section__title"><span className="ao-num">3</span>{fr ? "Votre offre" : "Your offer"}</h4>
          <div className="ao-stack">
            <label className="ao-field">
              <span className="ao-label">{fr ? "Ce que vous proposez aux créateurs" : "What you offer creators"}</span>
              <textarea
                className="ao-textarea"
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder={
                  fr
                    ? "Ex. : Nous sommes Maison Lune, soins visage naturels. Nous offrons le produit + 20 % de commission sur chaque vente avec votre code."
                    : "E.g. We are Lune Skincare, natural face care. We send the product for free + 20% commission on every sale with your code."
                }
              />
              <span className="ao-hint">
                {fr
                  ? "Les chiffres (commission, prix…) ne viennent que d'ici et des données réelles du créateur : l'IA n'en invente jamais."
                  : "Figures (commission, prices…) only come from here and the creator's real data: the AI never invents any."}
              </span>
            </label>
            <div className="ao-grid2">
              <label className="ao-field">
                <span className="ao-label">{fr ? "Ton" : "Tone"}</span>
                <select className="ao-select" value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => <option key={t} value={t}>{toneLabel(t, fr)}</option>)}
                </select>
              </label>
              <label className="ao-field">
                <span className="ao-label">{fr ? "Langue par défaut" : "Default language"}</span>
                <select className="ao-select" value={seqLang} onChange={(e) => setSeqLang(e.target.value === "fr" ? "fr" : "en")}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
                <span className="ao-hint">{fr ? "Chaque créateur reçoit l'e-mail dans sa langue quand on la connaît." : "Each creator gets the email in their own language when we know it."}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="ao-section">
          <h4 className="ao-section__title"><span className="ao-num">4</span>{fr ? "E-mails et relances" : "Emails and follow-ups"}</h4>
          <div className="ao-stack">
            {steps.map((s, i) => (
              <div key={i} className="ao-row">
                <span className="ao-badge">{i === 0 ? (fr ? "Premier e-mail" : "First email") : fr ? `Relance ${i}` : `Follow-up ${i}`}</span>
                {i === 0 ? (
                  <span className="ao-hint">{fr ? "dès l'ouverture de la plage d'envoi" : "as soon as the sending window opens"}</span>
                ) : (
                  <>
                    <input
                      className="ao-input"
                      style={{ width: 72 }}
                      type="number"
                      min={1}
                      max={30}
                      value={s.delay_days}
                      onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { delay_days: Math.max(1, Math.min(30, Number(e.target.value) || 1)) } : x)))}
                    />
                    <span className="ao-hint">{fr ? "jours après l'e-mail précédent, sans réponse" : "days after the previous email, if no reply"}</span>
                    <button type="button" className="ao-btn ao-btn--sm ao-btn--ghost" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={fr ? "Retirer" : "Remove"}>
                      <IconTrash size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {steps.length < 4 && (
              <button type="button" className="ao-btn ao-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setSteps([...steps, { delay_days: 4 }])}>
                <IconPlus size={13} /> {fr ? "Ajouter une relance" : "Add a follow-up"}
              </button>
            )}
            <span className="ao-hint">{fr ? "Les relances partent dans le même fil et s'arrêtent dès que le créateur répond." : "Follow-ups go in the same thread and stop as soon as the creator replies."}</span>
          </div>
        </div>

        <div className="ao-section">
          <h4 className="ao-section__title"><span className="ao-num">5</span>{fr ? "Plage d'envoi" : "Sending window"}</h4>
          <div className="ao-stack">
            <div className="ao-days">
              {dayLabels.map((label, i) => {
                const d = i + 1;
                const on = sendWin.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`ao-chip${on ? " is-active" : ""}`}
                    aria-pressed={on}
                    onClick={() => setSendWin({ ...sendWin, days: on ? sendWin.days.filter((x) => x !== d) : [...sendWin.days, d].sort() })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="ao-grid3">
              <label className="ao-field">
                <span className="ao-label">{fr ? "Fuseau horaire" : "Time zone"}</span>
                <input className="ao-input" value={sendWin.timezone} onChange={(e) => setSendWin({ ...sendWin, timezone: e.target.value })} />
              </label>
              <label className="ao-field">
                <span className="ao-label">{fr ? "De" : "From"}</span>
                <select className="ao-select" value={sendWin.start_hour} onChange={(e) => setSendWin({ ...sendWin, start_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${h}:00`}</option>)}
                </select>
              </label>
              <label className="ao-field">
                <span className="ao-label">{fr ? "À" : "To"}</span>
                <select className="ao-select" value={sendWin.end_hour} onChange={(e) => setSendWin({ ...sendWin, end_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
                </select>
              </label>
            </div>
            <span className="ao-hint">
              {fr
                ? "Envois espacés de 1 à 3 minutes au minimum, dans la limite quotidienne de la boîte."
                : "Emails are spaced at least 1 to 3 minutes apart, within the mailbox's daily limit."}
            </span>
          </div>
        </div>

        {error && (
          <div className="ao-result ao-result--bad" style={{ marginTop: 16 }} role="alert"><IconAlert /><span>{error}</span></div>
        )}
        <div className="ao-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="ao-btn" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</button>
          <button type="button" className="ao-btn ao-btn--primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
            {busy ? <Spinner /> : <IconSpark size={14} />}
            {fr ? "Créer et voir les aperçus" : "Create and preview"}
          </button>
        </div>
        {!canSubmit && (
          <div className="ao-hint" style={{ textAlign: "right", marginTop: 6 }}>
            {fr ? "Il faut une boîte connectée, au moins un créateur avec e-mail et une offre de 20 caractères ou plus." : "You need a connected mailbox, at least one creator with an email and an offer of 20+ characters."}
          </div>
        )}

        {connectOpen && (
          <MailboxConnectModal
            lang={lang}
            onClose={() => {
              setConnectOpen(false);
              void reloadMailboxes();
            }}
            onConnected={() => void reloadMailboxes()}
          />
        )}
      </div>
    </div>
  );
}

// ── Detail: review, launch, progress ─────────────────────────────────────────────

function SequenceDetail({ lang, id, onClose }: { lang: Lang; id: string; onClose: () => void }) {
  const fr = lang === "fr";
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await aoFetch<{ sequence?: Sequence; contacts?: Contact[]; stats?: Stats }>(`/api/outreach/sequences?id=${encodeURIComponent(id)}`);
    if (!res.ok || !res.data.sequence) {
      setError(aoError(res.data.error, lang));
      return;
    }
    setSequence(res.data.sequence);
    setContacts(res.data.contacts ?? []);
    setStats(res.data.stats ?? null);
  }, [id, lang]);

  const loadPreviews = useCallback(
    async (contactId?: string) => {
      setPreviewBusy(contactId ?? "all");
      const res = await aoFetch<{ previews?: Preview[] }>("/api/outreach/sequences/preview", {
        method: "POST",
        json: contactId ? { sequenceId: id, contactId, regenerate: true } : { sequenceId: id, count: 3 },
      });
      setPreviewBusy(null);
      if (!res.ok) {
        setError(aoError(res.data.error, lang));
        return;
      }
      const incoming = res.data.previews ?? [];
      setPreviews((prev) => {
        if (!contactId || !prev) return incoming;
        return prev.map((p) => incoming.find((n) => n.contactId === p.contactId) ?? p);
      });
    },
    [id, lang],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (sequence?.status === "draft" && previews === null && contacts.length > 0) void loadPreviews();
  }, [sequence?.status, previews, contacts.length, loadPreviews]);

  const act = async (action: "launch" | "pause" | "resume") => {
    setBusy(true);
    setError(null);
    const res = await aoFetch("/api/outreach/sequences", { method: "PATCH", json: { id, action } });
    setBusy(false);
    if (!res.ok) setError(aoError(res.data.error, lang));
    void load();
  };

  const remove = async () => {
    if (!window.confirm(fr ? "Supprimer cette campagne ? Les e-mails déjà envoyés restent dans l'historique." : "Delete this campaign? Emails already sent stay in the history.")) return;
    await aoFetch(`/api/outreach/sequences?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    onClose();
  };

  const handled = stats ? stats.total - stats.pending : 0;
  const pct = stats && stats.total ? Math.round((handled / stats.total) * 100) : 0;
  const stepCount = sequence?.steps?.length ?? 1;
  const previewErrors = (previews ?? []).filter((p) => p.error).length;

  return (
    <div className="ao-overlay" onClick={onClose} role="presentation">
      <div className="ao-modal ao-modal--wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ao-modal__head">
          <div className="ao-row" style={{ flexWrap: "nowrap" }}>
            <button type="button" className="ao-close" onClick={onClose} aria-label={fr ? "Retour" : "Back"}><IconBack /></button>
            <div>
              <div className="ao-row">
                <h2 className="ao-title" style={{ fontSize: 17 }}>{sequence?.name || (fr ? "Campagne" : "Campaign")}</h2>
                {sequence && sequenceStatusBadge(sequence.status, fr)}
              </div>
              {sequence && (
                <p className="ao-sub">
                  {fr
                    ? `${toneLabel(sequence.tone, true)} · ${stepCount} e-mail(s) par créateur`
                    : `${toneLabel(sequence.tone, false)} · ${stepCount} email(s) per creator`}
                </p>
              )}
            </div>
          </div>
          <div className="ao-row">
            <button type="button" className="ao-btn ao-btn--sm" onClick={() => void load()} aria-label={fr ? "Actualiser" : "Refresh"}><IconRefresh size={13} /></button>
            {sequence?.status === "active" && (
              <button type="button" className="ao-btn ao-btn--sm" disabled={busy} onClick={() => void act("pause")}><IconPause size={13} />{fr ? "Pause" : "Pause"}</button>
            )}
            {sequence?.status === "paused" && (
              <button type="button" className="ao-btn ao-btn--sm ao-btn--primary" disabled={busy} onClick={() => void act("resume")}><IconPlay size={13} />{fr ? "Reprendre" : "Resume"}</button>
            )}
            {sequence && sequence.status !== "active" && (
              <button type="button" className="ao-btn ao-btn--sm ao-btn--ghost ao-btn--danger" onClick={() => void remove()} aria-label={fr ? "Supprimer" : "Delete"}><IconTrash size={13} /></button>
            )}
          </div>
        </div>

        {error && <div className="ao-result ao-result--bad" style={{ marginBottom: 14 }} role="alert"><IconAlert /><span>{error}</span></div>}
        {!sequence && !error && <Spinner />}

        {sequence && stats && (
          <>
            <div className="ao-stats">
              <div className="ao-stat"><div className="ao-stat__value">{stats.total}</div><div className="ao-stat__label">{fr ? "Créateurs" : "Creators"}</div></div>
              <div className="ao-stat"><div className="ao-stat__value">{stats.emails_sent}</div><div className="ao-stat__label">{fr ? "E-mails envoyés" : "Emails sent"}</div></div>
              <div className="ao-stat"><div className="ao-stat__value">{stats.replied}</div><div className="ao-stat__label">{fr ? "Réponses" : "Replies"}</div></div>
              <div className="ao-stat"><div className="ao-stat__value">{stats.pending}</div><div className="ao-stat__label">{fr ? "En attente" : "Pending"}</div></div>
              <div className="ao-stat"><div className="ao-stat__value">{stats.bounced + stats.unsubscribed + stats.failed}</div><div className="ao-stat__label">{fr ? "Rejetés / désinscrits / échecs" : "Bounced / opted out / failed"}</div></div>
            </div>
            {sequence.status !== "draft" && (
              <div style={{ marginTop: 12 }}>
                <div className="ao-progress" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} /></div>
                <div className="ao-hint" style={{ marginTop: 6 }}>
                  {fr ? `${handled} créateur(s) contacté(s) sur ${stats.total}` : `${handled} of ${stats.total} creator(s) contacted`}
                </div>
              </div>
            )}
          </>
        )}

        {sequence?.status === "draft" && (
          <div className="ao-section">
            <div className="ao-row" style={{ justifyContent: "space-between" }}>
              <h4 className="ao-section__title" style={{ margin: 0 }}>{fr ? "Aperçus personnalisés" : "Personalised previews"}</h4>
              <button type="button" className="ao-btn ao-btn--sm" disabled={previewBusy !== null} onClick={() => { setPreviews(null); void loadPreviews(); }}>
                {previewBusy === "all" ? <Spinner /> : <IconRefresh size={13} />}{fr ? "Recharger" : "Reload"}
              </button>
            </div>
            <p className="ao-hint" style={{ margin: "6px 0 12px 0" }}>
              {fr
                ? "Ces e-mails partiront tels quels. Les autres créateurs reçoivent un e-mail écrit de la même façon, à partir de leurs propres données, au moment de l'envoi."
                : "These emails will go out exactly as shown. Every other creator gets one written the same way from their own data at send time."}
            </p>
            {previews === null ? (
              <div className="ao-row ao-muted" style={{ fontSize: 13 }}><Spinner /> {fr ? "Rédaction des e-mails…" : "Writing the emails…"}</div>
            ) : (
              <div className="ao-stack">
                {previews.map((p) => (
                  <div key={p.contactId} className="ao-preview">
                    <div className="ao-row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontSize: 13 }}><strong>{p.name}</strong> <span className="ao-dim">{p.email}</span></div>
                      <button type="button" className="ao-btn ao-btn--sm" disabled={previewBusy !== null} onClick={() => void loadPreviews(p.contactId)}>
                        {previewBusy === p.contactId ? <Spinner /> : <IconRefresh size={13} />}{fr ? "Réécrire" : "Rewrite"}
                      </button>
                    </div>
                    <div className="ao-facts" style={{ marginTop: 8 }}>
                      {p.facts.map((f) => <span key={f} className="ao-badge">{f}</span>)}
                    </div>
                    {p.error ? (
                      <div className="ao-result ao-result--bad" style={{ marginTop: 10 }}><IconAlert /><span>{aoError(p.error, lang)}</span></div>
                    ) : (
                      <>
                        <div className="ao-preview__subject">{p.subject}</div>
                        <div className="ao-preview__body">{p.fullText ?? p.body}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="ao-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="ao-btn ao-btn--primary" disabled={busy || previews === null || previewErrors === (previews?.length ?? 0)} onClick={() => void act("launch")}>
                {busy ? <Spinner /> : <IconPlay size={13} />}
                {fr ? `Lancer pour ${stats?.total ?? 0} créateur(s)` : `Launch for ${stats?.total ?? 0} creator(s)`}
              </button>
            </div>
          </div>
        )}

        {sequence && sequence.status !== "draft" && (
          <div className="ao-section">
            <h4 className="ao-section__title">{fr ? "Suivi par créateur" : "Progress per creator"}</h4>
            <div className="ao-table-wrap">
              <table className="ao-table">
                <thead>
                  <tr>
                    <th>{fr ? "Créateur" : "Creator"}</th>
                    <th>{fr ? "Statut" : "Status"}</th>
                    <th>{fr ? "E-mails" : "Emails"}</th>
                    <th>{fr ? "Prochain envoi" : "Next send"}</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{c.creator_name || c.creator_username}</div>
                        <div className="ao-dim">{c.creator_email}</div>
                      </td>
                      <td>
                        {contactStatusBadge(c.status, fr)}
                        {c.last_error && (c.status === "failed" || c.status === "bounced") && <div className="ao-hint" style={{ marginTop: 4, maxWidth: 260 }}>{c.last_error}</div>}
                      </td>
                      <td>{`${c.sent_count} / ${stepCount}`}</td>
                      <td>{(c.status === "pending" || c.status === "sent") && sequence.status !== "paused" ? formatDateTime(c.next_send_at, lang) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
