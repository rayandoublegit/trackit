"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDiscountCode } from "@/lib/generate-discount-code";
import { deleteCreatorById, getSavedCreators, getCampaigns, saveCreator, syncCampaignCreators } from "@/lib/db";
import { CreatorAvatar } from "./CreatorAvatar";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  BASIC_MAX_MANAGED_CREATORS,
  PRO_MAX_MANAGED_CREATORS,
  canBulkImportCreatorsCsv,
  getMaxManagedCreators,
  hasReachedManagedCreatorLimit,
  type PlanTier,
} from "@/lib/plan-limits";
import { UpgradeModal } from "./UpgradeModal";
import { SplitHeaderActions } from "./SplitHeaderActions";
import { CreatorPayoutMethodFields } from "./CreatorPayoutMethodFields";
import {
  mergeCreatorProfileExtras,
  saveCreatorProfileExtras,
} from "@/lib/creator-profile-extras-storage";

type CreatorStatus = "active" | "pending" | "contacted" | "declined";
type CreatorsTab = "all" | "active" | "pending";
type SortKey = "followers" | "engagement" | "addedDate";

type ManagedCreator = {
  id: string;
  username: string;
  displayName: string;
  platform: string;
  followers: number;
  engagement: number;
  niche: string;
  status: CreatorStatus;
  addedDate: string;
  age: number;
  email: string;
  location: string;
  notes: string;
  avatarUrl?: string;
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
  campaignIds: string[];
};


function mapDbCreator(c: Record<string, unknown>): ManagedCreator {
  return {
    id: String(c.id ?? ""),
    username: String(c.handle ?? c.username ?? ""),
    displayName: String(c.full_name ?? c.handle ?? ""),
    platform: String(c.platform ?? ""),
    followers: Number(c.followers ?? 0),
    engagement: Number(c.engagement_rate ?? 0),
    niche: String(c.niche ?? ""),
    status: c.needs_review === false ? "active" : "pending",
    addedDate: typeof c.created_at === "string" ? c.created_at.split("T")[0] : "",
    age: Number(c.age ?? 0) || 0,
    email: typeof c.email === "string" ? c.email : "",
    location: typeof c.location === "string" ? c.location : "",
    notes:
      typeof c.notes === "string"
        ? c.notes
        : typeof c.note === "string"
          ? c.note
          : "",
    avatarUrl: typeof c.avatar_url === "string" ? c.avatar_url : undefined,
    paypal_link: typeof c.paypal_link === "string" ? c.paypal_link : undefined,
    revolut_link: typeof c.revolut_link === "string" ? c.revolut_link : undefined,
    iban: typeof c.iban === "string" ? c.iban : undefined,
    campaignIds: [],
  };
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

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function statusLabel(status: CreatorStatus, lang: "en" | "fr"): string {
  const labels: Record<CreatorStatus, { en: string; fr: string }> = {
    active: { en: "Active", fr: "Actif" },
    pending: { en: "Pending", fr: "En attente" },
    contacted: { en: "Contacted", fr: "Contacté" },
    declined: { en: "Declined", fr: "Refusé" },
  };
  return lang === "fr" ? labels[status].fr : labels[status].en;
}

function statusBadgeStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    color: "#1A1A1A",
    textTransform: "capitalize",
    letterSpacing: "-0.01em",
  };
}

function discountCodeFor(username: string) {
  const base = username.replace(/^@/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "CREATOR";
  return `${base}15`;
}

function referralSlug(username: string) {
  const base = username.toLowerCase().replace(/[^a-z0-9]/g, "") || "creator";
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
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

function ModalShell({
  children,
  onClose,
  maxWidth = 560,
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
}) {
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
          maxWidth,
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
        {children}
      </div>
    </div>
  );
}

function ImportCsvModal({ lang, onClose }: { lang: "en" | "fr"; onClose: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px", paddingRight: 40 }}>{lang === "fr" ? "Importer un CSV" : "Import CSV"}</h2>
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>Bulk import creators from a spreadsheet.</p>
      <div
        style={{
          border: "2px dashed #E5E5E5",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          marginBottom: 16,
          background: "#FAFAFA",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) setFileName(f.name);
        }}
      >
        <p style={{ fontSize: 14, color: "#1A1A1A", margin: "0 0 8px" }}>Drag and drop your CSV here</p>
        <label style={{ fontSize: 13, color: "#0047FF", cursor: "pointer" }}>
          or browse files
          <input
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        {fileName && <p style={{ fontSize: 12, color: "#7A7A7A", marginTop: 12 }}>{fileName}</p>}
      </div>
      <button type="button" style={{ ...btnSecondary, width: "100%", marginBottom: 16 }} onClick={() => {}}>
        Download CSV template
      </button>
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 8px" }}>Required columns:</p>
      <p style={{ fontSize: 12, color: "#7A7A7A", margin: "0 0 16px" }}>name, username, platform, followers, engagement, niche, email</p>
      <p style={{ fontSize: 12, color: "#B45309", margin: "0 0 16px", background: "#FFFBEB", padding: 12, borderRadius: 8 }}>
        Coming soon — CSV import will be available in the next update
      </p>
      <button type="button" disabled style={{ ...btnSecondary, width: "100%", opacity: 0.45, cursor: "not-allowed" }}>
        Import
      </button>
    </ModalShell>
  );
}

function AddCreatorModal({
  lang,
  onClose,
  onAdd,
}: {
  lang: "en" | "fr";
  onClose: () => void;
  onAdd: (c: ManagedCreator) => void;
}) {
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [niche, setNiche] = useState("");
  const [followers, setFollowers] = useState("");
  const [engagement, setEngagement] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<CreatorStatus>("pending");
  const [notes, setNotes] = useState("");

  const canSubmit = fullName.trim() && username.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    const handle = username.trim().replace(/^@/, "");
    onAdd({
      id: `new_${Date.now()}`,
      username: handle,
      displayName: fullName.trim(),
      platform,
      followers: parseInt(followers, 10) || 0,
      engagement: parseFloat(engagement) || 0,
      niche: niche.trim() || "General",
      status,
      addedDate: new Date().toISOString().slice(0, 10),
      age: parseInt(age, 10) || 0,
      email: email.trim(),
      location: location.trim(),
      notes: notes.trim(),
      avatarUrl: avatarPreview ?? undefined,
      campaignIds: [],
    });
  };

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", paddingRight: 40 }}>{lang === "fr" ? "Ajouter un créateur" : "Add Creator"}</h2>
      <label style={{ display: "block", marginBottom: 16, cursor: "pointer", width: "fit-content" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "#F0F0F0",
            border: "2px dashed #E5E5E5",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#9A9A9A",
          }}
        >
          {avatarPreview ? (
            <img src={avatarPreview} alt="" width={72} height={72} style={{ objectFit: "cover" }} />
          ) : (
            lang === "fr" ? "Importer" : "Upload"
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setAvatarPreview(URL.createObjectURL(f));
          }}
        />
      </label>
      <Field label={lang === "fr" ? "Nom complet *" : "Full name *"}>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Nom d'utilisateur / pseudo *" : "Username / handle *"}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@creator" style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Plateforme" : "Platform"}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle}>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>
      </Field>
      <Field label={lang === "fr" ? "Niche" : "Niche"}>
        <input value={niche} onChange={(e) => setNiche(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={lang === "fr" ? "Abonnés" : "Followers"}>
          <input type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={lang === "fr" ? "Engagement (%)" : "Engagement (%)"}>
          <input type="number" step="0.1" value={engagement} onChange={(e) => setEngagement(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={lang === "fr" ? "Âge" : "Age"}>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={lang === "fr" ? "Statut" : "Status"}>
          <select value={status} onChange={(e) => setStatus(e.target.value as CreatorStatus)} style={inputStyle}>
            <option value="active">{statusLabel("active", lang)}</option>
            <option value="pending">{statusLabel("pending", lang)}</option>
            <option value="contacted">{statusLabel("contacted", lang)}</option>
            <option value="declined">{statusLabel("declined", lang)}</option>
          </select>
        </Field>
      </div>
      <Field label={lang === "fr" ? "E-mail" : "Email"}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Localisation" : "Location"}>
        <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Notes" : "Notes"}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button type="button" onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>
          {lang === "fr" ? "Annuler" : "Cancel"}
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit} style={{ ...btnBlack, flex: 1, opacity: canSubmit ? 1 : 0.45 }}>
          {lang === "fr" ? "Ajouter un créateur →" : "Add Creator →"}
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function CreatorOutreachModal({ creator, onClose }: { creator: ManagedCreator; onClose: () => void }) {
  const [product, setProduct] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);

  const generate = () => {
    setGenerating(true);
    setTimeout(() => {
      const first = creator.displayName.split(" ")[0];
      setMessage(
        `Hey ${first} 👋\n\nI've been following your content and I love how authentic your ${creator.niche} posts are. Your engagement rate is seriously impressive.\n\nI run ${product.trim() || "our brand"} and I think your audience would genuinely love what we do. We're looking for creators like you for a paid partnership — no scripts, just honest content in your style.\n\nWould you be open to a quick chat?\n\n— You`
      );
      setGenerating(false);
    }, 1500);
  };

  return (
    <ModalShell onClose={onClose} maxWidth={640}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px", paddingRight: 40 }}>Generate outreach</h2>
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>
        To @{creator.username} · {creator.platform}
      </p>
      <Field label="What are you selling?">
        <input value={product} onChange={(e) => setProduct(e.target.value)} style={inputStyle} />
      </Field>
      <button type="button" onClick={generate} disabled={generating} style={{ ...btnBlack, width: "100%", marginBottom: 16 }}>
        Generate outreach →
      </button>
      {generating && <p style={{ textAlign: "center", color: "#7A7A7A", fontSize: 14 }}>Generating personalized message...</p>}
      {message && !generating && (
        <>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={10} style={{ ...inputStyle, lineHeight: 1.55, marginBottom: 12 }} />
          <button type="button" style={btnSecondary} onClick={() => void navigator.clipboard.writeText(message)}>
            Copy message
          </button>
        </>
      )}
    </ModalShell>
  );
}

function CreatorProfileStatIcon({ kind }: { kind: "followers" | "engagement" | "views" | "niche" | "location" | "age" }) {
  const stroke = "#9A9A9A";
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true as const };
  switch (kind) {
    case "followers":
      return (
        <svg {...common}>
          <path d="M16 11a4 4 0 10-8 0M12 13v8M8 21h8" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "engagement":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.5-7-10a4 4 0 017-3 4 4 0 017 3c0 5.5-7 10-7 10z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "views":
      return (
        <svg {...common}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke={stroke} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case "niche":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h10M4 17h14" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke={stroke} strokeWidth="1.6" />
          <circle cx="12" cy="11" r="2" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case "age":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="1.6" />
          <path d="M12 7v5l3 2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

function CreatorProfileStatCard({
  label,
  value,
  accent,
  iconKind,
  children,
}: {
  label: string;
  value?: string;
  accent: string;
  iconKind: "followers" | "engagement" | "views" | "niche" | "location" | "age";
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)",
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        padding: "14px 14px 13px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        minHeight: 88,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#9A9A9A",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <CreatorProfileStatIcon kind={iconKind} />
      </div>
      {children ?? (
        <div style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {value}
        </div>
      )}
    </div>
  );
}

const profileStatInputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E8E8E8",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "#1A1A1A",
  background: "#FFFFFF",
  letterSpacing: "-0.02em",
  outline: "none",
  boxSizing: "border-box",
};

function CreatorDetailModal({
  creator,
  userId,
  onClose,
  onUpdate,
  onRemove,
  onRunCampaign,
  onGenerateOutreach,
}: {
  creator: ManagedCreator;
  userId?: string;
  onClose: () => void;
  onUpdate: (c: ManagedCreator) => void;
  onRemove: () => void;
  onRunCampaign: () => void;
  onGenerateOutreach: () => void;
}) {
  const lang = useLang();
  const [localCreator, setLocalCreator] = useState(creator);
  const [ageDraft, setAgeDraft] = useState(creator.age ? String(creator.age) : "");
  const [locationDraft, setLocationDraft] = useState(creator.location || "");
  const resolvedUserIdRef = useRef<string | undefined>(userId);
  const ageDraftRef = useRef(ageDraft);
  const locationDraftRef = useRef(locationDraft);
  const localCreatorRef = useRef(localCreator);

  useEffect(() => {
    resolvedUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (userId || !supabase) return;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) resolvedUserIdRef.current = user.id;
    });
  }, [userId]);

  useEffect(() => {
    ageDraftRef.current = ageDraft;
  }, [ageDraft]);

  useEffect(() => {
    locationDraftRef.current = locationDraft;
  }, [locationDraft]);

  useEffect(() => {
    localCreatorRef.current = localCreator;
  }, [localCreator]);

  useEffect(() => {
    setLocalCreator(creator);
    setAgeDraft(creator.age ? String(creator.age) : "");
    setLocationDraft(creator.location || "");
  }, [creator.id]);

  const avgViews = Math.max(0, Math.floor(localCreator.followers * 0.08));

  const flushProfileFields = useCallback(async () => {
    let uid = resolvedUserIdRef.current ?? userId;
    if (!uid && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id;
      if (uid) resolvedUserIdRef.current = uid;
    }
    if (!uid) return;

    const parsedAge = parseInt(ageDraftRef.current, 10);
    const nextAge = Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : 0;
    const nextLocation = locationDraftRef.current.trim();
    const current = localCreatorRef.current;

    if (nextAge === current.age && nextLocation === current.location) return;

    const updated = { ...current, age: nextAge, location: nextLocation };
    setLocalCreator(updated);
    localCreatorRef.current = updated;
    onUpdate(updated);
    saveCreatorProfileExtras(uid, current.id, { age: nextAge, location: nextLocation });
  }, [onUpdate, userId]);

  const handleClose = () => {
    void flushProfileFields();
    onClose();
  };

  return (
    <ModalShell onClose={handleClose} maxWidth={640}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22, paddingRight: 32 }}>
        <CreatorAvatar src={localCreator.avatarUrl} size={72} alt={localCreator.displayName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.03em", color: "#1A1A1A" }}>
            {localCreator.displayName}
          </h2>
          <div style={{ fontSize: 14, color: "#0047FF", marginBottom: 10, fontWeight: 500 }}>@{localCreator.username}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 500, background: "#F0F6FF", color: "#0047FF", padding: "4px 10px", borderRadius: 999, textTransform: "capitalize" }}>
              {localCreator.platform}
            </span>
            <span style={{ ...statusBadgeStyle(), background: "#F5F5F5", padding: "4px 10px", borderRadius: 999 }}>
              {statusLabel(localCreator.status, lang)}
            </span>
            {localCreator.niche && (
              <span style={{ fontSize: 11, fontWeight: 500, background: "#ECFDF3", color: "#1FB567", padding: "4px 10px", borderRadius: 999 }}>
                {localCreator.niche}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
          {lang === "fr" ? "Performance" : "Performance"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
          <CreatorProfileStatCard
            label={lang === "fr" ? "Abonnés" : "Followers"}
            value={formatCount(localCreator.followers)}
            accent="#0047FF"
            iconKind="followers"
          />
          <CreatorProfileStatCard
            label={lang === "fr" ? "Engagement" : "Engagement"}
            value={`${localCreator.engagement}%`}
            accent="#FF3D8B"
            iconKind="engagement"
          />
          <CreatorProfileStatCard
            label={lang === "fr" ? "Vues moy." : "Avg Views"}
            value={formatCount(avgViews)}
            accent="#7C3AED"
            iconKind="views"
          />
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
          {lang === "fr" ? "Profil" : "Profile"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <CreatorProfileStatCard
            label={lang === "fr" ? "Niche" : "Niche"}
            value={localCreator.niche || "—"}
            accent="#1FB567"
            iconKind="niche"
          />
          <CreatorProfileStatCard
            label={lang === "fr" ? "Localisation" : "Location"}
            accent="#6366F1"
            iconKind="location"
          >
            <input
              type="text"
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              onBlur={() => void flushProfileFields()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={lang === "fr" ? "Paris, FR" : "Paris, FR"}
              style={profileStatInputStyle}
            />
          </CreatorProfileStatCard>
          <CreatorProfileStatCard
            label={lang === "fr" ? "Âge" : "Age"}
            accent="#F59E0B"
            iconKind="age"
          >
            <input
              type="number"
              min={13}
              max={99}
              value={ageDraft}
              onChange={(e) => setAgeDraft(e.target.value)}
              onBlur={() => void flushProfileFields()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={lang === "fr" ? "25" : "25"}
              style={profileStatInputStyle}
            />
          </CreatorProfileStatCard>
        </div>
        <p style={{ fontSize: 11, color: "#9A9A9A", margin: "10px 0 0", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Localisation et âge modifiables — sauvegardés automatiquement." : "Location and age are editable — saved automatically."}
        </p>
      </div>

      <div style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 14, padding: 16, marginBottom: 24 }}>
        <CreatorPayoutMethodFields
          creator={localCreator}
          lang={lang}
          onUpdate={(next) => {
            const updated = { ...localCreator, ...next };
            setLocalCreator(updated);
            onUpdate(updated);
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 12, paddingTop: 16, paddingBottom: 8, borderTop: "1px solid #EFEFEF" }}>
        <SplitHeaderActions
          variant="white"
          size="compact"
          menuPlacement="above"
          menuOffsetLeft={12}
          primaryLabel={lang === "fr" ? "Lancer une campagne →" : "Run campaign →"}
          onPrimaryClick={onRunCampaign}
          menuAriaLabel={lang === "fr" ? "Actions créateur" : "Creator actions"}
          menuItems={[
            {
              label: lang === "fr" ? "Générer un outreach →" : "Generate outreach →",
              onClick: onGenerateOutreach,
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
            {
              label: lang === "fr" ? "Supprimer le créateur" : "Remove creator",
              onClick: onRemove,
              danger: true,
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
          ]}
        />
      </div>
    </ModalShell>
  );
}

function RunCampaignModal({
  creator,
  onClose,
  onLaunch,
}: {
  creator: ManagedCreator;
  onClose: () => void;
  onLaunch: (campaignId: string, commissionRate: number) => Promise<string | void>;
}) {
  const lang = useLang();
  const [step, setStep] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionRate, setCommissionRate] = useState("15");
  const [autoPayout, setAutoPayout] = useState(true);
  const [minPayout, setMinPayout] = useState("50");
  const [assignedCode, setAssignedCode] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [copiedField, setCopiedField] = useState<"code" | "link" | "assigned" | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; platform: string }[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const code = discountCodeFor(creator.username);
  const [refLink] = useState(`trackit.app/r/${referralSlug(creator.username)}`);

  const copyWithFeedback = async (text: string, field: "code" | "link" | "assigned") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setLoadingCampaigns(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingCampaigns(false);
        return;
      }
      const data = await getCampaigns(user.id);
      setCampaigns(data.map((c) => ({ id: c.id, name: c.name, platform: c.platform })));
      setLoadingCampaigns(false);
    };
    void load();
  }, []);

  return (
    <ModalShell onClose={onClose} maxWidth={560}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px", paddingRight: 40 }}>{lang === "fr" ? "Lancer une campagne" : "Run campaign"}</h2>
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>{lang === "fr" ? `Assigner ${creator.displayName} à une campagne` : `Assign ${creator.displayName} to a campaign`}</p>

      {step === 1 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", marginBottom: 12 }}>{lang === "fr" ? "ÉTAPE 1 — SÉLECTIONNER UNE CAMPAGNE" : "STEP 1 — SELECT CAMPAIGN"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {loadingCampaigns ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9A9A9A", fontSize: 13, background: "#FAFAFA", borderRadius: 12, border: "1px solid #EFEFEF" }}>
                {lang === "fr" ? "Aucune campagne. Créez-en une dans Campagnes." : "No campaigns yet. Create one in Campaigns."}
              </div>
            ) : (
              campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCampaign(c.id)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${selectedCampaign === c.id ? "#0047FF" : "#EFEFEF"}`,
                  background: selectedCampaign === c.id ? "rgba(0,71,255,0.06)" : "#FAFAFA",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#9A9A9A" }}>{c.platform}</div>
              </button>
              ))
            )}
            <button type="button" style={{ ...btnSecondary, borderStyle: "dashed" }}>
              {lang === "fr" ? "Créer une nouvelle campagne +" : "Create new campaign +"}
            </button>
          </div>
          <button type="button" disabled={!selectedCampaign} style={{ ...btnBlack, width: "100%", opacity: selectedCampaign ? 1 : 0.45 }} onClick={() => setStep(2)}>
            {lang === "fr" ? "Continuer →" : "Continue →"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", marginBottom: 12 }}>{lang === "fr" ? "ÉTAPE 2 — COMMISSION" : "STEP 2 — COMMISSION"}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["percentage", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCommissionType(t)}
                style={{
                  ...btnSecondary,
                  flex: 1,
                  background: commissionType === t ? "#1A1A1A" : "#FFF",
                  color: commissionType === t ? "#FFF" : "#1A1A1A",
                }}
              >
                {t === "percentage" ? (lang === "fr" ? "Pourcentage" : "Percentage") : lang === "fr" ? "Montant fixe" : "Fixed amount"}
              </button>
            ))}
          </div>
          <Field label={commissionType === "percentage" ? (lang === "fr" ? "Taux de commission (%)" : "Commission rate (%)") : lang === "fr" ? "Montant fixe (€)" : "Fixed amount ($)"}>
            <input value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>{lang === "fr" ? "Paiement automatique" : "Auto payout"}</span>
            <button
              type="button"
              onClick={() => setAutoPayout(!autoPayout)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                border: "none",
                background: autoPayout ? "#0047FF" : "#E5E5E5",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: autoPayout ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#FFF",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
          <Field label={lang === "fr" ? "Seuil minimum de paiement (€)" : "Minimum payout threshold ($)"}>
            <input value={minPayout} onChange={(e) => setMinPayout(e.target.value)} style={inputStyle} />
          </Field>
          <button type="button" style={{ ...btnBlack, width: "100%" }} onClick={() => setStep(3)}>
            {lang === "fr" ? "Continuer →" : "Continue →"}
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", marginBottom: 12 }}>
            {lang === "fr" ? "ÉTAPE 3 — ASSETS DE PARRAINAGE" : "STEP 3 — REFERRAL ASSETS"}
          </p>
          <Field label={lang === "fr" ? "Code de réduction" : "Discount code"}>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={code} style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 600 }} />
              <button
                type="button"
                style={btnSecondary}
                onClick={() => void copyWithFeedback(code, "code")}
              >
                {copiedField === "code" ? (lang === "fr" ? "Copié !" : "Copied!") : lang === "fr" ? "Copier" : "Copy"}
              </button>
            </div>
          </Field>
          <Field label={lang === "fr" ? "Lien de parrainage" : "Referral link"}>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={refLink} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} />
              <button
                type="button"
                style={btnSecondary}
                onClick={() => void copyWithFeedback(refLink, "link")}
              >
                {copiedField === "link" ? (lang === "fr" ? "Copié !" : "Copied!") : lang === "fr" ? "Copier" : "Copy"}
              </button>
            </div>
          </Field>
          <button
            type="button"
            style={{ ...btnBlack, width: "100%", marginTop: 8 }}
            disabled={launching}
            onClick={async () => {
              if (!selectedCampaign) return;
              setLaunching(true);
              const code = await onLaunch(selectedCampaign, parseFloat(commissionRate) || 10);
              if (code) setAssignedCode(code);
              setLaunching(false);
              setStep(4);
            }}
          >
            {launching
              ? lang === "fr"
                ? "Lancement…"
                : "Launching..."
              : lang === "fr"
                ? "Lancer la campagne →"
                : "Launch campaign →"}
          </button>
        </>
      )}

      {step === 4 && assignedCode && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", marginBottom: 12 }}>
            {lang === "fr" ? "CAMPAGNE LANCÉE" : "CAMPAIGN LAUNCHED"}
          </p>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 16px" }}>
            {lang === "fr"
              ? `Partagez ce code de réduction avec ${creator.displayName} :`
              : `Share this discount code with ${creator.displayName}:`}
          </p>
          <Field label={lang === "fr" ? "Code de réduction" : "Discount code"}>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={assignedCode} style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 600 }} />
              <button
                type="button"
                style={btnSecondary}
                onClick={() => void copyWithFeedback(assignedCode, "assigned")}
              >
                {copiedField === "assigned" ? (lang === "fr" ? "Copié !" : "Copied!") : lang === "fr" ? "Copier" : "Copy"}
              </button>
            </div>
          </Field>
          <button type="button" style={{ ...btnBlack, width: "100%", marginTop: 8 }} onClick={onClose}>
            {lang === "fr" ? "Terminé" : "Done"}
          </button>
        </>
      )}
    </ModalShell>
  );
}

export function CreatorsView({
  isMobile,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  userId,
}: {
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  userId?: string;
}) {
  const lang = useLang();
  const [creators, setCreators] = useState<ManagedCreator[]>([]);
  const [tab, setTab] = useState<CreatorsTab>("all");
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("followers");
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detailCreator, setDetailCreator] = useState<ManagedCreator | null>(null);
  const [campaignCreator, setCampaignCreator] = useState<ManagedCreator | null>(null);
  const [outreachCreator, setOutreachCreator] = useState<ManagedCreator | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await getSavedCreators(user.id);
      setCreators(data.map((row) => mergeCreatorProfileExtras(user.id, mapDbCreator(row as Record<string, unknown>))));
    };
    void load();
    const interval = setInterval(() => { void load(); }, 15000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const uniqueCampaigns = useMemo(() => {
    const ids = new Set<string>();
    creators.forEach((c) => c.campaignIds.forEach((id) => ids.add(id)));
    return ids.size;
  }, [creators]);

  const activeCount = creators.filter((c) => c.status === "active").length;
  const avgEngagement = creators.length
    ? creators.reduce((s, c) => s + c.engagement, 0) / creators.length
    : 0;

  const filtered = useMemo(() => {
    let list = [...creators];
    if (tab === "active") list = list.filter((c) => c.status === "active");
    if (tab === "pending") list = list.filter((c) => c.status === "pending");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.niche.toLowerCase().includes(q)
      );
    }
    if (platformFilter !== "all") list = list.filter((c) => c.platform === platformFilter);
    list.sort((a, b) => {
      if (sortBy === "followers") return b.followers - a.followers;
      if (sortBy === "engagement") return b.engagement - a.engagement;
      return b.addedDate.localeCompare(a.addedDate);
    });
    return list;
  }, [creators, tab, search, platformFilter, sortBy]);

  const updateCreator = (updated: ManagedCreator) => {
    setCreators((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    setDetailCreator((d) => (d?.id === updated.id ? updated : d));
  };

  const handleRemoveCreator = async (id: string, handle?: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const creator = creators.find((c) => c.id === id);
    const ok = await deleteCreatorById(user.id, id, handle ?? creator?.username);
    if (!ok) {
      setToast(lang === "fr" ? "Impossible de supprimer le créateur" : "Could not remove creator");
      return;
    }
    setCreators((list) => list.filter((c) => c.id !== id));
    setDetailCreator((d) => (d?.id === id ? null : d));
    setCampaignCreator((c) => (c?.id === id ? null : c));
    setOutreachCreator((c) => (c?.id === id ? null : c));
    setToast(lang === "fr" ? "Créateur supprimé" : "Creator removed");
  };

  const iconBtnAction: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid #E5E5E5",
    borderRadius: 10,
    width: 38,
    height: 38,
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  return (
    <>
      <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 24, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Créateurs" : "Creators"}</h1>
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 0" }}>{lang === "fr" ? "Gérez vos relations avec les créateurs." : "Manage your creator relationships."}</p>
          </div>
          <div style={{ marginTop: 8 }}>
            <SplitHeaderActions
              primaryLabel={lang === "fr" ? "+ Ajouter un créateur" : "+ Add Creator"}
              onPrimaryClick={() => {
                if (hasReachedManagedCreatorLimit(plan, creators.length)) {
                  setUpgradeMsg(plan === "pro"
                    ? lang === "fr"
                      ? `🔒 Limite de ${PRO_MAX_MANAGED_CREATORS} créateurs — Plan Scale requis.\n\nCréateurs illimités sur Scale.\n\nPassez à Scale →`
                      : `🔒 ${PRO_MAX_MANAGED_CREATORS} creator limit — Scale plan required.\n\nUnlimited creators on Scale.\n\nUpgrade to Scale →`
                    : plan === "basic"
                      ? lang === "fr"
                        ? `🔒 Limite de ${BASIC_MAX_MANAGED_CREATORS} créateurs — Plan Pro requis.\n\nGérez jusqu'à 50 créateurs avec Pro.\n\nPassez à Pro →`
                        : `🔒 ${BASIC_MAX_MANAGED_CREATORS} creator limit — Pro plan required.\n\nManage up to 50 creators on Pro.\n\nUpgrade to Pro →`
                      : lang === "fr"
                        ? `🔒 Limite de ${getMaxManagedCreators(plan)} créateurs.\n\nPassez à Growth pour jusqu'à 15 créateurs.\n\nPassez à Growth →`
                        : `🔒 ${getMaxManagedCreators(plan)} creator limit.\n\nUpgrade to Growth for up to 15 creators.\n\nUpgrade to Growth →`);
                  return;
                }
                setAddOpen(true);
              }}
              sectionLabel={lang === "fr" ? "Import" : "Import"}
              menuAriaLabel={lang === "fr" ? "Plus d'actions" : "More actions"}
              menuItems={[
                {
                  label: lang === "fr" ? "Importer un CSV" : "Import CSV",
                  onClick: () => {
                    if (!canBulkImportCreatorsCsv(plan)) {
                      setUpgradeMsg(lang === "fr"
                        ? "🔒 Import CSV en masse — Plan Pro requis.\n\nImportez des centaines de créateurs en un clic.\n\nPassez à Pro →"
                        : "🔒 Bulk CSV import — Pro plan required.\n\nImport hundreds of creators in one click.\n\nUpgrade to Pro →");
                      return;
                    }
                    setImportOpen(true);
                  },
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "56px 16px 16px" : "24px 40px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 12 : 16, marginBottom: 24 }}>
          {[
            { label: lang === "fr" ? "Total créateurs" : "Total Creators", value: String(creators.length) },
            { label: lang === "fr" ? "Partenaires actifs" : "Active Partners", value: String(activeCount) },
            { label: lang === "fr" ? "Engagement moyen" : "Avg Engagement", value: `${avgEngagement.toFixed(1)}%` },
            { label: lang === "fr" ? "Total campagnes" : "Total Campaigns", value: String(uniqueCampaigns) },
          ].map((kpi) => (
            <div key={kpi.label} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 8 }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #EFEFEF", marginBottom: 20 }}>
          {(
            [
              { id: "all" as const, label: lang === "fr" ? "Tous les créateurs" : "All Creators" },
              { id: "active" as const, label: lang === "fr" ? "Actifs" : "Active" },
              { id: "pending" as const, label: lang === "fr" ? "En attente" : "Pending" },
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
                padding: "10px 4px 14px",
                marginRight: 16,
                fontSize: 14,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "#1A1A1A" : "#7A7A7A",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "fr" ? "Rechercher par nom, pseudo, niche..." : "Search by name, handle, niche..."}
              style={{ border: "none", outline: "none", flex: 1, fontSize: 13, fontFamily: "inherit" }}
            />
          </div>
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 140 }}>
            <option value="all">{lang === "fr" ? "Toutes les plateformes" : "All platforms"}</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} style={{ ...inputStyle, width: "auto", minWidth: 140 }}>
            <option value="followers">{lang === "fr" ? "Abonnés" : "Followers"}</option>
            <option value="engagement">{lang === "fr" ? "Engagement" : "Engagement"}</option>
            <option value="addedDate">{lang === "fr" ? "Date d'ajout" : "Added date"}</option>
          </select>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          {isMobile ? (
            filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#7A7A7A", fontSize: 14 }}>{lang === "fr" ? "Aucun créateurs pour le moment" : "No creators match your filters"}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
                {filtered.map((creator) => (
                  <div key={creator.id} style={{ background: "#fff", border: "1px solid #EFEFEF", borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <CreatorAvatar src={creator.avatarUrl} size={44} alt={creator.displayName} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>{creator.displayName}</div>
                        <div style={{ fontSize: 12, color: "#0047FF" }}>@{creator.username}</div>
                        <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "capitalize" }}>{creator.platform}</div>
                      </div>
                      <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <span style={statusBadgeStyle()}>{statusLabel(creator.status, lang)}</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ textAlign: "center", background: "#F8F8F8", borderRadius: 8, padding: "8px 4px" }}>
                        <div style={{ fontSize: 11, color: "#9A9A9A" }}>{lang === "fr" ? "Abonnés" : "Followers"}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{formatCount(creator.followers)}</div>
                      </div>
                      <div style={{ textAlign: "center", background: "#F8F8F8", borderRadius: 8, padding: "8px 4px" }}>
                        <div style={{ fontSize: 11, color: "#9A9A9A" }}>{lang === "fr" ? "Engagement" : "Engagement"}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{creator.engagement}%</div>
                      </div>
                      <div style={{ textAlign: "center", background: "#F8F8F8", borderRadius: 8, padding: "8px 4px" }}>
                        <div style={{ fontSize: 11, color: "#9A9A9A" }}>{lang === "fr" ? "Niche" : "Niche"}</div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{creator.niche || "—"}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="hero-cta-shopify-light hero-cta-compact"
                      style={{ width: "fit-content", alignSelf: "flex-start" }}
                      onClick={() => setDetailCreator(creator)}
                    >
                      {lang === "fr" ? "Voir le profil" : "View profile"}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 0.9fr 0.8fr 0.7fr 0.8fr 0.8fr 0.9fr 3fr",
                  gap: 12,
                  padding: "14px 20px",
                  background: "#FAFAFA",
                  borderBottom: "1px solid #EFEFEF",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#9A9A9A",
                }}
              >
                {[
                  lang === "fr" ? "Créateur" : "Creator",
                  lang === "fr" ? "Plateforme" : "Platform",
                  lang === "fr" ? "Abonnés" : "Followers",
                  lang === "fr" ? "Engagement" : "Engagement",
                  lang === "fr" ? "Niche" : "Niche",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Ajouté" : "Added",
                  lang === "fr" ? "Actions" : "Actions",
                ].map((h) => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {filtered.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#7A7A7A", fontSize: 14 }}>{lang === "fr" ? "Aucun créateurs pour le moment" : "No creators match your filters"}</div>
              ) : (
                filtered.map((c, i) => (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 0.9fr 0.8fr 0.7fr 0.8fr 0.8fr 0.9fr 3fr",
                      gap: 12,
                      padding: "18px 20px",
                      alignItems: "center",
                      borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <CreatorAvatar src={c.avatarUrl} size={36} alt={c.displayName} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.displayName}</div>
                        <div style={{ fontSize: 12, color: "#0047FF" }}>@{c.username}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, textTransform: "capitalize" }}>{c.platform}</div>
                    <div style={{ fontSize: 13 }}>{formatCount(c.followers)}</div>
                    <div style={{ fontSize: 13 }}>{c.engagement}%</div>
                    <div style={{ fontSize: 13 }}>{c.niche}</div>
                    <div><span style={statusBadgeStyle()}>{statusLabel(c.status, lang)}</span></div>
                    <div style={{ fontSize: 12, color: "#7A7A7A" }}>{c.addedDate}</div>
                    <button
                      type="button"
                      className="hero-cta-shopify-light hero-cta-compact"
                      style={{ width: "fit-content", justifySelf: "start" }}
                      onClick={() => setDetailCreator(c)}
                    >
                      {lang === "fr" ? "Voir le profil" : "View profile"}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

      </div>

      {importOpen && <ImportCsvModal lang={lang} onClose={() => setImportOpen(false)} />}
      {addOpen && (
        <AddCreatorModal
          lang={lang}
          onClose={() => setAddOpen(false)}
          onAdd={async (c) => {
            if (hasReachedManagedCreatorLimit(plan, creators.length)) {
              setAddOpen(false);
              setUpgradeMsg(plan === "pro"
                ? lang === "fr"
                  ? `🔒 Limite de ${PRO_MAX_MANAGED_CREATORS} créateurs — Plan Scale requis.\n\nPassez à Scale →`
                  : `🔒 ${PRO_MAX_MANAGED_CREATORS} creator limit — Scale plan required.\n\nUpgrade to Scale →`
                : plan === "basic"
                  ? lang === "fr"
                    ? `🔒 Limite de ${BASIC_MAX_MANAGED_CREATORS} créateurs — Plan Pro requis.\n\nPassez à Pro →`
                    : `🔒 ${BASIC_MAX_MANAGED_CREATORS} creator limit — Pro plan required.\n\nUpgrade to Pro →`
                  : lang === "fr"
                    ? "🔒 Limite de créateurs atteinte. Passez à Growth →"
                    : "🔒 Creator limit reached. Upgrade to Growth →");
              return;
            }
            if (!supabase) return;
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const saved = await saveCreator(user.id, {
              username: c.username,
              display_name: c.displayName,
              avatar_url: c.avatarUrl ?? "",
              platform: c.platform,
              followers_count: c.followers,
              engagement_rate: c.engagement,
              avg_views: Math.floor(c.followers * 0.08),
              bio: c.notes || "",
              niche: c.niche,
            });
            const row = saved
              ? { ...mapDbCreator(saved as Record<string, unknown>), status: c.status, notes: c.notes, email: c.email, age: c.age, location: c.location }
              : c;
            setCreators((list) => [row, ...list]);
            setAddOpen(false);
            setToast("Creator added ✓");
          }}
        />
      )}
      {detailCreator && (
        <CreatorDetailModal
          creator={detailCreator}
          userId={userId}
          onClose={() => setDetailCreator(null)}
          onUpdate={updateCreator}
          onRemove={() => void handleRemoveCreator(detailCreator.id, detailCreator.username)}
          onRunCampaign={() => {
            if (plan === "free") {
              setUpgradeMsg(lang === "fr"
                ? "🔒 Lancer une campagne — Plan Growth requis.\n\nAssignez vos créateurs à des campagnes, suivez les ventes et automatisez les commissions.\n\nPassez à Growth →"
                : "🔒 Run campaigns — Growth plan required.\n\nAssign creators to campaigns, track sales, and automate commissions.\n\nUpgrade to Growth →");
              return;
            }
            setCampaignCreator(detailCreator);
            setDetailCreator(null);
          }}
          onGenerateOutreach={() => {
            setOutreachCreator(detailCreator);
            setDetailCreator(null);
          }}
        />
      )}
      {campaignCreator && (
        <RunCampaignModal
          creator={campaignCreator}
          onClose={() => setCampaignCreator(null)}
          onLaunch={async (campaignId, commissionRate) => {
            const discountCode = generateDiscountCode(
              campaignCreator.username || (campaignCreator as ManagedCreator & { handle?: string }).handle || "creator"
            );
            const { data: { user } } = await supabase!.auth.getUser();
            if (user) {
              const { data: existingRows } = await supabase!
                .from("campaign_creators")
                .select("creator_id")
                .eq("campaign_id", campaignId)
                .eq("user_id", user.id);
              const existingIds = (existingRows || []).map((row) => String(row.creator_id));
              const mergedIds = existingIds.includes(campaignCreator.id)
                ? existingIds
                : [...existingIds, campaignCreator.id];
              await syncCampaignCreators(user.id, campaignId, mergedIds);
            }
            await supabase!
              .from("creators")
              .update({
                discount_code: discountCode,
                commission_rate: commissionRate || 10,
              })
              .eq("id", campaignCreator.id);
            setCreators((list) =>
              list.map((c) =>
                c.id === campaignCreator.id
                  ? {
                      ...c,
                      status: "active" as const,
                      campaignIds: c.campaignIds.includes(campaignId) ? c.campaignIds : [...c.campaignIds, campaignId],
                    }
                  : c
              )
            );
            setToast("Campaign launched ✓");
            return discountCode;
          }}
        />
      )}
      {outreachCreator && <CreatorOutreachModal creator={outreachCreator} onClose={() => setOutreachCreator(null)} />}
      {upgradeMsg && <UpgradeModal lang={lang} message={upgradeMsg} onClose={() => setUpgradeMsg(null)} />}
      {toast && <Toast message={toast} />}
    </>
  );
}
