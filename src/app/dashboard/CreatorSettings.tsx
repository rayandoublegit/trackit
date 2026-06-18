"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { applyAppLocale, clearUserSessionStorage } from "@/lib/locale-preferences";
import { resolveAvatarUrl } from "@/lib/resolve-avatar-url";

const BLUE = "#0047FF";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.1)", fontSize: 15, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500,
  color: "rgba(0,0,0,0.55)", marginBottom: 6, letterSpacing: "-0.01em",
};

export function CreatorSettings({ userId, isMobile, onSaved }: { userId?: string; isMobile?: boolean; onSaved?: () => void }) {
  const lang = useLang();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const disconnectAccount = async () => {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut({ scope: "global" });
    clearUserSessionStorage();
    window.location.href = "/auth";
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase || !userId) { setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("full_name, username, avatar_url").eq("id", userId).maybeSingle();
      if (!cancelled && data) {
        setFullName(data.full_name ?? "");
        setUsername(data.username ?? "");
        const resolved = data.avatar_url && supabase ? await resolveAvatarUrl(supabase, userId, data.avatar_url) : data.avatar_url;
        if (!cancelled) setAvatarUrl(resolved ?? null);
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 2 * 1024 * 1024) { setError(lang === "fr" ? "Image sous 2 Mo maximum." : "Image must be under 2MB"); return; }
    setError(""); setSaved(false); setAvatarFile(f);
    setAvatarPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  const handleSave = async () => {
    if (!supabase || !userId) return;
    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");
    setSaving(true); setError(""); setSaved(false);
    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${userId}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (upErr) { setError(upErr.message); return; }
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        newAvatarUrl = pub.publicUrl + "?t=" + Date.now();
      }
      const { error: updErr } = await supabase.from("profiles").update({ full_name: fullName.trim(), username: cleanUsername || null, avatar_url: newAvatarUrl, updated_at: new Date().toISOString() }).eq("id", userId);
      if (updErr) { setError(updErr.message); return; }
      setUsername(cleanUsername);
      const resolved = newAvatarUrl && supabase ? await resolveAvatarUrl(supabase, userId, newAvatarUrl) : newAvatarUrl;
      setAvatarUrl(resolved ?? null);
      setAvatarFile(null);
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "#9A9A9A", fontSize: 14, background: "#FFFFFF", minHeight: "100vh" }}>
        {lang === "fr" ? "Chargement..." : "Loading..."}
      </div>
    );
  }

  const displayAvatar = avatarPreview || avatarUrl;

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 48, background: "#FFFFFF", minHeight: "100vh", flex: 1 }}>
      <div style={{ maxWidth: 640 }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.035em", margin: "0 0 8px" }}>{lang === "fr" ? "Paramètres" : "Settings"}</h1>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>{lang === "fr" ? "Gérez votre profil et vos préférences." : "Manage your profile and preferences."}</p>
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 20 }}>{lang === "fr" ? "Profil" : "Profile"}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", overflow: "hidden", background: "#F2F2F2", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #EFEFEF" }}>
              {displayAvatar ? (
                <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 34, color: "#B5B5B5", fontWeight: 600 }}>{(fullName || "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <label style={{ display: "inline-block", padding: "10px 18px", borderRadius: 10, border: "none", background: BLUE, fontSize: 14, fontWeight: 600, color: "#FFFFFF", cursor: "pointer", letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Changer la photo" : "Change photo"}
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
              </label>
              <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 10 }}>{lang === "fr" ? "JPG ou PNG, 2 Mo max." : "JPG or PNG, 2MB max."}</div>
            </div>
          </div>

          <label style={labelStyle}>{lang === "fr" ? "Nom complet" : "Full name"}</label>
          <input type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Votre nom" : "Your name"} style={{ ...inputStyle, marginBottom: 22 }} />

          <label style={labelStyle}>{lang === "fr" ? "Pseudo (réseaux sociaux)" : "Handle (social media)"}</label>
          <div style={{ position: "relative", marginBottom: 6 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A", fontSize: 15 }}>@</span>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setSaved(false); }} placeholder="votrepseudo" style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 4 }}>{lang === "fr" ? "Doit correspondre au pseudo connu par la marque qui vous a invité." : "Should match the handle known by the brand that invited you."}</div>
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 16 }}>{lang === "fr" ? "Préférences" : "Preferences"}</div>
          <label style={labelStyle}>{lang === "fr" ? "Langue" : "Language"}</label>
          <div style={{ display: "flex", gap: 8 }}>
            {([["fr", "Français"], ["en", "English"]] as const).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => { if (code !== lang) { applyAppLocale(code); window.location.reload(); } }}
                style={{
                  flex: 1, padding: "11px 14px", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.01em",
                  border: lang === code ? `1.5px solid ${BLUE}` : "1px solid rgba(0,0,0,0.12)",
                  background: lang === code ? "rgba(0,71,255,0.06)" : "#FFFFFF",
                  color: lang === code ? BLUE : "#1A1A1A",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 14 }}>{error}</div>
        )}
        {saved && (
          <div style={{ fontSize: 14, color: "#1A7F37", padding: "10px 12px", borderRadius: 10, background: "rgba(26,127,55,0.08)", marginBottom: 14 }}>
            {lang === "fr" ? "Modifications enregistrées." : "Changes saved."}
          </div>
        )}

        <button type="button" onClick={handleSave} disabled={saving || signingOut} style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: saving || signingOut ? "default" : "pointer", letterSpacing: "-0.01em", opacity: saving || signingOut ? 0.7 : 1 }}>
          {saving ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Enregistrer" : "Save")}
        </button>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #EFEFEF" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 6 }}>{lang === "fr" ? "Compte" : "Account"}</div>
          <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 14px 0", lineHeight: 1.45 }}>
            {lang === "fr" ? "Déconnectez-vous et dissociez cet appareil de votre compte Trackit." : "Sign out and disconnect this device from your Trackit account."}
          </p>
          <button
            type="button"
            onClick={() => void disconnectAccount()}
            disabled={signingOut}
            style={{
              padding: "11px 18px", borderRadius: 10, border: "1px solid rgba(220, 38, 38, 0.35)",
              background: "#FFFFFF", color: "#DC2626", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: signingOut ? "default" : "pointer", letterSpacing: "-0.01em",
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut ? (lang === "fr" ? "Déconnexion..." : "Disconnecting...") : (lang === "fr" ? "Déconnecter" : "Disconnect")}
          </button>
        </div>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #EFEFEF", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Propulsé par" : "Powered by"}</span>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 26, width: "auto", opacity: 0.85 }} />
        </div>

      </div>
    </div>
  );
}
