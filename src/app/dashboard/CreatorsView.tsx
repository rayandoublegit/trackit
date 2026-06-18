"use client";

import { useEffect, useMemo, useState } from "react";
import { generateDiscountCode } from "@/lib/generate-discount-code";
import { deleteCreatorById, getSavedCreators, getCampaigns, saveCreator } from "@/lib/db";
import { ScriptsManager } from "./ScriptsManager";
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
  paypal_link?: string;
  revolut_link?: string;
  iban?: string;
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
    status: "pending",
    addedDate: typeof c.created_at === "string" ? c.created_at.split("T")[0] : "",
    age: 0,
    email: "",
    location: "",
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

function avatarUrlFor(username: string, custom?: string) {
  return custom ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
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

function CreatorDetailModal({
  creator,
  onClose,
  onUpdate,
  onRemove,
  onRunCampaign,
  onGenerateOutreach,
}: {
  creator: ManagedCreator;
  onClose: () => void;
  onUpdate: (c: ManagedCreator) => void;
  onRemove: () => void;
  onRunCampaign: () => void;
  onGenerateOutreach: () => void;
}) {
  const lang = useLang();
  // Notes should be writable immediately, with explicit "Save notes" persistence.
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState(creator);

  const avgViews = Math.floor(creator.followers * 0.08);

  const saveEdit = async () => {
    if (!supabase) return;
    const nextNotes = draft.notes.trim();

    const { error } = await supabase.from("creators").update({ notes: nextNotes }).eq("id", creator.id);
    if (error) {
      // Keep editing open so the user can retry.
      console.error("Failed to save creator notes:", error);
      return;
    }

    onUpdate({ ...draft, notes: nextNotes });
    setEditing(false);
  };

  return (
    <ModalShell onClose={onClose} maxWidth={600}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, paddingRight: 32 }}>
        <img src={avatarUrlFor(creator.username, creator.avatarUrl)} alt="" width={80} height={80} style={{ borderRadius: "50%", background: "#F0F0F0" }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 4px" }}>{creator.displayName}</h2>
          <div style={{ fontSize: 15, color: "#0047FF", marginBottom: 8 }}>@{creator.username}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, background: "#F0F0F0", padding: "4px 10px", borderRadius: 999, textTransform: "capitalize" }}>{creator.platform}</span>
            <span style={statusBadgeStyle()}>{statusLabel(creator.status, lang)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Followers", value: formatCount(creator.followers) },
          { label: "Engagement", value: `${creator.engagement}%` },
          { label: "Avg Views", value: formatCount(avgViews) },
          { label: "Niche", value: creator.niche },
          { label: "Location", value: creator.location },
          { label: "Age", value: String(creator.age) },
        ].map((s) => (
          <div key={s.label} style={{ background: "#FAFAFA", borderRadius: 10, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 20 }}>
        <strong style={{ color: "#1A1A1A" }}>Email:</strong> {creator.email}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", display: "block", marginBottom: 6 }}>
          {lang === "fr" ? "Lien PayPal.me" : "PayPal.me link"}
        </label>
        <input
          type="text"
          placeholder="paypal.me/yourname"
          value={creator.paypal_link || ""}
          onChange={async (e) => {
            const { supabase } = await import("@/lib/supabase");
            if (!supabase) return;
            const val = e.target.value;
            await supabase.from("creators").update({ paypal_link: val }).eq("id", creator.id);
            onUpdate({ ...creator, paypal_link: val });
          }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 4 }}>
          {lang === "fr" ? "Ex: paypal.me/emmalauren" : "e.g. paypal.me/emmalauren"}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", display: "block", marginBottom: 6 }}>
          {lang === "fr" ? "Lien Revolut.me" : "Revolut.me link"}
        </label>
        <input
          type="text"
          placeholder="revolut.me/yourname"
          value={creator.revolut_link || ""}
          onChange={async (e) => {
            const { supabase } = await import("@/lib/supabase");
            if (!supabase) return;
            await supabase.from("creators").update({ revolut_link: e.target.value }).eq("id", creator.id);
          }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 4 }}>
          {lang === "fr" ? "Ex: revolut.me/emmalauren" : "e.g. revolut.me/emmalauren"}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", display: "block", marginBottom: 6 }}>
          {lang === "fr" ? "IBAN" : "IBAN"}
        </label>
        <input
          type="text"
          placeholder="FR76 3000 6000 0112 3456 7890 189"
          value={creator.iban || ""}
          onChange={async (e) => {
            const { supabase } = await import("@/lib/supabase");
            if (!supabase) return;
            await supabase.from("creators").update({ iban: e.target.value }).eq("id", creator.id);
          }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 4 }}>
          {lang === "fr" ? "Virement bancaire manuel — l'IBAN sera copié automatiquement" : "Manual bank transfer — IBAN will be auto-copied"}
        </div>
      </div>
      <Field label="Notes">
        <textarea
          value={editing ? draft.notes : creator.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          readOnly={!editing}
          rows={4}
          style={{ ...inputStyle, lineHeight: 1.5 }}
        />
      </Field>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {editing ? (
          <>
            <button type="button" style={btnSecondary} onClick={() => { setDraft(creator); setEditing(false); }}>
              Cancel edit
            </button>
            <button type="button" style={btnPrimary} onClick={saveEdit}>
              Save notes
            </button>
          </>
        ) : (
          <button type="button" style={btnSecondary} onClick={() => setEditing(true)}>
            {lang === "fr" ? "Modifier ce créateur" : "Edit creator"}
          </button>
        )}
        <button type="button" style={btnBlack} onClick={onRunCampaign}>
          {lang === "fr" ? "Lancer une campagne →" : "Run campaign →"}
        </button>
        <button type="button" style={btnSecondary} onClick={onGenerateOutreach}>
          {lang === "fr" ? "Générer un outreach →" : "Generate outreach →"}
        </button>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          color: "#DC2626",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          marginTop: 8,
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        {lang === "fr" ? "Supprimer" : "Remove"}
      </button>
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
      setCreators(data.map(mapDbCreator));
    };
    void load();
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
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="hero-cta-shopify-light"
              style={{ padding: "10px 16px", fontSize: 13 }}
              onClick={() => {
                if (!canBulkImportCreatorsCsv(plan)) {
                  setUpgradeMsg(lang === "fr"
                    ? "🔒 Import CSV en masse — Plan Pro requis.\n\nImportez des centaines de créateurs en un clic.\n\nPassez à Pro →"
                    : "🔒 Bulk CSV import — Pro plan required.\n\nImport hundreds of creators in one click.\n\nUpgrade to Pro →");
                  return;
                }
                setImportOpen(true);
              }}
            >
              {lang === "fr" ? "Importer un CSV" : "Import CSV"}
            </button>
            <button
              type="button"
              className="hero-cta-shopify"
              style={{ padding: "10px 16px", fontSize: 13 }}
              onClick={() => {
                if (hasReachedManagedCreatorLimit(plan, creators.length)) {
                  setUpgradeMsg(plan === "pro"
                    ? lang === "fr"
                      ? `🔒 Limite de ${PRO_MAX_MANAGED_CREATORS} créateurs — Plan Scale requis.\n\nCréateurs illimités sur Scale.\n\nPassez à Scale →`
                      : `🔒 ${PRO_MAX_MANAGED_CREATORS} creator limit — Scale plan required.\n\nUnlimited creators on Scale.\n\nUpgrade to Scale →`
                    : plan === "basic"
                      ? lang === "fr"
                        ? `🔒 Limite de ${BASIC_MAX_MANAGED_CREATORS} créateurs — Plan Pro requis.\n\nGérez jusqu'à 100 créateurs avec Pro.\n\nPassez à Pro →`
                        : `🔒 ${BASIC_MAX_MANAGED_CREATORS} creator limit — Pro plan required.\n\nManage up to 100 creators on Pro.\n\nUpgrade to Pro →`
                      : lang === "fr"
                        ? `🔒 Limite de ${getMaxManagedCreators(plan)} créateurs.\n\nPassez à Growth pour jusqu'à 25 créateurs.\n\nPassez à Growth →`
                        : `🔒 ${getMaxManagedCreators(plan)} creator limit.\n\nUpgrade to Growth for up to 25 creators.\n\nUpgrade to Growth →`);
                  return;
                }
                setAddOpen(true);
              }}
            >
              {lang === "fr" ? "+ Ajouter un créateur" : "+ Add Creator"}
            </button>
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
                      <img
                        src={avatarUrlFor(creator.username, creator.avatarUrl)}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                      />
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
                      className="hero-cta-shopify-dark hero-cta-compact-sm"
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
                      <img src={avatarUrlFor(c.username, c.avatarUrl)} alt="" width={36} height={36} style={{ borderRadius: "50%", flexShrink: 0 }} />
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
                      className="hero-cta-shopify-dark hero-cta-compact-sm"
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

        <ScriptsManager brandId={userId} isMobile={isMobile} />
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
