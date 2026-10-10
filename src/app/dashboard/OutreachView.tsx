"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveOutreach, getOutreachHistory, getSavedCreators, clearOutreachHistory, updateOutreachStatus } from "@/lib/db";
import { dispatchOutreachHistoryUpdated, OUTREACH_HISTORY_UPDATED_EVENT } from "@/lib/outreach-history-events";
import {
  appendStoredOutreachEntry,
  clearStoredOutreachHistory,
  dedupeOutreachEntries,
  loadStoredOutreachHistory,
  outreachEntryFingerprint,
  pruneSyncedOutreachEntries,
  updateStoredOutreachEntry,
  type StoredOutreachEntry,
} from "@/lib/outreach-history-storage";
import {
  avatarUrlForCreatorHandle,
  buildCreatorAvatarMap,
  resolveCreatorAvatarUrl,
} from "@/lib/creator-avatar";
import { CreatorAvatar } from "./CreatorAvatar";
import { prefetchCreatorAvatars } from "@/lib/avatar-url-cache";
import { notifyCreatorReplied, notifyOutreachSent } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { selectionPillColors } from "@/lib/selection-card-styles";
import { buildCreatorEmailMap } from "@/lib/creator-crm";
import { fetchDirectSendAvailable, isValidEmailAddress, openComposeLink, resolveCreatorEmail, sendOutreachEmail } from "@/lib/outreach-email";
import { buildMailComposeLink, mailClientShortName, resolveMailClient } from "@/lib/mail-client";
import { requestContactCreator } from "@/lib/contact-creator-events";
import { AUTO_OUTREACH_ENABLED } from "@/lib/auto-outreach-flag";
import {
  canGenerateAiOutreach,
  canPersistTemplates,
  canUseAutoFollowUp,
  type PlanTier,
} from "@/lib/plan-limits";
import { UpgradeModal } from "./UpgradeModal";
import { runGateUpgrade, type GateFeatureKey } from "@/lib/plan-marketing";
import { AutoOutreachEntry } from "./auto-outreach/AutoOutreachPanel";

type OutreachHistoryStatus = "sent" | "opened" | "replied" | "no_response" | "converted";
type HistoryFilter = "all" | OutreachHistoryStatus;

type OutreachHistoryEntry = {
  id: string;
  creator: string;
  handle: string;
  platform: string;
  avatar: string;
  message: string;
  sentDate: string;
  status: OutreachHistoryStatus;
  followUpDate: string | null;
};


const btnPrimary: React.CSSProperties = {
  background: "var(--ws-accent)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--ws-surface)",
  color: "var(--ws-text)",
  border: "1px solid var(--ws-border)",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnBlack: React.CSSProperties = {
  background: "var(--ws-btn)",
  color: "var(--ws-btn-text)",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const filterPillBtn: React.CSSProperties = {
  ...btnSecondary,
  padding: "11px 18px",
  fontSize: 14,
  minHeight: 42,
  lineHeight: 1.25,
};

type FollowUpTone = "Casual" | "Professional" | "Friendly";

const PLATFORM_DM_OPTIONS = [
  { value: "tiktok", label: "TikTok DM", labelFr: "DM TikTok" },
  { value: "instagram", label: "Instagram DM", labelFr: "DM Instagram" },
  { value: "email", label: "Email", labelFr: "E-mail" },
] as const;

function platformLabel(platform: string, lang: "en" | "fr" = "en") {
  const p = platform.toLowerCase();
  if (p === "tiktok") return lang === "fr" ? "DM TikTok" : "TikTok DM";
  if (p === "instagram") return lang === "fr" ? "DM Instagram" : "Instagram DM";
  if (p === "email") return lang === "fr" ? "E-mail" : "Email";
  return platform;
}

/** Display label for the AI panel platform pills (values stay English). */
function generatePlatformLabel(p: string, lang: "en" | "fr") {
  if (lang === "en") return p;
  if (p === "TikTok DM") return "DM TikTok";
  if (p === "Instagram DM") return "DM Instagram";
  if (p === "Email") return "E-mail";
  return p;
}

function formatSentDate(iso: string, lang: "en" | "fr") {
  if (lang !== "fr" || !iso) return iso;
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR");
}

function buildFollowUpMessage(creatorName: string, brandName: string, lang: "en" | "fr" = "en") {
  const firstName = creatorName.split(" ")[0];
  if (lang === "fr") {
    return `Bonjour ${firstName} 👋

Je me permets de revenir vers vous suite à mon message d'il y a quelques jours. Je sais que vous êtes très occupé(e) à créer du super contenu !

J'aimerais beaucoup échanger avec vous au sujet d'un partenariat — je pense sincèrement que votre audience apprécierait ce que nous proposons. Je peux vous envoyer plus de détails ou un produit à tester gratuitement.

Au plaisir d'avoir votre retour !

— ${brandName}`;
  }
  return `Hey ${firstName} 👋

Just wanted to follow up on my message from a few days ago. I know you're busy creating amazing content!

I'd love to chat about a potential partnership — I think your audience would genuinely enjoy what we offer. Happy to send over more details or a free product to try.

Would love to hear your thoughts!

— ${brandName}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--ws-border)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  letterSpacing: "-0.02em",
  background: "var(--ws-surface)",
};

function formatFollowUpDate(iso: string, lang: "en" | "fr" = "en") {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric" });
}

function displayTone(tone: string, lang: "en" | "fr"): string {
  if (lang === "en") return tone;
  const fr: Record<string, string> = {
    Casual: "Décontracté",
    Professional: "Professionnel",
    Friendly: "Amical",
    Direct: "Direct",
  };
  return fr[tone] ?? tone;
}

function outreachStatusBadge(status: OutreachHistoryStatus, lang: "en" | "fr") {
  const map: Record<OutreachHistoryStatus, { en: string; fr: string }> = {
    replied: { en: "Replied", fr: "Répondu" },
    sent: { en: "Sent", fr: "Envoyé" },
    no_response: { en: "No reply", fr: "Pas de réponse" },
    opened: { en: "Opened", fr: "Ouvert" },
    converted: { en: "Converted ✓", fr: "Converti ✓" },
  };
  const s = map[status];
  const label = lang === "fr" ? s.fr : s.en;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text)", whiteSpace: "nowrap", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
      {label}
    </span>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "var(--ws-btn)",
        color: "var(--ws-btn-text)",
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 1200,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        fontFamily: "inherit",
      }}
    >
      {message}
    </div>
  );
}

function FollowUpPanel({
  lang,
  entry,
  slideIn,
  onClose,
  onSend,
  onMarkManual,
}: {
  lang: "en" | "fr";
  entry: OutreachHistoryEntry;
  slideIn: boolean;
  onClose: () => void;
  onSend: () => Promise<void> | void;
  onMarkManual: () => void;
}) {
  const [message, setMessage] = useState(() => buildFollowUpMessage(entry.creator, "Trackit", lang));
  const [tone, setTone] = useState<FollowUpTone>("Casual");
  const [platform, setPlatform] = useState(entry.platform.toLowerCase());
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const selectedCreator = {
    displayName: entry.creator,
    username: entry.handle,
    platform: entry.platform,
  };
  const originalMessageText = entry.message;

  const tones: FollowUpTone[] = ["Casual", "Professional", "Friendly"];
  const showNotOpenedWarning = entry.status === "no_response";

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch("/api/generate-follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: selectedCreator,
          originalMessage: originalMessageText,
          brand: "Trackit",
          daysSince: 3,
          tone: tone.toLowerCase(),
          lang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Generation failed");
      setMessage(data.message);
    } catch {
      /* keep current message on failure */
    } finally {
      setRegenerating(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    const handle = (entry.handle || "").replace(/^@/, "");
    try { await navigator.clipboard.writeText(message); } catch { /* clipboard may be unavailable */ }
    // Mark the follow-up in DB FIRST (parent updates Supabase + reloads history)
    await onSend();
    // Then open the platform so the request isn't killed by the new tab
    const p = entry.platform.toLowerCase();
    if (p.includes("instagram")) {
      window.open(`https://www.instagram.com/direct/new/?username=${handle}`, "_blank");
    } else if (p.includes("tiktok")) {
      window.open(`https://www.tiktok.com/@${handle}`, "_blank");
    }
    setSending(false);
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 1000,
          opacity: slideIn ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 420,
          background: "var(--ws-surface)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          transform: slideIn ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          fontFamily: "inherit",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--ws-border)", position: "relative" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === "fr" ? "Fermer" : "Close"}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "var(--ws-surface-2)",
              border: "1px solid var(--ws-border)",
              borderRadius: 8,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="var(--ws-text-muted)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 36 }}>
            <CreatorAvatar src={entry.avatar} username={entry.handle} displayName={entry.creator} size={40} alt={entry.creator} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>{entry.creator}</div>
              <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{entry.handle}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, background: "var(--ws-hover)", padding: "4px 8px", borderRadius: 999, textTransform: "capitalize", flexShrink: 0 }}>
              {entry.platform}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: "10px 0 0" }}>
            {lang === "fr" ? `Message initial envoyé le ${formatSentDate(entry.sentDate, lang)}` : <>Original message sent {entry.sentDate}</>}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 12px" }}>{lang === "fr" ? "Message de relance" : "Follow up message"}</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
          />
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 14 }}>
            {lang === "fr" ? `${message.length} caractère${message.length > 1 ? "s" : ""}` : <>{message.length} characters</>}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {tones.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                style={{
                  ...btnSecondary,
                  padding: "6px 14px",
                  fontSize: 12,
                  background: tone === t ? "var(--ws-btn)" : "var(--ws-surface)",
                  color: tone === t ? "var(--ws-btn-text)" : "var(--ws-text)",
                  borderColor: tone === t ? "var(--ws-text)" : "var(--ws-border)",
                }}
              >
                {displayTone(t, lang)}
              </button>
            ))}
          </div>
          <button
            type="button"
            style={{ ...btnSecondary, width: "100%", marginBottom: 24, opacity: regenerating ? 0.7 : 1 }}
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
          >
            {regenerating
              ? (lang === "fr" ? "Génération..." : "Generating...")
              : lang === "fr"
                ? "Régénérer avec l'IA →"
                : "Regenerate with AI →"}
          </button>

          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 12px" }}>{lang === "fr" ? "Vérifier avant l'envoi" : "Review before sending"}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: showNotOpenedWarning ? 12 : 20 }}>
            <div style={{ fontSize: 13, color: "var(--ws-text)", display: "flex", gap: 8 }}>
              <span style={{ color: "#1FB567" }}>✓</span>
              <span>{lang === "fr" ? "Message personnalisé pour le créateur" : "Message personalized for creator"}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--ws-text)", display: "flex", gap: 8 }}>
              <span style={{ color: "#1FB567" }}>✓</span>
              <span>
                {lang === "fr"
                  ? "Le moment de la relance est adapté (3 jours après le premier message)"
                  : "Follow up timing is appropriate (3 days after initial)"}
              </span>
            </div>
          </div>
          {showNotOpenedWarning && (
            <p style={{ fontSize: 13, color: "var(--ws-text)", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Ce créateur n'a pas encore ouvert votre premier message."
                : "This creator hasn't opened your first message yet."}
            </p>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 8px" }}>{lang === "fr" ? "Envoyer via" : "Send via"}</h3>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }}>
            {PLATFORM_DM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {lang === "fr" ? opt.labelFr : opt.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--ws-text-dim)", marginTop: 6 }}>
            {lang === "fr"
              ? `Message initial envoyé via ${platformLabel(entry.platform, lang)}`
              : <>Original sent on {platformLabel(entry.platform)}</>}
          </p>
        </div>

        <div style={{ padding: "16px 20px 20px", borderTop: "1px solid var(--ws-border)" }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{ ...btnBlack, width: "100%", marginBottom: 10, opacity: sending ? 0.7 : 1 }}
          >
            {sending
              ? (lang === "fr" ? "Envoi..." : "Sending...")
              : lang === "fr"
                ? "Envoyer la relance →"
                : "Send follow up →"}
          </button>
          <button
            type="button"
            onClick={onMarkManual}
            style={{
              background: "none",
              border: "none",
              color: "var(--ws-text-dim)",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              width: "100%",
              textAlign: "center",
              padding: 0,
            }}
          >
            {lang === "fr" ? "Marquer comme envoyé manuellement" : "Mark as sent manually"}
          </button>
        </div>
      </aside>
    </>
  );
}

type OutreachCreator = {
  id: string;
  displayName: string;
  username: string;
  platform: string;
  avatar: string;
  niche: string;
  followersCount: number;
  engagementRate: number;
  bio: string;
};

type GenerateTone = "Casual" | "Professional" | "Friendly" | "Direct";
type GeneratePlatform = "TikTok DM" | "Instagram DM" | "Email";

type SavedOutreachTemplate = {
  id: string;
  name: string;
  body: string;
  platform: GeneratePlatform;
};


function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function followUpIn3Days() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function normalizeOutreachStatus(raw: string | null | undefined): OutreachHistoryStatus {
  const s = (raw || "sent").toLowerCase().replace(/\s+/g, "_");
  if (s === "replied") return "replied";
  if (s === "converted") return "converted";
  if (s === "opened") return "opened";
  if (s === "no_response" || s === "no_reply") return "no_response";
  return "sent";
}

function mapOutreachRow(o: Record<string, unknown>): OutreachHistoryEntry {
  const handle = String(o.creator_username ?? "").replace(/^@/, "");
  return {
    id: String(o.id ?? ""),
    creator: String(o.creator_display_name ?? handle ?? "—"),
    handle,
    platform: String(o.platform ?? ""),
    avatar: String(o.creator_avatar ?? ""),
    message: String(o.message ?? ""),
    sentDate: typeof o.created_at === "string" ? o.created_at.split("T")[0] : "",
    status: normalizeOutreachStatus(o.status as string),
    followUpDate: typeof o.follow_up_date === "string" ? o.follow_up_date.split("T")[0] : null,
  };
}

function SaveTemplateModal({
  lang,
  defaultName,
  onClose,
  onSave,
}: {
  lang: "en" | "fr";
  defaultName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 24 }}
      onClick={onClose}
    >
      <div style={{ background: "var(--ws-surface)", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>{lang === "fr" ? "Sauvegarder comme modèle" : "Save as template"}</h3>
        <label style={{ display: "block", fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 6 }}>{lang === "fr" ? "Nom du modèle" : "Template name"}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => name.trim() && onSave(name.trim())} style={{ ...btnBlack, flex: 1 }} disabled={!name.trim()}>
            {lang === "fr" ? "Enregistrer" : "Save"}
          </button>
          <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>
            {lang === "fr" ? "Annuler" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}




function OutreachAIGeneratePanel({
  lang,
  plan,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  onMarkSent,
  onToast,
  isMobile,
}: {
  lang: "en" | "fr";
  plan: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  onMarkSent: (entry: OutreachHistoryEntry) => void | Promise<void>;
  onToast: (msg: string) => void;
  isMobile?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<OutreachCreator | null>(null);
  const [brand, setBrand] = useState("");
  const [tone, setTone] = useState<GenerateTone>("Casual");
  const [platform, setPlatform] = useState<GeneratePlatform>("TikTok DM");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSendFlow, setShowSendFlow] = useState(false);
  const [creatorEmail, setCreatorEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [creatorEmailMap, setCreatorEmailMap] = useState<Record<string, string>>({});
  const [sendingEmail, setSendingEmail] = useState(false);
  const [directSend, setDirectSend] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [, setSavedTemplates] = useState<SavedOutreachTemplate[]>([]);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);
  const [savedCreators, setSavedCreators] = useState<OutreachCreator[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.email) setSenderEmail(user.email);
      const data = await getSavedCreators(user.id);
      setCreatorEmailMap(buildCreatorEmailMap(data));
      setSavedCreators(
        data.map((c) => {
          const username = String(c.handle || c.username || "").replace(/^@/, "");
          return {
            id: String(c.id ?? username),
            displayName: String(c.full_name || c.handle || username),
            username,
            platform: String(c.platform || ""),
            avatar: resolveCreatorAvatarUrl(String(c.avatar_url || "")),
            niche: String(c.niche || ""),
            followersCount: Number(c.followers || 0),
            engagementRate: Number(c.engagement_rate || 0),
            bio: String(c.bio || ""),
          };
        })
      );
    };
    void load();
  }, []);

  useEffect(() => {
    if (!senderEmail) return;
    let alive = true;
    void fetchDirectSendAvailable(senderEmail).then((ok) => {
      if (alive) setDirectSend(ok);
    });
    return () => {
      alive = false;
    };
  }, [senderEmail]);

  useEffect(() => {
    prefetchCreatorAvatars(savedCreators.map((c) => ({ username: c.username, avatarUrl: c.avatar })));
  }, [savedCreators]);

  const filteredCreators = useMemo(() => {
    const q = creatorSearch.trim().toLowerCase().replace(/^@/, "");
    if (!q) return savedCreators;
    return savedCreators.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q)
    );
  }, [creatorSearch, savedCreators]);

  useEffect(() => {
    if (!selectedCreator) return;
    const email = resolveCreatorEmail(`@${selectedCreator.username}`, creatorEmailMap);
    if (email) setCreatorEmail(email);
  }, [selectedCreator, creatorEmailMap]);

  const resetPanel = () => {
    setExpanded(false);
    setCreatorSearch("");
    setDropdownOpen(false);
    setSelectedCreator(null);
    setBrand("");
    setTone("Casual");
    setPlatform("TikTok DM");
    setMessage("");
    setEmailSubject("");
    setShowSendFlow(false);
    setCreatorEmail("");
    setSendingEmail(false);
    setCopied(false);
  };

  const handleGenerate = async () => {
    if (!canGenerateAiOutreach(plan)) {
      setUpgradeFeature("ai-outreach");
      return;
    }
    if (!selectedCreator || !brand.trim()) return;
    setGenerating(true);
    setMessage("");
    setEmailSubject("");
    setShowSendFlow(false);
    try {
      const res = await fetch("/api/generate-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: selectedCreator,
          brand: brand.trim(),
          tone: tone.toLowerCase(),
          platform,
          lang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Failed");
      setMessage(data.message);
      setEmailSubject(typeof data.subject === "string" ? data.subject : "");
      setShowSendFlow(false);
    } catch {
      onToast(lang === "fr" ? "La génération a échoué. Réessayez." : "Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!message) return;
    const clipboardText =
      platform === "Email" && emailSubject.trim()
        ? `${lang === "fr" ? "Objet" : "Subject"}: ${emailSubject.trim()}\n\n${message}`
        : message;
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSend = async () => {
    if (!selectedCreator || !message) return;
    const generatedMessage = message;
    const historyMessage =
      platform === "Email" && emailSubject.trim()
        ? `${lang === "fr" ? "Objet" : "Subject"}: ${emailSubject.trim()}\n\n${generatedMessage}`
        : generatedMessage;
    const handle = selectedCreator.username.replace(/^@/, "");

    if (platform === "Email") {
      const recipient = creatorEmail.trim();
      const subject = emailSubject.trim() || (lang === "fr" ? "Partenariat" : "Partnership");
      if (recipient && !isValidEmailAddress(recipient)) {
        onToast(lang === "fr" ? "L'e-mail du créateur n'est pas valide" : "The creator's email is not valid");
        return;
      }
      const historyEntry: OutreachHistoryEntry = {
        id: "",
        creator: selectedCreator.displayName,
        handle,
        platform: "Email",
        avatar: selectedCreator.avatar,
        message: historyMessage,
        sentDate: todayIso(),
        status: "sent",
        followUpDate: canUseAutoFollowUp(plan) ? followUpIn3Days() : null,
      };

      // Direct send only when the server is set up for it (OUTREACH_DIRECT_SEND_DOMAINS).
      if (directSend && recipient && isValidEmailAddress(senderEmail)) {
        setSendingEmail(true);
        const result = await sendOutreachEmail({
          fromEmail: senderEmail.trim(),
          subject,
          body: generatedMessage,
          recipients: [recipient],
        });
        setSendingEmail(false);
        if (!result.ok) {
          onToast(result.error);
          return;
        }
        if (result.mode !== "api" && result.composeUrl && openComposeLink(result.composeUrl) === "blocked") {
          onToast(lang === "fr" ? "Autorisez les pop-ups pour ouvrir votre messagerie" : "Allow pop-ups to open your mail app");
          return;
        }
        await onMarkSent(historyEntry);
        onToast(lang === "fr" ? "E-mail envoyé" : "Email sent");
        resetPanel();
        return;
      }

      // Otherwise open the brand's own mailbox with the email ready. Opened
      // before any await so the browser does not block the new tab.
      const draftTarget = {
        username: handle,
        displayName: selectedCreator.displayName,
        platform: selectedCreator.platform,
        avatarUrl: selectedCreator.avatar,
        email: recipient || null,
        niche: selectedCreator.niche,
        draft: { subject, body: generatedMessage },
      };
      const client = resolveMailClient(senderEmail);
      if (!client) {
        // Mail app unknown (custom domain): the composer asks once, then opens it.
        requestContactCreator(draftTarget);
        resetPanel();
        return;
      }
      const link = buildMailComposeLink({ client, to: recipient, subject, body: generatedMessage, fromEmail: senderEmail, lang });
      if (link.truncated) void navigator.clipboard?.writeText(`${subject}

${generatedMessage}`).catch(() => undefined);
      if (openComposeLink(link.url) === "blocked") {
        requestContactCreator(draftTarget);
        resetPanel();
        return;
      }
      await onMarkSent(historyEntry);
      const app = mailClientShortName(client, lang);
      onToast(
        lang === "fr"
          ? `Votre e-mail est prêt dans ${app}${link.truncated ? ". Texte complet copié dans le presse-papiers." : ""}`
          : `Your email is ready in ${app}${link.truncated ? ". Full text copied to your clipboard." : ""}`,
      );
      resetPanel();
      return;
    }

    try {
      await navigator.clipboard.writeText(historyMessage);
    } catch {
      /* clipboard may be unavailable */
    }
    await onMarkSent({
      id: "",
      creator: selectedCreator.displayName,
      handle,
      platform: selectedCreator.platform,
      avatar: selectedCreator.avatar,
      message: historyMessage,
      sentDate: todayIso(),
      status: "sent",
      followUpDate: canUseAutoFollowUp(plan) ? followUpIn3Days() : null,
    });
    if (platform === "Instagram DM") {
      window.open(`https://www.instagram.com/direct/new/?username=${handle}`, "_blank");
    } else if (platform === "TikTok DM") {
      window.open(`https://www.tiktok.com/@${handle}`, "_blank");
    }
    onToast(lang === "fr" ? "Message copié — collez-le dans le DM ✓" : "Outreach copied — paste in the DM ✓");
    resetPanel();
  };

  const sendViaLabel =
    platform === "Instagram DM"
      ? lang === "fr"
        ? "Envoyer via Instagram"
        : "Send via Instagram"
      : platform === "TikTok DM"
        ? lang === "fr"
          ? "Envoyer via TikTok"
          : "Send via TikTok"
        : lang === "fr"
          ? "Envoyer par e-mail"
          : "Send via Email";

  const handleMarkSentClick = async () => {
    if (!selectedCreator || !message) return;
    await onMarkSent({
      id: "",
      creator: selectedCreator.displayName,
      handle: selectedCreator.username.replace(/^@/, ""),
      platform: selectedCreator.platform,
      avatar: selectedCreator.avatar,
      message,
      sentDate: todayIso(),
      status: "sent",
      followUpDate: canUseAutoFollowUp(plan) ? followUpIn3Days() : null,
    });
    onToast(lang === "fr" ? "Prospection envoyée ✓" : "Outreach sent ✓");
    resetPanel();
  };

  const tones: GenerateTone[] = ["Casual", "Professional", "Friendly", "Direct"];
  const platforms: GeneratePlatform[] = ["TikTok DM", "Instagram DM", "Email"];

  return (
    <div style={{ marginBottom: 28 }}>
      <div className={`ou-ai${expanded ? " is-expanded" : ""}`}>
        {!expanded ? (
          <div className={`ou-ai__collapsed${isMobile ? " is-mobile" : ""}`}>
            <div className="ou-ai__icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ou-ai__title">
                {lang === "fr" ? "Générer un message de prospection avec l’IA" : "Generate outreach with AI"}
              </div>
              <div className="ou-ai__sub">
                {lang === "fr"
                  ? "Choisissez un créateur — l’IA rédige, vous modifiez, vous envoyez."
                  : "Pick a creator — AI drafts, you edit, you send."}
              </div>
            </div>
            <button type="button" className="ou-ai__cta" onClick={() => setExpanded(true)}>
              {lang === "fr" ? "Essayer" : "Try it"}
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid var(--ws-border)",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--ws-text)", margin: 0, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Générer un message de prospection avec Trackit IA" : "Generate outreach with Trackit AI"}
              </h3>
              <button
                type="button"
                onClick={resetPanel}
                aria-label={lang === "fr" ? "Fermer" : "Close"}
                style={{
                  background: "var(--ws-surface-2)",
                  border: "1px solid var(--ws-border)",
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="var(--ws-text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ws-text-dim)", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 1 — SÉLECTIONNER UN CRÉATEUR" : "STEP 1 — SELECT CREATOR"}
                </label>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ws-text)", marginBottom: 8 }}>{lang === "fr" ? "À qui souhaitez-vous vous adresser ?" : "Who are you reaching out to?"}</div>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={selectedCreator ? `${selectedCreator.displayName} (@${selectedCreator.username})` : creatorSearch}
                    onChange={(e) => {
                      setCreatorSearch(e.target.value);
                      setSelectedCreator(null);
                      setDropdownOpen(true);
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder={lang === "fr" ? "Rechercher des créateurs..." : "Search creators..."}
                    style={inputStyle}
                  />
                  {dropdownOpen && !selectedCreator && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        background: "var(--ws-surface)",
                        border: "1px solid var(--ws-border)",
                        borderRadius: 10,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                        zIndex: 10,
                        maxHeight: 240,
                        overflowY: "auto",
                      }}
                    >
                      {savedCreators.length === 0 ? (
                        <div style={{ padding: "14px 12px", fontSize: 13, color: "var(--ws-text-muted)" }}>
                          {lang === "fr"
                            ? "Aucun créateur sauvegardé. Ajoutez-en depuis Créateurs ou Découverte."
                            : "No saved creators. Add some from Creators or Discovery."}
                        </div>
                      ) : filteredCreators.length === 0 ? (
                        <div style={{ padding: "14px 12px", fontSize: 13, color: "var(--ws-text-muted)" }}>
                          {lang === "fr" ? "Aucun créateur ne correspond." : "No matching creators."}
                        </div>
                      ) : (
                        filteredCreators.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedCreator(c);
                              setCreatorSearch("");
                              setDropdownOpen(false);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "10px 12px",
                              border: "none",
                              borderBottom: "1px solid var(--ws-border)",
                              background: "var(--ws-surface)",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <CreatorAvatar src={c.avatar} username={c.username} displayName={c.displayName} size={32} alt={c.displayName} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.displayName}</div>
                              <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{c.username}</div>
                            </div>
                            <span style={{ fontSize: 10, background: "var(--ws-hover)", padding: "3px 8px", borderRadius: 999, textTransform: "capitalize" }}>
                              {c.platform}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {selectedCreator && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: 12, background: "var(--ws-surface-2)", borderRadius: 10, border: "1px solid var(--ws-border)" }}>
                    <CreatorAvatar src={selectedCreator.avatar} username={selectedCreator.username} displayName={selectedCreator.displayName} size={40} alt={selectedCreator.displayName} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedCreator.displayName}</div>
                      <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{selectedCreator.username}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 500, background: "var(--ws-hover)", padding: "4px 10px", borderRadius: 999, textTransform: "capitalize" }}>
                      {selectedCreator.platform}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ws-text-dim)", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 2 — VOTRE MARQUE" : "STEP 2 — YOUR BRAND"}
                </label>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ws-text)", marginBottom: 8 }}>{lang === "fr" ? "Que vendez-vous ?" : "What are you selling?"}</div>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={lang === "fr" ? "ex. vêtements de sport durables pour femmes" : "e.g. sustainable activewear for women"}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ws-text-dim)", marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 3 — TON ET PLATEFORME" : "STEP 3 — TONE AND PLATFORM"}
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 8 }}>{lang === "fr" ? "Ton" : "Tone"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {tones.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTone(t)}
                          style={{
                            ...filterPillBtn,
                            background: tone === t ? "var(--ws-btn)" : "var(--ws-surface)",
                            color: tone === t ? "var(--ws-btn-text)" : "var(--ws-text)",
                            borderColor: tone === t ? "var(--ws-text)" : "var(--ws-border)",
                          }}
                        >
                          {displayTone(t, lang)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 8 }}>{lang === "fr" ? "Plateforme" : "Platform"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {platforms.map((p) => {
                        const isActive = platform === p;
                        const pill = selectionPillColors(isActive);
                        return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlatform(p)}
                          style={{
                            ...filterPillBtn,
                            background: pill.background,
                            color: pill.color,
                            borderColor: pill.borderColor,
                          }}
                        >
                          {generatePlatformLabel(p, lang)}
                        </button>
                      );})}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || !selectedCreator || !brand.trim()}
                style={{ ...btnBlack, width: "100%", marginBottom: 20, opacity: generating || !selectedCreator || !brand.trim() ? 0.5 : 1 }}
              >
                {generating ? (lang === "fr" ? "Génération..." : "Generating...") : lang === "fr" ? "Générer le message →" : "Generate outreach →"}
              </button>

              {message && !generating && (
                <div>
                  {platform === "Email" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 6 }}>
                          {lang === "fr" ? "E-mail de la marque" : "Brand email"}
                        </label>
                        <input
                          type="email"
                          value={senderEmail}
                          onChange={(e) => setSenderEmail(e.target.value)}
                          placeholder={lang === "fr" ? "vous@marque.com" : "you@brand.com"}
                          style={inputStyle}
                          autoComplete="email"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 6 }}>
                          {lang === "fr" ? "E-mail du créateur" : "Creator email"}
                        </label>
                        <input
                          type="email"
                          value={creatorEmail}
                          onChange={(e) => setCreatorEmail(e.target.value)}
                          placeholder={lang === "fr" ? "createur@email.com" : "creator@email.com"}
                          style={inputStyle}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 6 }}>
                          {lang === "fr" ? "Objet" : "Subject"}
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder={lang === "fr" ? "Objet de l'e-mail" : "Email subject"}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={10}
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
                  />
                  <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 16 }}>
                    {lang === "fr" ? `${message.length} caractère${message.length > 1 ? "s" : ""}` : <>{message.length} characters</>}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ws-text)", margin: "0 0 12px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                    {platform === "Email"
                      ? lang === "fr"
                        ? "L'envoi ouvre votre messagerie (Gmail, Outlook ou Mail) — assurez-vous d'être connecté avec l'e-mail de la marque ci-dessus."
                        : "Send opens your mail app (Gmail, Outlook, or Mail) — make sure you're signed in with the brand email above."
                      : lang === "fr"
                        ? "Le message sera copié automatiquement. Collez-le (Cmd+V) dans le DM et envoyez."
                        : "Outreach will be auto-copied. Just paste it (Cmd+V) in the DM and hit send."}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void handleCopy()} style={{ ...btnSecondary, flex: 1, minWidth: 120 }}>
                      {copied ? (lang === "fr" ? "Copié ✓" : "Copied ✓") : lang === "fr" ? "Copier le message" : "Copy outreach"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canPersistTemplates(plan)) {
                          setUpgradeFeature("templates");
                          return;
                        }
                        setSaveTemplateOpen(true);
                      }}
                      style={{ ...btnSecondary, flex: 1, minWidth: 120 }}
                    >
                      {lang === "fr" ? "Sauvegarder comme modèle" : "Save as template"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={sendingEmail}
                      style={{ ...btnBlack, flex: 1, minWidth: 140, opacity: sendingEmail ? 0.6 : 1 }}
                    >
                      {sendingEmail
                        ? lang === "fr"
                          ? "Envoi…"
                          : "Sending…"
                        : `${sendViaLabel} →`}
                    </button>
                  </div>

                  {showSendFlow && (
                    <div style={{ padding: 16, background: "var(--ws-surface-2)", borderRadius: 12, border: "1px solid var(--ws-border)" }}>
                      {platform === "TikTok DM" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <a
                            href="https://tiktok.com/messages"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...btnSecondary, textAlign: "center", textDecoration: "none" }}
                          >
                            {lang === "fr" ? "Ouvrir les DM TikTok →" : "Open TikTok DMs →"}
                          </a>
                          <button type="button" onClick={() => void handleSend()} style={{ ...btnBlack, marginBottom: 8 }}>
                            {lang === "fr" ? "Envoyer par e-mail" : "Send via Email"}
                          </button>
                          <button type="button" onClick={() => void handleMarkSentClick()} style={btnPrimary}>
                            {lang === "fr" ? "Marquer comme envoyé" : "Mark as sent"}
                          </button>
                        </div>
                      )}
                      {platform === "Instagram DM" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <a
                            href="https://www.instagram.com/direct/inbox/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...btnSecondary, textAlign: "center", textDecoration: "none" }}
                          >
                            {lang === "fr" ? "Ouvrir les DM Instagram →" : "Open Instagram DMs →"}
                          </a>
                          <button type="button" onClick={() => void handleMarkSentClick()} style={btnPrimary}>
                            {lang === "fr" ? "Marquer comme envoyé" : "Mark as sent"}
                          </button>
                        </div>
                      )}
                      {platform === "Email" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <input
                            type="email"
                            value={creatorEmail}
                            onChange={(e) => setCreatorEmail(e.target.value)}
                            placeholder={lang === "fr" ? "createur@email.com" : "creator@email.com"}
                            style={inputStyle}
                          />
                          <button type="button" onClick={() => void handleMarkSentClick()} style={btnPrimary}>
                            {lang === "fr" ? "Marquer comme envoyé" : "Mark as sent"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {saveTemplateOpen && selectedCreator && (
        <SaveTemplateModal
          lang={lang}
          defaultName={`${lang === "fr" ? "Prospection" : "Outreach"} — ${selectedCreator.displayName}`}
          onClose={() => setSaveTemplateOpen(false)}
          onSave={(name) => {
            setSavedTemplates((list) => [
              ...list,
              { id: `tpl-${Date.now()}`, name, body: message, platform },
            ]);
            setSaveTemplateOpen(false);
            onToast(lang === "fr" ? "Modèle enregistré ✓" : "Template saved ✓");
          }}
        />
      )}
      {upgradeFeature && (
        <UpgradeModal
          lang={lang}
          featureKey={upgradeFeature}
          onClose={() => setUpgradeFeature(null)}
          onPrimary={() => {
            runGateUpgrade(upgradeFeature, lang, { onUpgrade, onUpgradePro, onUpgradeScale });
            setUpgradeFeature(null);
          }}
        />
      )}
    </div>
  );
}

function MessageViewModal({ lang, message, creator, onClose }: { lang: "en" | "fr"; message: string; creator: string; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1002, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--ws-surface)", borderRadius: 16, padding: 28, maxWidth: 520, width: "100%", position: "relative", boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === "fr" ? "Fermer" : "Close"}
          style={{ position: "absolute", top: 16, right: 16, background: "var(--ws-surface-2)", border: "1px solid var(--ws-border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontFamily: "inherit" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="var(--ws-text-muted)" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", paddingRight: 32 }}>{lang === "fr" ? `Prospection auprès de ${creator}` : `Outreach to ${creator}`}</h3>
        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: "0 0 16px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{message}</p>
        <button type="button" style={btnSecondary} onClick={() => void navigator.clipboard.writeText(message)}>
          {lang === "fr" ? "Copier le message" : "Copy outreach"}
        </button>
      </div>
    </div>
  );
}

export function OutreachHistorySection({
  plan,
  onNavigateToBilling,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  refreshKey = 0,
  userId,
}: {
  plan: PlanTier;
  onNavigateToBilling: () => void;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  refreshKey?: number;
  userId?: string;
}) {
  const lang = useLang();
  const [entries, setEntries] = useState<OutreachHistoryEntry[]>([]);
  const [savedCreators, setSavedCreators] = useState<OutreachCreator[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [historyCreatorSearchOpen, setHistoryCreatorSearchOpen] = useState(false);
  const [viewingMessage, setViewingMessage] = useState<string | null>(null);
  const [manageEntry, setManageEntry] = useState<OutreachHistoryEntry | null>(null);
  const [followUpEntry, setFollowUpEntry] = useState<OutreachHistoryEntry | null>(null);
  const [followUpSlideIn, setFollowUpSlideIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);

  useEffect(() => {
    if (followUpEntry) {
      const id = requestAnimationFrame(() => setFollowUpSlideIn(true));
      return () => cancelAnimationFrame(id);
    }
    setFollowUpSlideIn(false);
  }, [followUpEntry]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadHistory = useCallback(async () => {
    if (userId) {
      const local = loadStoredOutreachHistory(userId);
      setEntries(local.map((o) => mapOutreachRow(o as Record<string, unknown>)));
      setSavedCreators([]);
      return;
    }
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const local = loadStoredOutreachHistory(user.id);
    const remote = await getOutreachHistory(user.id);

    const remoteFingerprints = new Set(
      remote.map((row) =>
        outreachEntryFingerprint({
          creator_username: String((row as Record<string, unknown>).creator_username ?? ""),
          creator_display_name: String((row as Record<string, unknown>).creator_display_name ?? ""),
          platform: String((row as Record<string, unknown>).platform ?? ""),
          message: String((row as Record<string, unknown>).message ?? ""),
          created_at: String((row as Record<string, unknown>).created_at ?? ""),
        }),
      ),
    );

    const unsyncedLocal = local.filter(
      (entry) =>
        entry.id.startsWith("oh_") &&
        !remoteFingerprints.has(outreachEntryFingerprint(entry)),
    );

    for (const entry of unsyncedLocal) {
      await saveOutreach(user.id, {
        creator_username: entry.creator_username,
        creator_display_name: entry.creator_display_name,
        creator_avatar: entry.creator_avatar,
        platform: entry.platform,
        message: entry.message,
        status: entry.status,
        follow_up_date: entry.follow_up_date,
      });
    }

    const freshRemote = unsyncedLocal.length > 0 ? await getOutreachHistory(user.id) : remote;
    const freshRemoteFingerprints = new Set(
      freshRemote.map((row) =>
        outreachEntryFingerprint({
          creator_username: String((row as Record<string, unknown>).creator_username ?? ""),
          creator_display_name: String((row as Record<string, unknown>).creator_display_name ?? ""),
          platform: String((row as Record<string, unknown>).platform ?? ""),
          message: String((row as Record<string, unknown>).message ?? ""),
          created_at: String((row as Record<string, unknown>).created_at ?? ""),
        }),
      ),
    );
    const stillLocal = local.filter(
      (entry) =>
        entry.id.startsWith("oh_") &&
        !freshRemoteFingerprints.has(outreachEntryFingerprint(entry)),
    );

    pruneSyncedOutreachEntries(user.id, freshRemote as StoredOutreachEntry[]);

    const merged = dedupeOutreachEntries(
      [...freshRemote, ...stillLocal]
        .map((row) => ({
          id: String((row as Record<string, unknown>).id ?? ""),
          user_id: user.id,
          creator_username: String((row as Record<string, unknown>).creator_username ?? ""),
          creator_display_name: String((row as Record<string, unknown>).creator_display_name ?? ""),
          creator_avatar: String((row as Record<string, unknown>).creator_avatar ?? ""),
          platform: String((row as Record<string, unknown>).platform ?? ""),
          message: String((row as Record<string, unknown>).message ?? ""),
          status: String((row as Record<string, unknown>).status ?? "sent"),
          follow_up_date:
            typeof (row as Record<string, unknown>).follow_up_date === "string"
              ? ((row as Record<string, unknown>).follow_up_date as string)
              : null,
          created_at:
            typeof (row as Record<string, unknown>).created_at === "string"
              ? ((row as Record<string, unknown>).created_at as string)
              : new Date().toISOString(),
        }))
        .sort(
          (a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime(),
        ),
    );

    const history = merged;

    const creators = await getSavedCreators(user.id);
    const avatarMap = buildCreatorAvatarMap(creators);
    setEntries(
      history.map((o) => {
        const row = mapOutreachRow(o as Record<string, unknown>);
        if (!resolveCreatorAvatarUrl(row.avatar)) {
          const resolved = avatarUrlForCreatorHandle(row.handle, avatarMap);
          if (resolved) row.avatar = resolved;
        }
        return row;
      })
    );
    setSavedCreators(
      creators.map((c) => {
        const username = String(c.handle || c.username || "").replace(/^@/, "");
        return {
          id: String(c.id ?? username),
          displayName: String(c.full_name || c.handle || username),
          username,
          platform: String(c.platform || ""),
          avatar: resolveCreatorAvatarUrl(String(c.avatar_url || "")),
          niche: String(c.niche || ""),
          followersCount: Number(c.followers || 0),
          engagementRate: Number(c.engagement_rate || 0),
          bio: String(c.bio || ""),
        };
      })
    );
  }, [userId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    const refresh = () => void loadHistory();
    window.addEventListener(OUTREACH_HISTORY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(OUTREACH_HISTORY_UPDATED_EVENT, refresh);
  }, [loadHistory]);

  useEffect(() => {
    prefetchCreatorAvatars(savedCreators.map((c) => ({ username: c.username, avatarUrl: c.avatar })));
  }, [savedCreators]);

  const handleMarkSent = async (
    creator: {
      username?: string;
      handle?: string;
      displayName?: string;
      creator?: string;
      avatarUrl?: string;
      avatar?: string;
      platform: string;
    },
    message: string,
    followUpDate?: string | null
  ) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const handle = (creator.username || creator.handle || "").replace(/^@/, "");
    const payload = {
      creator_username: handle,
      creator_display_name: creator.displayName || creator.creator || handle,
      creator_avatar: creator.avatarUrl || creator.avatar || "",
      platform: creator.platform,
      message,
      status: "sent",
      follow_up_date: followUpDate ?? null,
    };
    const saved = await saveOutreach(user.id, payload);
    if (!saved) {
      appendStoredOutreachEntry(user.id, payload);
    }
    notifyOutreachSent(
      lang,
      creator.displayName || creator.creator || handle || (lang === "fr" ? "créateur" : "creator"),
      user.id
    );
    await loadHistory();
    dispatchOutreachHistoryUpdated();
  };

  const handleClearHistory = async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const confirmed = window.confirm(
      lang === "fr"
        ? "Supprimer tout l'historique de prospection ? Cette action est irréversible."
        : "Delete all outreach history? This cannot be undone."
    );
    if (!confirmed) return;
    clearStoredOutreachHistory(user.id);
    void clearOutreachHistory(user.id);
    setEntries([]);
    setManageEntry(null);
    setFollowUpEntry(null);
    setToast(lang === "fr" ? "Historique effacé ✓" : "History cleared ✓");
    dispatchOutreachHistoryUpdated();
  };

  const closeFollowUp = () => {
    setFollowUpSlideIn(false);
    setTimeout(() => setFollowUpEntry(null), 300);
  };

  const completeFollowUpSend = async (id: string) => {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await updateOutreachStatus(user.id, id, "sent", null);
    }
    setEntries((list) =>
      list.map((e) =>
        e.id === id
          ? { ...e, status: "sent" as const, followUpDate: null }
          : e
      )
    );
    closeFollowUp();
    setToast(lang === "fr" ? "Relance envoyée ✓" : "Follow up sent ✓");
    await loadHistory();
    dispatchOutreachHistoryUpdated();
  };

  const sendFollowUp = async (item: OutreachHistoryEntry) => {
    if (!canUseAutoFollowUp(plan)) {
      setUpgradeFeature("auto-follow-up");
      return;
    }
    const res = await fetch("/api/generate-follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator: { displayName: item.creator, username: item.handle, platform: item.platform },
        originalMessage: item.message,
        brand: "Trackit",
        daysSince: 3,
        tone: "casual",
        lang,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.followUp || data.message) {
      await navigator.clipboard.writeText(data.followUp || data.message);
      alert(lang === "fr" ? "Message de relance copié dans le presse-papiers ✓" : "Follow-up outreach copied to clipboard ✓");
      const { supabase: sb } = await import("@/lib/supabase");
      if (sb) {
        const { data: { user } } = await sb.auth.getUser();
        if (user) await updateOutreachStatus(user.id, item.id, item.status, null);
      }
      setManageEntry(null);
      await loadHistory();
      dispatchOutreachHistoryUpdated();
    }
  };

  const markAsReplied = async (item: OutreachHistoryEntry) => {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await updateOutreachStatus(user.id, item.id, "replied");
    }
    updateStatus(item.id, "replied", item);
    setManageEntry(null);
    dispatchOutreachHistoryUpdated();
  };

  const historyCreatorSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    if (!q) return [];
    return savedCreators
      .filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.platform.toLowerCase().includes(q) ||
          c.niche.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [search, savedCreators]);

  const filtered = useMemo(() => {
    let list = [...entries];
    if (filter !== "all") list = list.filter((e) => e.status === filter);
    const q = search.trim().toLowerCase().replace(/^@/, "");
    if (q) {
      list = list.filter(
        (e) =>
          e.creator.toLowerCase().includes(q) ||
          e.handle.toLowerCase().includes(q) ||
          e.platform.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, filter, search]);

  const updateStatus = (id: string, status: OutreachHistoryStatus, source?: OutreachHistoryEntry) => {
    const prev = entries.find((e) => e.id === id);
    setEntries((list) =>
      list.map((e) =>
        e.id === id
          ? { ...e, status, followUpDate: status === "replied" || status === "converted" ? null : e.followUpDate }
          : e
      )
    );
    void (async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      updateStoredOutreachEntry(user.id, id, {
        status,
        ...(status === "replied" || status === "converted" ? { follow_up_date: null } : {}),
      });
      if (!id.startsWith("oh_")) {
        await updateOutreachStatus(
          user.id,
          id,
          status,
          status === "replied" || status === "converted" ? null : undefined,
        );
      }
      if (status === "replied" && prev?.status !== "replied") {
        const entry = source ?? prev;
        notifyCreatorReplied(lang, entry?.creator || entry?.handle || "", user.id);
      }
      dispatchOutreachHistoryUpdated();
    })();
  };

  const filterTabs: { id: HistoryFilter; label: string }[] = [
    { id: "all", label: lang === "fr" ? "Tous" : "All" },
    { id: "sent", label: lang === "fr" ? "Envoyé" : "Sent" },
    { id: "opened", label: lang === "fr" ? "Ouvert" : "Opened" },
    { id: "replied", label: lang === "fr" ? "Répondu" : "Replied" },
    { id: "no_response", label: lang === "fr" ? "Pas de réponse" : "No reply" },
    { id: "converted", label: lang === "fr" ? "Converti" : "Converted" },
  ];

  return (
    <>
      {AUTO_OUTREACH_ENABLED ? (
        <AutoOutreachEntry plan={plan} onUpgrade={() => setUpgradeFeature("ai-outreach")} />
      ) : null}
      <div className="ou-history">
        <div className="ou-history__toolbar">
          <h3 className="ou-history__title">{lang === "fr" ? "Historique" : "History"}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              className="ou-ghost-btn"
            >
              {lang === "fr" ? "Vider" : "Clear"}
            </button>
          )}
          <div style={{ position: "relative", minWidth: 220 }}>
            <div className="ou-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHistoryCreatorSearchOpen(true);
                }}
                onFocus={() => setHistoryCreatorSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setHistoryCreatorSearchOpen(false), 150)}
                placeholder={lang === "fr" ? "Rechercher…" : "Search…"}
              />
            </div>
            {historyCreatorSearchOpen && search.trim() && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  left: 0,
                  marginTop: 4,
                  background: "var(--ws-surface)",
                  border: "1px solid var(--ws-border)",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                  zIndex: 20,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {historyCreatorSuggestions.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--ws-text-muted)" }}>
                    {lang === "fr" ? "Aucun créateur trouvé." : "No creators found."}
                  </div>
                ) : (
                  historyCreatorSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearch(c.displayName || c.username);
                        setHistoryCreatorSearchOpen(false);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: "1px solid var(--ws-border)",
                        background: "var(--ws-surface)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <CreatorAvatar src={c.avatar} username={c.username} displayName={c.displayName} size={28} alt={c.displayName} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ws-text)" }}>{c.displayName}</div>
                        <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{c.username}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className={`ou-tabs${isMobile ? " is-mobile" : ""}`}>
          {filterTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`ou-tab${filter === t.id ? " is-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ou-list">
          {filtered.length === 0 ? (
            <div className="ou-empty">
              {entries.length === 0
                ? lang === "fr"
                  ? "Il semblerait que vous n’ayez encore envoyé aucun message de prospection — la première conversation commence ici."
                  : "Looks like you haven’t sent any outreach yet — your first conversation starts here."
                : lang === "fr"
                  ? "Rien ne correspond à ce filtre — essayez un autre angle."
                  : "Nothing matches this filter — try a different angle."}
            </div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
              {filtered.map((item) => {
                return (
                  <div key={item.id} className="ou-row-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <CreatorAvatar src={item.avatar} username={item.handle} displayName={item.creator} size={40} alt={item.creator} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ws-text)" }}>{item.creator}</div>
                        <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{item.handle}</div>
                        <div style={{ fontSize: 11, color: "var(--ws-text-dim)", textTransform: "capitalize" }}>
                          {item.platform} · {item.sentDate ? new Date(item.sentDate + "T12:00:00").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : "—"}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>{outreachStatusBadge(item.status, lang)}</div>
                    </div>
                    {item.message && (
                      <div style={{ fontSize: 12, color: "var(--ws-text-muted)", background: "#F8F8F8", borderRadius: 8, padding: "8px 12px", marginBottom: 10, lineHeight: 1.4 }}>
                        {item.message.slice(0, 80)}
                        {item.message.length > 80 ? "..." : ""}
                      </div>
                    )}
                    {item.followUpDate && (
                      <div style={{ fontSize: 11, color: "#F57F17", marginBottom: 10 }}>
                        {lang === "fr" ? "Relance :" : "Follow up:"} {formatFollowUpDate(item.followUpDate, lang)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="hero-cta-shopify-light hero-cta-compact"
                        style={{ flex: 1, width: "100%" }}
                        onClick={() => setManageEntry(item)}
                      >
                        {lang === "fr" ? "Gérer la prospection" : "Manage the outreach"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div
                className="ou-table-head"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.9fr 0.9fr 0.9fr 1.1fr",
                  gap: 10,
                  padding: "10px 4px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ws-text-muted, var(--ws-text-dim))",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {[
                  lang === "fr" ? "Créateur" : "Creator",
                  lang === "fr" ? "Plateforme" : "Platform",
                  lang === "fr" ? "Aperçu du message" : "Outreach preview",
                  lang === "fr" ? "Date d'envoi" : "Sent date",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Relance" : "Follow up",
                  lang === "fr" ? "Actions" : "Actions",
                ].map((h) => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {filtered.map((row, i) => {
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.9fr 0.9fr 0.9fr 1.1fr",
                      gap: 10,
                      padding: "14px 16px",
                      alignItems: "center",
                      borderTop: i === 0 ? "none" : "1px solid var(--ws-border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <CreatorAvatar src={row.avatar} username={row.handle} displayName={row.creator} size={32} alt={row.creator} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.creator}</div>
                        <div style={{ fontSize: 12, color: "var(--ws-accent)" }}>@{row.handle}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, textTransform: "capitalize" }}>{row.platform}</div>
                    <div style={{ fontSize: 12, color: "var(--ws-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.message.slice(0, 60)}
                      {row.message.length > 60 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ws-text-muted)" }}>{formatSentDate(row.sentDate, lang)}</div>
                    <div>{outreachStatusBadge(row.status, lang)}</div>
                    <div style={{ fontSize: 11, color: "#EA580C" }}>
                      {row.followUpDate ? `${lang === "fr" ? "Relance :" : "Follow up:"} ${formatFollowUpDate(row.followUpDate, lang)}` : row.status === "replied" || row.status === "converted" ? "—" : "—"}
                    </div>
                    <div>
                      <button type="button" className="hero-cta-shopify-light hero-cta-compact" style={{ width: "100%" }} onClick={() => setManageEntry(row)}>
                        {lang === "fr" ? "Gérer la prospection" : "Manage the outreach"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {upgradeFeature && (
        <UpgradeModal
          lang={lang}
          featureKey={upgradeFeature}
          onClose={() => setUpgradeFeature(null)}
          onPrimary={() => {
            runGateUpgrade(upgradeFeature, lang, { onUpgrade, onUpgradePro, onUpgradeScale });
            setUpgradeFeature(null);
          }}
        />
      )}

      {manageEntry && (() => {
        const followUpDisabled = manageEntry.status === "replied" || manageEntry.status === "converted" || !canUseAutoFollowUp(plan);
        const showMarkReplied = manageEntry.status === "sent" || manageEntry.status === "opened" || manageEntry.status === "no_response";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setManageEntry(null)}>
            <div style={{ background: "var(--ws-surface)", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{lang === "fr" ? "Gérer la prospection" : "Manage the outreach"}</div>
              <div style={{ fontSize: 13, color: "var(--ws-text-muted)", marginBottom: 20 }}>{manageEntry.creator} · @{manageEntry.handle}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  style={{ ...btnSecondary, width: "100%" }}
                  onClick={() => {
                    setViewingMessage(manageEntry.message || "");
                    setManageEntry(null);
                  }}
                >
                  {lang === "fr" ? "Voir le message" : "View outreach"}
                </button>
                <button
                  type="button"
                  disabled={followUpDisabled}
                  style={{ ...btnSecondary, width: "100%", opacity: followUpDisabled ? 0.4 : 1, cursor: followUpDisabled ? "not-allowed" : "pointer" }}
                  onClick={() => void sendFollowUp(manageEntry)}
                >
                  {lang === "fr" ? "Envoyer une relance" : "Send follow up"}
                </button>
                {showMarkReplied && (
                  <button type="button" style={{ ...btnPrimary, width: "100%" }} onClick={() => void markAsReplied(manageEntry)}>
                    {lang === "fr" ? "Marquer comme répondu" : "Mark as replied"}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setManageEntry(null)} style={{ ...btnSecondary, width: "100%", marginTop: 16 }}>
                {lang === "fr" ? "Fermer" : "Close"}
              </button>
            </div>
          </div>
        );
      })()}

      {viewingMessage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setViewingMessage(null)}>
          <div style={{ background: "var(--ws-surface)", borderRadius: 16, padding: 24, maxWidth: 500, width: "100%", position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{lang === "fr" ? "Message envoyé" : "Outreach sent"}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ws-text)", whiteSpace: "pre-wrap" }}>{viewingMessage}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => { navigator.clipboard.writeText(viewingMessage); }} style={{ flex: 1, padding: "10px", background: "var(--ws-hover)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                {lang === "fr" ? "Copier" : "Copy"}
              </button>
              <button type="button" onClick={() => setViewingMessage(null)} style={{ flex: 1, padding: "10px", background: "var(--ws-btn)", color: "var(--ws-btn-text)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                {lang === "fr" ? "Fermer" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {followUpEntry && (
        <FollowUpPanel
          lang={lang}
          entry={followUpEntry}
          slideIn={followUpSlideIn}
          onClose={closeFollowUp}
          onSend={() => completeFollowUpSend(followUpEntry.id)}
          onMarkManual={() => completeFollowUpSend(followUpEntry.id)}
        />
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
