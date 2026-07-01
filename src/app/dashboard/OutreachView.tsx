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
import { notifyOutreachSent } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { selectionPillColors } from "@/lib/selection-card-styles";
import { buildCreatorEmailMap } from "@/lib/creator-crm";
import { isValidEmailAddress, resolveCreatorEmail, sendOutreachEmail } from "@/lib/outreach-email";
import {
  canPersistTemplates,
  canUseAutoFollowUp,
  canUseUnlimitedAIOutreach,
  type PlanTier,
} from "@/lib/plan-limits";
import { UpgradeModal } from "./UpgradeModal";
import { runGateUpgrade, type GateFeatureKey } from "@/lib/plan-marketing";

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
  background: "#0047FF",
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
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnBlack: React.CSSProperties = {
  background: "#1A1A1A",
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

const filterPillBtn: React.CSSProperties = {
  ...btnSecondary,
  padding: "11px 18px",
  fontSize: 14,
  minHeight: 42,
  lineHeight: 1.25,
};

type FollowUpTone = "Casual" | "Professional" | "Friendly";

const PLATFORM_DM_OPTIONS = [
  { value: "tiktok", label: "TikTok DM" },
  { value: "instagram", label: "Instagram DM" },
  { value: "youtube", label: "YouTube" },
  { value: "email", label: "Email" },
] as const;

function platformLabel(platform: string) {
  const p = platform.toLowerCase();
  if (p === "tiktok") return "TikTok DM";
  if (p === "instagram") return "Instagram DM";
  if (p === "youtube") return "YouTube";
  if (p === "email") return "Email";
  return platform;
}

function buildFollowUpMessage(creatorName: string, brandName: string) {
  const firstName = creatorName.split(" ")[0];
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
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFFFFF",
};

function formatFollowUpDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
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
        background: "#1A1A1A",
        color: "#FFFFFF",
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
  const [message, setMessage] = useState(() => buildFollowUpMessage(entry.creator, "Trackit"));
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
      const data = await res.json();
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
          background: "#FFFFFF",
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
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #EFEFEF", position: "relative" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "#FAFAFA",
              border: "1px solid #EFEFEF",
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
              <path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 36 }}>
            <CreatorAvatar src={entry.avatar} username={entry.handle} displayName={entry.creator} size={40} alt={entry.creator} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{entry.creator}</div>
              <div style={{ fontSize: 12, color: "#0047FF" }}>@{entry.handle}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, background: "#F0F0F0", padding: "4px 8px", borderRadius: 999, textTransform: "capitalize", flexShrink: 0 }}>
              {entry.platform}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#9A9A9A", margin: "10px 0 0" }}>Original message sent {entry.sentDate}</p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 12px" }}>Follow up message</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
          />
          <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 14 }}>{message.length} characters</div>
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
                  background: tone === t ? "#1A1A1A" : "#FFFFFF",
                  color: tone === t ? "#FFFFFF" : "#1A1A1A",
                  borderColor: tone === t ? "#1A1A1A" : "#E5E5E5",
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
            {regenerating ? (lang === "fr" ? "Génération..." : "Generating...") : "Regenerate with AI →"}
          </button>

          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 12px" }}>Review before sending</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: showNotOpenedWarning ? 12 : 20 }}>
            <div style={{ fontSize: 13, color: "#1A1A1A", display: "flex", gap: 8 }}>
              <span style={{ color: "#1FB567" }}>✓</span>
              <span>Message personalized for creator</span>
            </div>
            <div style={{ fontSize: 13, color: "#1A1A1A", display: "flex", gap: 8 }}>
              <span style={{ color: "#1FB567" }}>✓</span>
              <span>Follow up timing is appropriate (3 days after initial)</span>
            </div>
          </div>
          {showNotOpenedWarning && (
            <p style={{ fontSize: 13, color: "#1A1A1A", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Ce créateur n'a pas encore ouvert votre premier message."
                : "This creator hasn't opened your first message yet."}
            </p>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>Send via</h3>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }}>
            {PLATFORM_DM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "#9A9A9A", marginTop: 6 }}>Original sent on {platformLabel(entry.platform)}</p>
        </div>

        <div style={{ padding: "16px 20px 20px", borderTop: "1px solid #EFEFEF" }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{ ...btnBlack, width: "100%", marginBottom: 10, opacity: sending ? 0.7 : 1 }}
          >
            {sending ? "Sending..." : "Send follow up →"}
          </button>
          <button
            type="button"
            onClick={onMarkManual}
            style={{
              background: "none",
              border: "none",
              color: "#9A9A9A",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              width: "100%",
              textAlign: "center",
              padding: 0,
            }}
          >
            Mark as sent manually
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
      <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>{lang === "fr" ? "Sauvegarder comme modèle" : "Save as template"}</h3>
        <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Template name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => name.trim() && onSave(name.trim())} style={{ ...btnBlack, flex: 1 }} disabled={!name.trim()}>
            Save
          </button>
          <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function outreachTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getOutreachGenerationsToday(): number {
  const storedDate = localStorage.getItem("trackit_outreach_date");
  if (storedDate !== outreachTodayDateKey()) return 0;
  return parseInt(localStorage.getItem("trackit_outreach_today") || "0", 10);
}

function incrementOutreachGenerationsToday() {
  const today = outreachTodayDateKey();
  const storedDate = localStorage.getItem("trackit_outreach_date");
  if (storedDate !== today) {
    localStorage.setItem("trackit_outreach_date", today);
    localStorage.setItem("trackit_outreach_today", "1");
    return;
  }
  const count = getOutreachGenerationsToday() + 1;
  localStorage.setItem("trackit_outreach_today", String(count));
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
    if (!canUseUnlimitedAIOutreach(plan)) {
      const today = new Date().toDateString();
      const key = "trackit_outreach_gen_" + today;
      const used = parseInt(localStorage.getItem(key) || "0");
      if (used >= 1) {
        setUpgradeFeature("ai-outreach");
        return;
      }
      localStorage.setItem(key, String(used + 1));
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
      const data = await res.json();
      if (!res.ok) throw new Error("Failed");
      setMessage(data.message);
      setEmailSubject(typeof data.subject === "string" ? data.subject : "");
      setShowSendFlow(false);
    } catch {
      onToast("Generation failed. Try again.");
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
      if (!isValidEmailAddress(senderEmail) || !isValidEmailAddress(recipient)) {
        onToast(lang === "fr" ? "Renseignez l'email marque et créateur" : "Enter brand and creator emails");
        return;
      }
      setSendingEmail(true);
      const result = await sendOutreachEmail({
        fromEmail: senderEmail.trim(),
        subject: emailSubject.trim() || (lang === "fr" ? "Partenariat" : "Partnership"),
        body: generatedMessage,
        recipients: [recipient],
      });
      setSendingEmail(false);
      if (!result.ok) {
        onToast(result.error);
        return;
      }
      if (result.mode !== "api" && result.composeUrl) {
        window.open(result.composeUrl, "_blank", "noopener,noreferrer");
      }
      await onMarkSent({
        id: "",
        creator: selectedCreator.displayName,
        handle,
        platform: "Email",
        avatar: selectedCreator.avatar,
        message: historyMessage,
        sentDate: todayIso(),
        status: "sent",
        followUpDate: canUseAutoFollowUp(plan) ? followUpIn3Days() : null,
      });
      onToast(lang === "fr" ? "Email envoyé ✓" : "Email sent ✓");
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
    onToast(lang === "fr" ? "Outreach copié — collez dans le DM ✓" : "Outreach copied — paste in the DM ✓");
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
          ? "Envoyer via Email"
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
    onToast(lang === "fr" ? "Outreach envoyé ✓" : "Outreach sent ✓");
    resetPanel();
  };

  const tones: GenerateTone[] = ["Casual", "Professional", "Friendly", "Direct"];
  const platforms: GeneratePlatform[] = ["TikTok DM", "Instagram DM", "Email"];

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #EFEFEF",
          borderRadius: 16,
          padding: expanded ? 0 : 20,
          overflow: "hidden",
        }}
      >
        {!expanded ? (
          isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 72, width: "auto", display: "block", flexShrink: 0, alignSelf: "flex-start" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {lang === "fr" ? "Générer un outreach avec Trackit IA" : "Generate outreach with Trackit AI"}
                </div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45 }}>
                  {lang === "fr" ? "Sélectionnez un créateur, l'IA rédige un outreach personnalisé, vous modifiez et envoyez" : "Select a creator, AI writes a personalized outreach, you edit and send"}
                </div>
              </div>
              <button type="button" className="hero-cta-shopify hero-cta-compact" style={{ alignSelf: "flex-start" }} onClick={() => setExpanded(true)}>
                {lang === "fr" ? "Essayer maintenant" : "Try now"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 72, width: "auto", display: "block", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>
                  {lang === "fr" ? "Générer un outreach avec Trackit IA" : "Generate outreach with Trackit AI"}
                </div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                  {lang === "fr" ? "Sélectionnez un créateur, l'IA rédige un outreach personnalisé, vous modifiez et envoyez" : "Select a creator, AI writes a personalized outreach, you edit and send"}
                </div>
              </div>
              <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={() => setExpanded(true)}>
                {lang === "fr" ? "Essayer maintenant" : "Try now"}
              </button>
            </div>
          )
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid #EFEFEF",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Générer un outreach avec Trackit IA" : "Generate outreach with Trackit AI"}
              </h3>
              <button
                type="button"
                onClick={resetPanel}
                aria-label="Close"
                style={{
                  background: "#FAFAFA",
                  border: "1px solid #EFEFEF",
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
                  <path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 1 — SÉLECTIONNER UN CRÉATEUR" : "STEP 1 — SELECT CREATOR"}
                </label>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", marginBottom: 8 }}>{lang === "fr" ? "À qui souhaitez-vous vous adresser ?" : "Who are you reaching out to?"}</div>
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
                        background: "#FFFFFF",
                        border: "1px solid #EFEFEF",
                        borderRadius: 10,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                        zIndex: 10,
                        maxHeight: 240,
                        overflowY: "auto",
                      }}
                    >
                      {savedCreators.length === 0 ? (
                        <div style={{ padding: "14px 12px", fontSize: 13, color: "#7A7A7A" }}>
                          {lang === "fr"
                            ? "Aucun créateur sauvegardé. Ajoutez-en depuis Créateurs ou Découverte."
                            : "No saved creators. Add some from Creators or Discovery."}
                        </div>
                      ) : filteredCreators.length === 0 ? (
                        <div style={{ padding: "14px 12px", fontSize: 13, color: "#7A7A7A" }}>
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
                              borderBottom: "1px solid #F5F5F5",
                              background: "#FFFFFF",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <CreatorAvatar src={c.avatar} username={c.username} displayName={c.displayName} size={32} alt={c.displayName} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.displayName}</div>
                              <div style={{ fontSize: 12, color: "#0047FF" }}>@{c.username}</div>
                            </div>
                            <span style={{ fontSize: 10, background: "#F0F0F0", padding: "3px 8px", borderRadius: 999, textTransform: "capitalize" }}>
                              {c.platform}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {selectedCreator && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 10, border: "1px solid #EFEFEF" }}>
                    <CreatorAvatar src={selectedCreator.avatar} username={selectedCreator.username} displayName={selectedCreator.displayName} size={40} alt={selectedCreator.displayName} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedCreator.displayName}</div>
                      <div style={{ fontSize: 12, color: "#0047FF" }}>@{selectedCreator.username}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 500, background: "#F0F0F0", padding: "4px 10px", borderRadius: 999, textTransform: "capitalize" }}>
                      {selectedCreator.platform}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 2 — VOTRE MARQUE" : "STEP 2 — YOUR BRAND"}
                </label>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", marginBottom: 8 }}>{lang === "fr" ? "Que vendez-vous ?" : "What are you selling?"}</div>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={lang === "fr" ? "ex. vêtements de sport durables pour femmes" : "e.g. sustainable activewear for women"}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "ÉTAPE 3 — TON ET PLATEFORME" : "STEP 3 — TONE AND PLATFORM"}
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>{lang === "fr" ? "Ton" : "Tone"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {tones.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTone(t)}
                          style={{
                            ...filterPillBtn,
                            background: tone === t ? "#1A1A1A" : "#FFFFFF",
                            color: tone === t ? "#FFFFFF" : "#1A1A1A",
                            borderColor: tone === t ? "#1A1A1A" : "#E5E5E5",
                          }}
                        >
                          {displayTone(t, lang)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>{lang === "fr" ? "Plateforme" : "Platform"}</div>
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
                          {p}
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
                {generating ? (lang === "fr" ? "Génération..." : "Generating...") : lang === "fr" ? "Générer l'outreach →" : "Generate outreach →"}
              </button>

              {message && !generating && (
                <div>
                  {platform === "Email" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>
                          {lang === "fr" ? "Email de la marque" : "Brand email"}
                        </label>
                        <input
                          type="email"
                          value={senderEmail}
                          onChange={(e) => setSenderEmail(e.target.value)}
                          placeholder="vous@marque.com"
                          style={inputStyle}
                          autoComplete="email"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>
                          {lang === "fr" ? "Email du créateur" : "Creator email"}
                        </label>
                        <input
                          type="email"
                          value={creatorEmail}
                          onChange={(e) => setCreatorEmail(e.target.value)}
                          placeholder="creator@email.com"
                          style={inputStyle}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>
                          {lang === "fr" ? "Objet" : "Subject"}
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder={lang === "fr" ? "Objet de l'email" : "Email subject"}
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
                  <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 16 }}>{message.length} characters</div>
                  <p style={{ fontSize: 13, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                    {platform === "Email"
                      ? lang === "fr"
                        ? "L'envoi ouvre votre messagerie (Gmail, Outlook ou Mail) — assurez-vous d'être connecté avec l'email de la marque ci-dessus."
                        : "Send opens your mail app (Gmail, Outlook, or Mail) — make sure you're signed in with the brand email above."
                      : lang === "fr"
                        ? "L'outreach sera copié automatiquement. Collez-le (Cmd+V) dans le DM et envoyez."
                        : "Outreach will be auto-copied. Just paste it (Cmd+V) in the DM and hit send."}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void handleCopy()} style={{ ...btnSecondary, flex: 1, minWidth: 120 }}>
                      {copied ? (lang === "fr" ? "Copié ✓" : "Copied ✓") : lang === "fr" ? "Copier l'outreach" : "Copy outreach"}
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
                    <div style={{ padding: 16, background: "#FAFAFA", borderRadius: 12, border: "1px solid #EFEFEF" }}>
                      {platform === "TikTok DM" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <a
                            href="https://tiktok.com/messages"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...btnSecondary, textAlign: "center", textDecoration: "none" }}
                          >
                            Open TikTok DMs →
                          </a>
                          <button type="button" onClick={() => void handleSend()} style={{ ...btnBlack, marginBottom: 8 }}>
                            {lang === "fr" ? "Envoyer via Email" : "Send via Email"}
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
                            Open Instagram DMs →
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
                            placeholder="creator@email.com"
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
          defaultName={`Outreach — ${selectedCreator.displayName}`}
          onClose={() => setSaveTemplateOpen(false)}
          onSave={(name) => {
            setSavedTemplates((list) => [
              ...list,
              { id: `tpl-${Date.now()}`, name, body: message, platform },
            ]);
            setSaveTemplateOpen(false);
            onToast("Template saved ✓");
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
        style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 520, width: "100%", position: "relative", boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 16, right: 16, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontFamily: "inherit" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", paddingRight: 32 }}>{lang === "fr" ? `Outreach à ${creator}` : `Outreach to ${creator}`}</h3>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{message}</p>
        <button type="button" style={btnSecondary} onClick={() => void navigator.clipboard.writeText(message)}>
          {lang === "fr" ? "Copier l'outreach" : "Copy outreach"}
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
}: {
  plan: PlanTier;
  onNavigateToBilling: () => void;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  refreshKey?: number;
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
  }, []);

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
      creator.displayName || creator.creator || handle || "creator",
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
        ? "Supprimer tout l'historique d'outreach ? Cette action est irréversible."
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
    const data = await res.json();
    if (data.followUp || data.message) {
      await navigator.clipboard.writeText(data.followUp || data.message);
      alert(lang === "fr" ? "Outreach de relance copié ✓" : "Follow-up outreach copied to clipboard ✓");
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
    updateStatus(item.id, "replied");
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

  const historyStats = useMemo(() => {
    const totalSent = entries.length;
    const replied = entries.filter((e) => e.status === "replied" || e.status === "converted").length;
    const converted = entries.filter((e) => e.status === "converted").length;
    const replyRate = totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0;
    return { totalSent, replied, converted, replyRate };
  }, [entries]);

  const updateStatus = (id: string, status: OutreachHistoryStatus) => {
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

  const handleAiMarkSent = async (entry: OutreachHistoryEntry) => {
    await handleMarkSent(
      {
        username: entry.handle,
        handle: entry.handle,
        displayName: entry.creator,
        creator: entry.creator,
        avatarUrl: entry.avatar,
        avatar: entry.avatar,
        platform: entry.platform,
      },
      entry.message,
      entry.followUpDate
    );
  };

  return (
    <>
      <OutreachAIGeneratePanel
        lang={lang}
        plan={plan}
        onUpgrade={onUpgrade}
        onUpgradePro={onUpgradePro}
        onUpgradeScale={onUpgradeScale}
        onMarkSent={handleAiMarkSent}
        onToast={setToast}
        isMobile={isMobile}
      />

      <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>{lang === "fr" ? "Historique d'outreach" : "Outreach history"}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              className="hero-cta-shopify-light hero-cta-compact-sm"
            >
              {lang === "fr" ? "Vider l'historique" : "Clear history"}
            </button>
          )}
          <div style={{ position: "relative", minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 10, padding: "8px 12px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
                <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
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
                placeholder={lang === "fr" ? "Rechercher un créateur..." : "Search creators..."}
                style={{ border: "none", outline: "none", flex: 1, fontSize: 13, fontFamily: "inherit", background: "transparent", minWidth: 140 }}
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
                  background: "#FFFFFF",
                  border: "1px solid #EFEFEF",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                  zIndex: 20,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {historyCreatorSuggestions.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#7A7A7A" }}>
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
                        borderBottom: "1px solid #F5F5F5",
                        background: "#FFFFFF",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <CreatorAvatar src={c.avatar} username={c.username} displayName={c.displayName} size={28} alt={c.displayName} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{c.displayName}</div>
                        <div style={{ fontSize: 12, color: "#0047FF" }}>@{c.username}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : undefined, paddingBottom: isMobile ? 4 : undefined, marginBottom: 20, borderBottom: "1px solid #EFEFEF" }}>
          {filterTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: filter === t.id ? "2px solid #0047FF" : "2px solid transparent",
                padding: "8px 10px 12px",
                fontSize: 13,
                fontWeight: filter === t.id ? 600 : 400,
                color: filter === t.id ? "#1A1A1A" : "#7A7A7A",
                fontFamily: "inherit",
                cursor: "pointer",
                marginRight: 4,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: lang === "fr" ? "Total envoyé" : "Total sent", value: String(historyStats.totalSent) },
            { label: lang === "fr" ? "Taux de réponse" : "Reply rate", value: `${historyStats.replyRate}%` },
            {
              label: lang === "fr" ? "Réponses" : "Replies",
              value: String(historyStats.replied),
            },
            { label: lang === "fr" ? "Converti" : "Converted", value: String(historyStats.converted) },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#7A7A7A", fontSize: 14 }}>
              {entries.length === 0
                ? lang === "fr"
                  ? "Aucun outreach envoyé pour le moment. Contactez un créateur via Instagram, TikTok, etc."
                  : "No outreach sent yet. Contact a creator via Instagram, TikTok, etc."
                : lang === "fr"
                  ? "Aucun résultat pour ce filtre."
                  : "No results for this filter."}
            </div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
              {filtered.map((item) => {
                return (
                  <div key={item.id} style={{ background: "#fff", border: "1px solid #EFEFEF", borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <CreatorAvatar src={item.avatar} username={item.handle} displayName={item.creator} size={40} alt={item.creator} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>{item.creator}</div>
                        <div style={{ fontSize: 12, color: "#0047FF" }}>@{item.handle}</div>
                        <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "capitalize" }}>
                          {item.platform} · {item.sentDate ? new Date(item.sentDate + "T12:00:00").toLocaleDateString() : "—"}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>{outreachStatusBadge(item.status, lang)}</div>
                    </div>
                    {item.message && (
                      <div style={{ fontSize: 12, color: "#5A5A5A", background: "#F8F8F8", borderRadius: 8, padding: "8px 12px", marginBottom: 10, lineHeight: 1.4 }}>
                        {item.message.slice(0, 80)}
                        {item.message.length > 80 ? "..." : ""}
                      </div>
                    )}
                    {item.followUpDate && (
                      <div style={{ fontSize: 11, color: "#F57F17", marginBottom: 10 }}>
                        {lang === "fr" ? "Relance :" : "Follow up:"} {formatFollowUpDate(item.followUpDate)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="hero-cta-shopify-light hero-cta-compact"
                        style={{ flex: 1, width: "100%" }}
                        onClick={() => setManageEntry(item)}
                      >
                        {lang === "fr" ? "Gérer l'outreach" : "Manage the outreach"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.9fr 0.9fr 0.9fr 1.1fr",
                  gap: 10,
                  padding: "12px 16px",
                  background: "#FAFAFA",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#9A9A9A",
                }}
              >
                {[
                  lang === "fr" ? "Créateur" : "Creator",
                  lang === "fr" ? "Plateforme" : "Platform",
                  lang === "fr" ? "Aperçu de l'outreach" : "Outreach preview",
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
                      borderTop: i === 0 ? "none" : "1px solid #F5F5F5",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <CreatorAvatar src={row.avatar} username={row.handle} displayName={row.creator} size={32} alt={row.creator} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.creator}</div>
                        <div style={{ fontSize: 12, color: "#0047FF" }}>@{row.handle}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, textTransform: "capitalize" }}>{row.platform}</div>
                    <div style={{ fontSize: 12, color: "#7A7A7A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.message.slice(0, 60)}
                      {row.message.length > 60 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#7A7A7A" }}>{row.sentDate}</div>
                    <div>{outreachStatusBadge(row.status, lang)}</div>
                    <div style={{ fontSize: 11, color: "#EA580C" }}>
                      {row.followUpDate ? `${lang === "fr" ? "Relance :" : "Follow up:"} ${formatFollowUpDate(row.followUpDate)}` : row.status === "replied" || row.status === "converted" ? "—" : "—"}
                    </div>
                    <div>
                      <button type="button" className="hero-cta-shopify-light hero-cta-compact" style={{ width: "100%" }} onClick={() => setManageEntry(row)}>
                        {lang === "fr" ? "Gérer l'outreach" : "Manage the outreach"}
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
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{lang === "fr" ? "Gérer l'outreach" : "Manage the outreach"}</div>
              <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 20 }}>{manageEntry.creator} · @{manageEntry.handle}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  style={{ ...btnSecondary, width: "100%" }}
                  onClick={() => {
                    setViewingMessage(manageEntry.message || "");
                    setManageEntry(null);
                  }}
                >
                  {lang === "fr" ? "Voir l'outreach" : "View outreach"}
                </button>
                <button
                  type="button"
                  disabled={followUpDisabled}
                  style={{ ...btnSecondary, width: "100%", opacity: followUpDisabled ? 0.4 : 1, cursor: followUpDisabled ? "not-allowed" : "pointer" }}
                  onClick={() => void sendFollowUp(manageEntry)}
                >
                  {lang === "fr" ? "Envoyer un suivi" : "Send follow up"}
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
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 500, width: "100%", position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{lang === "fr" ? "Outreach envoyé" : "Outreach sent"}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#1A1A1A", whiteSpace: "pre-wrap" }}>{viewingMessage}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => { navigator.clipboard.writeText(viewingMessage); }} style={{ flex: 1, padding: "10px", background: "#F5F5F5", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                {lang === "fr" ? "Copier" : "Copy"}
              </button>
              <button type="button" onClick={() => setViewingMessage(null)} style={{ flex: 1, padding: "10px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
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
