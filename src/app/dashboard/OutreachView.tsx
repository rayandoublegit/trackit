"use client";

import { useEffect, useMemo, useState } from "react";
import { saveOutreach, getOutreachHistory } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

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

const INITIAL_OUTREACH_HISTORY: OutreachHistoryEntry[] = [
  { id: "1", creator: "Emma Laurent", handle: "fashionwithemma", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma", message: "Hey Emma 👋 I've been following your content and I love how authentic your fashion posts are...", sentDate: "2026-05-10", status: "replied", followUpDate: null },
  { id: "2", creator: "Sarah Martin", handle: "fitnessbysarah", platform: "instagram", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah", message: "Hey Sarah, I run a fitness brand and I think your audience would genuinely love what we do...", sentDate: "2026-05-12", status: "sent", followUpDate: "2026-05-15" },
  { id: "3", creator: "Marc Dubois", handle: "techreviewspro", platform: "youtube", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=marc", message: "Hey Marc, huge fan of your honest tech reviews. I'd love to discuss a potential partnership...", sentDate: "2026-05-08", status: "no_response", followUpDate: "2026-05-15" },
  { id: "4", creator: "Julie Chen", handle: "beautybyjulie", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=julie", message: "Hey Julie 👋 Your skincare content is exactly the kind of authentic voice our brand needs...", sentDate: "2026-05-14", status: "opened", followUpDate: "2026-05-17" },
  { id: "5", creator: "Leo Moreau", handle: "travelwithleo", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=leo", message: "Hey Leo, I've been watching your travel content and I think there's a great fit with our brand...", sentDate: "2026-05-15", status: "converted", followUpDate: null },
];

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
  const map: Record<OutreachHistoryStatus, { bg: string; fg: string; en: string; fr: string }> = {
    replied: { bg: "rgba(31,181,103,0.12)", fg: "#1FB567", en: "Replied", fr: "Répondu" },
    sent: { bg: "rgba(0,71,255,0.1)", fg: "#0047FF", en: "Sent", fr: "Envoyé" },
    no_response: { bg: "#F0F0F0", fg: "#7A7A7A", en: "No reply", fr: "Pas de réponse" },
    opened: { bg: "rgba(234,179,8,0.15)", fg: "#B45309", en: "Opened", fr: "Ouvert" },
    converted: { bg: "rgba(21,128,61,0.15)", fg: "#15803D", en: "Converted ✓", fr: "Converti ✓" },
  };
  const s = map[status];
  const label = lang === "fr" ? s.fr : s.en;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.fg, background: s.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
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
  onSend: () => void;
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

  const handleSend = () => {
    setSending(true);
    setTimeout(() => {
      onSend();
      setSending(false);
    }, 1000);
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
            <img src={entry.avatar} alt="" width={40} height={40} style={{ borderRadius: "50%", flexShrink: 0 }} />
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
            <div style={{ fontSize: 13, color: "#B45309", background: "#FFFBEB", padding: "10px 12px", borderRadius: 8, marginBottom: 20 }}>
              ⚠ This creator hasn&apos;t opened your first message yet
            </div>
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

const MOCK_OUTREACH_CREATORS: OutreachCreator[] = [
  { id: "c1", displayName: "Emma Laurent", username: "fashionwithemma", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma", niche: "Fashion", followersCount: 245000, engagementRate: 4.2, bio: "Fashion & lifestyle creator based in Paris." },
  { id: "c2", displayName: "Sarah Martin", username: "fitnessbysarah", platform: "instagram", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah", niche: "Fitness", followersCount: 89000, engagementRate: 6.8, bio: "Fitness coach helping women build strength." },
  { id: "c3", displayName: "Marc Dubois", username: "techreviewspro", platform: "youtube", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=marc", niche: "Tech", followersCount: 520000, engagementRate: 3.1, bio: "Honest tech reviews and gadget breakdowns." },
  { id: "c4", displayName: "Julie Chen", username: "beautybyjulie", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=julie", niche: "Beauty", followersCount: 167000, engagementRate: 5.4, bio: "Skincare routines and honest beauty reviews." },
  { id: "c5", displayName: "Leo Moreau", username: "travelwithleo", platform: "tiktok", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=leo", niche: "Travel", followersCount: 312000, engagementRate: 4.9, bio: "Budget travel tips and hidden gems worldwide." },
  { id: "c6", displayName: "Thomas Bernard", username: "foodieparadise", platform: "instagram", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=thomas", niche: "Food", followersCount: 98000, engagementRate: 7.2, bio: "Food reviews and recipe content from Marseille." },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function followUpIn3Days() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function nextHistoryId() {
  return `oh-${Date.now()}`;
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

type PlanTier = "free" | "basic" | "pro";

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
  onNavigateToBilling,
  onMarkSent,
  onToast,
  isMobile,
}: {
  lang: "en" | "fr";
  plan: PlanTier;
  onNavigateToBilling: () => void;
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
  const [copied, setCopied] = useState(false);
  const [showSendFlow, setShowSendFlow] = useState(false);
  const [creatorEmail, setCreatorEmail] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [, setSavedTemplates] = useState<SavedOutreachTemplate[]>([]);

  const filteredCreators = useMemo(() => {
    const q = creatorSearch.trim().toLowerCase();
    if (!q) return MOCK_OUTREACH_CREATORS;
    return MOCK_OUTREACH_CREATORS.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q)
    );
  }, [creatorSearch]);

  const resetPanel = () => {
    setExpanded(false);
    setCreatorSearch("");
    setDropdownOpen(false);
    setSelectedCreator(null);
    setBrand("");
    setTone("Casual");
    setPlatform("TikTok DM");
    setMessage("");
    setShowSendFlow(false);
    setCreatorEmail("");
    setCopied(false);
  };

  const outreachLimitReached = plan === "free";

  const handleGenerate = async () => {
    if (plan === "free") {
      alert(lang === "fr" ? "La génération IA est disponible à partir du plan Basic." : "AI generation is available on Basic plan and above.");
      return;
    }
    if (!selectedCreator || !brand.trim()) return;
    setGenerating(true);
    setMessage("");
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
      setShowSendFlow(false);
    } catch {
      onToast("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSend = async () => {
    if (!selectedCreator || !message) return;
    const generatedMessage = message;
    const handle = selectedCreator.username.replace(/^@/, "");
    try {
      await navigator.clipboard.writeText(generatedMessage);
    } catch {
      /* clipboard may be unavailable */
    }
    if (platform === "Instagram DM") {
      window.open(`https://www.instagram.com/direct/new/?username=${handle}`, "_blank");
    } else if (platform === "TikTok DM") {
      window.open(`https://www.tiktok.com/@${handle}`, "_blank");
    } else if (platform === "Email") {
      window.open(`mailto:${creatorEmail.trim() || handle}?body=${encodeURIComponent(generatedMessage)}`, "_blank");
    }
    onToast(lang === "fr" ? "Message copié — collez dans le DM ✓" : "Message copied — paste in the DM ✓");
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
      id: nextHistoryId(),
      creator: selectedCreator.displayName,
      handle: selectedCreator.username,
      platform: selectedCreator.platform,
      avatar: selectedCreator.avatar,
      message,
      sentDate: todayIso(),
      status: "sent",
      followUpDate: followUpIn3Days(),
    });
    onToast(lang === "fr" ? "Message envoyé ✓" : "Outreach sent ✓");
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
                  {lang === "fr" ? "Générer un message avec Trackit IA" : "Generate outreach with Trackit AI"}
                </div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45 }}>
                  {lang === "fr" ? "Sélectionnez un créateur, l'IA rédige un message personnalisé, vous modifiez et envoyez" : "Select a creator, AI writes a personalized message, you edit and send"}
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
                  {lang === "fr" ? "Générer un message avec Trackit IA" : "Generate outreach with Trackit AI"}
                </div>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                  {lang === "fr" ? "Sélectionnez un créateur, l'IA rédige un message personnalisé, vous modifiez et envoyez" : "Select a creator, AI writes a personalized message, you edit and send"}
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
                {lang === "fr" ? "Générer un message avec Trackit IA" : "Generate outreach with Trackit AI"}
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
                      {filteredCreators.map((c) => (
                        <button
                          key={c.id}
                          type="button"
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
                          <img src={c.avatar} alt="" width={32} height={32} style={{ borderRadius: "50%", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{c.displayName}</div>
                            <div style={{ fontSize: 12, color: "#0047FF" }}>@{c.username}</div>
                          </div>
                          <span style={{ fontSize: 10, background: "#F0F0F0", padding: "3px 8px", borderRadius: 999, textTransform: "capitalize" }}>
                            {c.platform}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCreator && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 10, border: "1px solid #EFEFEF" }}>
                    <img src={selectedCreator.avatar} alt="" width={40} height={40} style={{ borderRadius: "50%" }} />
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {tones.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTone(t)}
                          style={{
                            ...btnSecondary,
                            padding: "6px 12px",
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
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>{lang === "fr" ? "Plateforme" : "Platform"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {platforms.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlatform(p)}
                          style={{
                            ...btnSecondary,
                            padding: "6px 12px",
                            fontSize: 12,
                            background: platform === p ? "rgba(0,71,255,0.08)" : "#FFFFFF",
                            color: platform === p ? "#0047FF" : "#1A1A1A",
                            borderColor: platform === p ? "#0047FF" : "#E5E5E5",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {outreachLimitReached ? (
                <div
                  style={{
                    padding: 16,
                    background: "#FFFBF0",
                    border: "1px solid #FFE4A8",
                    borderRadius: 12,
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 14, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.5, letterSpacing: "-0.02em" }}>
                    You&apos;ve used your 3 free AI messages today. Upgrade for unlimited.
                  </p>
                  <button type="button" onClick={onNavigateToBilling} style={{ ...btnPrimary }}>
                    Upgrade →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || !selectedCreator || !brand.trim()}
                  style={{ ...btnBlack, width: "100%", marginBottom: 20, opacity: generating || !selectedCreator || !brand.trim() ? 0.5 : 1 }}
                >
                  {generating ? (lang === "fr" ? "Génération..." : "Generating...") : lang === "fr" ? "Générer le message →" : "Generate message →"}
                </button>
              )}

              {message && !generating && (
                <div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={10}
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
                  />
                  <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 16 }}>{message.length} characters</div>
                  <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#7B5800", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>⚡</span>
                    <span>{lang === "fr" ? "Le message sera copié automatiquement. Collez-le (Cmd+V) dans le DM et envoyez." : "Message will be auto-copied. Just paste it (Cmd+V) in the DM and hit send."}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void handleCopy()} style={{ ...btnSecondary, flex: 1, minWidth: 120 }}>
                      {copied ? (lang === "fr" ? "Copié ✓" : "Copied ✓") : lang === "fr" ? "Copier le message" : "Copy message"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveTemplateOpen(true)}
                      style={{ ...btnSecondary, flex: 1, minWidth: 120 }}
                    >
                      {lang === "fr" ? "Sauvegarder comme modèle" : "Save as template"}
                    </button>
                    <button type="button" onClick={() => void handleSend()} style={{ ...btnBlack, flex: 1, minWidth: 140 }}>
                      {sendViaLabel} →
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
                          <button type="button" disabled style={{ ...btnSecondary, opacity: 0.45, cursor: "not-allowed" }}>
                            Send email → (coming soon)
                          </button>
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
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", paddingRight: 32 }}>{lang === "fr" ? `Message à ${creator}` : `Message to ${creator}`}</h3>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{message}</p>
        <button type="button" style={btnSecondary} onClick={() => void navigator.clipboard.writeText(message)}>
          {lang === "fr" ? "Copier le message" : "Copy message"}
        </button>
      </div>
    </div>
  );
}

export function OutreachHistorySection({
  plan,
  onNavigateToBilling,
  isMobile,
}: {
  plan: PlanTier;
  onNavigateToBilling: () => void;
  isMobile?: boolean;
}) {
  const lang = useLang();
  const [entries, setEntries] = useState<OutreachHistoryEntry[]>(INITIAL_OUTREACH_HISTORY);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [viewingMessage, setViewingMessage] = useState<string | null>(null);
  const [followUpEntry, setFollowUpEntry] = useState<OutreachHistoryEntry | null>(null);
  const [followUpSlideIn, setFollowUpSlideIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const history = await getOutreachHistory(user.id);
      if (history.length > 0) {
        setEntries(history.map((o) => ({
          id: o.id,
          creator: o.creator_display_name,
          handle: o.creator_username,
          platform: o.platform,
          avatar: o.creator_avatar,
          message: o.message,
          sentDate: o.created_at?.split("T")[0] ?? "",
          status: o.status as OutreachHistoryStatus,
          followUpDate: o.follow_up_date ?? null,
        })));
      }
    };
    void load();
  }, []);

  const handleMarkSent = async (creator: any, message: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await saveOutreach(user.id, {
      creator_username: creator.username || creator.handle,
      creator_display_name: creator.displayName || creator.creator,
      creator_avatar: creator.avatarUrl || creator.avatar,
      platform: creator.platform,
      message: message,
      status: "sent",
    });
  };

  const closeFollowUp = () => {
    setFollowUpSlideIn(false);
    setTimeout(() => setFollowUpEntry(null), 300);
  };

  const completeFollowUpSend = (id: string) => {
    setEntries((list) =>
      list.map((e) =>
        e.id === id
          ? { ...e, status: "sent" as const, followUpDate: null }
          : e
      )
    );
    closeFollowUp();
    setToast("Follow up sent ✓");
  };

  const filtered = useMemo(() => {
    let list = [...entries];
    if (filter !== "all") list = list.filter((e) => e.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.creator.toLowerCase().includes(q) || e.handle.toLowerCase().includes(q));
    return list;
  }, [entries, filter, search]);

  const updateStatus = (id: string, status: OutreachHistoryStatus) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, status, followUpDate: status === "replied" || status === "converted" ? null : e.followUpDate } : e)));
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
      entry.message
    );
    setEntries((list) => [entry, ...list]);
  };

  return (
    <>
      <OutreachAIGeneratePanel lang={lang} plan={plan} onNavigateToBilling={onNavigateToBilling} onMarkSent={handleAiMarkSent} onToast={setToast} isMobile={isMobile} />

      <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>{lang === "fr" ? "Historique des messages" : "Outreach history"}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 10, padding: "8px 12px", minWidth: 220 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by creator name..."
              style={{ border: "none", outline: "none", flex: 1, fontSize: 13, fontFamily: "inherit", background: "transparent" }}
            />
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
            { label: lang === "fr" ? "Total envoyé" : "Total sent", value: "5" },
            { label: lang === "fr" ? "Taux de réponse" : "Reply rate", value: "20%" },
            { label: lang === "fr" ? "Temps de réponse moyen" : "Avg response time", value: lang === "fr" ? "2,4 jours" : "2.4 days" },
            { label: lang === "fr" ? "Converti" : "Converted", value: "1" },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, overflow: "hidden" }}>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
              {filtered.map((item) => {
                const followUpDisabled = item.status === "replied" || item.status === "converted";
                const showMarkReplied = item.status === "sent" || item.status === "opened" || item.status === "no_response";
                return (
                  <div key={item.id} style={{ background: "#fff", border: "1px solid #EFEFEF", borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <img
                        src={item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.handle}`}
                        alt=""
                        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                      />
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setViewingMessage(item.message || "")}
                        style={{ flex: 1, minWidth: 100, padding: "8px", background: "#F5F5F5", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#1A1A1A" }}
                      >
                        {lang === "fr" ? "Voir le message" : "View message"}
                      </button>
                      <button
                        type="button"
                        disabled={followUpDisabled}
                        onClick={async () => {
                          const res = await fetch("/api/generate-follow-up", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              creatorHandle: item.handle,
                              platform: item.platform,
                              originalMessage: item.message,
                              lang,
                            }),
                          });
                          const data = await res.json();
                          if (data.followUp || data.message) {
                            await navigator.clipboard.writeText(data.followUp || data.message);
                            alert(lang === "fr" ? "Message de relance copié ✓" : "Follow-up copied to clipboard ✓");
                            const { supabase } = await import("@/lib/supabase");
                            if (supabase) await supabase
                              .from("outreach_history")
                              .update({ follow_up_sent: true })
                              .eq("id", item.id);
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 100,
                          padding: "8px",
                          background: "#F5F5F5",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: followUpDisabled ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          color: "#1A1A1A",
                          opacity: followUpDisabled ? 0.4 : 1,
                        }}
                      >
                        {lang === "fr" ? "Envoyer un suivi" : "Send follow up"}
                      </button>
                      {showMarkReplied && (
                        <button
                          type="button"
                          onClick={async () => {
                            const { supabase } = await import("@/lib/supabase");
                            if (supabase) await supabase
                              .from("outreach_history")
                              .update({ status: "replied" })
                              .eq("id", item.id);
                            window.location.reload();
                          }}
                          style={{ flex: 1, minWidth: 100, padding: "8px", background: "#0047FF", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          {lang === "fr" ? "Marquer comme répondu" : "Mark as replied"}
                        </button>
                      )}
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
                  gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.9fr 0.9fr 0.9fr 1.8fr",
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
                  lang === "fr" ? "Aperçu du message" : "Message preview",
                  lang === "fr" ? "Date d'envoi" : "Sent date",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Relance" : "Follow up",
                  lang === "fr" ? "Actions" : "Actions",
                ].map((h) => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {filtered.map((row, i) => {
                const followUpDisabled = row.status === "replied" || row.status === "converted";
                const showMarkReplied = row.status === "sent" || row.status === "opened" || row.status === "no_response";
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 0.8fr 1.4fr 0.9fr 0.9fr 0.9fr 1.8fr",
                      gap: 10,
                      padding: "14px 16px",
                      alignItems: "center",
                      borderTop: i === 0 ? "none" : "1px solid #F5F5F5",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <img src={row.avatar} alt="" width={32} height={32} style={{ borderRadius: "50%", flexShrink: 0 }} />
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button type="button" style={{ ...btnSecondary, fontSize: 11, padding: "6px 10px" }} onClick={() => setViewingMessage(row.message || "")}>
                        {lang === "fr" ? "Voir le message" : "View message"}
                      </button>
                      <button
                        type="button"
                        disabled={followUpDisabled}
                        onClick={async () => {
                          const res = await fetch("/api/generate-follow-up", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              creatorHandle: row.handle,
                              platform: row.platform,
                              originalMessage: row.message,
                              lang,
                            }),
                          });
                          const data = await res.json();
                          if (data.followUp || data.message) {
                            await navigator.clipboard.writeText(data.followUp || data.message);
                            alert(lang === "fr" ? "Message de relance copié ✓" : "Follow-up copied to clipboard ✓");
                            const { supabase } = await import("@/lib/supabase");
                            if (supabase) await supabase
                              .from("outreach_history")
                              .update({ follow_up_sent: true })
                              .eq("id", row.id);
                          }
                        }}
                        style={{ ...btnSecondary, fontSize: 11, padding: "6px 10px", opacity: followUpDisabled ? 0.4 : 1, cursor: followUpDisabled ? "not-allowed" : "pointer" }}
                      >
                        {lang === "fr" ? "Envoyer un suivi" : "Send follow up"}
                      </button>
                      {showMarkReplied && (
                        <button
                          type="button"
                          style={{ ...btnPrimary, fontSize: 11, padding: "6px 10px" }}
                          onClick={async () => {
                            const { supabase } = await import("@/lib/supabase");
                            if (supabase) await supabase
                              .from("outreach_history")
                              .update({ status: "replied" })
                              .eq("id", row.id);
                            window.location.reload();
                          }}
                        >
                          {lang === "fr" ? "Marquer comme répondu" : "Mark as replied"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {viewingMessage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setViewingMessage(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 500, width: "100%", position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{lang === "fr" ? "Message envoyé" : "Sent message"}</div>
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
