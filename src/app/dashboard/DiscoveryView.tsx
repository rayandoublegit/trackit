"use client";

import { useEffect, useState } from "react";
import { saveCreator, getSavedCreators, removeCreator } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type DiscoveryTab = "discover" | "saved";

type VideoThumbnail = {
  views: number;
  thumbnail: string | null;
};

type Creator = {
  username: string;
  displayName: string;
  avatarUrl: string;
  followersCount: number;
  engagementRate: number;
  avgViews: number;
  platform: string;
  bio: string;
  niche: string;
  videoThumbnails?: VideoThumbnail[];
};

type OutreachModalTab = "generate" | "templates" | "send";
type OutreachTone = "Casual" | "Professional" | "Friendly" | "Direct";
type OutreachPlatform = "TikTok DM" | "Instagram DM" | "Email";

type OutreachTemplate = {
  id: string;
  name: string;
  body: string;
  platform: OutreachPlatform;
};

type OutreachContact = {
  username: string;
  displayName: string;
  status: "Contacted";
};

const INITIAL_OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "tpl-casual",
    name: "Casual collab pitch",
    platform: "TikTok DM",
    body:
      "Hey! I've been following your content and love your vibe. We're looking for creators for a paid collab — no scripts, just your style. Open to chatting?",
  },
  {
    id: "tpl-pro",
    name: "Professional partnership",
    platform: "Email",
    body:
      "Dear creator,\n\nWe are reaching out regarding a potential brand partnership opportunity. We believe your audience aligns well with our brand values.",
  },
];

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
};

function buildGeneratedMessage(creator: Creator, brand: string, userName: string) {
  const brandLabel = brand.trim() || "our brand";
  const firstName = creator.displayName.split(" ")[0];
  return `Hey ${firstName} 👋 

I've been following your content and I love how authentic your ${creator.niche} posts are. Your engagement rate is seriously impressive.

I run ${brandLabel} and I think your audience would genuinely love what we do. We're looking for creators like you for a paid partnership — no scripts, just honest content in your style.

Would you be open to a quick chat? Happy to send over details and a free product to try first.

— ${userName}`;
}

function newTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const VIDEO_GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

function usernameSeed(username: string) {
  let hash = 0;
  for (let i = 0; i < (username?.length ?? 0); i++) hash += username?.charCodeAt(i) ?? 0;
  return hash;
}

function gradientForVideo(username: string, thumbIndex: number) {
  return VIDEO_GRADIENTS[(usernameSeed(username) + thumbIndex) % VIDEO_GRADIENTS.length];
}

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

const filterSelectStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  background: "#FFFFFF",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1A1A1A",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  width: "100%",
  boxSizing: "border-box",
};

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DiscoveryHeader({ lang }: { lang: "en" | "fr" }) {
  return (
    <div style={{ padding: "32px 40px 0 40px", background: "#FFFFFF" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>
        {lang === "fr" ? "Recherche" : "Discovery"}
      </h1>
      <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
        {lang === "fr" ? "Recherchez parmi 250M+ créateurs sur toutes les grandes plateformes" : "Search 250M+ creators across every major platform"}
      </p>
    </div>
  );
}

function DiscoveryTabs({
  lang,
  activeTab,
  savedCount,
  onTabChange,
}: {
  lang: "en" | "fr";
  activeTab: DiscoveryTab;
  savedCount: number;
  onTabChange: (tab: DiscoveryTab) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "20px 40px 0 40px",
        background: "#FFFFFF",
        borderBottom: "1px solid #EFEFEF",
      }}
    >
      {(
        [
          { id: "discover" as const, label: lang === "fr" ? "Découvrir" : "Discover" },
          { id: "saved" as const, label: lang === "fr" ? "Créateurs sauvegardés" : "Saved Creators", badge: savedCount },
        ] as const
      ).map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #0047FF" : "2px solid transparent",
              padding: "10px 4px 14px",
              marginRight: 20,
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              color: active ? "#1A1A1A" : "#7A7A7A",
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {tab.label}
            {"badge" in tab && tab.badge > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: active ? "#0047FF" : "#7A7A7A",
                  background: active ? "rgba(0,71,255,0.1)" : "#F0F0F0",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SaveToast({ message }: { message: string }) {
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
        letterSpacing: "-0.02em",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 1100,
        fontFamily: "inherit",
      }}
    >
      {message}
    </div>
  );
}

function getVideoThumbnails(creator: Creator) {
  return (
    creator.videoThumbnails ?? [
      { views: Math.floor(creator.avgViews * 0.8), thumbnail: null },
      { views: Math.floor(creator.avgViews * 1.2), thumbnail: null },
      { views: Math.floor(creator.avgViews * 0.9), thumbnail: null },
    ]
  );
}

function VideoPreviews({ creator, size }: { creator: Creator; size: "card" | "modal" }) {
  const videoThumbnails = getVideoThumbnails(creator);
  const isModal = size === "modal";

  return (
    <div style={{ display: "flex", gap: isModal ? 10 : 6 }}>
      {videoThumbnails.map((video, i) => (
        <div
          key={i}
          style={{
            flex: isModal ? 1 : "0 0 30%",
            aspectRatio: "9 / 16",
            maxHeight: isModal ? 220 : undefined,
            borderRadius: isModal ? 10 : 8,
            overflow: "hidden",
            position: "relative",
            background: video.thumbnail
              ? `url(${video.thumbnail}) center / cover no-repeat`
              : gradientForVideo(creator.username ?? "", i),
          }}
        >
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                width: isModal ? 40 : 28,
                height: isModal ? 40 : 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={isModal ? 16 : 12} height={isModal ? 16 : 12} viewBox="0 0 24 24" fill="none">
                <path d="M8 5v14l11-7L8 5z" fill="#FFFFFF" />
              </svg>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: isModal ? "8px 8px 7px" : "6px 6px 5px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
              fontSize: isModal ? 11 : 10,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
            }}
          >
            {formatCount(video.views)} views
          </div>
        </div>
      ))}
    </div>
  );
}

type ParsedAnalysis = {
  fitScore: number | null;
  fitReason: string;
  audienceMatch: string;
  risk: string;
  recommendation: "BUILD IT" | "APPROACH WITH CAUTION" | "SKIP IT" | null;
  recommendationReason: string;
};

function parseAnalysis(raw: string): ParsedAnalysis {
  const fit = raw.match(/FIT SCORE:\s*(\d+)\s*\/?\s*10?\s*[—–-]?\s*([^\n]+)/i);
  const audience = raw.match(/AUDIENCE MATCH:\s*([^\n]+)/i);
  const risk = raw.match(/RISK:\s*([^\n]+)/i);
  const rec = raw.match(/RECOMMENDATION:\s*(BUILD IT|APPROACH WITH CAUTION|SKIP IT)\s*[—–-]?\s*([^\n]+)/i);
  return {
    fitScore: fit ? parseInt(fit[1], 10) : null,
    fitReason: fit?.[2]?.trim() ?? "",
    audienceMatch: audience?.[1]?.trim() ?? "",
    risk: risk?.[1]?.trim() ?? "",
    recommendation: rec ? (rec[1].toUpperCase() as ParsedAnalysis["recommendation"]) : null,
    recommendationReason: rec?.[2]?.trim() ?? "",
  };
}

function fitScoreColor(score: number) {
  if (score >= 8) return "#1FB567";
  if (score >= 5) return "#B45309";
  return "#DC2626";
}

function recommendationBadgeStyle(rec: NonNullable<ParsedAnalysis["recommendation"]>) {
  if (rec === "BUILD IT") return { bg: "rgba(31,181,103,0.12)", fg: "#1FB567" };
  if (rec === "APPROACH WITH CAUTION") return { bg: "rgba(234,179,8,0.15)", fg: "#B45309" };
  return { bg: "rgba(220,38,38,0.1)", fg: "#DC2626" };
}

function CreatorProfileModal({
  creator,
  onClose,
  onGenerateOutreach,
}: {
  creator: Creator;
  onClose: () => void;
  onGenerateOutreach: () => void;
}) {
  const [brand, setBrand] = useState("");
  const [showBrandInput, setShowBrandInput] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisRaw, setAnalysisRaw] = useState<string | null>(null);

  const parsed = analysisRaw ? parseAnalysis(analysisRaw) : null;

  const handleAnalyze = async () => {
    if (!brand.trim()) {
      setShowBrandInput(true);
      return;
    }
    setAnalyzing(true);
    setAnalysisRaw(null);
    try {
      const res = await fetch("/api/analyze-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator, brand: brand.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Analysis failed");
      setAnalysisRaw(data.analysis);
    } catch {
      setAnalysisRaw(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const totalLikes = creator.followersCount * 8;
  const nicheTags = creator.niche
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 32,
          maxWidth: 600,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, paddingRight: 32 }}>
          <img
            src={creator.avatarUrl}
            alt={creator.displayName}
            width={80}
            height={80}
            style={{ borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 4px 0" }}>
              {creator.displayName}
            </h2>
            <div style={{ fontSize: 15, color: "#0047FF", letterSpacing: "-0.02em", marginBottom: 8 }}>@{creator.username ?? ""}</div>
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 500,
                color: "#1A1A1A",
                background: "#F0F0F0",
                padding: "4px 10px",
                borderRadius: 999,
                textTransform: "capitalize",
                letterSpacing: "-0.01em",
              }}
            >
              {creator.platform}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 14, color: "#5A5A5A", lineHeight: 1.55, margin: "0 0 20px 0" }}>{creator.bio}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Followers", value: formatCount(creator.followersCount) },
            { label: "Engagement Rate", value: `${creator.engagementRate}%` },
            { label: "Avg Views", value: formatCount(creator.avgViews) },
            { label: "Total Likes", value: formatCount(totalLikes) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#FAFAFA", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 20, padding: 20, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            AI Analysis
          </div>
          {showBrandInput && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>What do you sell?</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Your product or brand"
                style={{ ...inputStyle, marginBottom: 0 }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={analyzing}
            style={{ ...btnSecondary, width: "100%", opacity: analyzing ? 0.7 : 1 }}
          >
            Analyze fit for my brand →
          </button>
          {analyzing && (
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: "12px 0 0", textAlign: "center" }}>Analyzing creator fit...</p>
          )}
          {parsed && !analyzing && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {parsed.fitScore !== null && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: fitScoreColor(parsed.fitScore), lineHeight: 1, flexShrink: 0 }}>
                    {parsed.fitScore}
                    <span style={{ fontSize: 16, fontWeight: 500, color: "#9A9A9A" }}>/10</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginBottom: 4, letterSpacing: "0.04em" }}>FIT SCORE</div>
                    {parsed.fitReason && <p style={{ fontSize: 13, color: "#4A4A4A", margin: 0, lineHeight: 1.45 }}>{parsed.fitReason}</p>}
                  </div>
                </div>
              )}
              {parsed.recommendation && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginBottom: 6, letterSpacing: "0.04em" }}>RECOMMENDATION</div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "5px 12px",
                      borderRadius: 999,
                      background: recommendationBadgeStyle(parsed.recommendation).bg,
                      color: recommendationBadgeStyle(parsed.recommendation).fg,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {parsed.recommendation}
                  </span>
                  {parsed.recommendationReason && (
                    <p style={{ fontSize: 13, color: "#4A4A4A", margin: "8px 0 0", lineHeight: 1.45 }}>{parsed.recommendationReason}</p>
                  )}
                </div>
              )}
              {parsed.audienceMatch && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginBottom: 4, letterSpacing: "0.04em" }}>AUDIENCE MATCH</div>
                  <p style={{ fontSize: 13, color: "#4A4A4A", margin: 0, lineHeight: 1.45 }}>{parsed.audienceMatch}</p>
                </div>
              )}
              {parsed.risk && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginBottom: 4, letterSpacing: "0.04em" }}>RISK</div>
                  <p style={{ fontSize: 13, color: "#4A4A4A", margin: 0, lineHeight: 1.45 }}>{parsed.risk}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {(nicheTags.length > 0 ? nicheTags : [creator.niche]).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                color: "#5A5A5A",
                background: "#F0F0F0",
                padding: "5px 10px",
                borderRadius: 999,
                letterSpacing: "-0.01em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Video previews
          </div>
          <VideoPreviews creator={creator} size="modal" />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            style={{ ...btnSecondary, flex: 1 }}
            onClick={() => window.open(`https://tiktok.com/@${creator.username ?? ""}`, "_blank", "noopener,noreferrer")}
          >
            View on TikTok →
          </button>
          <button type="button" style={{ ...btnBlack, flex: 1 }} onClick={onGenerateOutreach}>
            Generate outreach →
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorMiniCard({ creator }: { creator: Creator }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: "#FAFAFA",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        marginBottom: 20,
      }}
    >
      <img src={creator.avatarUrl} alt={creator.displayName} width={40} height={40} style={{ borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{creator.displayName}</div>
        <div style={{ fontSize: 12, color: "#0047FF" }}>@{creator.username ?? ""}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#1A1A1A",
          background: "#F0F0F0",
          padding: "4px 10px",
          borderRadius: 999,
          textTransform: "capitalize",
          flexShrink: 0,
        }}
      >
        {creator.platform}
      </span>
    </div>
  );
}

function OutreachModal({
  creator,
  onClose,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onMarkSent,
  userName,
}: {
  creator: Creator;
  onClose: () => void;
  templates: OutreachTemplate[];
  onSaveTemplate: (t: OutreachTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onMarkSent: () => void;
  userName: string;
}) {
  const [tab, setTab] = useState<OutreachModalTab>("generate");
  const [product, setProduct] = useState("");
  const [tone, setTone] = useState<OutreachTone>("Casual");
  const [platform, setPlatform] = useState<OutreachPlatform>("TikTok DM");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [creatorEmail, setCreatorEmail] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setMessage("");
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator,
          brand: product,
          tone: tone.toLowerCase(),
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Generation failed");
      setMessage(data.message);
    } catch {
      setGenerateError("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      /* ignore */
    }
  };

  const handleSaveAsTemplate = () => {
    if (!message.trim()) return;
    onSaveTemplate({
      id: newTemplateId(),
      name: `Outreach — ${creator.displayName}`,
      body: message,
      platform,
    });
    setTab("templates");
  };

  const tones: OutreachTone[] = ["Casual", "Professional", "Friendly", "Direct"];
  const platforms: OutreachPlatform[] = ["TikTok DM", "Instagram DM", "Email"];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 32,
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #EFEFEF", marginBottom: 24, paddingRight: 40 }}>
          {(
            [
              { id: "generate" as const, label: "Generate" },
              { id: "templates" as const, label: "Templates" },
              { id: "send" as const, label: "Send" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: tab === t.id ? "2px solid #0047FF" : "2px solid transparent",
                padding: "8px 12px 12px",
                fontSize: 14,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "#1A1A1A" : "#7A7A7A",
                fontFamily: "inherit",
                cursor: "pointer",
                letterSpacing: "-0.02em",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "generate" && (
          <>
            <CreatorMiniCard creator={creator} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 16, letterSpacing: "-0.02em" }}>
              Generate with Trackit AI
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>What are you selling?</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Your product or brand"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>Tone</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {tones.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  style={{
                    ...btnSecondary,
                    padding: "8px 14px",
                    fontSize: 12,
                    background: tone === t ? "#1A1A1A" : "#FFFFFF",
                    color: tone === t ? "#FFFFFF" : "#1A1A1A",
                    borderColor: tone === t ? "#1A1A1A" : "#E5E5E5",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>Platform</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  style={{
                    ...btnSecondary,
                    padding: "8px 14px",
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
            <button type="button" onClick={handleGenerate} disabled={generating} style={{ ...btnBlack, width: "100%", marginBottom: 20, opacity: generating ? 0.7 : 1 }}>
              Generate outreach →
            </button>
            {generating && (
              <p style={{ fontSize: 14, color: "#7A7A7A", textAlign: "center", margin: "0 0 16px" }}>Generating personalized message...</p>
            )}
            {generateError && !generating && (
              <p style={{ fontSize: 14, color: "#DC2626", textAlign: "center", margin: "0 0 16px" }}>{generateError}</p>
            )}
            {message && !generating && (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={12}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9A9A9A" }}>{message.length} characters</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => void handleCopy()} style={{ ...btnSecondary, fontSize: 12, padding: "8px 14px" }}>
                      Copy message
                    </button>
                    <button type="button" onClick={handleSaveAsTemplate} style={{ ...btnSecondary, fontSize: 12, padding: "8px 14px" }}>
                      Save as template
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === "templates" && (
          <>
            {templates.length === 0 ? (
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>No templates yet. Generate a message and save it as a template.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {templates.map((tpl) => (
                  <div key={tpl.id} style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16, background: "#FAFAFA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>{tpl.name}</div>
                        <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, lineHeight: 1.45 }}>
                          {tpl.body.slice(0, 80)}
                          {tpl.body.length > 80 ? "…" : ""}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 500, background: "#F0F0F0", padding: "4px 8px", borderRadius: 999, flexShrink: 0 }}>
                        {tpl.platform}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        type="button"
                        style={{ ...btnPrimary, fontSize: 12, padding: "8px 14px" }}
                        onClick={() => {
                          setMessage(tpl.body);
                          setPlatform(tpl.platform);
                          setTab("generate");
                        }}
                      >
                        Use this template
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(tpl.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#DC2626",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "send" && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.03em" }}>How to send your message</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px", lineHeight: 1.5 }}>
              Direct sending requires creator login. For now copy your message and send manually.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>🎵</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send on TikTok</div>
                </div>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px" }}>Open TikTok DMs → copy your message and paste it</p>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12 }}
                  onClick={() => window.open("https://tiktok.com/messages", "_blank", "noopener,noreferrer")}
                >
                  Open TikTok →
                </button>
              </div>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>📷</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send on Instagram</div>
                </div>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px" }}>Open Instagram DMs → copy your message and paste it</p>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12 }}
                  onClick={() => window.open("https://instagram.com/direct/inbox", "_blank", "noopener,noreferrer")}
                >
                  Open Instagram →
                </button>
              </div>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>✉️</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send via Email</div>
                </div>
                <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Creator email address</label>
                <input
                  type="email"
                  value={creatorEmail}
                  onChange={(e) => setCreatorEmail(e.target.value)}
                  placeholder="creator@email.com"
                  style={{ ...inputStyle, marginBottom: 12 }}
                />
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  style={{ ...btnSecondary, fontSize: 12, opacity: 0.45, cursor: "not-allowed" }}
                >
                  Send email →
                </button>
              </div>
            </div>
            <button type="button" onClick={onMarkSent} style={{ ...btnPrimary, width: "100%" }}>
              Mark as sent
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={filterSelectStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CreatorCardBody({ creator }: { creator: Creator }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <img
          src={creator.avatarUrl}
          alt={creator.displayName}
          width={48}
          height={48}
          style={{ borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{creator.displayName}</div>
          <div style={{ fontSize: 13, color: "#0047FF", letterSpacing: "-0.01em" }}>@{creator.username ?? ""}</div>
          <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 4, textTransform: "capitalize" }}>{creator.platform}</div>
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "#5A5A5A",
          lineHeight: 1.5,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {creator.bio}
      </p>

      <VideoPreviews creator={creator} size="card" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <div style={{ background: "#FAFAFA", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{formatCount(creator.followersCount)}</div>
          <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>Followers</div>
        </div>
        <div style={{ background: "#FAFAFA", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{creator.engagementRate}%</div>
          <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>Engagement</div>
        </div>
        <div style={{ background: "#FAFAFA", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{formatCount(creator.avgViews)}</div>
          <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>Avg views</div>
        </div>
      </div>
    </>
  );
}

function CreatorCard({
  creator,
  variant,
  isSaved,
  onToggleSave,
  onViewProfile,
  onGenerateOutreach,
  onRemove,
}: {
  creator: Creator;
  variant: "discover" | "saved";
  isSaved?: boolean;
  onToggleSave?: () => void;
  onViewProfile: () => void;
  onGenerateOutreach?: () => void;
  onRemove?: () => void;
}) {
  const cardStyle: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid #EFEFEF",
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  if (variant === "saved") {
    return (
      <div style={cardStyle}>
        <CreatorCardBody creator={creator} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onViewProfile} style={{ ...btnSecondary, flex: 1, fontSize: 12, padding: "8px 12px" }}>
              View profile
            </button>
            <button type="button" onClick={onGenerateOutreach} style={{ ...btnBlack, flex: 1, fontSize: 12, padding: "8px 12px" }}>
              Generate outreach →
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              color: "#DC2626",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: "4px 0",
              letterSpacing: "-0.01em",
            }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <CreatorCardBody creator={creator} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onViewProfile} style={{ ...btnSecondary, flex: 1, fontSize: 12, padding: "8px 12px" }}>
          View profile
        </button>
        <button
          type="button"
          onClick={onToggleSave}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "8px 12px",
            border: "none",
            borderRadius: 10,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            letterSpacing: "-0.02em",
            background: isSaved ? "#E5E5E5" : "#0047FF",
            color: isSaved ? "#5A5A5A" : "#FFFFFF",
          }}
        >
          {isSaved ? "Saved ✓" : "Save creator"}
        </button>
      </div>
    </div>
  );
}

type PlanTier = "free" | "basic" | "pro";

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDiscoverySearchCountToday(): number {
  const storedDate = localStorage.getItem("trackit_searches_date");
  if (storedDate !== todayDateKey()) return 0;
  return parseInt(localStorage.getItem("trackit_searches_today") || "0", 10);
}

function incrementDiscoverySearchCount() {
  const today = todayDateKey();
  const storedDate = localStorage.getItem("trackit_searches_date");
  if (storedDate !== today) {
    localStorage.setItem("trackit_searches_date", today);
    localStorage.setItem("trackit_searches_today", "1");
    return;
  }
  const count = getDiscoverySearchCountToday() + 1;
  localStorage.setItem("trackit_searches_today", String(count));
}

export function DiscoveryView({
  plan,
  onUpgrade,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
}) {
  const lang = useLang();
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("discover");
  const [query, setQuery] = useState("");
  const [niche, setNiche] = useState("fitness");
  const [platform, setPlatform] = useState("tiktok");
  const [followers, setFollowers] = useState("10-20k");
  const [engagement, setEngagement] = useState("3+");
  const [location, setLocation] = useState("US");
  const [language, setLanguage] = useState("english");

  const [creators, setCreators] = useState<Creator[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCreators, setSavedCreators] = useState<Creator[]>([]);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [outreachCreator, setOutreachCreator] = useState<Creator | null>(null);
  const [outreachTemplates, setOutreachTemplates] = useState<OutreachTemplate[]>(INITIAL_OUTREACH_TEMPLATES);
  const [outreachContacted, setOutreachContacted] = useState<OutreachContact[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const openOutreach = (creator: Creator) => {
    setSelectedCreator(null);
    setOutreachCreator(creator);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const loadSaved = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const saved = await getSavedCreators(user.id);
      setSavedCreators(saved.map(c => ({
        username: c.username  ?? "",
        displayName: c.display_name,
        avatarUrl: c.avatar_url,
        platform: c.platform,
        followersCount: c.followers_count,
        engagementRate: c.engagement_rate,
        avgViews: c.avg_views,
        bio: c.bio,
        niche: c.niche
      })));
    };
    void loadSaved();
  }, []);

  const isCreatorSaved = (username: string) => savedCreators.some((c) => (c.username  ?? "") === username);

  const handleSaveCreator = async (creator: Creator) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await saveCreator(user.id, {
      username: creator.username ?? "",
      display_name: creator.displayName,
      avatar_url: creator.avatarUrl,
      platform: creator.platform,
      followers_count: creator.followersCount,
      engagement_rate: creator.engagementRate,
      avg_views: creator.avgViews,
      bio: creator.bio,
      niche: creator.niche || ""
    });
    setSavedCreators(prev => [...prev.filter(c => (c.username  ?? "") !== (creator.username ?? "")), creator]);
    setToast("Creator saved ✓");
  };

  const handleRemoveCreator = async (username: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await removeCreator(user.id, username);
    setSavedCreators(prev => prev.filter(c => (c.username  ?? "") !== username));
  };

  const toggleSaveCreator = (creator: Creator) => {
    if (isCreatorSaved(creator.username ?? "")) {
      void handleRemoveCreator(creator.username ?? "");
    } else {
      void handleSaveCreator(creator);
    }
  };

  const search = async () => {
    if (plan === "free" && getDiscoverySearchCountToday() >= 5) {
      setUpgradeModalOpen(true);
      return;
    }

    const nicheTerm = query.trim() || niche;
    setLoading(true);
    setError(null);
    setHasSearched(true);

    if (plan === "free") {
      incrementDiscoverySearchCount();
    }

    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: nicheTerm, platform }),
      });

      if (!res.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = (await res.json()) as { creators: Creator[] };
      setCreators(data.creators ?? []);
    } catch (e) {
      setCreators([]);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const creatorsGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 16,
  };

  return (
    <>
      <DiscoveryHeader lang={lang} />
      <DiscoveryTabs lang={lang} activeTab={activeTab} savedCount={savedCreators.length} onTabChange={setActiveTab} />
      <div style={{ padding: 40 }}>
        {activeTab === "discover" && (
          <>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#FAFAFA",
              border: "1px solid #EFEFEF",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 14,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder={lang === "fr" ? "Rechercher des créateurs" : "Search creators"}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 14,
                fontFamily: "inherit",
                flex: 1,
                color: "#1A1A1A",
                letterSpacing: "-0.02em",
              }}
            />
            <button
              type="button"
              onClick={() => void search()}
              disabled={loading}
              style={{
                background: "#0047FF",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: loading ? "wait" : "pointer",
                letterSpacing: "-0.02em",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Searching..." : lang === "fr" ? "Rechercher des créateurs" : "Search creators"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            <FilterSelect
              label={lang === "fr" ? "Niche" : "Niche"}
              value={niche}
              onChange={setNiche}
              options={[
                { value: "fitness", label: lang === "fr" ? "Fitness" : "Fitness" },
                { value: "fashion", label: lang === "fr" ? "Mode" : "Fashion" },
                { value: "beauty", label: lang === "fr" ? "Beauté" : "Beauty" },
                { value: "tech", label: lang === "fr" ? "Tech" : "Tech" },
                { value: "food", label: lang === "fr" ? "Cuisine" : "Food" },
                { value: "travel", label: lang === "fr" ? "Voyage" : "Travel" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Plateforme" : "Platform"}
              value={platform}
              onChange={setPlatform}
              options={[
                { value: "tiktok", label: "TikTok" },
                { value: "instagram", label: "Instagram" },
                { value: "youtube", label: "YouTube" },
                { value: "twitter", label: "Twitter" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Abonnés" : "Followers"}
              value={followers}
              onChange={setFollowers}
              options={[
                { value: "1-10k", label: "1–10K" },
                { value: "10-20k", label: "10–20K" },
                { value: "20-50k", label: "20–50K" },
                { value: "50-100k", label: "50–100K" },
                { value: "100k+", label: "100K+" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Engagement" : "Engagement"}
              value={engagement}
              onChange={setEngagement}
              options={[
                { value: "1+", label: "1%+" },
                { value: "3+", label: "3%+" },
                { value: "5+", label: "5%+" },
                { value: "7+", label: "7%+" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Localisation" : "Location"}
              value={location}
              onChange={setLocation}
              options={[
                { value: "US", label: lang === "fr" ? "États-Unis" : "United States" },
                { value: "UK", label: lang === "fr" ? "Royaume-Uni" : "United Kingdom" },
                { value: "FR", label: lang === "fr" ? "France" : "France" },
                { value: "DE", label: lang === "fr" ? "Allemagne" : "Germany" },
                { value: "CA", label: lang === "fr" ? "Canada" : "Canada" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Langue" : "Language"}
              value={language}
              onChange={setLanguage}
              options={[
                { value: "english", label: lang === "fr" ? "Anglais" : "English" },
                { value: "french", label: lang === "fr" ? "Français" : "French" },
                { value: "spanish", label: lang === "fr" ? "Espagnol" : "Spanish" },
                { value: "german", label: lang === "fr" ? "Allemand" : "German" },
              ]}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 60, textAlign: "center" }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid #EFEFEF",
                borderTopColor: "#0047FF",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "discovery-spin 0.8s linear infinite",
              }}
            />
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>Searching creators...</p>
            <style>{`@keyframes discovery-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && !hasSearched && (
          <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#F5F5F5",
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="1.8" />
                <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>
              {lang === "fr" ? "Aucune recherche" : "No search yet"}
            </h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {lang === "fr" ? "Entrez votre niche ci-dessus pour trouver des créateurs" : "Enter your niche above to find creators"}
            </p>
          </div>
        )}

        {!loading && hasSearched && creators.length === 0 && !error && (
          <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>No creators found</h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>Try a different niche or platform filter.</p>
          </div>
        )}

        {!loading && creators.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0, letterSpacing: "-0.02em" }}>
                {creators.length} creator{creators.length === 1 ? "" : "s"} found
              </p>
            </div>
            <div style={creatorsGridStyle}>
              {creators.map((c) => (
                <CreatorCard
                  key={c.username  ?? ""}
                  variant="discover"
                  creator={c}
                  isSaved={isCreatorSaved(c.username  ?? "")}
                  onToggleSave={() => toggleSaveCreator(c)}
                  onViewProfile={() => setSelectedCreator(c)}
                />
              ))}
            </div>
          </>
        )}
          </>
        )}

        {activeTab === "saved" && (
          <>
            {savedCreators.length === 0 ? (
              <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔖</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>
                  {lang === "fr" ? "Aucun créateur sauvegardé" : "No saved creators yet"}
                </h3>
                <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
                  {lang === "fr" ? "Recherchez des créateurs et sauvegardez ceux avec qui vous souhaitez collaborer." : "Search for creators and save the ones you want to work with."}
                </p>
              </div>
            ) : (
              <div style={creatorsGridStyle}>
                {savedCreators.map((c) => (
                  <CreatorCard
                    key={c.username ?? Math.random().toString()}
                    variant="saved"
                    creator={c}
                    onViewProfile={() => setSelectedCreator(c)}
                    onGenerateOutreach={() => openOutreach(c)}
                    onRemove={() => void handleRemoveCreator(c.username  ?? "")}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedCreator && (
        <CreatorProfileModal
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onGenerateOutreach={() => openOutreach(selectedCreator)}
        />
      )}
      {outreachCreator && (
        <OutreachModal
          creator={outreachCreator}
          onClose={() => setOutreachCreator(null)}
          templates={outreachTemplates}
          onSaveTemplate={(t) => setOutreachTemplates((list) => [...list, t])}
          onDeleteTemplate={(id) => setOutreachTemplates((list) => list.filter((t) => t.id !== id))}
          onMarkSent={() => {
            setOutreachContacted((list) => {
              if (list.some((c) => c.username === (outreachCreator.username))) return list;
              return [
                ...list,
                { username: outreachCreator.username, displayName: outreachCreator.displayName, status: "Contacted" },
              ];
            });
            setToast("Outreach marked as sent ✓");
            setOutreachCreator(null);
          }}
          userName="You"
        />
      )}
      {upgradeModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: 24,
          }}
          onClick={() => setUpgradeModalOpen(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 32,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 12px", letterSpacing: "-0.03em" }}>
              You&apos;ve used your 5 free searches
            </h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              Upgrade to Basic for unlimited creator discovery.
            </p>
            <button
              type="button"
              onClick={() => void onUpgrade()}
              style={{
                background: "#0047FF",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 10,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                width: "100%",
                letterSpacing: "-0.02em",
              }}
            >
              Upgrade to Basic $49/mo →
            </button>
          </div>
        </div>
      )}
      {toast && <SaveToast message={toast} />}
    </>
  );
}
