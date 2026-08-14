"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { listFolders, type FolderRow } from "@/lib/workspace-client";
import { useDashboardNavigationOptional } from "./DashboardNavigationProvider";

const SIMULATE_CREATOR_ID = "simulate-new-creator";
const SIMULATE_STORAGE_KEY = "trackit_simulate_new_creator";
const HOLD_MS = 1400;

type PendingCreator = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  commission_rate: number | null;
  discount_code: string | null;
};

const SIMULATE_CREATOR: PendingCreator = {
  id: SIMULATE_CREATOR_ID,
  handle: "noemie.home",
  full_name: "Noémie Home",
  avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=noemie-home",
  platform: "tiktok",
  commission_rate: 12,
  discount_code: "NOEMI12",
};

function wantsSimulateNewCreator() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("simulateNewCreator") === "1" || params.get("previewNewCreator") === "1") {
    sessionStorage.setItem(SIMULATE_STORAGE_KEY, "1");
    return true;
  }
  return sessionStorage.getItem(SIMULATE_STORAGE_KEY) === "1";
}

type Phase = "simple" | "info" | "list";

export function NewCreatorModal({ brandId }: { brandId?: string }) {
  const lang = useLang();
  const navigation = useDashboardNavigationOptional();
  const [queue, setQueue] = useState<PendingCreator[]>([]);
  const [simulate, setSimulate] = useState(false);
  const [phase, setPhase] = useState<Phase>("simple");
  const [commission, setCommission] = useState("");
  const [discount, setDiscount] = useState("");
  const [platform, setPlatform] = useState("");
  const [niche, setNiche] = useState("");
  const [followers, setFollowers] = useState("");
  const [engagement, setEngagement] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdRaf = useRef<number | null>(null);
  const holdStart = useRef<number | null>(null);
  const holdDone = useRef(false);

  const current = queue[0];
  const expanded = phase === "info" || phase === "list";
  const showList = phase === "list";

  const infoComplete = useMemo(() => {
    const commissionOk = commission.trim() !== "" && Number.isFinite(Number(commission));
    const engagementOk = engagement.trim() !== "" && Number.isFinite(Number(engagement));
    return (
      commissionOk &&
      discount.trim().length > 0 &&
      platform.trim().length > 0 &&
      niche.trim().length > 0 &&
      followers.trim().length > 0 &&
      engagementOk
    );
  }, [commission, discount, platform, niche, followers, engagement]);

  const listReady = folders.length === 0 || selectedFolderId.trim().length > 0;
  const canHoldAdd = showList && infoComplete && listReady && !saving;

  const load = async () => {
    if (!brandId) return;
    if (wantsSimulateNewCreator()) {
      setSimulate(true);
      setQueue([SIMULATE_CREATOR]);
      return;
    }
    try {
      const res = await fetch(`/api/creators/pending-review?brandId=${brandId}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.creators)) setQueue(data.creators);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
    if (!brandId) return;
    const interval = setInterval(() => {
      void load();
    }, 15000);
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [brandId]);

  useEffect(() => {
    if (!brandId) return;
    void (async () => {
      const { folders: f } = await listFolders();
      setFolders(f);
    })();
  }, [brandId]);

  useEffect(() => {
    if (!current) return;
    setPhase("simple");
    setSaveError(null);
    setHoldProgress(0);
    holdDone.current = false;
    // Prefill known invite values; empty fields still block until user fills everything.
    setCommission(current.commission_rate != null ? String(current.commission_rate) : "");
    setDiscount(current.discount_code || "");
    setPlatform(current.platform || "");
    setNiche("");
    setFollowers("");
    setEngagement("");
    setSelectedFolderId("");
    setAvatarFile(null);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [current?.id]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  useEffect(() => {
    if (!current) {
      document.body.classList.remove("ncm-dashboard-locked");
      return;
    }
    document.body.classList.add("ncm-dashboard-locked");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("ncm-dashboard-locked");
      document.body.style.overflow = prev;
    };
  }, [current]);

  useEffect(
    () => () => {
      if (holdRaf.current != null) cancelAnimationFrame(holdRaf.current);
    },
    [],
  );

  const closeCurrent = (creatorId: string) => {
    setQueue((q) => q.filter((c) => c.id !== creatorId));
    setPhase("simple");
    setHoldProgress(0);
    holdDone.current = false;
  };

  const redirectToList = (folderId: string, creatorHandle: string) => {
    const handle = creatorHandle.replace(/^@/, "");
    navigation?.navigate({
      view: "creators",
      list: folderId || undefined,
      creator: handle || undefined,
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) return;
    setAvatarFile(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const stopHold = (reset: boolean) => {
    if (holdRaf.current != null) {
      cancelAnimationFrame(holdRaf.current);
      holdRaf.current = null;
    }
    holdStart.current = null;
    if (reset && !holdDone.current) setHoldProgress(0);
  };

  const commitAdd = async () => {
    if (!brandId || !current) return;
    if (!infoComplete) {
      setSaveError(
        lang === "fr"
          ? "Remplis toutes les infos avant d'ajouter."
          : "Fill every field before adding.",
      );
      setHoldProgress(0);
      holdDone.current = false;
      return;
    }
    if (folders.length > 0 && !selectedFolderId) {
      setSaveError(lang === "fr" ? "Choisis une liste." : "Choose a list.");
      setHoldProgress(0);
      holdDone.current = false;
      return;
    }

    setSaving(true);
    setSaveError(null);
    const targetFolderId = selectedFolderId;
    try {
      if (simulate || current.id === SIMULATE_CREATOR_ID) {
        sessionStorage.removeItem(SIMULATE_STORAGE_KEY);
        const handle = current.handle;
        closeCurrent(current.id);
        redirectToList(targetFolderId, handle);
        return;
      }
      let avatarUrl: string | undefined;
      if (avatarFile && supabase) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${brandId}/creators/${current.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
        }
      }
      const res = await fetch("/api/creators/pending-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          creatorId: current.id,
          commissionRate: commission,
          discountCode: discount,
          platform,
          avatarUrl,
          niche,
          followers,
          engagement,
          folderId: targetFolderId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data?.error === "string"
            ? data.error
            : lang === "fr"
              ? "Échec de l'enregistrement"
              : "Save failed",
        );
        setHoldProgress(0);
        holdDone.current = false;
        return;
      }
      const handle = current.handle;
      closeCurrent(current.id);
      window.dispatchEvent(new CustomEvent("trackit:creators-saved"));
      redirectToList(targetFolderId, handle);
    } finally {
      setSaving(false);
    }
  };

  const startHold = () => {
    if (!canHoldAdd || holdDone.current) return;
    stopHold(false);
    holdDone.current = false;
    holdStart.current = performance.now();
    const tick = (now: number) => {
      const start = holdStart.current;
      if (start == null) return;
      const p = Math.min(1, (now - start) / HOLD_MS);
      setHoldProgress(p);
      if (p >= 1) {
        holdDone.current = true;
        holdRaf.current = null;
        holdStart.current = null;
        void commitAdd();
        return;
      }
      holdRaf.current = requestAnimationFrame(tick);
    };
    holdRaf.current = requestAnimationFrame(tick);
  };

  const goToListStep = () => {
    if (!infoComplete) {
      setSaveError(
        lang === "fr"
          ? "Remplis toutes les infos pour continuer."
          : "Fill every field to continue.",
      );
      return;
    }
    setSaveError(null);
    setSelectedFolderId("");
    setHoldProgress(0);
    holdDone.current = false;
    setPhase("list");
  };

  const handleRefuse = async () => {
    if (!brandId || !current) return;
    stopHold(true);
    setSaving(true);
    setSaveError(null);
    try {
      if (simulate || current.id === SIMULATE_CREATOR_ID) {
        closeCurrent(current.id);
        sessionStorage.removeItem(SIMULATE_STORAGE_KEY);
        document.body.classList.add("ncm-dashboard-disabled");
        return;
      }
      await fetch(
        `/api/creators/pending-review?creatorId=${current.id}&brandId=${brandId}`,
        { method: "DELETE" },
      );
      closeCurrent(current.id);
      document.body.classList.add("ncm-dashboard-disabled");
      window.dispatchEvent(new CustomEvent("trackit:creators-saved"));
    } finally {
      setSaving(false);
    }
  };

  if (!current) return null;

  const displayName = current.full_name || `@${current.handle}`;
  const handleLabel = `@${current.handle.replace(/^@/, "")}`;
  const displayAvatar = avatarPreview || current.avatar_url;
  const holdPct = Math.round(holdProgress * 100);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #2A2A2A",
    background: "#141414",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "#F5F5F5",
    letterSpacing: "-0.01em",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "#8A8A8A",
    marginBottom: 6,
    letterSpacing: "-0.01em",
  };

  return (
    <>
      <style>{`
        body.ncm-dashboard-locked .ws-shell,
        body.ncm-dashboard-disabled .ws-shell {
          pointer-events: none;
          user-select: none;
        }
        body.ncm-dashboard-disabled .ws-shell {
          filter: grayscale(0.35);
          opacity: 0.55;
        }
        .ncm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1200;
          padding: 20px;
          pointer-events: auto;
        }
        .ncm-card {
          position: relative;
          width: min(100%, 380px);
          max-height: min(92vh, 860px);
          overflow-x: hidden;
          overflow-y: auto;
          background: #111111;
          border-radius: 28px;
          border: 1px solid #262626;
          box-shadow: 0 28px 70px rgba(0,0,0,0.55);
          padding: 28px 26px 22px;
          font-family: "InterDisplay", "Inter", system-ui, sans-serif;
          transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
          scrollbar-width: thin;
          color: #F5F5F5;
        }
        .ncm-card.is-expanded {
          width: min(100%, 420px);
        }
        .ncm-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: #F5F5F5;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ncm-close:hover { background: #1F1F1F; }
        .ncm-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: #FFFFFF;
          letter-spacing: -0.04em;
          line-height: 1.2;
          text-align: center;
        }
        .ncm-profile {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin: 22px 0 8px;
        }
        .ncm-avatar {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          overflow: hidden;
          background: #1A1A1A;
          border: 1px solid #2E2E2E;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #F5F5F5;
        }
        .ncm-name {
          font-size: 16px;
          font-weight: 650;
          color: #FFFFFF;
          letter-spacing: -0.02em;
        }
        .ncm-handle {
          font-size: 13px;
          color: #8A8A8A;
          margin-top: 2px;
          letter-spacing: -0.01em;
        }
        .ncm-btn {
          width: 100%;
          border: none;
          border-radius: 999px;
          padding: 14px 18px;
          font-size: 15px;
          font-weight: 650;
          font-family: inherit;
          cursor: pointer;
          letter-spacing: -0.02em;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .ncm-btn:active { transform: scale(0.985); }
        .ncm-btn-primary {
          background: #FFFFFF;
          color: #111111;
        }
        .ncm-btn-primary:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .ncm-btn-ghost {
          background: transparent;
          color: #8A8A8A;
          font-weight: 500;
          font-size: 14px;
          padding: 10px;
        }
        .ncm-btn-ghost:hover { color: #F5F5F5; }
        .ncm-link {
          border: none;
          background: none;
          padding: 0;
          font: inherit;
          font-size: 13px;
          font-weight: 500;
          color: #8A8A8A;
          cursor: pointer;
          letter-spacing: -0.01em;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ncm-link:hover { color: #F5F5F5; }
        .ncm-link-accent { color: #FFFFFF; font-weight: 600; }
        .ncm-expand {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ncm-expand.is-open {
          grid-template-rows: 1fr;
        }
        .ncm-expand__inner {
          overflow: hidden;
          min-height: 0;
        }
        .ncm-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 18px;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s ease 0.08s, transform 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.08s;
        }
        .ncm-expand.is-open .ncm-fields {
          opacity: 1;
          transform: translateY(0);
        }
        .ncm-field:focus {
          border-color: #FFFFFF !important;
          box-shadow: 0 0 0 3px rgba(255,255,255,0.12);
          background: #171717 !important;
        }
        .ncm-field:disabled {
          opacity: 0.55;
        }
        .ncm-list-step {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ncm-list-step.is-open { grid-template-rows: 1fr; }
        .ncm-list-step__inner { overflow: hidden; min-height: 0; }
        .ncm-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 6px;
        }
        .ncm-hold {
          position: relative;
          width: 100%;
          border: none;
          border-radius: 999px;
          padding: 14px 18px;
          font-size: 15px;
          font-weight: 650;
          font-family: inherit;
          letter-spacing: -0.02em;
          cursor: pointer;
          overflow: hidden;
          user-select: none;
          touch-action: none;
          background: #1A1A1A;
          color: #FFFFFF;
          border: 1px solid #3A3A3A;
          margin-top: 4px;
        }
        .ncm-hold:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .ncm-hold__fill {
          position: absolute;
          inset: 0 auto 0 0;
          width: 0%;
          background: #FFFFFF;
          transition: none;
        }
        .ncm-hold__label {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          mix-blend-mode: difference;
          color: #FFFFFF;
        }
        .ncm-hold-hint {
          margin: 8px 0 0;
          text-align: center;
          font-size: 12px;
          color: #6E6E6E;
          letter-spacing: -0.01em;
        }
      `}</style>

      <div className="ncm-overlay" role="dialog" aria-modal="true" aria-labelledby="ncm-title">
        <div className={`ncm-card${expanded ? " is-expanded" : ""}`}>
          <button
            type="button"
            className="ncm-close"
            aria-label={lang === "fr" ? "Fermer" : "Close"}
            disabled={saving}
            onClick={() => void handleRefuse()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <h2 id="ncm-title" className="ncm-title">
            {lang === "fr"
              ? "Vous avez une nouvelle demande d'un créateur !"
              : "You have a new creator request!"}
          </h2>

          <div className="ncm-profile">
            <label
              className="ncm-avatar"
              style={{ cursor: saving ? "default" : "pointer", position: "relative" }}
              aria-label={lang === "fr" ? "Changer la photo" : "Change photo"}
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                displayName.replace("@", "").charAt(0).toUpperCase()
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={saving}
                style={{ display: "none" }}
              />
            </label>
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <div className="ncm-name">{displayName}</div>
              <div className="ncm-handle">{handleLabel}</div>
            </div>
          </div>

          {!expanded ? (
            <div style={{ marginTop: 18 }}>
              <button
                type="button"
                className="ncm-btn ncm-btn-primary"
                disabled={saving}
                onClick={() => setPhase("info")}
              >
                {lang === "fr" ? "Accepter" : "Accept"}
              </button>
              <div className="ncm-footer-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="ncm-link"
                  disabled={saving}
                  onClick={() => void handleRefuse()}
                >
                  {lang === "fr" ? "Pas intéressé" : "Not interested"}
                </button>
                <button
                  type="button"
                  className="ncm-link ncm-link-accent"
                  disabled={saving}
                  onClick={() => setPhase("info")}
                >
                  Add Info
                </button>
              </div>
            </div>
          ) : null}

          <div className={`ncm-expand${expanded ? " is-open" : ""}`}>
            <div className="ncm-expand__inner">
              <div className="ncm-fields">
                <div>
                  <label style={labelStyle}>{lang === "fr" ? "Commission (%)" : "Commission (%)"} *</label>
                  <input
                    type="number"
                    value={commission}
                    onChange={(e) => setCommission(e.target.value)}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>{lang === "fr" ? "Code promo" : "Promo code"} *</label>
                  <input
                    type="text"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder={lang === "fr" ? "Ex : SARAH10" : "e.g. SARAH10"}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>{lang === "fr" ? "Plateforme" : "Platform"} *</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  >
                    <option value="">{lang === "fr" ? "— Choisir —" : "— Choose —"}</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Niche *</label>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder={lang === "fr" ? "Ex : mode, beauté, fitness" : "e.g. fashion, beauty"}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>{lang === "fr" ? "Abonnés" : "Subscribers"} *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={followers}
                    onChange={(e) => setFollowers(e.target.value)}
                    placeholder={lang === "fr" ? "Ex : 10M, 1.2B, 450000" : "e.g. 10M, 1.2B"}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>{lang === "fr" ? "Taux (%)" : "Rate (%)"} *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={engagement}
                    onChange={(e) => setEngagement(e.target.value)}
                    placeholder={lang === "fr" ? "Ex : 3.5" : "e.g. 3.5"}
                    className="ncm-field"
                    style={fieldStyle}
                    disabled={saving || showList}
                    required
                  />
                </div>

                <div className={`ncm-list-step${showList ? " is-open" : ""}`} aria-hidden={!showList}>
                  <div className="ncm-list-step__inner">
                    {showList ? (
                      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
                        <label style={labelStyle}>{lang === "fr" ? "Liste" : "List"} *</label>
                        {folders.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#8A8A8A", lineHeight: 1.45 }}>
                            {lang === "fr"
                              ? "Aucune liste — le créateur ira dans Tous les créateurs."
                              : "No lists — creator will go to All creators."}
                          </p>
                        ) : (
                          <select
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                            disabled={saving}
                            className="ncm-field"
                            style={fieldStyle}
                            required
                          >
                            <option value="">
                              {lang === "fr" ? "— Choisir une liste —" : "— Choose a list —"}
                            </option>
                            {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                {folder.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {saveError ? (
                  <div style={{ fontSize: 13, color: "#FF6B6B", letterSpacing: "-0.01em" }}>{saveError}</div>
                ) : null}

                {!showList ? (
                  <button
                    type="button"
                    className="ncm-btn ncm-btn-primary"
                    disabled={saving || !infoComplete}
                    onClick={goToListStep}
                    style={{ marginTop: 4 }}
                  >
                    {lang === "fr" ? "Ajouter" : "Add"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ncm-hold"
                      disabled={!canHoldAdd}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={holdPct}
                      aria-label={
                        lang === "fr"
                          ? "Maintenir pour ajouter le créateur"
                          : "Hold to add creator"
                      }
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                        startHold();
                      }}
                      onPointerUp={() => stopHold(true)}
                      onPointerCancel={() => stopHold(true)}
                      onLostPointerCapture={() => stopHold(true)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <span className="ncm-hold__fill" style={{ width: `${holdPct}%` }} />
                      <span className="ncm-hold__label">
                        {saving
                          ? lang === "fr"
                            ? "Ajout…"
                            : "Adding…"
                          : holdProgress > 0 && holdProgress < 1
                            ? lang === "fr"
                              ? `Maintiens… ${holdPct}%`
                              : `Hold… ${holdPct}%`
                            : lang === "fr"
                              ? "Maintenir pour ajouter"
                              : "Hold to add"}
                      </span>
                    </button>
                    <p className="ncm-hold-hint">
                      {lang === "fr"
                        ? "Maintiens le bouton jusqu'à la fin pour confirmer"
                        : "Keep holding until the button fills to confirm"}
                    </p>
                  </>
                )}

                <button
                  type="button"
                  className="ncm-btn ncm-btn-ghost"
                  disabled={saving}
                  onClick={() => void handleRefuse()}
                >
                  {lang === "fr" ? "Refuser" : "Refuse"}
                </button>
              </div>
            </div>
          </div>

          {queue.length > 1 ? (
            <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "#6E6E6E" }}>
              {lang === "fr"
                ? `+${queue.length - 1} autre(s) en attente`
                : `+${queue.length - 1} more waiting`}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
