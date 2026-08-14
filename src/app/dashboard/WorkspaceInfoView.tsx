"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  getAppTimezone,
  setAppTimezone,
  type AppTimezone,
} from "@/lib/locale-preferences";
import { supabase } from "@/lib/supabase";
import { beginWorkspaceSwitch } from "@/lib/workspace-switch";
import {
  getWorkspaceEditId,
  setWorkspaceEditId,
  WORKSPACE_EDIT_EVENT,
} from "@/lib/workspace-edit";
import type { BrandWorkspace } from "@/lib/workspaces";
import { useDashboardTheme } from "./DashboardThemeProvider";

const TIMEZONES: AppTimezone[] = [
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

function prefsKey(workspaceId: string) {
  return `trackit.workspace.prefs.${workspaceId}`;
}

function loadPrefs(workspaceId: string) {
  try {
    const raw = localStorage.getItem(prefsKey(workspaceId));
    if (!raw) return { notifEmail: true, notifProduct: true };
    const prefs = JSON.parse(raw) as { notifEmail?: boolean; notifProduct?: boolean };
    return {
      notifEmail: typeof prefs.notifEmail === "boolean" ? prefs.notifEmail : true,
      notifProduct: typeof prefs.notifProduct === "boolean" ? prefs.notifProduct : true,
    };
  } catch {
    return { notifEmail: true, notifProduct: true };
  }
}

export function WorkspaceInfoView({
  userId,
  actorId,
  isMobile,
  fallbackName,
  fallbackAvatarUrl,
  onSaved,
}: {
  userId: string;
  actorId?: string;
  isMobile?: boolean;
  fallbackName: string;
  fallbackAvatarUrl?: string | null;
  onSaved?: () => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const { theme } = useDashboardTheme();
  const dark = theme === "dark";
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [workspace, setWorkspace] = useState<BrandWorkspace | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState(fallbackName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(fallbackAvatarUrl || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<AppTimezone>(() => getAppTimezone());
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifProduct, setNotifProduct] = useState(true);

  const applyWorkspace = (found: BrandWorkspace) => {
    setWorkspace(found);
    setName((found.name || "").trim() || fallbackName);
    setAvatarUrl(found.avatar_url);
    setAvatarFile(null);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    const prefs = loadPrefs(found.id);
    setNotifEmail(prefs.notifEmail);
    setNotifProduct(prefs.notifProduct);
  };

  const loadWorkspace = async () => {
    setLoading(true);
    setMessage(null);
    const fallback: BrandWorkspace = {
      id: userId,
      owner_id: userId,
      name: fallbackName,
      avatar_url: fallbackAvatarUrl || null,
    };
    try {
      const res = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        workspaces?: BrandWorkspace[];
        activeWorkspaceId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        applyWorkspace(fallback);
        setActiveId(userId);
        setWorkspaceEditId(userId, { silent: true });
        setMessage({
          text: data.error || (fr ? "Impossible de charger le workspace." : "Couldn’t load workspace."),
          type: "error",
        });
        return;
      }
      const list = data.workspaces || [];
      const active = data.activeWorkspaceId || userId;
      setActiveId(active);
      const editId = getWorkspaceEditId() || active;
      const found =
        list.find((w) => w.id === editId) ||
        list.find((w) => w.id === active) ||
        list[0] ||
        fallback;
      setWorkspaceEditId(found.id, { silent: true });
      applyWorkspace(found);
    } catch {
      applyWorkspace(fallback);
      setActiveId(userId);
      setWorkspaceEditId(userId, { silent: true });
      setMessage({ text: fr ? "Erreur réseau." : "Network error.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
    const onEdit = () => void loadWorkspace();
    window.addEventListener(WORKSPACE_EDIT_EVENT, onEdit);
    return () => window.removeEventListener(WORKSPACE_EDIT_EVENT, onEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fallbackName, fallbackAvatarUrl]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const uploadAvatar = async (workspaceId: string, file: File): Promise<string | null> => {
    if (!supabase) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    // Storage RLS requires first path segment = auth.uid()
    const path = `${userId}/workspaces/${workspaceId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (uploadError) {
      console.error("[workspace avatar]", uploadError.message);
      return null;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    return pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;
  };

  const save = async () => {
    if (!workspace || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ text: fr ? "Le nom est requis." : "Name is required.", type: "error" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let nextAvatar = avatarUrl;
      if (avatarFile) {
        const uploaded = await uploadAvatar(workspace.id, avatarFile);
        if (!uploaded) {
          setMessage({
            text: fr ? "Impossible d’uploader la photo." : "Couldn’t upload the picture.",
            type: "error",
          });
          setSaving(false);
          return;
        }
        nextAvatar = uploaded;
      }

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, avatarUrl: nextAvatar }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        workspace?: BrandWorkspace;
      };
      if (!res.ok || !data.ok || !data.workspace) {
        setMessage({
          text: data.error || (fr ? "Enregistrement impossible." : "Couldn’t save."),
          type: "error",
        });
        setSaving(false);
        return;
      }

      applyWorkspace(data.workspace);
      setAppTimezone(timezone);
      try {
        localStorage.setItem(
          prefsKey(workspace.id),
          JSON.stringify({ notifEmail, notifProduct }),
        );
      } catch {
        /* ignore */
      }

      window.dispatchEvent(new Event("trackit:workspaces-updated"));
      onSaved?.();
      setMessage({
        text: fr ? "Workspace mis à jour." : "Workspace updated.",
        type: "success",
      });
    } catch {
      setMessage({ text: fr ? "Erreur réseau." : "Network error.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const switchToWorkspace = () => {
    if (!workspace || switching || workspace.id === activeId) return;
    setSwitching(true);
    setMessage(null);
    beginWorkspaceSwitch({
      workspaceId: workspace.id,
      ownerId: userId,
      actorId,
      name: (workspace.name || name || fallbackName).trim(),
      avatarUrl: avatarUrl ?? workspace.avatar_url,
    });
  };

  const cardBg = dark ? "transparent" : "#fff";
  const cardBorder = dark ? "rgba(255,255,255,0.1)" : "#EFEFEF";
  const text = dark ? "#F3F3F4" : "#1A1A1A";
  const muted = dark ? "#9A9AA0" : "#7A7A7A";
  const inputBg = dark ? "#1E1F23" : "#fff";
  const inputBorder = dark ? "rgba(255,255,255,0.12)" : "#E5E5E5";
  const letter = String(name || "W").slice(0, 1).toUpperCase();
  const previewSrc = avatarPreview || avatarUrl;

  if (loading) {
    return (
      <div className="ws-page" style={{ padding: isMobile ? 16 : 40 }}>
        <p style={{ color: muted }}>{fr ? "Chargement…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="ws-page" style={{ padding: isMobile ? "56px 16px 40px" : "40px 40px 56px", maxWidth: 720 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: "-0.03em", color: text }}>
        {fr ? "Infos du workspace" : "Workspace info"}
      </h1>
      <p style={{ margin: "8px 0 24px", fontSize: 14, color: muted, letterSpacing: "-0.02em" }}>
        {fr
          ? "Photo, nom et préférences de ce space. Tout se met à jour dans la sidebar."
          : "Picture, name, and preferences for this space. Updates show in the sidebar."}
      </p>

      <div
        style={{
          border: `1px solid ${cardBorder}`,
          background: cardBg,
          borderRadius: 16,
          padding: isMobile ? 18 : 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              border: `1px solid ${cardBorder}`,
              background: dark ? "#2A2B30" : "#F5F5F5",
              padding: 0,
              overflow: "hidden",
              cursor: "pointer",
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
            }}
            title={fr ? "Changer la photo" : "Change picture"}
          >
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 700, color: text }}>{letter}</span>
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 650, color: text }}>{name || fallbackName}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `1px solid ${inputBorder}`,
                  background: "transparent",
                  color: text,
                  borderRadius: 10,
                  padding: "8px 12px",
                  font: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {fr ? "Changer la photo" : "Change picture"}
              </button>
              {previewSrc ? (
                <button
                  type="button"
                  onClick={() => {
                    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    setAvatarUrl(null);
                  }}
                  style={{
                    border: `1px solid ${inputBorder}`,
                    background: "transparent",
                    color: muted,
                    borderRadius: 10,
                    padding: "8px 12px",
                    font: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {fr ? "Retirer" : "Remove"}
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = "";
                if (!file) return;
                if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: muted }}>
          {fr ? "Nom du workspace" : "Workspace name"}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={fr ? "Nom du workspace" : "Workspace name"}
            style={{
              border: `1px solid ${inputBorder}`,
              background: inputBg,
              color: text,
              borderRadius: 12,
              padding: "11px 12px",
              font: "inherit",
              fontSize: 14,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: muted }}>
          {fr ? "Fuseau horaire" : "Timezone"}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value as AppTimezone)}
            style={{
              border: `1px solid ${inputBorder}`,
              background: inputBg,
              color: text,
              borderRadius: 12,
              padding: "11px 12px",
              font: "inherit",
              fontSize: 14,
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: muted, fontWeight: 600 }}>
            {fr ? "Préférences" : "Preferences"}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, color: text, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} />
            {fr ? "Emails de notifications" : "Email notifications"}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, color: text, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={notifProduct} onChange={(e) => setNotifProduct(e.target.checked)} />
            {fr ? "Mises à jour produit" : "Product updates"}
          </label>
        </div>

        {message ? (
          <p style={{ margin: 0, fontSize: 13, color: message.type === "error" ? "#f87171" : "#22c55e" }}>
            {message.text}
          </p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !workspace}
            style={{
              border: "none",
              background: dark ? "#f5f5f6" : "#111",
              color: dark ? "#111" : "#fff",
              borderRadius: 12,
              padding: "11px 16px",
              font: "inherit",
              fontSize: 14,
              fontWeight: 650,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
          </button>
          {workspace && workspace.id !== activeId ? (
            <button
              type="button"
              onClick={() => void switchToWorkspace()}
              disabled={switching}
              style={{
                border: `1px solid ${inputBorder}`,
                background: "transparent",
                color: text,
                borderRadius: 12,
                padding: "11px 16px",
                font: "inherit",
                fontSize: 14,
                fontWeight: 650,
                cursor: switching ? "default" : "pointer",
              }}
            >
              {switching
                ? "…"
                : fr
                  ? "Activer ce workspace"
                  : "Switch to this workspace"}
            </button>
          ) : (
            <span style={{ fontSize: 13, color: muted }}>
              {fr ? "Workspace actif" : "Active workspace"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
