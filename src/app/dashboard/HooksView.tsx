"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type HookRow = {
  id: string;
  title: string;
  body: string | null;
  color: number;
  created_at: string;
};

const HOOK_COLORS = ["#0047ff", "#f97316", "#10b981", "#a855f7", "#ef4444", "#06b6d4", "#e11d48", "#84cc16"];

async function sessionAuthHeaders(): Promise<HeadersInit> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export function HooksView({
  userId,
  isMobile,
  isCreator,
}: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
  displayName?: string | null;
}) {
  if (isCreator) {
    return <CreatorHooksView userId={userId} isMobile={isMobile} />;
  }
  return <BrandHooksView userId={userId} isMobile={isMobile} />;
}

function BrandHooksView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const inputRef = useRef<HTMLInputElement>(null);
  const [hooks, setHooks] = useState<HookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setHooks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch(`/api/hooks?brandId=${encodeURIComponent(userId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Chargement impossible" : "Could not load"));
        setHooks([]);
        return;
      }
      setHooks((data.hooks || []) as HookRow[]);
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, [userId, fr]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextColor = () => {
    const used = hooks.map((h) => h.color);
    for (let i = 0; i < HOOK_COLORS.length; i++) {
      if (!used.includes(i)) return i;
    }
    return hooks.length % HOOK_COLORS.length;
  };

  const addHook = async () => {
    const title = manualTitle.trim();
    if (!title || !userId || saving) return;
    setSaving(true);
    setError("");
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch("/api/hooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ brandId: userId, title, color: nextColor() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Création impossible" : "Could not create"));
        return;
      }
      if (data.hook) setHooks((prev) => [data.hook as HookRow, ...prev]);
      setManualTitle("");
      setAddingManual(false);
      window.dispatchEvent(new Event("trackit:hooks-updated"));
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteHook = async (id: string) => {
    if (!userId) return;
    setHooks((prev) => prev.filter((h) => h.id !== id));
    try {
      const authHeaders = await sessionAuthHeaders();
      await fetch(`/api/hooks?id=${encodeURIComponent(id)}&brandId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders,
      });
      window.dispatchEvent(new Event("trackit:hooks-updated"));
    } catch {
      void load();
    }
  };

  const renderRow = (hook: HookRow) => {
    const color = HOOK_COLORS[hook.color % HOOK_COLORS.length];
    return (
      <li key={hook.id} className="tsk-row" style={{ ["--tsk-color" as string]: color }}>
        <span className="tsk-check" aria-hidden style={{ pointerEvents: "none", opacity: 0.35 }} />
        <div className="tsk-row__body">
          <span className="tsk-row__title">{hook.title}</span>
        </div>
        <button
          type="button"
          className="tsk-row__del"
          onClick={() => void deleteHook(hook.id)}
          aria-label={fr ? "Supprimer" : "Delete"}
        >
          ×
        </button>
      </li>
    );
  };

  return (
    <div className={`tsk-page${isMobile ? " is-mobile" : ""}`} style={{ fontFamily: "inherit" }}>
      <div className="tsk-manual">
        <h1 className="tsk-manual__title" style={{ fontFamily: "inherit" }}>
          Hooks
        </h1>
        <p className="tsk-empty tsk-empty--manual" style={{ marginTop: 0, marginBottom: 16, fontFamily: "inherit" }}>
          {fr
            ? "Les hooks ajoutés ici apparaissent dans le dashboard de tous vos créateurs actifs."
            : "Hooks you add here appear in every active creator dashboard."}
        </p>

        {error ? (
          <p className="tsk-error" style={{ fontFamily: "inherit" }}>
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="tsk-empty" style={{ fontFamily: "inherit" }}>
            {fr ? "Chargement…" : "Loading…"}
          </p>
        ) : hooks.length === 0 && !addingManual ? (
          <p className="tsk-empty tsk-empty--manual" style={{ fontFamily: "inherit" }}>
            {fr
              ? "Aucun hook pour l’instant — créez-en un pour le partager avec vos créateurs."
              : "No hooks yet — create one to share with your creators."}
          </p>
        ) : (
          <ul className="tsk-manual__list">{hooks.map(renderRow)}</ul>
        )}

        {addingManual ? (
          <div className="tsk-manual__compose">
            <span className="tsk-manual__compose-check" aria-hidden />
            <input
              ref={inputRef}
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={fr ? "Texte du hook…" : "Hook text…"}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addHook();
                if (e.key === "Escape") {
                  setAddingManual(false);
                  setManualTitle("");
                }
              }}
              autoFocus
              style={{ fontFamily: "inherit" }}
            />
            <button
              type="button"
              className="tsk-manual__save"
              disabled={!manualTitle.trim() || saving}
              onClick={() => void addHook()}
              style={{ fontFamily: "inherit" }}
            >
              {saving ? "…" : fr ? "Ajouter" : "Add"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tsk-manual__add"
            onClick={() => {
              setAddingManual(true);
              queueMicrotask(() => inputRef.current?.focus());
            }}
            style={{ fontFamily: "inherit" }}
          >
            <span className="tsk-manual__add-plus" aria-hidden>
              +
            </span>
            {fr ? "Créer un nouveau hook" : "Add hook"}
          </button>
        )}
      </div>
    </div>
  );
}

type CreatorHookRow = HookRow & {
  brandName: string;
  status: string | null;
};

function CreatorHooksView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const [hooks, setHooks] = useState<CreatorHookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setHooks([]);
      setLoading(false);
      return;
    }
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch(`/api/creator/hooks?userId=${encodeURIComponent(userId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Chargement impossible" : "Could not load"));
        return;
      }
      setHooks((data.hooks || []) as CreatorHookRow[]);
      setError("");
    } catch {
      setError(fr ? "Erreur réseau" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [userId, fr]);

  useEffect(() => {
    void load();
    if (!userId) return;
    const interval = setInterval(() => void load(), 20_000);
    const onFocus = () => void load();
    const onUpdated = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("trackit:hooks-updated", onUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("trackit:hooks-updated", onUpdated);
    };
  }, [load, userId]);

  const toggleDone = async (hook: CreatorHookRow) => {
    if (!userId) return;
    const nextStatus = hook.status === "done" ? "seen" : "done";
    setHooks((list) => list.map((h) => (h.id === hook.id ? { ...h, status: nextStatus } : h)));
    try {
      const authHeaders = await sessionAuthHeaders();
      await fetch("/api/creator/hooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ userId, hookId: hook.id, status: nextStatus }),
      });
    } catch {
      void load();
    }
  };

  const open = hooks.filter((h) => h.status !== "done");
  const done = hooks.filter((h) => h.status === "done");

  const renderRow = (hook: CreatorHookRow, opts?: { done?: boolean }) => {
    const color = HOOK_COLORS[(hook.color ?? 0) % HOOK_COLORS.length];
    return (
      <li
        key={hook.id}
        className={`tsk-row${opts?.done ? " is-done" : ""}`}
        style={{ ["--tsk-color" as string]: color }}
      >
        <button
          type="button"
          className="tsk-check"
          aria-label={opts?.done ? "Undo" : "Done"}
          onClick={() => void toggleDone(hook)}
        />
        <div className="tsk-row__body">
          <span className="tsk-row__title">{hook.title}</span>
          {hook.brandName ? <span className="tsk-row__due">{hook.brandName}</span> : null}
        </div>
      </li>
    );
  };

  return (
    <div className={`tsk-page${isMobile ? " is-mobile" : ""}`} style={{ fontFamily: "inherit" }}>
      <div className="tsk-manual">
        <h1 className="tsk-manual__title" style={{ fontFamily: "inherit" }}>
          Hooks
        </h1>
        <p className="tsk-empty tsk-empty--manual" style={{ marginTop: 0, marginBottom: 16, fontFamily: "inherit" }}>
          {fr
            ? "Hooks partagés par vos marques — cochez ceux que vous avez utilisés."
            : "Hooks shared by your brands — check off the ones you’ve used."}
        </p>

        {error ? (
          <p className="tsk-error" style={{ fontFamily: "inherit" }}>
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="tsk-empty" style={{ fontFamily: "inherit" }}>
            {fr ? "Chargement…" : "Loading…"}
          </p>
        ) : open.length === 0 && done.length === 0 ? (
          <p className="tsk-empty tsk-empty--manual" style={{ fontFamily: "inherit" }}>
            {fr
              ? "Aucun hook pour l’instant. Dès qu’une marque en ajoute, ils apparaîtront ici."
              : "No hooks yet. As soon as a brand adds some, they’ll show up here."}
          </p>
        ) : (
          <>
            <div className="tsk-list-block__label" style={{ fontFamily: "inherit" }}>
              {fr ? "À faire" : "To do"}
            </div>
            {open.length === 0 ? (
              <p className="tsk-empty" style={{ fontFamily: "inherit" }}>
                {fr ? "Tous les hooks sont cochés." : "All hooks are checked off."}
              </p>
            ) : (
              <ul className="tsk-manual__list">{open.map((h) => renderRow(h))}</ul>
            )}
            {done.length > 0 ? (
              <div className="tsk-done" style={{ marginTop: 24 }}>
                <div className="tsk-list-block__label" style={{ fontFamily: "inherit" }}>
                  {fr ? "Utilisés" : "Used"}
                </div>
                <ul className="tsk-manual__list">{done.map((h) => renderRow(h, { done: true }))}</ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
