"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { applyAppLocale, clearUserSessionStorage, dispatchProfileUpdated, PROFILE_UPDATED_EVENT, type ProfileUpdatedDetail } from "@/lib/locale-preferences";
import { patchDashboardBootstrap } from "@/lib/dashboard-bootstrap-cache";
import { renameCachedAvatarUrl, setCachedAvatarUrl } from "@/lib/avatar-url-cache";
import { resolveAvatarUrl, toPersistableAvatarUrl } from "@/lib/resolve-avatar-url";
import { selectionCardStyle, selectionTextPrimary } from "@/lib/selection-card-styles";
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

const BLUE = "var(--ws-accent)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid var(--ws-border)", fontSize: 15, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
  background: "var(--ws-input)", color: "var(--ws-text)",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500,
  color: "var(--ws-text-muted)", marginBottom: 6, letterSpacing: "-0.01em",
};

export function CreatorSettings({ userId, isMobile, onSaved }: { userId?: string; isMobile?: boolean; onSaved?: () => void }) {
  const lang = useLang();
  const [fullName, setFullName] = useState("");
  const [initialFullName, setInitialFullName] = useState("");
  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<ProfileUsernameStatus>("idle");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hydratedRef = useRef(false);
  const savingRef = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeStarting, setStripeStarting] = useState(false);
  const [brandMemberships, setBrandMemberships] = useState<
    { brandId: string; brandName: string; creatorHandle: string | null; linkStatus: string; handleMatched: boolean }[]
  >([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  const loadBrandMemberships = async () => {
    if (!userId) {
      setBrandsLoading(false);
      return;
    }
    setBrandsLoading(true);
    try {
      const res = await fetch(`/api/creator/brands?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        brands?: typeof brandMemberships;
      };
      if (data?.ok) setBrandMemberships(data.brands ?? []);
    } finally {
      setBrandsLoading(false);
    }
  };

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
        const loadedName = data.full_name ?? "";
        const loadedUsername = data.username ?? "";
        setFullName(loadedName);
        setInitialFullName(loadedName);
        setUsername(loadedUsername);
        setInitialUsername(loadedUsername);
        setUsernameStatus(loadedUsername ? "available" : "idle");
        const resolved = data.avatar_url && supabase ? await resolveAvatarUrl(supabase, userId, data.avatar_url) : data.avatar_url;
        if (!cancelled) setAvatarUrl(resolved ?? null);
      }
      if (!cancelled) {
        setLoading(false);
        hydratedRef.current = true;
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    void loadBrandMemberships();
  }, [userId]);

  useEffect(() => {
    const onRefresh = () => void loadBrandMemberships();
    window.addEventListener("trackit:creators-saved", onRefresh);
    window.addEventListener("trackit:content-updated", onRefresh);
    window.addEventListener(PROFILE_UPDATED_EVENT, onRefresh);
    return () => {
      window.removeEventListener("trackit:creators-saved", onRefresh);
      window.removeEventListener("trackit:content-updated", onRefresh);
      window.removeEventListener(PROFILE_UPDATED_EVENT, onRefresh);
    };
  }, [userId]);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

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
    if (!userId) { setStripeLoading(false); return; }
    let cancelled = false;
    const loadStripe = async () => {
      try {
        const res = await fetch(`/api/creator/stripe-connect?userId=${encodeURIComponent(userId)}`);
        const data = (await res.json().catch(() => ({}))) as { connected?: boolean; onboarded?: boolean };
        if (!cancelled) {
          setStripeConnected(!!data.connected);
          setStripeOnboarded(!!data.onboarded);
        }
      } catch {
        /* silencieux : on laisse l'etat par defaut (non connecte) */
      } finally {
        if (!cancelled) setStripeLoading(false);
      }
    };
    void loadStripe();
    // Nettoie le parametre de retour Stripe dans l'URL apres onboarding.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payout_connected") === "1" || params.get("payout_refresh") === "1") {
        window.history.replaceState({}, "", "/dashboard?view=settings");
      }
    }
    return () => { cancelled = true; };
  }, [userId]);

  const startStripeOnboarding = async () => {
    if (!userId || stripeStarting) return;
    setStripeStarting(true);
    try {
      const res = await fetch("/api/creator/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || (lang === "fr" ? "Impossible de demarrer la connexion Stripe." : "Could not start Stripe connection."));
      setStripeStarting(false);
    } catch {
      setError(lang === "fr" ? "Erreur reseau." : "Network error.");
      setStripeStarting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 2 * 1024 * 1024) { setError(lang === "fr" ? "Image sous 2 Mo maximum." : "Image must be under 2MB"); return; }
    setError(""); setSaved(false); setAvatarFile(f);
    setAvatarPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  const canPersist = useCallback(() => {
    const cleanUsername = normalizeProfileUsername(username);
    const currentUsername = normalizeProfileUsername(initialUsername);
    if (cleanUsername && !isValidProfileUsername(cleanUsername)) return false;
    if (cleanUsername && cleanUsername !== currentUsername) {
      if (usernameStatus === "checking" || usernameStatus === "taken" || usernameStatus === "invalid") return false;
    }
    return true;
  }, [username, initialUsername, usernameStatus]);

  const hasPendingChanges = useCallback(() => {
    return (
      fullName.trim() !== initialFullName.trim()
      || normalizeProfileUsername(username) !== normalizeProfileUsername(initialUsername)
      || avatarFile !== null
    );
  }, [fullName, initialFullName, username, initialUsername, avatarFile]);

  const persistProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!supabase || !userId || savingRef.current) return false;
    if (!hasPendingChanges()) return true;
    if (!canPersist()) return false;

    const cleanUsername = normalizeProfileUsername(username);
    const currentUsername = normalizeProfileUsername(initialUsername);
    const usernameToSave = cleanUsername || currentUsername;

    if (cleanUsername && !isValidProfileUsername(cleanUsername)) {
      if (!options?.silent) setError(profileUsernameInvalidMessage(lang));
      return false;
    }
    if (cleanUsername && cleanUsername !== currentUsername) {
      if (usernameStatus === "checking") {
        if (!options?.silent) setError(lang === "fr" ? "Vérification du pseudo en cours…" : "Checking username availability…");
        return false;
      }
      if (usernameStatus === "taken") {
        if (!options?.silent) setError(profileUsernameTakenMessage(lang));
        return false;
      }
      if (usernameStatus !== "available") {
        if (!options?.silent) setError(profileUsernameInvalidMessage(lang));
        return false;
      }
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
        const path = `${userId}/avatar.${safeExt}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, avatarFile, {
          upsert: true,
          contentType: avatarFile.type || "image/jpeg",
        });
        if (upErr) {
          if (!options?.silent) setError(upErr.message);
          return false;
        }
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        newAvatarUrl = pub.publicUrl + "?t=" + Date.now();
      }

      const persistAvatarUrl =
        toPersistableAvatarUrl(supabase, userId, newAvatarUrl) ?? newAvatarUrl;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch("/api/creator/profile", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: usernameToSave,
          avatar_url: persistAvatarUrl,
        }),
      });
      let data = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: { full_name?: string; username?: string; avatar_url?: string | null };
      };

      // Fallback: cookie/bearer auth failed — persist with the browser session (RLS).
      if (!res.ok && res.status === 401) {
        const { error: directErr } = await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim(),
            username: usernameToSave || null,
            avatar_url: persistAvatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (directErr) {
          setError(directErr.message);
          return false;
        }
        data = {
          profile: {
            full_name: fullName.trim(),
            username: usernameToSave,
            avatar_url: persistAvatarUrl,
          },
        };
      } else if (!res.ok) {
        const msg = res.status === 409
          ? profileUsernameTakenMessage(lang)
          : (data.error || (lang === "fr" ? "Impossible d'enregistrer le profil." : "Could not save profile."));
        setError(msg);
        return false;
      }

      const savedUsername = normalizeProfileUsername(data.profile?.username ?? usernameToSave);
      const savedName = data.profile?.full_name ?? fullName.trim();
      const previousUsername = normalizeProfileUsername(initialUsername);
      setFullName(savedName);
      setInitialFullName(savedName);
      setUsername(savedUsername);
      setInitialUsername(savedUsername);
      setUsernameStatus(savedUsername ? "available" : "idle");

      const savedAvatar =
        toPersistableAvatarUrl(supabase, userId, data.profile?.avatar_url ?? persistAvatarUrl) ??
        persistAvatarUrl;
      const resolved = savedAvatar && supabase
        ? await resolveAvatarUrl(supabase, userId, savedAvatar)
        : savedAvatar;
      setAvatarUrl(resolved ?? null);
      if (previousUsername && savedUsername && previousUsername !== savedUsername) {
        renameCachedAvatarUrl(previousUsername, savedUsername, resolved ?? savedAvatar);
      } else if (savedUsername && (resolved || savedAvatar)) {
        setCachedAvatarUrl(savedUsername, resolved ?? savedAvatar);
      }
      setAvatarFile(null);
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
      setSaved(true);
      onSaved?.();
      patchDashboardBootstrap(userId, {
        full_name: savedName,
        username: savedUsername,
        avatar_url: resolved ?? savedAvatar,
      });
      dispatchProfileUpdated({
        full_name: savedName,
        username: savedUsername,
        avatar_url: resolved ?? savedAvatar,
      });
      window.dispatchEvent(new CustomEvent("trackit:creators-saved"));

      if (savedUsername) {
        await fetch("/api/creator/sync-brand-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ userId }),
        });
      }
      void loadBrandMemberships();
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    avatarFile,
    avatarPreview,
    avatarUrl,
    canPersist,
    fullName,
    hasPendingChanges,
    initialUsername,
    lang,
    onSaved,
    userId,
    username,
    usernameStatus,
  ]);

  useEffect(() => {
    if (!hydratedRef.current || loading || saving) return;
    if (!hasPendingChanges() || !canPersist()) return;
    const timer = setTimeout(() => { void persistProfile({ silent: true }); }, 800);
    return () => clearTimeout(timer);
  }, [fullName, username, loading, saving, hasPendingChanges, canPersist, persistProfile]);

  useEffect(() => {
    if (!hydratedRef.current || loading || saving || !avatarFile) return;
    void persistProfile({ silent: true });
  }, [avatarFile, loading, saving, persistProfile]);

  if (loading) {
    return (
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "var(--ws-text-dim)", fontSize: 14, background: "var(--ws-surface)", minHeight: "100vh" }}>
        {lang === "fr" ? "Chargement..." : "Loading..."}
      </div>
    );
  }

  const displayAvatar = avatarPreview || avatarUrl;

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 48, background: "var(--ws-surface)", minHeight: "100vh", flex: 1 }}>
      <div style={{ maxWidth: 640 }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 650, color: "var(--ws-text)", letterSpacing: "-0.035em", margin: "0 0 8px" }}>{lang === "fr" ? "Paramètres" : "Settings"}</h1>
          <p style={{ fontSize: 15, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>{lang === "fr" ? "Gérez votre profil et vos préférences." : "Manage your profile and preferences."}</p>
        </div>

        <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 20 }}>{lang === "fr" ? "Profil" : "Profile"}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", overflow: "hidden", background: "var(--ws-surface-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ws-border)" }}>
              {displayAvatar ? (
                <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 34, color: "var(--ws-text-dim)", fontWeight: 600 }}>{(fullName.trim() || username.trim() || "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <label style={{ display: "inline-block", padding: "10px 18px", borderRadius: 10, border: "none", background: BLUE, fontSize: 14, fontWeight: 600, color: "#FFFFFF", cursor: "pointer", letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Changer la photo" : "Change photo"}
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
              </label>
              <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginTop: 10 }}>{lang === "fr" ? "JPG ou PNG, 2 Mo max." : "JPG or PNG, 2MB max."}</div>
            </div>
          </div>

          <label style={labelStyle}>{lang === "fr" ? "Nom complet" : "Full name"}</label>
          <input type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Votre nom" : "Your name"} style={{ ...inputStyle, marginBottom: 22 }} />

          <label style={labelStyle}>{lang === "fr" ? "Pseudo (réseaux sociaux)" : "Handle (social media)"}</label>
          <div style={{ position: "relative", marginBottom: 6 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ws-text-dim)", fontSize: 15 }}>@</span>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setSaved(false); setError(""); }} placeholder="votrepseudo" style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          {usernameStatus !== "idle" && (
            <div style={{ fontSize: 12, color: profileUsernameStatusColor(usernameStatus), marginBottom: 4 }}>
              {profileUsernameStatusMessage(usernameStatus, lang)}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4 }}>{lang === "fr" ? "Doit correspondre au pseudo connu par la marque qui vous a invité." : "Should match the handle known by the brand that invited you."}</div>
        </div>

        <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 6 }}>
            {lang === "fr" ? "Marque partenaire" : "Partner brand"}
          </div>
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 16px", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Indique si votre compte est bien relié à la marque qui vous a invité. Vos uploads de contenu sont envoyés à cette marque."
              : "Shows whether your account is linked to the brand that invited you. Your content uploads are sent to this brand."}
          </p>

          {brandsLoading ? (
            <div style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
          ) : brandMemberships.length === 0 ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "#FFF7ED",
                border: "1px solid #FED7AA",
                fontSize: 13,
                color: "#9A3412",
                lineHeight: 1.5,
              }}
            >
              {lang === "fr"
                ? "Aucune marque associée pour le moment. Acceptez l'invitation de la marque et vérifiez que votre pseudo ci-dessus correspond à celui connu par la marque."
                : "No linked brand yet. Accept the brand invite and make sure your handle above matches the one the brand knows."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {brandMemberships.map((brand) => {
                const pending = brand.linkStatus === "pending_review";
                return (
                  <div
                    key={brand.brandId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: 12,
                      background: "rgba(26,127,55,0.06)",
                      border: "1px solid rgba(26,127,55,0.15)",
                    }}
                  >
                    <span style={{ fontSize: 16, color: "#1A7F37", fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>&#10003;</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A7F37", letterSpacing: "-0.02em" }}>
                        {lang === "fr" ? "A rejoint" : "Joined"}
                      </div>
                      <div style={{ fontSize: 14, color: "var(--ws-text)", marginTop: 4, letterSpacing: "-0.02em" }}>
                        {lang === "fr" ? "Appartient à " : "Belongs to "}
                        <strong>{brand.brandName}</strong>
                      </div>
                      {brand.creatorHandle && (
                        <div style={{ fontSize: 12, color: "var(--ws-text-muted)", marginTop: 6 }}>
                          {lang === "fr" ? "Pseudo côté marque : " : "Brand-side handle: "}
                          @{brand.creatorHandle.replace(/^@+/, "")}
                          {brand.handleMatched
                            ? lang === "fr"
                              ? " · correspond à votre compte"
                              : " · matches your account"
                            : lang === "fr"
                              ? " · vérifiez votre pseudo ci-dessus"
                              : " · check your handle above"}
                        </div>
                      )}
                      {pending && (
                        <div style={{ fontSize: 12, color: "#946000", marginTop: 6 }}>
                          {lang === "fr"
                            ? "En attente de validation par la marque — vous pouvez déjà envoyer du contenu."
                            : "Pending brand validation — you can already upload content."}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 16 }}>{lang === "fr" ? "Préférences" : "Preferences"}</div>
          <label style={labelStyle}>{lang === "fr" ? "Langue" : "Language"}</label>
          <div style={{ display: "flex", gap: 8 }}>
            {([["fr", "Français"], ["en", "English"]] as const).map(([code, label]) => {
              const active = lang === code;
              return (
              <button
                key={code}
                type="button"
                onClick={() => { if (code !== lang) { applyAppLocale(code); window.location.reload(); } }}
                style={{
                  flex: 1, padding: "11px 14px", borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.01em",
                  ...selectionCardStyle(active, { unselectedBackground: "var(--ws-surface)", unselectedBorder: "1px solid var(--ws-border)" }),
                  color: selectionTextPrimary(active),
                }}
              >
                {label}
              </button>
            );})}
          </div>
        </div>

        <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? 22 : 28, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 6 }}>{lang === "fr" ? "Versements" : "Payouts"}</div>
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 18px", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Connectez votre compte Stripe pour recevoir vos paiements automatiquement, en toute securite."
              : "Connect your Stripe account to receive your payments automatically and securely."}
          </p>

          {stripeLoading ? (
            <div style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
          ) : stripeOnboarded ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "rgba(26,127,55,0.08)" }}>
              <span style={{ fontSize: 15, color: "#1A7F37", fontWeight: 700 }}>&#10003;</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A7F37" }}>{lang === "fr" ? "Compte Stripe connecte" : "Stripe account connected"}</div>
                <div style={{ fontSize: 12, color: "rgba(26,127,55,0.85)" }}>{lang === "fr" ? "Vous etes pret a recevoir vos versements." : "You're ready to receive payouts."}</div>
              </div>
            </div>
          ) : stripeConnected ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "rgba(180,120,0,0.08)", marginBottom: 14 }}>
                <span style={{ fontSize: 15, color: "#B47800", fontWeight: 700 }}>&#9888;</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#946000" }}>{lang === "fr" ? "Configuration incomplete" : "Setup incomplete"}</div>
                  <div style={{ fontSize: 12, color: "rgba(148,96,0,0.85)" }}>{lang === "fr" ? "Terminez votre inscription Stripe pour activer les versements." : "Finish your Stripe setup to enable payouts."}</div>
                </div>
              </div>
              <button type="button" onClick={() => void startStripeOnboarding()} disabled={stripeStarting} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: stripeStarting ? "default" : "pointer", letterSpacing: "-0.01em", opacity: stripeStarting ? 0.7 : 1 }}>
                {stripeStarting ? (lang === "fr" ? "Redirection..." : "Redirecting...") : (lang === "fr" ? "Terminer la configuration" : "Finish setup")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void startStripeOnboarding()} disabled={stripeStarting} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: stripeStarting ? "default" : "pointer", letterSpacing: "-0.01em", opacity: stripeStarting ? 0.7 : 1 }}>
              {stripeStarting ? (lang === "fr" ? "Redirection..." : "Redirecting...") : (lang === "fr" ? "Connecter mon compte Stripe" : "Connect my Stripe account")}
            </button>
          )}
        </div>

        {(saving || saved || error) && (
          <div
            style={{
              fontSize: 13,
              color: error ? "var(--ws-danger)" : saved ? "#1A7F37" : "var(--ws-text-muted)",
              padding: "10px 12px",
              borderRadius: 10,
              background: error
                ? "rgba(153,35,35,0.06)"
                : saved
                  ? "rgba(26,127,55,0.08)"
                  : "var(--ws-hover)",
              marginBottom: 14,
            }}
          >
            {error
              || (saving
                ? (lang === "fr" ? "Enregistrement automatique…" : "Saving automatically…")
                : (lang === "fr" ? "Modifications enregistrées." : "Changes saved."))}
          </div>
        )}

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--ws-border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 6 }}>{lang === "fr" ? "Compte" : "Account"}</div>
          <p style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", margin: "0 0 14px 0", lineHeight: 1.45 }}>
            {lang === "fr" ? "Déconnectez-vous et dissociez cet appareil de votre compte Trackit." : "Sign out and disconnect this device from your Trackit account."}
          </p>
          <button
            type="button"
            onClick={() => void disconnectAccount()}
            disabled={signingOut}
            style={{
              padding: "11px 18px", borderRadius: 10, border: "1px solid rgba(220, 38, 38, 0.35)",
              background: "var(--ws-surface)", color: "var(--ws-danger)", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: signingOut ? "default" : "pointer", letterSpacing: "-0.01em",
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut ? (lang === "fr" ? "Déconnexion..." : "Disconnecting...") : (lang === "fr" ? "Déconnecter" : "Disconnect")}
          </button>
        </div>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--ws-border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--ws-text-dim)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Propulsé par" : "Powered by"}</span>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 26, width: "auto", opacity: 0.85 }} />
        </div>

      </div>
    </div>
  );
}
