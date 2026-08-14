"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BillingPaymentMethodSummary, PaymentMethodsBillingSection } from "./PayoutsView";
import type { User } from "@supabase/supabase-js";
import { useLang, type Lang } from "@/lib/useLang";
import {
  applyAppLocale,
  clearUserSessionStorage,
  dispatchProfileUpdated,
  getAppTimezone,
  setAppTimezone,
  PROFILE_UPDATED_EVENT,
  type AppTimezone,
  type ProfileUpdatedDetail,
} from "@/lib/locale-preferences";
import { patchDashboardBootstrap } from "@/lib/dashboard-bootstrap-cache";
import { renameCachedAvatarUrl, setCachedAvatarUrl } from "@/lib/avatar-url-cache";
import { resolveAvatarUrl, toPersistableAvatarUrl } from "@/lib/resolve-avatar-url";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  NOTIFICATION_PREF_KEYS,
  type NotificationPreferences,
  type NotificationPrefKey,
} from "@/lib/notification-preferences";
import { useDisplayCurrency } from "@/lib/useCurrency";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import {
  fetchProfileUsernameAvailability,
  isValidProfileUsername,
  normalizeProfileUsername,
  profileUsernameInvalidMessage,
  profileUsernameStatusColor,
  profileUsernameStatusMessage,
  profileUsernameTakenMessage,
  type ProfileUsernameStatus,
} from "@/lib/profile-username";
import { PLAN_PRICES, planDisplayName, formatPricingAmount, checkoutCurrencyFromLang, annualFreeMonthsBadge } from "@/lib/plan-marketing";
import type { BillingInterval } from "@/lib/stripe-billing";
import { STRIPE_BILLING_PORTAL_LOGIN_URL } from "@/lib/open-billing-portal";

const GROWTH_MONTHLY = PLAN_PRICES.growthMonthly;
const PRO_MONTHLY = PLAN_PRICES.proMonthly;
const SCALE_MONTHLY = PLAN_PRICES.scaleMonthly;

function planMonthlyPrice(plan: PlanTier): number {
  if (plan === "scale") return SCALE_MONTHLY;
  if (plan === "pro") return PRO_MONTHLY;
  if (plan === "basic") return GROWTH_MONTHLY;
  return 0;
}

type SettingsTab = "general" | "profile" | "team" | "billing" | "notifications" | "security";

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

function emailNotifLabel(key: NotificationPrefKey, lang: Lang): string {
  const map: Record<NotificationPrefKey, { en: string; fr: string }> = {
    outreach_reply: { en: "New creator replied to outreach", fr: "Un créateur a répondu à votre message" },
    sale_tracked: { en: "Sale tracked from creator", fr: "Vente suivie depuis un créateur" },
    commission_threshold: { en: "Commission threshold reached", fr: "Seuil de commission atteint" },
    follow_up_reminder: { en: "Follow up reminder", fr: "Rappel de relance" },
    weekly_report: { en: "Weekly performance report", fr: "Rapport de performance hebdomadaire" },
    team_joined: { en: "New team member joined", fr: "Nouveau membre a rejoint l'équipe" },
  };
  return lang === "fr" ? map[key].fr : map[key].en;
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
  background: "var(--ws-input)",
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

export function SettingsView({
  onProfileUpdate,
  isMobile,
  actorUserId,
  actorEmail,
}: {
  onProfileUpdate?: () => void;
  isMobile?: boolean;
  actorUserId: string;
  actorEmail?: string | null;
}) {
  useDisplayCurrency();
  const lang = useLang();
  const [tab, setTab] = useState<SettingsTab>("general");
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: lang === "fr" ? "Général" : "General" },
    { id: "profile", label: lang === "fr" ? "Profil" : "Profile" },
    { id: "notifications", label: lang === "fr" ? "Notifications" : "Notifications" },
    { id: "security", label: lang === "fr" ? "Sécurité" : "Security" },
  ];
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const reloadProfile = async () => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) return;
    const actorUser = {
      ...authUser,
      id: actorUserId,
      email: actorEmail ?? authUser.email,
    } as User;
    setUser(actorUser);
    const { data } = await supabase
      .from("profiles")
      .select("full_name, username, avatar_url, business_name, business_type, niche, shopify_store_url")
      .eq("id", actorUserId)
      .maybeSingle();
    if (data) {
      // Keep the DB URL as source of truth — never overwrite with a short-lived signed URL.
      setProfile({ ...data });
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void (async () => {
      await reloadProfile();
      setLoading(false);
    })();
  }, [actorUserId, actorEmail]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      if (detail) {
        setProfile((prev) => prev ? {
          ...prev,
          ...(detail.full_name !== undefined ? { full_name: detail.full_name } : {}),
          ...(detail.username !== undefined ? { username: detail.username } : {}),
          ...(detail.avatar_url !== undefined ? { avatar_url: detail.avatar_url } : {}),
        } : prev);
      }
      void reloadProfile();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [actorUserId, actorEmail]);

  return (
    <>
      <div style={{ padding: isMobile ? "16px" : "32px 40px 0 40px", paddingTop: isMobile ? 56 : undefined, borderBottom: "1px solid var(--ws-border)", background: "var(--ws-bg)" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", margin: 0, marginBottom: 20 }}>{lang === "fr" ? "Paramètres" : "Settings"}</h1>
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
                color: tab === t.id ? "var(--ws-text)" : "var(--ws-text-muted)",
                fontWeight: tab === t.id ? 500 : 400,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                borderBottom: tab === t.id ? "2px solid var(--ws-btn)" : "2px solid transparent",
                marginBottom: -1,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px", background: "var(--ws-bg)", minHeight: "100%", color: "var(--ws-text)" }}>
        {loading ? (
          <p style={{ fontSize: 14, color: "var(--ws-text-muted)", letterSpacing: "-0.01em" }}>Loading settings...</p>
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
            {tab === "notifications" && user && <NotificationsSettings userId={user.id} />}
            {tab === "security" && <SecuritySettings onDeleteAccount={() => setDeleteModalOpen(true)} />}
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
    <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      {title && <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", margin: "0 0 18px 0" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--ws-text-dim)", letterSpacing: "-0.01em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function SegmentedToggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--ws-bg)", borderRadius: 10, padding: 3, gap: 2 }}>
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
            background: value === opt ? "var(--ws-surface)" : "transparent",
            color: value === opt ? "var(--ws-text)" : "var(--ws-text-muted)",
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
        background: on ? "var(--ws-accent)" : "var(--ws-border)",
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
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text)", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
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
  const [storeName, setStoreName] = useState(initialBusinessName);
  const [websiteUrl, setWebsiteUrl] = useState(initialShopifyUrl);
  const [niche, setNiche] = useState(initialNiche);
  const [businessType, setBusinessType] = useState(
    (initialBusinessType && BUSINESS_TYPE_LABELS[initialBusinessType]) || "Ecommerce"
  );
  const [timezone, setTimezone] = useState<AppTimezone>(() => getAppTimezone());
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
    clearUserSessionStorage();
    window.location.href = "/auth";
  };

  const persistGeneral = async () => {
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
    // Keep the active brand-workspace name in sync with Settings.
    try {
      const spacesRes = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
      const spacesData = (await spacesRes.json()) as { ok?: boolean; activeWorkspaceId?: string };
      if (spacesRes.ok && spacesData.ok && spacesData.activeWorkspaceId) {
        await fetch(`/api/workspaces/${spacesData.activeWorkspaceId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: storeName.trim() }),
        });
      }
    } catch {
      /* non-blocking */
    }
    setAppTimezone(timezone);
    onSaved({
      business_name: storeName.trim(),
      shopify_store_url: websiteUrl.trim() || null,
      business_type: LABEL_TO_BUSINESS_TYPE[businessType] ?? "other",
      niche: niche.trim(),
    });
    patchDashboardBootstrap(userId, { business_name: storeName.trim() });
    setMessage({
      text: lang === "fr" ? "Modifications enregistrées." : "Changes saved successfully.",
      type: "success",
    });
  };

  const save = async () => {
    const storeChanged = storeName.trim() !== initialBusinessName.trim();
    if (storeChanged) {
      const ok = window.confirm(
        lang === "fr"
          ? "Êtes-vous sûr de vouloir renommer ce workspace ?"
          : "Are you sure you want to rename this workspace?"
      );
      if (!ok) return;
    }
    await persistGeneral();
  };

  return (
    <Card>
      <Field label={lang === "fr" ? "Nom du workspace" : "Workspace name"}>
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder={lang === "fr" ? "Mon workspace" : "My workspace"}
          style={inputStyle}
        />
      </Field>
      <p style={{ margin: "-4px 0 14px", fontSize: 12, color: "var(--ws-text-muted)", lineHeight: 1.45 }}>
        {lang === "fr"
          ? "Ce nom apparaît en haut du dashboard (comme un espace ClickUp)."
          : "This name appears at the top of the dashboard (like a ClickUp space)."}
      </p>
      <Field label={lang === "fr" ? "Langue par défaut" : "Default language"}>
        <SegmentedToggle
          options={["EN", "FR"]}
          value={lang === "fr" ? "FR" : "EN"}
          onChange={(v) => {
            const next = v === "FR" ? "fr" : "en";
            if (next === lang) return;
            applyAppLocale(next);
            window.location.reload();
          }}
        />
      </Field>
      <Field label={lang === "fr" ? "Fuseau horaire" : "Timezone"}>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value as AppTimezone)}
          style={inputStyle}
        >
          <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
          <option value="America/New_York">America/New_York (GMT-5)</option>
          <option value="America/Los_Angeles">America/Los_Angeles (GMT-8)</option>
          <option value="UTC">UTC</option>
        </select>
      </Field>
      {message && (
        <p style={{ fontSize: 13, color: message.type === "error" ? "#DC2626" : "#2E7D32", margin: "0 0 12px 0" }}>{message.text}</p>
      )}
      <button type="button" onClick={() => void save()} disabled={saving || signingOut} style={{ ...btnPrimary, marginTop: 8, opacity: saving || signingOut ? 0.7 : 1 }}>
        {saving ? (lang === "fr" ? "Enregistrement…" : "Saving...") : lang === "fr" ? "Sauvegarder" : "Save changes"}
      </button>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--ws-border)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 6 }}>{lang === "fr" ? "Compte" : "Account"}</div>
        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 14px 0", lineHeight: 1.45 }}>
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
  /** Stable URL persisted in Supabase (never a signed URL). */
  const [storedAvatarUrl, setStoredAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [displayAvatarUrl, setDisplayAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<ProfileUsernameStatus>("idle");
  const avatarFileRef = useRef(avatarFile);
  useEffect(() => { avatarFileRef.current = avatarFile; }, [avatarFile]);

  useEffect(() => {
    setFullName(initialFullName);
    setUsername(initialUsername);
    setStoredAvatarUrl(initialAvatarUrl);
    setUsernameStatus(initialUsername ? "available" : "idle");
    let cancelled = false;
    void (async () => {
      if (!supabase || !initialAvatarUrl) {
        if (!cancelled) setDisplayAvatarUrl(initialAvatarUrl);
        return;
      }
      const resolved = await resolveAvatarUrl(supabase, userId, initialAvatarUrl);
      if (!cancelled) setDisplayAvatarUrl(resolved ?? initialAvatarUrl);
    })();
    return () => { cancelled = true; };
  }, [initialFullName, initialUsername, initialAvatarUrl, userId]);

  useEffect(() => {
    const normalized = normalizeProfileUsername(username);
    const current = normalizeProfileUsername(initialUsername);

    if (!normalized) {
      setUsernameStatus("idle");
      return;
    }
    if (normalized === current) {
      setUsernameStatus("available");
      return;
    }
    if (!isValidProfileUsername(normalized)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    const timer = setTimeout(() => {
      void fetchProfileUsernameAvailability(normalized).then(setUsernameStatus);
    }, 400);
    return () => clearTimeout(timer);
  }, [username, initialUsername]);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 2 * 1024 * 1024) {
      setMessage({ text: lang === "fr" ? "L'image doit faire moins de 2 Mo" : "Image must be under 2MB", type: "error" });
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
    const trimmedUsername = normalizeProfileUsername(username);
    if (trimmedUsername && !isValidProfileUsername(trimmedUsername)) {
      setMessage({ text: profileUsernameInvalidMessage(lang), type: "error" });
      return;
    }
    if (trimmedUsername && trimmedUsername !== normalizeProfileUsername(initialUsername)) {
      if (usernameStatus === "checking") {
        setMessage({ text: lang === "fr" ? "Vérification du pseudo en cours…" : "Checking username availability…", type: "error" });
        return;
      }
      if (usernameStatus === "taken") {
        setMessage({ text: profileUsernameTakenMessage(lang), type: "error" });
        return;
      }
      if (usernameStatus !== "available") {
        setMessage({ text: profileUsernameInvalidMessage(lang), type: "error" });
        return;
      }
    }
    setSaving(true);
    setMessage(null);

    let persistAvatarUrl =
      toPersistableAvatarUrl(supabase, userId, storedAvatarUrl) ?? storedAvatarUrl;
    const file = avatarFileRef.current;
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
      const path = `${userId}/avatar.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (uploadError) {
        setSaving(false);
        setMessage({ text: uploadError.message, type: "error" });
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      persistAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
    }

    const profileRes = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        full_name: fullName.trim(),
        username: trimmedUsername,
        avatar_url: persistAvatarUrl,
      }),
    });
    const profileData = (await profileRes.json().catch(() => ({}))) as {
      error?: string;
      profile?: { full_name?: string; username?: string; avatar_url?: string | null };
    };

    // Fallback: if cookie auth fails, still persist via the browser session.
    if (!profileRes.ok && profileRes.status === 401) {
      const { error: directErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          username: trimmedUsername || null,
          avatar_url: persistAvatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (directErr) {
        setSaving(false);
        setMessage({ text: directErr.message, type: "error" });
        return;
      }
    } else if (!profileRes.ok) {
      setSaving(false);
      setMessage({
        text: profileRes.status === 409
          ? profileUsernameTakenMessage(lang)
          : (profileData.error || (lang === "fr" ? "Impossible d'enregistrer le profil." : "Could not save profile.")),
        type: "error",
      });
      return;
    }

    setSaving(false);

    const savedUsername = normalizeProfileUsername(profileData.profile?.username ?? trimmedUsername);
    const savedName = profileData.profile?.full_name ?? fullName.trim();
    const savedAvatar =
      toPersistableAvatarUrl(supabase, userId, profileData.profile?.avatar_url ?? persistAvatarUrl) ??
      persistAvatarUrl;

    const displayResolved = savedAvatar
      ? (await resolveAvatarUrl(supabase, userId, savedAvatar)) ?? savedAvatar
      : null;

    const previousUsername = normalizeProfileUsername(initialUsername);
    setFullName(savedName);
    setUsername(savedUsername);
    setStoredAvatarUrl(savedAvatar);
    setDisplayAvatarUrl(displayResolved);
    setAvatarFile(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    }
    if (previousUsername && savedUsername && previousUsername !== savedUsername) {
      renameCachedAvatarUrl(previousUsername, savedUsername, savedAvatar ?? displayResolved);
    } else if (savedUsername && savedAvatar) {
      setCachedAvatarUrl(savedUsername, savedAvatar);
    }
    patchDashboardBootstrap(userId, {
      full_name: savedName,
      username: savedUsername,
      avatar_url: savedAvatar,
    });
    onSaved({
      full_name: savedName,
      username: savedUsername,
      avatar_url: savedAvatar,
    });
    dispatchProfileUpdated({
      full_name: savedName,
      username: savedUsername,
      avatar_url: savedAvatar,
    });
    setMessage({
      text: lang === "fr" ? "Modifications enregistrées." : "Changes saved successfully.",
      type: "success",
    });
  };

  const displayAvatar = avatarPreview ?? displayAvatarUrl;
  const initial = (fullName[0] || username[0] || "?").toUpperCase();

  return (
    <Card>
      <Field label={lang === "fr" ? "Photo de profil" : "Profile photo"}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--ws-accent-soft)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {displayAvatar ? (
              <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 600, color: "var(--ws-accent)" }}>{initial}</span>
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
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ws-text-dim)", fontSize: 14 }}>@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.replace(/^@/, "").toLowerCase());
              setMessage(null);
            }}
            placeholder="yourname"
            style={{ ...inputStyle, paddingLeft: 28 }}
          />
        </div>
        {usernameStatus !== "idle" && (
          <p style={{ fontSize: 13, color: profileUsernameStatusColor(usernameStatus), margin: "8px 0 0" }}>
            {profileUsernameStatusMessage(usernameStatus, lang)}
          </p>
        )}
      </Field>
      {message && (
        <p style={{ fontSize: 13, color: message.type === "error" ? "#DC2626" : "#2E7D32", margin: "0 0 12px 0" }}>{message.text}</p>
      )}
      <button type="button" onClick={() => void save()} disabled={saving} style={{ ...btnPrimary, marginTop: 8, opacity: saving ? 0.7 : 1 }}>
        {saving ? (lang === "fr" ? "Enregistrement…" : "Saving...") : lang === "fr" ? "Sauvegarder" : "Save changes"}
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
  const [annual, setAnnual] = useState(false);
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

  const currency = checkoutCurrencyFromLang(lang);
  const periodShort = lang === "fr" ? "/mois" : "/mo";

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/billing/plan", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { plan?: string; billingInterval?: BillingInterval | null; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load plan");
        if (!cancelled) {
          setCurrentPlan(normalizePlan(data.plan));
          if (data.billingInterval === "year") setAnnual(true);
        }
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
          ? getGrowthPriceId(currency, annual)
          : target === "pro"
            ? getProPriceId(currency, annual)
            : getScalePriceId(currency, annual);
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
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "var(--ws-accent)", background: "var(--ws-accent-soft)", padding: "4px 10px", borderRadius: 6, marginBottom: 10, letterSpacing: "-0.01em" }}>
              {planLoading
                ? "…"
                : planDisplayName(currentPlan, lang)}
            </span>
            <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", marginBottom: 4 }}>
              {planLoading ? (
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ws-text-muted)" }}>
                  {lang === "fr" ? "Chargement..." : "Loading..."}
                </span>
              ) : (
                <>
                  {formatPricingAmount(planMonthlyPrice(currentPlan), lang)}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ws-text-muted)" }}>{lang === "fr" ? "/mois" : "/month"}</span>
                </>
              )}
            </div>
            {!planLoading && isPaidPlan && (
              <>
                <div style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: isMobile ? "stretch" : "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: isMobile ? "center" : "flex-end" }}>
                <span style={{ fontSize: 13, color: annual ? "var(--ws-text-dim)" : "var(--ws-text)", fontWeight: annual ? 400 : 600 }}>
                  {lang === "fr" ? "Mensuel" : "Monthly"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={annual}
                  onClick={() => setAnnual((v) => !v)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 999,
                    border: "none",
                    background: annual ? "var(--ws-accent)" : "var(--ws-border)",
                    position: "relative",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: annual ? 22 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--ws-surface)",
                      transition: "left 0.2s ease",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                    }}
                  />
                </button>
                <span style={{ fontSize: 13, color: annual ? "var(--ws-text)" : "var(--ws-text-dim)", fontWeight: annual ? 600 : 400 }}>
                  {lang === "fr" ? "Annuel" : "Annual"}
                </span>
                {annual && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-accent)", letterSpacing: "-0.01em" }}>
                    {annualFreeMonthsBadge(lang)}
                  </span>
                )}
              </div>
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
                      : `${planDisplayName("basic", lang)} ${formatPricingAmount(GROWTH_MONTHLY, lang)}${periodShort} →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCheckout("pro")}
                    disabled={loading !== null}
                    style={{ ...btnPrimary, background: "var(--ws-btn)", color: "var(--ws-btn-text)" }}
                  >
                    {loading === "pro"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `${planDisplayName("pro", lang)} ${formatPricingAmount(PRO_MONTHLY, lang)}${periodShort} →`}
                  </button>
                </>
              )}
              {currentPlan === "basic" && (
                <>
                  <button
                    type="button"
                    onClick={() => void startCheckout("pro")}
                    disabled={loading !== null}
                    style={{ ...btnPrimary, background: "var(--ws-btn)", color: "var(--ws-btn-text)" }}
                  >
                    {loading === "pro"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `${planDisplayName("pro", lang)} ${formatPricingAmount(PRO_MONTHLY, lang)}${periodShort} →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCheckout("scale")}
                    disabled={loading !== null}
                    style={btnPrimary}
                  >
                    {loading === "scale"
                      ? lang === "fr" ? "Chargement..." : "Loading..."
                      : `${planDisplayName("scale", lang)} ${formatPricingAmount(SCALE_MONTHLY, lang)}${periodShort} →`}
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
                    : `${planDisplayName("scale", lang)} ${formatPricingAmount(SCALE_MONTHLY, lang)}${periodShort} →`}
                </button>
              )}
              </div>
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
              color: "var(--ws-text-dim)",
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
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Chargement des factures..." : "Loading invoices..."}
          </p>
        ) : invoicesError ? (
          <p style={{ fontSize: 13, color: "#C62828", margin: 0, letterSpacing: "-0.01em" }}>
            {invoicesError}
          </p>
        ) : invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Aucune facture pour le moment. Elles apparaîtront ici après votre premier paiement."
              : "No invoices yet. They will appear here after your first payment."}
          </p>
        ) : (
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 500 : undefined }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Date" : "Date"}</th>
                  <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Montant" : "Amount"}</th>
                  <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Statut" : "Status"}</th>
                  <th style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500, letterSpacing: "-0.01em" }}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                    <td style={{ padding: "12px 8px", color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{formatInvoiceDate(inv.created)}</td>
                    <td style={{ padding: "12px 8px", color: "var(--ws-text)", letterSpacing: "-0.02em" }}>
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

function NotificationsSettings({ userId }: { userId: string }) {
  const lang = useLang();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => loadNotificationPreferences(userId));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadNotificationPreferences(userId));
  }, [userId]);

  const updatePref = (
    channel: "email" | "push",
    key: NotificationPrefKey,
    value: boolean
  ) => {
    setPrefs((prev) => {
      const next: NotificationPreferences = {
        email: { ...prev.email },
        push: { ...prev.push },
      };
      next[channel][key] = value;
      saveNotificationPreferences(userId, next);
      return next;
    });
    setMessage(lang === "fr" ? "Préférence enregistrée." : "Preference saved.");
  };

  return (
    <>
      <Card title={lang === "fr" ? "Notifications email" : "Email notifications"}>
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <ToggleRow
            key={`email-${key}`}
            label={emailNotifLabel(key, lang)}
            on={prefs.email[key]}
            onToggle={() => updatePref("email", key, !prefs.email[key])}
          />
        ))}
      </Card>
      <Card title={lang === "fr" ? "Notifications push" : "Push notifications"}>
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <ToggleRow
            key={`push-${key}`}
            label={emailNotifLabel(key, lang)}
            on={prefs.push[key]}
            onToggle={() => updatePref("push", key, !prefs.push[key])}
          />
        ))}
      </Card>
      {message && (
        <p style={{ fontSize: 13, color: "#2E7D32", margin: "0 0 12px 0" }}>{message}</p>
      )}
    </>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--ws-border)" }}>
      <span style={{ fontSize: 14, color: "var(--ws-text)", letterSpacing: "-0.02em", paddingRight: 16 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "var(--ws-text-dim)", letterSpacing: "-0.01em" }}>{on ? "On" : "Off"}</span>
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
        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>
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
          <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: "8px 0 0", letterSpacing: "-0.01em" }}>
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
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Chargement de l'équipe..." : "Loading team..."}
          </p>
        ) : (
        <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 600 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                {[
                  lang === "fr" ? "Membre" : "Member",
                  lang === "fr" ? "Rôle" : "Role",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Dernière activité" : "Last active",
                  "",
                ].map((h) => (
                  <th key={h || "actions"} style={{ padding: "10px 8px", color: "var(--ws-text-dim)", fontWeight: 500, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                  <td style={{ padding: "14px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: m.avatarUrl ? "var(--ws-border)" : m.isYou ? "var(--ws-accent)" : "var(--ws-border)",
                          color: m.isYou && !m.avatarUrl ? "#FFFFFF" : "var(--ws-text-muted)",
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
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ws-text)" }}>
                          {m.isYou ? "You" : m.name}
                          {m.isYou && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ws-text-dim)", fontWeight: 400 }}>({lang === "fr" ? "propriétaire du compte" : "account owner"})</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>{m.email}</div>
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text)", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
                      {m.status === "active" ? (lang === "fr" ? "Actif" : "Active") : lang === "fr" ? "Invitation en attente" : "Pending invite"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 8px", color: "var(--ws-text-muted)", fontSize: 12 }}>{formatLastActive(m.lastActive, lang)}</td>
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
              <div style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", lineHeight: 1.45, paddingTop: 2 }}>
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
    owner: { bg: "var(--ws-btn)", color: "var(--ws-btn-text)" },
    admin: { bg: "var(--ws-accent-soft)", color: "var(--ws-accent)" },
    editor: { bg: "rgba(46, 125, 50, 0.15)", color: "#4ADE80" },
    viewer: { bg: "var(--ws-hover)", color: "var(--ws-text-muted)" },
    billing: { bg: "rgba(245, 127, 23, 0.15)", color: "#FBBF24" },
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

function SecuritySettings({ onDeleteAccount }: { onDeleteAccount: () => void }) {
  const lang = useLang();

  return (
    <>
      <Card title={lang === "fr" ? "Changer le mot de passe" : "Change password"}>
        <Field label={lang === "fr" ? "Mot de passe actuel" : "Current password"}><input type="password" style={inputStyle} /></Field>
        <Field label={lang === "fr" ? "Nouveau mot de passe" : "New password"}><input type="password" style={inputStyle} /></Field>
        <Field label={lang === "fr" ? "Confirmer le nouveau mot de passe" : "Confirm new password"}><input type="password" style={inputStyle} /></Field>
        <button type="button" style={btnPrimary}>{lang === "fr" ? "Sauvegarder" : "Save"}</button>
      </Card>

      <Card title={lang === "fr" ? "Zone dangereuse" : "Danger zone"}>
        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>{lang === "fr" ? "Supprimez définitivement votre compte et toutes les données associées. Cette action est irréversible." : "Permanently delete your account and all associated data. This cannot be undone."}</p>
        <button type="button" onClick={onDeleteAccount} style={{ background: "var(--ws-surface)", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Supprimer le compte" : "Delete account"}</button>
      </Card>
    </>
  );
}

function DeleteAccountModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: "var(--ws-surface)", borderRadius: 16, padding: 28, maxWidth: 420, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>Delete account?</h3>
        <p style={{ fontSize: 14, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: "0 0 24px 0", lineHeight: 1.5 }}>This will permanently delete your account, stores, creators, and billing history. Type DELETE to confirm.</p>
        <input type="text" placeholder="DELETE" style={{ ...inputStyle, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{ ...btnPrimary, background: "#DC2626" }}>Delete account</button>
        </div>
      </div>
    </div>
  );
}
