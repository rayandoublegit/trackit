"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";
import { BillingPaymentMethodSummary, PaymentMethodsBillingSection } from "./PayoutsView";
import type { User } from "@supabase/supabase-js";
import { useLang, type Lang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade } from "@/lib/checkout";
import { formatLastActiveFromDate } from "@/lib/format-last-active";
import { recordLoginIp } from "@/lib/record-login";
import { getOrCreateSessionKey } from "@/lib/session-key";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { UserSessionRow } from "@/app/api/auth/sessions/route";

const GROWTH_MONTHLY = 19;
const PRO_MONTHLY = 39;
const SCALE_MONTHLY = 99;

const STRIPE_BILLING_PORTAL_LOGIN_URL =
  process.env.NEXT_PUBLIC_STRIPE_BILLING_PORTAL_LOGIN_URL ??
  "https://billing.stripe.com/p/login/7sY28r4L0bXp8x67ck0RG00";

function planDisplayName(plan: PlanTier, lang: Lang): string {
  if (plan === "scale") return "Scale";
  if (plan === "pro") return "Pro";
  if (plan === "basic") return "Growth";
  return lang === "fr" ? "Gratuit" : "Free";
}

function planMonthlyPrice(plan: PlanTier): number {
  if (plan === "scale") return SCALE_MONTHLY;
  if (plan === "pro") return PRO_MONTHLY;
  if (plan === "basic") return GROWTH_MONTHLY;
  return 0;
}

type SettingsTab = "general" | "profile" | "team" | "billing" | "notifications" | "security" | "api";

type TeamRole = "owner" | "admin" | "editor" | "viewer" | "billing";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "pending";
  lastActive?: string;
  isYou?: boolean;
  avatarUrl?: string | null;
};

function roleLabel(role: TeamRole, lang: Lang): string {
  const labels: Record<TeamRole, { en: string; fr: string }> = {
    owner: { en: "Owner", fr: "Propriétaire" },
    admin: { en: "Admin", fr: "Admin" },
    editor: { en: "Editor", fr: "Éditeur" },
    viewer: { en: "Viewer", fr: "Observateur" },
    billing: { en: "Billing", fr: "Facturation" },
  };
  return lang === "fr" ? labels[role].fr : labels[role].en;
}

function roleDescription(role: TeamRole, lang: Lang): string {
  const descriptions: Record<TeamRole, { en: string; fr: string }> = {
    owner: {
      en: "Full access including billing, team, and account deletion.",
      fr: "Accès complet incluant la facturation, l'équipe et la suppression du compte.",
    },
    admin: {
      en: "Manage campaigns, creators, payouts, settings, and invite members.",
      fr: "Gérez les campagnes, créateurs, paiements, paramètres et invitez des membres.",
    },
    editor: {
      en: "Create and edit campaigns, outreach, and discovery. No billing or team admin.",
      fr: "Créez et modifiez des campagnes, messages et recherches. Pas de facturation ou d'admin équipe.",
    },
    viewer: {
      en: "View-only access to dashboards, campaigns, and reports.",
      fr: "Accès en lecture seule aux tableaux de bord, campagnes et rapports.",
    },
    billing: {
      en: "View analytics and manage billing, invoices, and payouts only.",
      fr: "Consultez les analytiques et gérez uniquement la facturation, les factures et les paiements.",
    },
  };
  return lang === "fr" ? descriptions[role].fr : descriptions[role].en;
}

function businessTypeLabel(value: string, lang: Lang): string {
  const map: Record<string, { en: string; fr: string }> = {
    Ecommerce: { en: "Ecommerce", fr: "E-commerce" },
    Infopreneur: { en: "Infopreneur", fr: "Infopreneur" },
    Agency: { en: "Agency", fr: "Agence" },
    Other: { en: "Other", fr: "Autre" },
  };
  return lang === "fr" ? map[value]?.fr ?? value : map[value]?.en ?? value;
}

function emailNotifLabel(key: string, lang: Lang): string {
  const map: Record<string, { en: string; fr: string }> = {
    "New creator replied to outreach": { en: "New creator replied to outreach", fr: "Un créateur a répondu à votre message" },
    "Sale tracked from creator": { en: "Sale tracked from creator", fr: "Vente suivie depuis un créateur" },
    "Commission threshold reached": { en: "Commission threshold reached", fr: "Seuil de commission atteint" },
    "Follow up reminder": { en: "Follow up reminder", fr: "Rappel de relance" },
    "Weekly performance report": { en: "Weekly performance report", fr: "Rapport de performance hebdomadaire" },
    "New team member joined": { en: "New team member joined", fr: "Nouveau membre a rejoint l'équipe" },
  };
  return lang === "fr" ? map[key]?.fr ?? key : map[key]?.en ?? key;
}

function formatLastActive(text: string | undefined, lang: Lang): string {
  if (!text) return "—";
  if (text === "Active now") return lang === "fr" ? "Actif maintenant" : "Active now";
  if (text === "2 hours ago") return lang === "fr" ? "il y a quelques heures" : "2 hours ago";
  if (text === "Yesterday") return lang === "fr" ? "Hier" : "Yesterday";
  if (text === "3 days ago") return lang === "fr" ? "il y a quelques jours" : "3 days ago";
  return text;
}

function invoiceStatusLabel(status: "Paid" | "Failed" | "Pending", lang: Lang): string {
  if (status === "Paid") return lang === "fr" ? "Payé" : "Paid";
  if (status === "Failed") return lang === "fr" ? "Échoué" : "Failed";
  return lang === "fr" ? "En attente" : "Pending";
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

type ProfileRow = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  business_name: string | null;
  business_type: string | null;
  niche: string | null;
  shopify_store_url: string | null;
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  ecommerce: "Ecommerce",
  infopreneur: "Infopreneur",
  agency: "Agency",
  other: "Other",
};

const LABEL_TO_BUSINESS_TYPE: Record<string, string> = {
  Ecommerce: "ecommerce",
  Infopreneur: "infopreneur",
  Agency: "agency",
  Other: "other",
};

export function SettingsView({ onProfileUpdate, isMobile }: { onProfileUpdate?: () => void; isMobile?: boolean }) {
  const lang = useLang();
  const [tab, setTab] = useState<SettingsTab>("general");
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: lang === "fr" ? "Général" : "General" },
    { id: "profile", label: lang === "fr" ? "Profil" : "Profile" },
    { id: "team", label: lang === "fr" ? "Équipe" : "Team" },
    { id: "billing", label: lang === "fr" ? "Facturation" : "Billing" },
    { id: "notifications", label: lang === "fr" ? "Notifications" : "Notifications" },
    { id: "security", label: lang === "fr" ? "Sécurité" : "Security" },
    { id: "api", label: lang === "fr" ? "API" : "API" },
  ];
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }
      setUser(authUser);
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username, avatar_url, business_name, business_type, niche, shopify_store_url")
        .eq("id", authUser.id)
        .maybeSingle();
      if (data) {
        const avatar_url = await resolveAvatarUrl(supabase, authUser.id, data.avatar_url);
        setProfile({ ...data, avatar_url });
      }
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <div style={{ padding: isMobile ? "16px" : "32px 40px 0 40px", paddingTop: isMobile ? 56 : undefined, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 20 }}>{lang === "fr" ? "Paramètres" : "Settings"}</h1>
        <div style={{ display: "flex", gap: 28, overflowX: isMobile ? "auto" : undefined, flexWrap: isMobile ? "nowrap" : undefined }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: "none",
                border: "none",
                padding: "12px 0",
                fontSize: 14,
                fontFamily: "inherit",
                color: tab === t.id ? "#1A1A1A" : "#7A7A7A",
                fontWeight: tab === t.id ? 500 : 400,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
                marginBottom: -1,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px" }}>
        {loading ? (
          <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Loading settings...</p>
        ) : (
          <>
            {tab === "general" && user && profile && (
              <GeneralSettings
                userId={user.id}
                businessName={profile.business_name ?? ""}
                shopifyStoreUrl={profile.shopify_store_url ?? ""}
                businessType={profile.business_type}
                niche={profile.niche ?? ""}
                onSaved={(patch) => {
                  setProfile((p) => (p ? { ...p, ...patch } : p));
                  onProfileUpdate?.();
                }}
              />
            )}
            {tab === "profile" && user && profile && (
              <ProfileSettings
                userId={user.id}
                email={user.email ?? ""}
                fullName={profile.full_name ?? ""}
                username={profile.username ?? ""}
                avatarUrl={profile.avatar_url}
                onSaved={(patch) => {
                  setProfile((p) => (p ? { ...p, ...patch } : p));
                  onProfileUpdate?.();
                }}
              />
            )}
            {tab === "team" && user && (
              <TeamSettings
                isMobile={isMobile}
                userId={user.id}
                email={user.email ?? ""}
                fullName={profile?.full_name ?? ""}
                username={profile?.username ?? ""}
                avatarUrl={profile?.avatar_url ?? null}
              />
            )}
            {tab === "billing" && <BillingSettings isMobile={isMobile} />}
            {tab === "notifications" && <NotificationsSettings />}
            {tab === "security" && <SecuritySettings twoFa={twoFa} setTwoFa={setTwoFa} onDeleteAccount={() => setDeleteModalOpen(true)} />}
            {tab === "api" && <ApiSettings />}
          </>
        )}
      </div>

      {deleteModalOpen && (
        <DeleteAccountModal onCancel={() => setDeleteModalOpen(false)} onConfirm={() => setDeleteModalOpen(false)} />
      )}
    </>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      {title && <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 18px 0" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function SegmentedToggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "#F5F5F5", borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: value === opt ? 500 : 400,
            cursor: "pointer",
            background: value === opt ? "#FFFFFF" : "transparent",
            color: value === opt ? "#1A1A1A" : "#7A7A7A",
            boxShadow: value === opt ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            letterSpacing: "-0.02em",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SettingsToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      style={{
        position: "relative",
        width: 40,
        height: 22,
        background: on ? "#0047FF" : "#E5E5E5",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          background: "#FFFFFF",
          borderRadius: "50%",
          transition: "left 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        }}
      />
    </button>
  );
}

function StatusBadge({ lang, status }: { lang: Lang; status: "Paid" | "Failed" | "Pending" }) {
  const styles: Record<string, { bg: string; color: string }> = {
    Paid: { bg: "#E8F5E9", color: "#2E7D32" },
    Failed: { bg: "#FFEBEE", color: "#C62828" },
    Pending: { bg: "#FFF8E1", color: "#F57F17" },
  };
  const s = styles[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color, letterSpacing: "-0.01em" }}>
      {invoiceStatusLabel(status, lang)}
    </span>
  );
}

function GeneralSettings({
  userId,
  businessName: initialBusinessName,
  shopifyStoreUrl: initialShopifyUrl,
  businessType: initialBusinessType,
  niche: initialNiche,
  onSaved,
}: {
  userId: string;
  businessName: string;
  shopifyStoreUrl: string;
  businessType: string | null;
  niche: string;
  onSaved: (patch: Partial<ProfileRow>) => void;
}) {
  const lang = useLang();
  const [currency, setCurrency] = useState("EUR");
  const [storeName, setStoreName] = useState(initialBusinessName);
  const [websiteUrl, setWebsiteUrl] = useState(initialShopifyUrl);
  const [niche, setNiche] = useState(initialNiche);
  const [businessType, setBusinessType] = useState(
    (initialBusinessType && BUSINESS_TYPE_LABELS[initialBusinessType]) || "Ecommerce"
  );
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const router = useRouter();

  useEffect(() => {
    setStoreName(initialBusinessName);
    setWebsiteUrl(initialShopifyUrl);
    setNiche(initialNiche);
    setBusinessType((initialBusinessType && BUSINESS_TYPE_LABELS[initialBusinessType]) || "Ecommerce");
  }, [initialBusinessName, initialShopifyUrl, initialNiche, initialBusinessType]);

  const disconnectAccount = async () => {
    if (!supabase) return;
    setSigningOut(true);
  await supabase.auth.signOut({ scope: "global" });
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = "/auth";
  };

  const save = async () => {
    if (!supabase) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        business_name: storeName.trim(),
        shopify_store_url: websiteUrl.trim() || null,
        business_type: LABEL_TO_BUSINESS_TYPE[businessType] ?? "other",
        niche: niche.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setMessage({ text: error.message, type: "error" });
      return;
    }
    onSaved({
      business_name: storeName.trim(),
      shopify_store_url: websiteUrl.trim() || null,
      business_type: LABEL_TO_BUSINESS_TYPE[businessType] ?? "other",
      niche: niche.trim(),
    });
    setMessage({ text: "Changes saved successfully.", type: "success" });
  };

  return (
    <Card>
      <Field label={lang === "fr" ? "Nom de la boutique" : "Store name"}>
        <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Acme Co." style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "URL de la boutique Shopify" : "Shopify store URL"}>
        <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="yourstore.myshopify.com" style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Votre niche" : "Your niche"}>
        <input type="text" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Fashion, fitness, beauty..." style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Type d'activité" : "Business type"}>
        <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={inputStyle}>
          <option value="Ecommerce">{businessTypeLabel("Ecommerce", lang)}</option>
          <option value="Infopreneur">{businessTypeLabel("Infopreneur", lang)}</option>
          <option value="Agency">{businessTypeLabel("Agency", lang)}</option>
          <option value="Other">{businessTypeLabel("Other", lang)}</option>
        </select>
      </Field>
      <Field label={lang === "fr" ? "Devise par défaut" : "Default currency"}>
        <SegmentedToggle options={["EUR", "USD"]} value={currency} onChange={setCurrency} />
      </Field>
      <Field label={lang === "fr" ? "Langue par défaut" : "Default language"}>
        <SegmentedToggle
          options={["EN", "FR"]}
          value={lang === "fr" ? "FR" : "EN"}
          onChange={(v) => {
            const next = v === "FR" ? "fr" : "en";
            if (next === lang) return;
            localStorage.setItem("trackit_lang", next);
            window.location.reload();
          }}
        />
      </Field>
      <Field label={lang === "fr" ? "Fuseau horaire" : "Timezone"}>
        <select defaultValue="Europe/Paris" style={inputStyle}>
          <option>Europe/Paris (GMT+1)</option>
          <option>America/New_York (GMT-5)</option>
          <option>America/Los_Angeles (GMT-8)</option>
          <option>UTC</option>
        </select>
      </Field>
      {message && (
        <p style={{ fontSize: 13, color: message.type === "error" ? "#DC2626" : "#2E7D32", margin: "0 0 12px 0" }}>{message.text}</p>
      )}
      <button type="button" onClick={() => void save()} disabled={saving || signingOut} style={{ ...btnPrimary, marginTop: 8, opacity: saving || signingOut ? 0.7 : 1 }}>
        {saving ? "Saving..." : lang === "fr" ? "Sauvegarder" : "Save changes"}
      </button>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #EFEFEF" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>{lang === "fr" ? "Compte" : "Account"}</div>
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 14px 0", lineHeight: 1.45 }}>
          {lang === "fr" ? "Déconnectez-vous et dissociez cet appareil de votre compte Trackit." : "Sign out and disconnect this device from your Trackit account."}
        </p>
        <button
          type="button"
          onClick={() => void disconnectAccount()}
          disabled={signingOut}
          style={{
            ...btnSecondary,
            color: "#DC2626",
            borderColor: "rgba(220, 38, 38, 0.35)",
            opacity: signingOut ? 0.6 : 1,
          }}
        >
          {signingOut ? "Disconnecting..." : lang === "fr" ? "Déconnecter" : "Disconnect"}
        </button>
      </div>
    </Card>
  );
}

function ProfileSettings({
  userId,
  email,
  fullName: initialFullName,
  username: initialUsername,
  avatarUrl: initialAvatarUrl,
  onSaved,
}: {
  userId: string;
  email: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  onSaved: (patch: Partial<ProfileRow>) => void;
}) {
  const lang = useLang();
  const [fullName, setFullName] = useState(initialFullName);
  const [username, setUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const avatarFileRef = useRef(avatarFile);
  useEffect(() => { avatarFileRef.current = avatarFile; }, [avatarFile]);

  useEffect(() => {
    setFullName(initialFullName);
    setUsername(initialUsername);
    setAvatarUrl(initialAvatarUrl);
  }, [initialFullName, initialUsername, initialAvatarUrl]);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 2 * 1024 * 1024) {
      setMessage({ text: "Image must be under 2MB", type: "error" });
      return;
    }
    setMessage(null);
    setAvatarFile(f);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const save = async () => {
    if (!supabase) return;
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername && !/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setMessage({ text: "Username must be 3–20 characters (letters, numbers, underscores).", type: "error" });
      return;
    }
    setSaving(true);
    setMessage(null);

    let newAvatarUrl = avatarUrl;
    const file = avatarFileRef.current;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        setSaving(false);
        setMessage({ text: uploadError.message, type: "error" });
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      newAvatarUrl = pub.publicUrl + "?t=" + Date.now();
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        username: trimmedUsername,
        avatar_url: newAvatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    setSaving(false);
    if (error) {
      setMessage({ text: error.message, type: "error" });
      return;
    }

    const resolved = newAvatarUrl && supabase
      ? await resolveAvatarUrl(supabase, userId, newAvatarUrl)
      : newAvatarUrl;

    setAvatarUrl(resolved);
    setAvatarFile(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    }
    onSaved({
      full_name: fullName.trim(),
      username: trimmedUsername,
      avatar_url: resolved,
    });
    setMessage({ text: "Changes saved successfully.", type: "success" });
  };

  const displayAvatar = avatarPreview ?? avatarUrl;
  const initial = (fullName[0] || username[0] || "?").toUpperCase();

  return (
    <Card>
      <Field label={lang === "fr" ? "Photo de profil" : "Profile photo"}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E8EEFC", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {displayAvatar ? (
              <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 600, color: "#0047FF" }}>{initial}</span>
            )}
          </div>
          <label style={{ cursor: "pointer" }}>
            <span style={btnSecondary}>{lang === "fr" ? "Télécharger une photo" : "Upload photo"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
          </label>
        </div>
      </Field>
      <Field label={lang === "fr" ? "Nom complet" : "Full name"}>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
      </Field>
      <Field label={lang === "fr" ? "Email" : "Email"}>
        <input type="email" value={email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
      </Field>
      <Field label={lang === "fr" ? "Nom d'utilisateur" : "Username"}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A", fontSize: 14 }}>@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="yourname"
            style={{ ...inputStyle, paddingLeft: 28 }}
          />
        </div>
      </Field>
      {message && (
        <p style={{ fontSize: 13, color: message.type === "error" ? "#DC2626" : "#2E7D32", margin: "0 0 12px 0" }}>{message.text}</p>
      )}
      <button type="button" onClick={() => void save()} disabled={saving} style={{ ...btnPrimary, marginTop: 8, opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving..." : lang === "fr" ? "Sauvegarder" : "Save changes"}
      </button>
    </Card>
  );
}


function BillingSettings({ isMobile }: { isMobile?: boolean }) {
  const lang = useLang();
  const [loading, setLoading] = useState<"growth" | "pro" | "scale" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("free");
  const [planLoading, setPlanLoading] = useState(true);
  const [invoices, setInvoices] = useState<
    {
      id: string;
      created: number;
      amount: number;
      currency: string;
      status: "Paid" | "Failed" | "Pending";
      pdfUrl: string | null;
    }[]
  >([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [nextBillingDate, setNextBillingDate] = useState<number | null>(null);

  const currency = lang === "fr" ? "eur" : "usd";

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/billing/plan", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { plan?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load plan");
        if (!cancelled) setCurrentPlan(normalizePlan(data.plan));
      })
      .catch(() => {
        if (!cancelled) {
          const client = supabase;
          if (!client) return;
          void client.auth.getUser().then(async ({ data: { user } }) => {
            if (!user || cancelled) return;
            const { data } = await client
              .from("profiles")
              .select("plan")
              .eq("id", user.id)
              .maybeSingle();
            if (!cancelled) setCurrentPlan(normalizePlan(data?.plan));
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInvoicesLoading(true);
    setInvoicesError(null);
    void fetch("/api/invoices")
      .then(async (res) => {
        const data = (await res.json()) as {
          invoices?: typeof invoices;
          nextBillingDate?: number | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load invoices");
        if (!cancelled) {
          setInvoices(data.invoices ?? []);
          setNextBillingDate(data.nextBillingDate ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInvoicesError(
            err instanceof Error ? err.message : "Failed to load invoices"
          );
          setInvoices([]);
          setNextBillingDate(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInvoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatInvoiceDate = (unixSeconds: number) =>
    new Date(unixSeconds * 1000).toLocaleDateString(
      lang === "fr" ? "fr-FR" : "en-US",
      { year: "numeric", month: "short", day: "numeric" }
    );

  const isPaidPlan = currentPlan !== "free";

  const openBillingPortal = async () => {
    const client = supabase;
    setPortalLoading(true);
    try {
      if (!client) {
        window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
        return;
      }
      const { data: { user } } = await client.auth.getUser();
      if (!user?.id) {
        window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
        return;
      }
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    } catch (err) {
      console.error("Billing portal error:", err);
      window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    } finally {
      setPortalLoading(false);
    }
  };

  const startCheckout = async (target: "growth" | "pro" | "scale") => {
    setLoading(target);
    try {
      const priceId =
        target === "growth"
          ? getGrowthPriceId(currency)
          : target === "pro"
            ? getProPriceId(currency)
            : getScalePriceId(currency);
      await handleUpgrade(priceId);
    } catch (err) {
      console.error("Checkout error:", err);
      alert(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Card title={lang === "fr" ? "Plan actuel" : "Current plan"}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "#0047FF", background: "#F0F6FF", padding: "4px 10px", borderRadius: 6, marginBottom: 10, letterSpacing: "-0.01em" }}>
              {planLoading
                ? "…"
                : planDisplayName(currentPlan, lang)}
            </span>
            <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", marginBottom: 4 }}>
              {planLoading ? (
                <span style={{ fontSize: 14, fontWeight: 400, color: "#7A7A7A" }}>
                  {lang === "fr" ? "Chargement..." : "Loading..."}
                </span>
              ) : (
                <>
                  {formatCurrency(planMonthlyPrice(currentPlan), lang)}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "#7A7A7A" }}>{lang === "fr" ? "/mois" : "/month"}</span>
                </>
              )}
            </div>
            {!planLoading && isPaidPlan && (
              <>
                <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                  {lang === "fr" ? "Prochaine date de facturation :" : "Next billing date:"}{" "}
                  {invoicesLoading
                    ? lang === "fr"
                      ? "Chargement..."
                      : "Loading..."
                    : nextBillingDate
                      ? formatInvoiceDate(nextBillingDate)
                      : lang === "fr"
                        ? "—"
                        : "—"}
                </div>
                <BillingPaymentMethodSummary compact />
              </>
            )}
          </div>
          {!planLoading && currentPlan !== "scale" && (
            <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row", flexWrap: "wrap" }}>
              {currentPlan === "free" && (
                <>
                  <button
                    type="button"
                    onClick={() => void startCheckout("growth")}
                    disabled={loading !== null}
                    style={btnPrimary}
                  >
                    {loading === "growth"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `Growth ${formatCurrency(GROWTH_MONTHLY, lang)}/mo →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCheckout("pro")}
                    disabled={loading !== null}
                    style={{ ...btnPrimary, background: "#1A1A1A" }}
                  >
                    {loading === "pro"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `Pro ${formatCurrency(PRO_MONTHLY, lang)}/mo →`}
                  </button>
                </>
              )}
              {currentPlan === "basic" && (
                <>
                  <button
                    type="button"
                    onClick={() => void startCheckout("pro")}
                    disabled={loading !== null}
                    style={{ ...btnPrimary, background: "#1A1A1A" }}
                  >
                    {loading === "pro"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `Pro ${formatCurrency(PRO_MONTHLY, lang)}/mo →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCheckout("scale")}
                    disabled={loading !== null}
                    style={btnPrimary}
                  >
                    {loading === "scale"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `Scale ${formatCurrency(SCALE_MONTHLY, lang)}/mo →`}
                  </button>
                </>
              )}
              {currentPlan === "pro" && (
                <button
                  type="button"
                  onClick={() => void startCheckout("scale")}
                  disabled={loading !== null}
                  style={btnPrimary}
                >
                  {loading === "scale"
                    ? lang === "fr" ? "Chargement..." : "Loading..."
                    : `Scale ${formatCurrency(SCALE_MONTHLY, lang)}/mo →`}
                </button>
              )}
            </div>
          )}
        </div>
        {!planLoading && isPaidPlan && (
          <button
            type="button"
            onClick={() => void openBillingPortal()}
            disabled={portalLoading}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginTop: 14,
              fontSize: 12,
              color: "#9A9A9A",
              cursor: portalLoading ? "wait" : "pointer",
              fontFamily: "inherit",
              letterSpacing: "-0.01em",
              opacity: portalLoading ? 0.6 : 1,
            }}
          >
            {portalLoading
              ? lang === "fr"
                ? "Ouverture du portail..."
                : "Opening portal..."
              : lang === "fr"
                ? "Annuler l'abonnement"
                : "Cancel subscription"}
          </button>
        )}
      </Card>

      <Card title={lang === "fr" ? "Méthode de paiement" : "Payment method"}>
        <PaymentMethodsBillingSection />
      </Card>

      <Card title={lang === "fr" ? "Historique des factures" : "Invoice history"}>
        {invoicesLoading ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Chargement des factures..." : "Loading invoices..."}
          </p>
        ) : invoicesError ? (
          <p style={{ fontSize: 13, color: "#C62828", margin: 0, letterSpacing: "-0.01em" }}>
            {invoicesError}
          </p>
        ) : invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Aucune facture pour le moment. Elles apparaîtront ici après votre premier paiement."
              : "No invoices yet. They will appear here after your first payment."}
          </p>
        ) : (
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 500 : undefined }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Date" : "Date"}</th>
                  <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Montant" : "Amount"}</th>
                  <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Statut" : "Status"}</th>
                  <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                    <td style={{ padding: "12px 8px", color: "#1A1A1A", letterSpacing: "-0.02em" }}>{formatInvoiceDate(inv.created)}</td>
                    <td style={{ padding: "12px 8px", color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                      {new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
                        style: "currency",
                        currency: inv.currency,
                      }).format(inv.amount)}
                    </td>
                    <td style={{ padding: "12px 8px" }}><StatusBadge lang={lang} status={inv.status} /></td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <button
                        type="button"
                        disabled={!inv.pdfUrl}
                        onClick={() => {
                          if (inv.pdfUrl) window.open(inv.pdfUrl, "_blank", "noopener,noreferrer");
                        }}
                        style={{
                          ...btnSecondary,
                          padding: "6px 12px",
                          fontSize: 12,
                          opacity: inv.pdfUrl ? 1 : 0.45,
                          cursor: inv.pdfUrl ? "pointer" : "not-allowed",
                        }}
                      >
                        {lang === "fr" ? "Télécharger PDF" : "Download PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

const EMAIL_NOTIFS = [
  "New creator replied to outreach",
  "Sale tracked from creator",
  "Commission threshold reached",
  "Follow up reminder",
  "Weekly performance report",
  "New team member joined",
];

function NotificationsSettings() {
  const lang = useLang();
  const [emailToggles, setEmailToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(EMAIL_NOTIFS.map((l, i) => [l, i % 2 === 0]))
  );
  const [pushToggles, setPushToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(EMAIL_NOTIFS.map((l, i) => [l, i % 3 !== 0]))
  );

  return (
    <>
      <Card title={lang === "fr" ? "Notifications email" : "Email notifications"}>
        {EMAIL_NOTIFS.map((label) => (
          <ToggleRow
            key={`email-${label}`}
            label={emailNotifLabel(label, lang)}
            on={emailToggles[label]}
            onToggle={() => setEmailToggles((t) => ({ ...t, [label]: !t[label] }))}
          />
        ))}
      </Card>
      <Card title={lang === "fr" ? "Notifications push" : "Push notifications"}>
        {EMAIL_NOTIFS.map((label) => (
          <ToggleRow
            key={`push-${label}`}
            label={emailNotifLabel(label, lang)}
            on={pushToggles[label]}
            onToggle={() => setPushToggles((t) => ({ ...t, [label]: !t[label] }))}
          />
        ))}
      </Card>
    </>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F5F5F5" }}>
      <span style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", paddingRight: 16 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{on ? "On" : "Off"}</span>
        <SettingsToggle on={on} onToggle={onToggle} />
      </div>
    </div>
  );
}

function TeamSettings({
  isMobile,
  userId,
  email,
  fullName,
  username,
  avatarUrl,
}: {
  isMobile?: boolean;
  userId: string;
  email: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
}) {
  const lang = useLang();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");

  const assignableRoles: TeamRole[] = ["admin", "editor", "viewer", "billing"];
  const teamInvitesEnabled = false;

  useEffect(() => {
    const displayName =
      fullName.trim() ||
      (username.trim() ? `@${username.trim()}` : "") ||
      email.split("@")[0] ||
      (lang === "fr" ? "Vous" : "You");

    setMembers([
      {
        id: userId,
        name: displayName,
        email,
        role: "owner",
        status: "active",
        lastActive: "Active now",
        isYou: true,
        avatarUrl,
      },
    ]);
    setMembersLoading(false);
  }, [userId, email, fullName, username, avatarUrl, lang]);

  const sendInvite = () => {
    if (!teamInvitesEnabled) {
      window.alert(
        lang === "fr"
          ? "Les invitations d'équipe arrivent bientôt."
          : "Team invites are coming soon."
      );
      return;
    }
    const normalized = inviteEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    if (members.some((m) => m.email.toLowerCase() === normalized)) return;
    setInviteEmail("");
  };

  const updateRole = (_id: string, _role: TeamRole) => {};

  const removeMember = (_id: string) => {};

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <>
      <Card title={lang === "fr" ? "Inviter un membre" : "Invite team member"}>
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>
          {lang === "fr" ? "Ajoutez des collègues à votre espace de travail. Ils recevront une invitation par email." : "Add colleagues to your workspace. They will receive an email invite to join."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <Field label={lang === "fr" ? "Adresse email" : "Email address"}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                style={inputStyle}
                disabled={!teamInvitesEnabled}
              />
            </Field>
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <Field label={lang === "fr" ? "Rôle" : "Role"}>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                style={inputStyle}
                disabled={!teamInvitesEnabled}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>{roleLabel(r, lang)}</option>
                ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            style={{ ...btnPrimary, marginBottom: 16, opacity: teamInvitesEnabled ? 1 : 0.5 }}
            disabled={!teamInvitesEnabled}
            onClick={sendInvite}
          >
            {lang === "fr" ? "Envoyer l'invitation" : "Send invite"}
          </button>
        </div>
        {!teamInvitesEnabled && (
          <p style={{ fontSize: 12, color: "#9A9A9A", margin: "8px 0 0", letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Les invitations d'équipe seront disponibles prochainement."
              : "Team invites will be available soon."}
          </p>
        )}
      </Card>

      <Card
        title={
          lang === "fr"
            ? `Membres de l'équipe (${activeCount} ${activeCount === 1 ? "actif" : "actifs"}${pendingCount ? `, ${pendingCount} en attente` : ""})`
            : `Team members (${activeCount} active${pendingCount ? `, ${pendingCount} pending` : ""})`
        }
      >
        {membersLoading ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Chargement de l'équipe..." : "Loading team..."}
          </p>
        ) : (
        <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 600 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                {[
                  lang === "fr" ? "Membre" : "Member",
                  lang === "fr" ? "Rôle" : "Role",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Dernière activité" : "Last active",
                  "",
                ].map((h) => (
                  <th key={h || "actions"} style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "14px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: m.avatarUrl ? "#EFEFEF" : m.isYou ? "#0047FF" : "#EFEFEF",
                          color: m.isYou && !m.avatarUrl ? "#FFF" : "#7A7A7A",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : m.name !== "—" ? (
                          m.name.charAt(0).toUpperCase()
                        ) : (
                          "?"
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>
                          {m.isYou ? "You" : m.name}
                          {m.isYou && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "#9A9A9A", fontWeight: 400 }}>({lang === "fr" ? "propriétaire du compte" : "account owner"})</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#9A9A9A" }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 8px" }}>
                    {m.isYou || m.role === "owner" ? (
                      <RoleBadge lang={lang} role={m.role} />
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => updateRole(m.id, e.target.value as TeamRole)}
                        style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, minWidth: 110 }}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>{roleLabel(r, lang)}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "14px 8px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: m.status === "active" ? "#E8F5E9" : "#FFF8E1",
                        color: m.status === "active" ? "#2E7D32" : "#F57F17",
                      }}
                    >
                      {m.status === "active" ? (lang === "fr" ? "Actif" : "Active") : lang === "fr" ? "Invitation en attente" : "Pending invite"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 8px", color: "#7A7A7A", fontSize: 12 }}>{formatLastActive(m.lastActive, lang)}</td>
                  <td style={{ padding: "14px 8px", textAlign: "right" }}>
                    {!m.isYou && m.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}
                      >
                        {m.status === "pending" ? (lang === "fr" ? "Annuler l'invitation" : "Cancel invite") : lang === "fr" ? "Supprimer" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Card title={lang === "fr" ? "Permissions des rôles" : "Role permissions"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(["owner", "admin", "editor", "viewer", "billing"] as TeamRole[]).map((role) => (
            <div key={role} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <RoleBadge lang={lang} role={role} />
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45, paddingTop: 2 }}>
                {roleDescription(role, lang)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function RoleBadge({ lang, role }: { lang: Lang; role: TeamRole }) {
  const styles: Record<TeamRole, { bg: string; color: string }> = {
    owner: { bg: "#1A1A1A", color: "#FFFFFF" },
    admin: { bg: "#F0F6FF", color: "#0047FF" },
    editor: { bg: "#E8F5E9", color: "#2E7D32" },
    viewer: { bg: "#F5F5F5", color: "#7A7A7A" },
    billing: { bg: "#FFF8E1", color: "#F57F17" },
  };
  const s = styles[role];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 6,
        background: s.bg,
        color: s.color,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {roleLabel(role, lang)}
    </span>
  );
}

function SecuritySettings({ twoFa, setTwoFa, onDeleteAccount }: { twoFa: boolean; setTwoFa: (v: boolean) => void; onDeleteAccount: () => void }) {
  const lang = useLang();
  const [sessions, setSessions] = useState<UserSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const sessionKey = getOrCreateSessionKey();
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      await recordLoginIp();
      const res = await fetch("/api/auth/sessions", {
        credentials: "include",
        headers: sessionKey ? { "X-Trackit-Session-Key": sessionKey } : {},
      });
      const data = (await res.json()) as {
        sessions?: UserSessionRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load sessions");
      setSessions(data.sessions ?? []);
    } catch (err) {
      setSessionsError(
        err instanceof Error ? err.message : "Failed to load sessions"
      );
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const revokeSession = async (sessionKey: string, isCurrent: boolean) => {
    setRevokingKey(sessionKey);
    try {
      const res = await fetch("/api/auth/sessions", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Trackit-Session-Key": getOrCreateSessionKey(),
        },
        body: JSON.stringify({ sessionKey }),
      });
      const data = (await res.json()) as { signOut?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not revoke session");
      if (data.signOut || isCurrent) {
        if (supabase) await supabase.auth.signOut();
        window.location.href = "/auth";
        return;
      }
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not revoke session");
    } finally {
      setRevokingKey(null);
    }
  };

  const revokeAllOthers = async () => {
    setRevokingKey("__all__");
    try {
      const res = await fetch("/api/auth/sessions", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Trackit-Session-Key": getOrCreateSessionKey(),
        },
        body: JSON.stringify({ revokeOthers: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not revoke sessions");
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not revoke sessions");
    } finally {
      setRevokingKey(null);
    }
  };

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <>
      <Card title={lang === "fr" ? "Changer le mot de passe" : "Change password"}>
        <Field label={lang === "fr" ? "Mot de passe actuel" : "Current password"}><input type="password" style={inputStyle} /></Field>
        <Field label={lang === "fr" ? "Nouveau mot de passe" : "New password"}><input type="password" style={inputStyle} /></Field>
        <Field label={lang === "fr" ? "Confirmer le nouveau mot de passe" : "Confirm new password"}><input type="password" style={inputStyle} /></Field>
        <button type="button" style={btnPrimary}>{lang === "fr" ? "Sauvegarder" : "Save"}</button>
      </Card>

      <Card title={lang === "fr" ? "Authentification à deux facteurs" : "Two factor authentication"}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: twoFa ? 20 : 0 }}>
          <div>
            <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{lang === "fr" ? "Activer 2FA" : "Enable 2FA"}</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Ajoutez une couche de sécurité supplémentaire à votre compte" : "Add an extra layer of security to your account"}</div>
          </div>
          <SettingsToggle on={twoFa} onToggle={() => setTwoFa(!twoFa)} />
        </div>
        {twoFa && (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", padding: 20, background: "#FAFAFA", borderRadius: 12, border: "1px solid #EFEFEF" }}>
            <div style={{ width: 120, height: 120, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="80" height="80" viewBox="0 0 100 100"><rect fill="#1A1A1A" width="20" height="20" x="10" y="10"/><rect fill="#1A1A1A" width="20" height="20" x="40" y="10"/><rect fill="#1A1A1A" width="20" height="20" x="70" y="10"/><rect fill="#1A1A1A" width="20" height="20" x="10" y="40"/><rect fill="#FFFFFF" width="20" height="20" x="40" y="40"/><rect fill="#1A1A1A" width="20" height="20" x="70" y="40"/><rect fill="#1A1A1A" width="20" height="20" x="10" y="70"/><rect fill="#1A1A1A" width="20" height="20" x="40" y="70"/><rect fill="#1A1A1A" width="20" height="20" x="70" y="70"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 8 }}>Scan with your authenticator app</div>
              <input type="text" placeholder="Enter 6-digit code" style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
          </div>
        )}
      </Card>

      <Card title={lang === "fr" ? "Sessions actives" : "Active sessions"}>
        {sessionsLoading ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>
            {lang === "fr" ? "Chargement des sessions..." : "Loading sessions..."}
          </p>
        ) : sessionsError ? (
          <p style={{ fontSize: 13, color: "#C62828", margin: 0 }}>{sessionsError}</p>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>
            {lang === "fr"
              ? "Aucune session enregistrée. Reconnectez-vous pour voir cet appareil ici."
              : "No sessions recorded yet. Sign in again to see this device here."}
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0",
                borderBottom: "1px solid #F5F5F5",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                  {s.device}
                  {s.isCurrent && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#0047FF", fontWeight: 600 }}>
                      {lang === "fr" ? "Cet appareil" : "This device"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                  {s.location} · {formatLastActiveFromDate(s.lastActiveAt, lang)}
                </div>
              </div>
              <button
                type="button"
                disabled={revokingKey === s.sessionKey}
                onClick={() => void revokeSession(s.sessionKey, s.isCurrent)}
                style={{
                  ...btnSecondary,
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: revokingKey === s.sessionKey ? 0.6 : 1,
                }}
              >
                {revokingKey === s.sessionKey
                  ? lang === "fr"
                    ? "..."
                    : "..."
                  : lang === "fr"
                    ? "Révoquer"
                    : "Revoke"}
              </button>
            </div>
          ))
        )}
        {otherSessionsCount > 0 && (
          <button
            type="button"
            disabled={revokingKey === "__all__"}
            onClick={() => void revokeAllOthers()}
            style={{
              ...btnSecondary,
              marginTop: 16,
              width: "100%",
              opacity: revokingKey === "__all__" ? 0.6 : 1,
            }}
          >
            {revokingKey === "__all__"
              ? lang === "fr"
                ? "Révocation..."
                : "Revoking..."
              : lang === "fr"
                ? "Révoquer toutes les autres sessions"
                : "Revoke all other sessions"}
          </button>
        )}
      </Card>

      <Card title={lang === "fr" ? "Zone dangereuse" : "Danger zone"}>
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>{lang === "fr" ? "Supprimez définitivement votre compte et toutes les données associées. Cette action est irréversible." : "Permanently delete your account and all associated data. This cannot be undone."}</p>
        <button type="button" onClick={onDeleteAccount} style={{ background: "#FFFFFF", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Supprimer le compte" : "Delete account"}</button>
      </Card>
    </>
  );
}

function ApiSettings() {
  const lang = useLang();
  const [webhooks, setWebhooks] = useState(["https://api.mystore.com/webhooks/trackit"]);
  const [webhookInput, setWebhookInput] = useState("");
  const apiCalls = 2847;
  const apiLimit = 10000;

  return (
    <>
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 18px 0", display: "flex", alignItems: "center" }}>
          {lang === "fr" ? "Votre clé API" : "Your API key"}
          <span style={{ fontSize: 11, fontWeight: 600, background: "#F0F4FF", color: "#0047FF", padding: "2px 8px", borderRadius: 20, marginLeft: 8, letterSpacing: "0.02em" }}>
            {lang === "fr" ? "Bientôt disponible" : "Coming soon"}
          </span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <code style={{ flex: 1, minWidth: 200, padding: "12px 14px", background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 10, fontSize: 13, color: "#1A1A1A", letterSpacing: "0.02em" }}>tr_live_••••••••••••••••4f2a</code>
          <button type="button" style={btnSecondary} onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}>{lang === "fr" ? "Copier la clé" : "Copy key"}</button>
          <button type="button" style={btnSecondary} onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}>{lang === "fr" ? "Régénérer la clé" : "Regenerate key"}</button>
        </div>
        <p style={{ fontSize: 12, color: "#C45C00", margin: 0, letterSpacing: "-0.01em" }}>{lang === "fr" ? "La régénération cassera les intégrations existantes" : "Regenerating will break existing integrations"}</p>
      </Card>

      <Card>
        <a href="#" onClick={(e) => { e.preventDefault(); alert(lang === "fr" ? "Bientôt disponible" : "Coming soon"); }} style={{ fontSize: 14, fontWeight: 500, color: "#0047FF", textDecoration: "none", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Voir la doc API →" : "View API docs →"}</a>
      </Card>

      <Card title={lang === "fr" ? "URL Webhook" : "Webhook URL"}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input type="url" value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)} placeholder="https://your-app.com/webhook" style={{ ...inputStyle, flex: 1 }} />
          <button
            type="button"
            style={btnPrimary}
            onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")}
          >
            {lang === "fr" ? "Ajouter un endpoint webhook" : "Add webhook endpoint"}
          </button>
        </div>
        {webhooks.map((url) => (
          <div key={url} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F5F5F5", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>{url}</span>
            <button type="button" onClick={() => alert(lang === "fr" ? "Bientôt disponible" : "Coming soon")} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}>Delete</button>
          </div>
        ))}
      </Card>

      <Card title={lang === "fr" ? "Utilisation ce mois" : "Usage this month"}>
        <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 10 }}>
          API calls made: <strong>{apiCalls.toLocaleString()}</strong> / {apiLimit.toLocaleString()}
        </div>
        <div style={{ height: 8, background: "#EFEFEF", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${(apiCalls / apiLimit) * 100}%`, height: "100%", background: "#0047FF", borderRadius: 999 }} />
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); alert(lang === "fr" ? "Bientôt disponible" : "Coming soon"); }} style={{ fontSize: 13, fontWeight: 500, color: "#0047FF", textDecoration: "none", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Passer à Pro pour des appels API illimités →" : "Upgrade for unlimited API calls →"}</a>
      </Card>
    </>
  );
}

function DeleteAccountModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 420, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>Delete account?</h3>
        <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: "0 0 24px 0", lineHeight: 1.5 }}>This will permanently delete your account, stores, creators, and billing history. Type DELETE to confirm.</p>
        <input type="text" placeholder="DELETE" style={{ ...inputStyle, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{ ...btnPrimary, background: "#DC2626" }}>Delete account</button>
        </div>
      </div>
    </div>
  );
}
