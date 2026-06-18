"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { applyAppLocale } from "@/lib/locale-preferences";
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase || !userId) { setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
      if (!cancelled && data) {
        setFullName(data.full_name ?? "");
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
      const { error: updErr } = await supabase.from("profiles").update({ full_name: fullName.trim(), avatar_url: newAvatarUrl, updated_at: new Date().toISOString() }).eq("id", userId);
      if (updErr) { setError(updErr.message); return; }
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
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "#9A9A9A", fontSize: 14 }}>
        {lang === "fr" ? "Chargement..." : "Loading..."}
      </div>
    );
  }

  const displayAvatar = avatarPreview || avatarUrl;

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 24, paddingBottom: 48, background: "#FFFFFF" }}>
      <div style={{ maxWidth: 520, border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 20 : 28 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", background: "#F2F2F2", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {displayAvatar ? (
              <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 26, color: "#B5B5B5", fontWeight: 600 }}>{(fullName || "?").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <label style={{ display: "inline-block", padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", fontSize: 14, fontWeight: 500, color: "#1A1A1A", cursor: "pointer", letterSpacing: "-0.01em" }}>
              {lang === "fr" ? "Changer la photo" : "Change photo"}
              <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
            </label>
            <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 8 }}>{lang === "fr" ? "JPG ou PNG, 2 Mo max." : "JPG or PNG, 2MB max."}</div>
          </div>
        </div>

        <label style={labelStyle}>{lang === "fr" ? "Nom" : "Name"}</label>
        <input type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Votre nom" : "Your name"} style={{ ...inputStyle, marginBottom: 22 }} />

        <label style={labelStyle}>{lang === "fr" ? "Langue" : "Language"}</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
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

        {error && (
          <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 14 }}>{error}</div>
        )}
        {saved && (
          <div style={{ fontSize: 14, color: "#1A7F37", padding: "10px 12px", borderRadius: 10, background: "rgba(26,127,55,0.08)", marginBottom: 14 }}>
            {lang === "fr" ? "Modifications enregistrées." : "Changes saved."}
          </div>
        )}

        <button type="button" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer", letterSpacing: "-0.01em", opacity: saving ? 0.7 : 1 }}>
          {saving ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Enregistrer" : "Save")}
        </button>
      </div>
    </div>
  );
}
