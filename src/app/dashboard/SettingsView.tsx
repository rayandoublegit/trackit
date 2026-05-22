"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";
import { PaymentMethodsBillingSection } from "./PayoutsView";
import type { User } from "@supabase/supabase-js";

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
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  billing: "Billing",
};

const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: "Full access including billing, team, and account deletion.",
  admin: "Manage campaigns, creators, payouts, settings, and invite members.",
  editor: "Create and edit campaigns, outreach, and discovery. No billing or team admin.",
  viewer: "View-only access to dashboards, campaigns, and reports.",
  billing: "View analytics and manage billing, invoices, and payouts only.",
};

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "billing", label: "Billing" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "api", label: "API" },
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

export function SettingsView({ onProfileUpdate }: { onProfileUpdate?: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("general");
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
      <div style={{ padding: "32px 40px 0 40px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 20 }}>Settings</h1>
        <div style={{ display: "flex", gap: 28, overflowX: "auto" }}>
          {TABS.map((t) => (
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

      <div style={{ padding: 40 }}>
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
            {tab === "team" && <TeamSettings />}
            {tab === "billing" && <BillingSettings />}
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

function StatusBadge({ status }: { status: "Paid" | "Failed" | "Pending" }) {
  const styles: Record<string, { bg: string; color: string }> = {
    Paid: { bg: "#E8F5E9", color: "#2E7D32" },
    Failed: { bg: "#FFEBEE", color: "#C62828" },
    Pending: { bg: "#FFF8E1", color: "#F57F17" },
  };
  const s = styles[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color, letterSpacing: "-0.01em" }}>
      {status}
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
  const [currency, setCurrency] = useState("EUR");
  const [language, setLanguage] = useState("EN");
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
    await supabase.auth.signOut();
    router.replace("/auth");
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
      <Field label="Store name">
        <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Acme Co." style={inputStyle} />
      </Field>
      <Field label="Shopify store URL">
        <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="yourstore.myshopify.com" style={inputStyle} />
      </Field>
      <Field label="Your niche">
        <input type="text" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Fashion, fitness, beauty..." style={inputStyle} />
      </Field>
      <Field label="Business type">
        <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={inputStyle}>
          <option>Ecommerce</option>
          <option>Infopreneur</option>
          <option>Agency</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Default currency">
        <SegmentedToggle options={["EUR", "USD"]} value={currency} onChange={setCurrency} />
      </Field>
      <Field label="Default language">
        <SegmentedToggle options={["EN", "FR"]} value={language} onChange={setLanguage} />
      </Field>
      <Field label="Timezone">
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
        {saving ? "Saving..." : "Save changes"}
      </button>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #EFEFEF" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>Account</div>
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 14px 0", lineHeight: 1.45 }}>
          Sign out and disconnect this device from your Trackit account.
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
          {signingOut ? "Disconnecting..." : "Disconnect"}
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
      <Field label="Profile photo">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E8EEFC", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {displayAvatar ? (
              <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 600, color: "#0047FF" }}>{initial}</span>
            )}
          </div>
          <label style={{ cursor: "pointer" }}>
            <span style={btnSecondary}>Upload photo</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
          </label>
        </div>
      </Field>
      <Field label="Full name">
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
      </Field>
      <Field label="Email">
        <input type="email" value={email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
      </Field>
      <Field label="Username">
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
        {saving ? "Saving..." : "Save changes"}
      </button>
    </Card>
  );
}


function BillingSettings() {
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState("free");

  const handleUpgrade = async (plan: "basic" | "pro") => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase!.auth.getUser();
      const priceId = plan === "basic"
        ? process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          userId: user?.id,
          email: user?.email,
          cancelUrl: window.location.href
        })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(false);
    }
  };

  const invoices = [
    { date: "Apr 1, 2026", amount: "$49.00", status: "Paid" as const },
    { date: "Mar 1, 2026", amount: "$49.00", status: "Paid" as const },
    { date: "Feb 1, 2026", amount: "$49.00", status: "Pending" as const },
    { date: "Jan 1, 2026", amount: "$49.00", status: "Failed" as const },
  ];

  return (
    <>
      <Card title="Current plan">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "#0047FF", background: "#F0F6FF", padding: "4px 10px", borderRadius: 6, marginBottom: 10, letterSpacing: "-0.01em" }}>Basic</span>
            <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", marginBottom: 4 }}>$49<span style={{ fontSize: 14, fontWeight: 400, color: "#7A7A7A" }}>/month</span></div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Next billing date: May 1, 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => handleUpgrade("basic")}
              disabled={loading}
              style={btnPrimary}
            >
              {loading ? "Loading..." : "Basic $49/mo →"}
            </button>
            <button
              type="button"
              onClick={() => handleUpgrade("pro")}
              disabled={loading}
              style={{ ...btnPrimary, background: "#1A1A1A" }}
            >
              {loading ? "Loading..." : "Pro $119/mo →"}
            </button>
          </div>
        </div>
        <button type="button" style={{ background: "none", border: "none", padding: 0, marginTop: 14, fontSize: 12, color: "#9A9A9A", cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>Cancel subscription</button>
      </Card>

      <Card title="Payment method">
        <PaymentMethodsBillingSection />
      </Card>

      <Card title="Invoice history">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>Date</th>
                <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>Amount</th>
                <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}>Status</th>
                <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, letterSpacing: "-0.01em" }}></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.date} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", color: "#1A1A1A", letterSpacing: "-0.02em" }}>{inv.date}</td>
                  <td style={{ padding: "12px 8px", color: "#1A1A1A", letterSpacing: "-0.02em" }}>{inv.amount}</td>
                  <td style={{ padding: "12px 8px" }}><StatusBadge status={inv.status} /></td>
                  <td style={{ padding: "12px 8px", textAlign: "right" }}>
                    <button type="button" style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [emailToggles, setEmailToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(EMAIL_NOTIFS.map((l, i) => [l, i % 2 === 0]))
  );
  const [pushToggles, setPushToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(EMAIL_NOTIFS.map((l, i) => [l, i % 3 !== 0]))
  );

  return (
    <>
      <Card title="Email notifications">
        {EMAIL_NOTIFS.map((label) => (
          <ToggleRow
            key={`email-${label}`}
            label={label}
            on={emailToggles[label]}
            onToggle={() => setEmailToggles((t) => ({ ...t, [label]: !t[label] }))}
          />
        ))}
      </Card>
      <Card title="Push notifications">
        {EMAIL_NOTIFS.map((label) => (
          <ToggleRow
            key={`push-${label}`}
            label={label}
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

function TeamSettings() {
  const [members, setMembers] = useState<TeamMember[]>([
    { id: "0", name: "You", email: "alex@trackit.app", role: "owner", status: "active", lastActive: "Active now", isYou: true },
    { id: "1", name: "Jordan Lee", email: "jordan@company.com", role: "admin", status: "active", lastActive: "2 hours ago" },
    { id: "2", name: "Sam Taylor", email: "sam@company.com", role: "editor", status: "active", lastActive: "Yesterday" },
    { id: "3", name: "Morgan Kim", email: "morgan@company.com", role: "viewer", status: "active", lastActive: "3 days ago" },
    { id: "4", name: "—", email: "finance@company.com", role: "billing", status: "pending" },
  ]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");

  const assignableRoles: TeamRole[] = ["admin", "editor", "viewer", "billing"];

  const sendInvite = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (members.some((m) => m.email.toLowerCase() === email)) return;
    setMembers((list) => [
      ...list,
      { id: String(Date.now()), name: "—", email, role: inviteRole, status: "pending" },
    ]);
    setInviteEmail("");
  };

  const updateRole = (id: string, role: TeamRole) => {
    if (role === "owner") return;
    setMembers((list) => list.map((m) => (m.id === id ? { ...m, role } : m)));
  };

  const removeMember = (id: string) => {
    setMembers((list) => list.filter((m) => m.id !== id || m.isYou));
  };

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <>
      <Card title="Invite team member">
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>
          Add colleagues to your workspace. They will receive an email invite to join.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <Field label="Email address">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <Field label="Role">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                style={inputStyle}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" style={{ ...btnPrimary, marginBottom: 16 }} onClick={sendInvite}>
            Send invite
          </button>
        </div>
      </Card>

      <Card title={`Team members (${activeCount} active${pendingCount ? `, ${pendingCount} pending` : ""})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                {["Member", "Role", "Status", "Last active", ""].map((h) => (
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
                          background: m.isYou ? "#0047FF" : "#EFEFEF",
                          color: m.isYou ? "#FFF" : "#7A7A7A",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {m.isYou ? "You" : m.name !== "—" ? m.name.charAt(0) : "?"}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>
                          {m.isYou ? "You" : m.name}
                          {m.isYou && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "#9A9A9A", fontWeight: 400 }}>(account owner)</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#9A9A9A" }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 8px" }}>
                    {m.isYou || m.role === "owner" ? (
                      <RoleBadge role={m.role} />
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => updateRole(m.id, e.target.value as TeamRole)}
                        style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, minWidth: 110 }}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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
                      {m.status === "active" ? "Active" : "Pending invite"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 8px", color: "#7A7A7A", fontSize: 12 }}>{m.lastActive ?? "—"}</td>
                  <td style={{ padding: "14px 8px", textAlign: "right" }}>
                    {!m.isYou && m.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}
                      >
                        {m.status === "pending" ? "Cancel invite" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Role permissions">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(Object.keys(ROLE_LABELS) as TeamRole[]).map((role) => (
            <div key={role} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <RoleBadge role={role} />
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45, paddingTop: 2 }}>
                {ROLE_DESCRIPTIONS[role]}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function RoleBadge({ role }: { role: TeamRole }) {
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
      {ROLE_LABELS[role]}
    </span>
  );
}

function SecuritySettings({ twoFa, setTwoFa, onDeleteAccount }: { twoFa: boolean; setTwoFa: (v: boolean) => void; onDeleteAccount: () => void }) {
  const sessions = [
    { device: "MacBook Pro · Chrome", location: "Paris, FR", last: "Active now" },
    { device: "iPhone 15 · Safari", location: "Paris, FR", last: "2 hours ago" },
    { device: "Windows · Firefox", location: "Lyon, FR", last: "3 days ago" },
  ];

  return (
    <>
      <Card title="Change password">
        <Field label="Current password"><input type="password" style={inputStyle} /></Field>
        <Field label="New password"><input type="password" style={inputStyle} /></Field>
        <Field label="Confirm new password"><input type="password" style={inputStyle} /></Field>
        <button type="button" style={btnPrimary}>Save</button>
      </Card>

      <Card title="Two factor authentication">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: twoFa ? 20 : 0 }}>
          <div>
            <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>Enable 2FA</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Add an extra layer of security to your account</div>
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

      <Card title="Active sessions">
        {sessions.map((s) => (
          <div key={s.device} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #F5F5F5", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{s.device}</div>
              <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{s.location} · {s.last}</div>
            </div>
            <button type="button" style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>Revoke</button>
          </div>
        ))}
        <button type="button" style={{ ...btnSecondary, marginTop: 16, width: "100%" }}>Revoke all sessions</button>
      </Card>

      <Card title="Danger zone">
        <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 16px 0" }}>Permanently delete your account and all associated data. This cannot be undone.</p>
        <button type="button" onClick={onDeleteAccount} style={{ background: "#FFFFFF", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em" }}>Delete account</button>
      </Card>
    </>
  );
}

function ApiSettings() {
  const [webhooks, setWebhooks] = useState(["https://api.mystore.com/webhooks/trackit"]);
  const [webhookInput, setWebhookInput] = useState("");
  const apiCalls = 2847;
  const apiLimit = 10000;

  return (
    <>
      <Card title="Your API key">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <code style={{ flex: 1, minWidth: 200, padding: "12px 14px", background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 10, fontSize: 13, color: "#1A1A1A", letterSpacing: "0.02em" }}>tr_live_••••••••••••••••4f2a</code>
          <button type="button" style={btnSecondary}>Copy key</button>
          <button type="button" style={btnSecondary}>Regenerate key</button>
        </div>
        <p style={{ fontSize: 12, color: "#C45C00", margin: 0, letterSpacing: "-0.01em" }}>Regenerating will break existing integrations</p>
      </Card>

      <Card>
        <a href="#" style={{ fontSize: 14, fontWeight: 500, color: "#0047FF", textDecoration: "none", letterSpacing: "-0.02em" }}>View API docs →</a>
      </Card>

      <Card title="Webhook URL">
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input type="url" value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)} placeholder="https://your-app.com/webhook" style={{ ...inputStyle, flex: 1 }} />
          <button
            type="button"
            style={btnPrimary}
            onClick={() => {
              if (webhookInput.trim()) {
                setWebhooks((w) => [...w, webhookInput.trim()]);
                setWebhookInput("");
              }
            }}
          >
            Add webhook endpoint
          </button>
        </div>
        {webhooks.map((url) => (
          <div key={url} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F5F5F5", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>{url}</span>
            <button type="button" onClick={() => setWebhooks((w) => w.filter((x) => x !== url))} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}>Delete</button>
          </div>
        ))}
      </Card>

      <Card title="Usage this month">
        <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 10 }}>
          API calls made: <strong>{apiCalls.toLocaleString()}</strong> / {apiLimit.toLocaleString()}
        </div>
        <div style={{ height: 8, background: "#EFEFEF", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${(apiCalls / apiLimit) * 100}%`, height: "100%", background: "#0047FF", borderRadius: 999 }} />
        </div>
        <a href="#" style={{ fontSize: 13, fontWeight: 500, color: "#0047FF", textDecoration: "none", letterSpacing: "-0.02em" }}>Upgrade for unlimited API calls →</a>
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
