"use client";

import { useEffect, useRef, useState } from "react";
import { setWorkspaceClientIdentity, supabase } from "@/lib/supabase";
import {
  rememberClientBrandSpace,
} from "@/lib/brand-workspace";
import {
  beginWorkspaceSwitch,
  consumeWorkspaceSwitchFlag,
  dismissWorkspaceSwitchVeil,
} from "@/lib/workspace-switch";
import type { BrandWorkspace } from "@/lib/workspaces";
import { WsIcon } from "./WorkspaceIcons";

type WorkspaceSwitcherProps = {
  lang: "en" | "fr";
  ownerId: string;
  actorId?: string;
  delegated?: boolean;
  fallbackName: string;
  fallbackAvatarUrl?: string | null;
};

export function WorkspaceSwitcher({
  lang,
  ownerId,
  actorId,
  delegated,
  fallbackName,
  fallbackAvatarUrl,
}: WorkspaceSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<BrandWorkspace[]>([]);
  const [activeId, setActiveId] = useState(ownerId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BrandWorkspace | null>(null);

  const fr = lang === "fr";

  // After the post-switch reload the boot veil (plain DOM, injected before
  // hydration) is still covering the page: hold it briefly so the dashboard
  // paints behind it, then fade it out. Idempotent — safe under StrictMode.
  useEffect(() => {
    const flag = consumeWorkspaceSwitchFlag();
    dismissWorkspaceSwitchVeil(flag ? 550 : 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          workspaces?: BrandWorkspace[];
          activeWorkspaceId?: string;
        };
        if (cancelled || !res.ok || !data.ok) return;
        setWorkspaces(data.workspaces || []);
        const nextActive = data.activeWorkspaceId || ownerId;
        setActiveId(nextActive);
        rememberClientBrandSpace(nextActive);
        setWorkspaceClientIdentity(actorId || ownerId, ownerId, nextActive);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const onUpdated = () => void refresh();
    window.addEventListener("trackit:workspaces-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:workspaces-updated", onUpdated);
    };
  }, [actorId, ownerId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const active =
    workspaces.find((w) => w.id === activeId) ||
    ({
      id: ownerId,
      owner_id: ownerId,
      name: fallbackName,
      avatar_url: fallbackAvatarUrl || null,
    } satisfies BrandWorkspace);

  const mark = String(active.name || fallbackName || "W").slice(0, 1).toUpperCase();

  const requestSwitch = (ws: BrandWorkspace) => {
    if (ws.id === activeId) {
      setOpen(false);
      return;
    }
    setError("");
    setOpen(false);
    setConfirmTarget(ws);
  };

  const confirmSwitch = () => {
    const ws = confirmTarget;
    if (!ws || saving) return;
    setSaving(true);
    setConfirmTarget(null);
    beginWorkspaceSwitch({
      workspaceId: ws.id,
      ownerId,
      actorId,
      name: ws.name,
      avatarUrl: ws.avatar_url,
    });
  };

  const uploadAvatar = async (workspaceId: string, file: File): Promise<string | null> => {
    if (!supabase) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    // Storage RLS requires first path segment = auth.uid()
    const path = `${ownerId}/workspaces/${workspaceId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (uploadError) return null;
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    return pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;
  };

  const createWorkspace = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        workspace?: BrandWorkspace;
      };
      if (!res.ok || !data.ok || !data.workspace) {
        setError(data.error || (fr ? "Création impossible" : "Could not create workspace"));
        setSaving(false);
        return;
      }

      let avatarUrl: string | null = null;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(data.workspace.id, avatarFile);
        if (avatarUrl) {
          await fetch(`/api/workspaces/${data.workspace.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatarUrl }),
          });
        }
      }

      setCreateOpen(false);
      beginWorkspaceSwitch({
        workspaceId: data.workspace.id,
        ownerId,
        actorId,
        name: data.workspace.name || trimmed,
        avatarUrl,
        // The create endpoint already set this workspace active server-side.
        skipActivate: true,
      });
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
      setSaving(false);
    }
  };

  return (
    <div className="ws-workspace-switcher" ref={rootRef}>
      <button
        type="button"
        className="ws-workspace-btn"
        onClick={() => {
          setOpen((v) => !v);
          setCreateOpen(false);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={fr ? "Changer de workspace" : "Switch workspace"}
      >
        {active.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ws-workspace-mark is-photo" src={active.avatar_url} alt="" />
        ) : (
          <span className="ws-workspace-mark" aria-hidden>
            {mark}
          </span>
        )}
        <span className="label">{active.name || fallbackName}</span>
        <WsIcon name="chevron" size={14} />
      </button>

      {open && (
        <div className="ws-workspace-menu" role="menu">
          <div className="ws-workspace-menu__label">
            {fr ? "Workspaces" : "Workspaces"}
          </div>
          {(workspaces.length ? workspaces : [active]).map((ws) => {
            const letter = String(ws.name || "W").slice(0, 1).toUpperCase();
            const isActive = ws.id === activeId;
            return (
              <button
                key={ws.id}
                type="button"
                className={`ws-workspace-menu__item${isActive ? " is-active" : ""}`}
                role="menuitem"
                disabled={saving || loading}
                onClick={() => requestSwitch(ws)}
              >
                {ws.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ws-workspace-mark is-photo" src={ws.avatar_url} alt="" />
                ) : (
                  <span className="ws-workspace-mark" aria-hidden>
                    {letter}
                  </span>
                )}
                <span className="ws-workspace-menu__name">{ws.name}</span>
                {isActive ? <span className="ws-workspace-menu__check">✓</span> : null}
              </button>
            );
          })}
          {!delegated && (
            <button
              type="button"
              className="ws-workspace-menu__create"
              onClick={() => {
                setCreateOpen(true);
                setOpen(false);
                setName("");
                setAvatarFile(null);
                setAvatarPreview(null);
                setError("");
              }}
            >
              <span className="ws-workspace-menu__plus">+</span>
              {fr ? "Créer un workspace" : "Create workspace"}
            </button>
          )}
          {error && !createOpen ? <p className="ws-workspace-menu__error">{error}</p> : null}
        </div>
      )}

      {confirmTarget && (
        <div
          className="ws-workspace-panel ws-switch-confirm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmTarget(null);
          }}
        >
          <div className="ws-workspace-panel__card ws-switch-confirm__card">
            {confirmTarget.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ws-switch-confirm__mark is-photo" src={confirmTarget.avatar_url} alt="" />
            ) : (
              <span className="ws-switch-confirm__mark" aria-hidden>
                {String(confirmTarget.name || "W").slice(0, 1).toUpperCase()}
              </span>
            )}
            <h2 className="ws-switch-confirm__title">
              {fr
                ? `Passer à « ${confirmTarget.name} » ?`
                : `Switch to “${confirmTarget.name}”?`}
            </h2>
            <p className="ws-switch-confirm__hint">
              {fr
                ? "Le dashboard s'ouvrira avec les campagnes, créateurs et données de ce workspace."
                : "The dashboard will open with this workspace's campaigns, creators, and data."}
            </p>
            <div className="ws-workspace-panel__actions ws-switch-confirm__actions">
              <button
                type="button"
                className="ws-workspace-btn-ghost"
                onClick={() => setConfirmTarget(null)}
              >
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                className="ws-workspace-btn-primary"
                disabled={saving}
                onClick={confirmSwitch}
              >
                {fr ? "Changer de workspace" : "Switch workspace"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="ws-workspace-panel" role="dialog" aria-modal="true">
          <div className="ws-workspace-panel__card">
            <div className="ws-workspace-panel__head">
              <h2>{fr ? "Nouveau workspace" : "New workspace"}</h2>
              <button
                type="button"
                className="ws-icon-btn"
                onClick={() => setCreateOpen(false)}
                aria-label={fr ? "Fermer" : "Close"}
              >
                ×
              </button>
            </div>
            <p className="ws-workspace-panel__hint">
              {fr
                ? "Un workspace a ses propres campagnes, créateurs et données. Tout repart à zéro."
                : "Each workspace has its own campaigns, creators, and data — a clean slate."}
            </p>
            <button
              type="button"
              className="ws-workspace-avatar-picker"
              onClick={() => fileRef.current?.click()}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" />
              ) : (
                <span>{(name.trim() || "W").slice(0, 1).toUpperCase()}</span>
              )}
              <em>{fr ? "Photo" : "Photo"}</em>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
            <label className="ws-workspace-field">
              <span>{fr ? "Nom du workspace" : "Workspace name"}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={fr ? "ex. Brand US" : "e.g. Brand US"}
                autoFocus
                maxLength={60}
              />
            </label>
            {error ? <p className="ws-workspace-menu__error">{error}</p> : null}
            <div className="ws-workspace-panel__actions">
              <button type="button" className="ws-workspace-btn-ghost" onClick={() => setCreateOpen(false)}>
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                className="ws-workspace-btn-primary"
                disabled={!name.trim() || saving}
                onClick={() => void createWorkspace()}
              >
                {saving ? (fr ? "Création…" : "Creating…") : fr ? "Créer" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
