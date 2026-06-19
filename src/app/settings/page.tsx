"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type SettingsLang = "en" | "fr";

const settingsT: Record<SettingsLang, Record<string, string>> = {
  en: {
    back: "← Dashboard",
    title: "Settings",
    subtitle: "Manage your account and preferences.",
    profile: "Profile",
    change_photo: "Change photo",
    photo_hint: "JPG, PNG. Max 2MB.",
    username_label: "Username",
    email_label: "Email",
    email_hint: "Email cannot be changed.",
    save_changes: "Save changes",
    saving: "Saving...",
    password_title: "Change Password",
    current_password: "Current Password",
    new_password: "New Password",
    confirm_password: "Confirm New Password",
    current_placeholder: "Enter current password",
    new_placeholder: "Min 12 chars, 1 uppercase, 1 symbol",
    confirm_placeholder: "Repeat new password",
    update_password: "Update password",
    updating: "Updating...",
    language_title: "Language",
    save_language: "Save language",
    wallpaper_title: "Dashboard Wallpaper",
    solid_colors: "Solid Colors",
    gradients: "Gradients",
    custom_image: "Custom Image",
    upload_image: "Upload image",
    remove: "Remove",
    text_color: "Text Color",
    plan_title: "Plan",
    current_plan: "Current Plan",
    upgrade_plan: "Upgrade plan →",
    manage_plan: "Manage plan →",
    scale_max: "You're on the highest plan. 🔥",
    analyses_free: "Free plan · 3 managed creators",
    analyses_spark: "Growth · €19/mo · 15 managed creators",
    analyses_build: "Pro · €39/mo · 50 managed creators",
    analyses_scale: "Scale · €99/mo · unlimited creators",
    danger_title: "Danger Zone",
    danger_sub: "These actions are permanent and cannot be undone.",
    sign_out: "Sign out",
    delete_account: "Delete account",
    delete_confirm:
      "Are you sure? This will permanently delete your account and all your data. This cannot be undone.",
    cancel: "Cancel",
    confirm_delete: "Yes, delete my account",
    loading: "Loading...",
    lang_en: "🇬🇧 English",
    lang_fr: "🇫🇷 Français",
  },
  fr: {
    back: "← Tableau de bord",
    title: "Paramètres",
    subtitle: "Gérez votre compte et vos préférences.",
    profile: "Profil",
    change_photo: "Changer la photo",
    photo_hint: "JPG, PNG. Max 2Mo.",
    username_label: "Nom d'utilisateur",
    email_label: "Email",
    email_hint: "L'email ne peut pas être modifié.",
    save_changes: "Sauvegarder les modifications",
    saving: "Sauvegarde...",
    password_title: "Changer le mot de passe",
    current_password: "Mot de passe actuel",
    new_password: "Nouveau mot de passe",
    confirm_password: "Confirmer le nouveau mot de passe",
    current_placeholder: "Entrez le mot de passe actuel",
    new_placeholder: "Min 12 caractères, 1 majuscule, 1 symbole",
    confirm_placeholder: "Répétez le nouveau mot de passe",
    update_password: "Mettre à jour le mot de passe",
    updating: "Mise à jour...",
    language_title: "Langue",
    save_language: "Sauvegarder la langue",
    wallpaper_title: "Fond d'écran du tableau de bord",
    solid_colors: "Couleurs unies",
    gradients: "Dégradés",
    custom_image: "Image personnalisée",
    upload_image: "Télécharger une image",
    remove: "Supprimer",
    text_color: "Couleur du texte",
    plan_title: "Plan",
    current_plan: "Plan actuel",
    upgrade_plan: "Améliorer le plan →",
    manage_plan: "Gérer le plan →",
    scale_max: "Tu es sur le plan le plus élevé. 🔥",
    analyses_free: "Plan Free · 3 créateurs gérés",
    analyses_spark: "Growth · 19€/mois · 15 créateurs gérés",
    analyses_build: "Pro · 39€/mois · 50 créateurs gérés",
    analyses_scale: "Scale · 99€/mois · créateurs illimités",
    danger_title: "Zone de danger",
    danger_sub: "Ces actions sont permanentes et ne peuvent pas être annulées.",
    sign_out: "Se déconnecter",
    delete_account: "Supprimer le compte",
    delete_confirm:
      "Es-tu sûr ? Cela supprimera définitivement ton compte et toutes tes données. Cette action est irréversible.",
    cancel: "Annuler",
    confirm_delete: "Oui, supprimer mon compte",
    loading: "Chargement...",
    lang_en: "🇬🇧 English",
    lang_fr: "🇫🇷 Français",
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const lang = useLang();
  const [locale, setLocale] = useState<SettingsLang>(lang);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [wallpaper, setWallpaper] = useState<string>("");
  const [wallpaperType, setWallpaperType] = useState<"color" | "gradient" | "image">("color");
  const [savingWallpaper, setSavingWallpaper] = useState(false);
  const [textColor, setTextColor] = useState<string>("#ffffff");

  useEffect(() => {
    setLocale(lang);
  }, [lang]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth"); return; }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url, plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setUsername(profile.username ?? "");
        setAvatarUrl(profile.avatar_url ?? null);
        setPlan(profile.plan ?? "free");
      }
      const savedWallpaper = localStorage.getItem("klayan_wallpaper") ?? "";
      const savedWallpaperType = (localStorage.getItem("klayan_wallpaper_type") ?? "color") as "color" | "gradient" | "image";
      if (savedWallpaper) { setWallpaper(savedWallpaper); setWallpaperType(savedWallpaperType); }
      const savedTextColor = localStorage.getItem("klayan_text_color") ?? "#ffffff";
      setTextColor(savedTextColor);
      setLoading(false);
    })();
  }, [router]);

  const avatarFileRef = React.useRef(avatarFile);
  React.useEffect(() => { avatarFileRef.current = avatarFile; }, [avatarFile]);

  const saveProfile = useCallback(async () => {
    const avatarFile = avatarFileRef.current;
    console.log("SAVE called, avatarFile:", avatarFile);
    if (!supabase || !user) return;
    setSaving(true);
    setMessage(null);

    let newAvatarUrl = avatarUrl;

    if (avatarFile) {
      const path = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

      console.log("UPLOAD RESULT:", uploadError, "path:", `${user.id}/avatar`);
      console.log("UPLOAD RESULT:", uploadError, "path:", `${user.id}/avatar`);
      if (uploadError) {
        setMessage({ text: "Failed to upload photo.", type: "error" });
        setSaving(false);
        return;
      }

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      newAvatarUrl = pub.publicUrl + "?t=" + Date.now();
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim(), avatar_url: newAvatarUrl })
      .eq("id", user.id);

    if (error) {
      setMessage({ text: "Failed to save changes.", type: "error" });
    } else {
      setMessage({ text: "Changes saved successfully.", type: "success" });
      setAvatarUrl(newAvatarUrl);
    }
    setSaving(false);
  }, [supabase, user, username, avatarFile, avatarUrl]);

  const changePassword = useCallback(async () => {
    if (!supabase || !user) return;
    setPasswordMessage(null);

    if (newPassword.length < 12) {
      setPasswordMessage({ text: "New password must be at least 12 characters.", type: "error" });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPasswordMessage({ text: "New password must contain at least one uppercase letter.", type: "error" });
      return;
    }
    if (!/[!@#$%^&*]/.test(newPassword)) {
      setPasswordMessage({ text: "New password must contain at least one symbol (!@#$%^&*).", type: "error" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    setChangingPassword(true);

    // Re-authenticate with current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordMessage({ text: "Current password is incorrect.", type: "error" });
      setChangingPassword(false);
      return;
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setPasswordMessage({ text: "Failed to update password.", type: "error" });
    } else {
      setPasswordMessage({ text: "Password updated successfully.", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    }

    setChangingPassword(false);
  }, [supabase, user, currentPassword, newPassword, confirmNewPassword]);

  const saveLanguage = useCallback(async () => {
    setSavingLanguage(true);
    localStorage.setItem("klayan_lang", locale);
    await new Promise(resolve => setTimeout(resolve, 300));
    setMessage({ text: "Language preference saved.", type: "success" });
    setSavingLanguage(false);
  }, [locale]);

  const saveWallpaper = useCallback((value: string, type: "color" | "gradient" | "image") => {
    localStorage.setItem("klayan_wallpaper", value);
    localStorage.setItem("klayan_wallpaper_type", type);
    setWallpaper(value);
    setWallpaperType(type);
    setMessage({ text: "Wallpaper saved.", type: "success" });
  }, []);

  const applyTextColor = useCallback((color: string) => {
    localStorage.setItem("klayan_text_color", color);
    setTextColor(color);
    setMessage({ text: "Text color saved.", type: "success" });
  }, []);

  const handleWallpaperImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      saveWallpaper(result, "image");
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/");
  };

  const deleteAccount = async () => {
    // For now just sign out — full deletion requires server-side
    await signOut();
  };

  const t = settingsT[locale];

  if (loading) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>{t.loading}</div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 16px",
    color: "#fff",
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const sectionStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: "28px 32px",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
          {t.back}
        </Link>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
        <img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px" }}>

        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>{t.title}</h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40 }}>{t.subtitle}</p>

        {message ? (
          <div style={{
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 500,
            background: message.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            border: `1px solid ${message.type === "success" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
            color: message.type === "success" ? "#4ade80" : "#f87171",
          }}>
            {message.text}
          </div>
        ) : null}

        {/* Profile Section */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 24 }}>{t.profile}</div>

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {avatarPreview || avatarUrl ? (
                  <img src={avatarPreview ?? avatarUrl!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 24, color: "rgba(255,255,255,0.4)" }}>{username.slice(0, 1).toUpperCase() || "?"}</span>
                )}
              </div>
            </div>
            <div>
              <label style={{ cursor: "pointer" }}>
                <div style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "inline-block",
                }}>
                  {t.change_photo}
                </div>
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
              </label>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{t.photo_hint}</div>
            </div>
          </div>

          {/* Username */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>{t.username_label}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              style={inputStyle}
            />
          </div>

          {/* Email — read only */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t.email_label}</label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              style={{ ...inputStyle, opacity: 0.4, cursor: "not-allowed" }}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>{t.email_hint}</div>
          </div>

          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving}
            style={{
              background: "#ffffff",
              color: "#000",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t.saving : t.save_changes}
          </button>
        </div>

        {/* Password Section */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 24 }}>{t.password_title}</div>

          {passwordMessage ? (
            <div style={{
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 500,
              background: passwordMessage.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${passwordMessage.type === "success" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              color: passwordMessage.type === "success" ? "#4ade80" : "#f87171",
            }}>
              {passwordMessage.text}
            </div>
          ) : null}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t.current_password}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t.current_placeholder}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t.new_password}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.new_placeholder}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>{t.confirm_password}</label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder={t.confirm_placeholder}
              style={inputStyle}
            />
          </div>

          <button
            type="button"
            onClick={() => void changePassword()}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
            style={{
              background: "#ffffff",
              color: "#000",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              opacity: changingPassword || !currentPassword || !newPassword || !confirmNewPassword ? 0.4 : 1,
            }}
          >
            {changingPassword ? t.updating : t.update_password}
          </button>
        </div>

        {/* Language Section */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>{t.language_title}</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {[
              { value: "en" as const, label: t.lang_en },
              { value: "fr" as const, label: t.lang_fr },
            ].map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLocale(l.value)}
                style={{
                  background: locale === l.value ? "#ffffff" : "rgba(255,255,255,0.04)",
                  color: locale === l.value ? "#000" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${locale === l.value ? "#ffffff" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void saveLanguage()}
            disabled={savingLanguage}
            style={{
              background: "#ffffff",
              color: "#000",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              opacity: savingLanguage ? 0.6 : 1,
            }}
          >
            {savingLanguage ? t.saving : t.save_language}
          </button>
        </div>

        {/* Wallpaper Section */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>{t.wallpaper_title}</div>

          {/* Color Presets */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>{t.solid_colors}</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { value: "#0a0a0a", label: "Default" },
                { value: "#0f1117", label: "Midnight" },
                { value: "#0a0f0a", label: "Forest" },
                { value: "#0a0a1a", label: "Navy" },
                { value: "#1a0a0a", label: "Ember" },
                { value: "#0f0a1a", label: "Violet" },
              ].map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => saveWallpaper(c.value, "color")}
                  title={c.label}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.value,
                    border: wallpaper === c.value ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Gradient Presets */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>{t.gradients}</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { value: "linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 100%)", label: "Purple Night" },
                { value: "linear-gradient(135deg, #0a0a0a 0%, #0a1a0a 100%)", label: "Matrix" },
                { value: "linear-gradient(135deg, #0a0a1a 0%, #001a2e 100%)", label: "Ocean" },
                { value: "linear-gradient(135deg, #1a0a0a 0%, #2e0a0a 100%)", label: "Ember" },
                { value: "linear-gradient(135deg, #0a0a0a 0%, #1a1a00 100%)", label: "Gold" },
                { value: "linear-gradient(135deg, #0a0a2e 0%, #2e0a2e 100%)", label: "Cosmos" },
              ].map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => saveWallpaper(g.value, "gradient")}
                  title={g.label}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: g.value,
                    border: wallpaper === g.value ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Custom Image */}
          <div>
            <label style={labelStyle}>{t.custom_image}</label>
            <label style={{ cursor: "pointer", display: "inline-block" }}>
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                color: "rgba(255,255,255,0.6)",
              }}>
                {t.upload_image}
              </div>
              <input type="file" accept="image/*,image/gif" onChange={handleWallpaperImage} style={{ display: "none" }} />
            </label>
            {wallpaperType === "image" && wallpaper ? (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <img src={wallpaper} alt="wallpaper preview" style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }} />
                <button
                  type="button"
                  onClick={() => saveWallpaper("#0a0a0a", "color")}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12 }}
                >
                  {t.remove}
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <label style={labelStyle}>{t.text_color}</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { value: "#ffffff", label: "White" },
                { value: "#000000", label: "Black" },
                { value: "#e2e8f0", label: "Silver" },
                { value: "#fbbf24", label: "Gold" },
                { value: "#60a5fa", label: "Blue" },
                { value: "#4ade80", label: "Green" },
              ].map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => applyTextColor(c.value)}
                  title={c.label}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.value,
                    border: textColor === c.value ? "2px solid rgba(255,255,255,0.8)" : "1px solid rgba(255,255,255,0.15)",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Plan Section */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>{t.plan_title}</div>

          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{t.current_plan}</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
                {plan === "free" ? "Free" : plan === "spark" ? "Spark" : plan === "build" ? "Build" : "Scale"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                {plan === "free" ? t.analyses_free :
                 plan === "spark" ? t.analyses_spark :
                 plan === "build" ? t.analyses_build :
                 t.analyses_scale}
              </div>
            </div>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: plan === "free" ? "rgba(255,255,255,0.3)" : plan === "spark" ? "#facc15" : plan === "build" ? "#60a5fa" : "#4ade80",
              flexShrink: 0,
            }} />
          </div>

          {plan !== "scale" ? (
            <Link
              href="/pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#ffffff",
                color: "#000000",
                border: "none",
                borderRadius: 10,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                cursor: "pointer",
                letterSpacing: "-0.02em",
              }}
            >
              {t.upgrade_plan}
            </Link>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              {t.scale_max}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div style={{ ...sectionStyle, borderColor: "rgba(248,113,113,0.15)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8, color: "#f87171" }}>{t.danger_title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{t.danger_sub}</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => void signOut()}
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.sign_out}
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: "rgba(248,113,113,0.1)",
                  color: "#f87171",
                  border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.delete_account}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                  {t.delete_confirm}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAccount()}
                    style={{
                      background: "#f87171",
                      color: "#000",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t.confirm_delete}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
