"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedCreator } from "@/lib/discovery-feed";
import type { Lang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import {
  saveCreator,
  unsave,
  createFolder,
  addToFolder,
  removeFromFolder,
  type FolderRow,
} from "@/lib/workspace-client";

const actionFont = "'InterDisplay', 'Inter Display', sans-serif";

export function SaveCreatorDropdown({
  lang,
  creator,
  saved,
  inFolders,
  folders,
  isPaid,
  onUpgrade,
  onWorkspaceChange,
  onSavedOptimistic,
  onFoldersOptimistic,
}: {
  lang: Lang;
  creator: FeedCreator;
  saved: boolean;
  inFolders: Set<string>;
  folders: FolderRow[];
  isPaid: boolean;
  onUpgrade?: () => void;
  onWorkspaceChange: () => void;
  onSavedOptimistic?: (username: string, saved: boolean) => void;
  onFoldersOptimistic?: (username: string, folderId: string, inFolder: boolean) => void;
}) {
  const t = discoveryCopy(lang);
  const [open, setOpen] = useState(false);
  const [newList, setNewList] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedLocal, setSavedLocal] = useState(saved);
  const [inFoldersLocal, setInFoldersLocal] = useState(inFolders);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(0);
  const savedPropRef = useRef(saved);
  const foldersKeyRef = useRef("");

  const foldersKey = [...inFolders].sort().join("\0");

  useEffect(() => {
    if (pendingRef.current > 0) return;
    if (savedPropRef.current === saved) return;
    savedPropRef.current = saved;
    setSavedLocal(saved);
  }, [saved]);

  useEffect(() => {
    if (pendingRef.current > 0) return;
    if (foldersKeyRef.current === foldersKey) return;
    foldersKeyRef.current = foldersKey;
    setInFoldersLocal(inFolders);
  }, [foldersKey, inFolders]);

  const syncWorkspace = useCallback(() => {
    void onWorkspaceChange();
  }, [onWorkspaceChange]);

  const setSaved = useCallback(
    (next: boolean) => {
      setSavedLocal(next);
      savedPropRef.current = next;
      onSavedOptimistic?.(creator.username, next);
    },
    [creator.username, onSavedOptimistic],
  );

  const setFolderMembership = useCallback(
    (folderId: string, inFolder: boolean) => {
      setInFoldersLocal((prev) => {
        const next = new Set(prev);
        if (inFolder) next.add(folderId);
        else next.delete(folderId);
        foldersKeyRef.current = [...next].sort().join("\0");
        return next;
      });
      onFoldersOptimistic?.(creator.username, folderId, inFolder);
    },
    [creator.username, onFoldersOptimistic],
  );

  const runPending = useCallback(async (fn: () => Promise<void>) => {
    pendingRef.current += 1;
    try {
      await fn();
    } finally {
      pendingRef.current -= 1;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const ensureSaved = useCallback(async (): Promise<boolean> => {
    if (savedLocal) return true;
    setSaved(true);
    const res = await saveCreator(creator);
    if (res.error) {
      setSaved(false);
      if (res.status === 402) onUpgrade?.();
      return false;
    }
    syncWorkspace();
    return true;
  }, [savedLocal, creator, onUpgrade, setSaved, syncWorkspace]);

  const toggleSaved = async (next: boolean) => {
    const prevSaved = savedLocal;
    const prevFolders = inFoldersLocal;
    const prevFoldersKey = foldersKeyRef.current;
    setSaved(next);
    if (!next) {
      setInFoldersLocal(new Set());
      foldersKeyRef.current = "";
      for (const folderId of prevFolders) {
        onFoldersOptimistic?.(creator.username, folderId, false);
      }
    }

    await runPending(async () => {
      try {
        if (next) {
          const res = await saveCreator(creator);
          if (res.error) {
            setSavedLocal(prevSaved);
            savedPropRef.current = prevSaved;
            onSavedOptimistic?.(creator.username, prevSaved);
            if (res.status === 402) onUpgrade?.();
            return;
          }
        } else {
          for (const folderId of prevFolders) {
            void removeFromFolder(folderId, creator.username);
          }
          const res = await unsave(creator.username);
          if (res.error) {
            setSavedLocal(prevSaved);
            setInFoldersLocal(prevFolders);
            foldersKeyRef.current = prevFoldersKey;
            onSavedOptimistic?.(creator.username, prevSaved);
            for (const folderId of prevFolders) {
              onFoldersOptimistic?.(creator.username, folderId, true);
            }
            return;
          }
        }
        syncWorkspace();
      } catch {
        setSavedLocal(prevSaved);
        setInFoldersLocal(prevFolders);
        foldersKeyRef.current = prevFoldersKey;
        onSavedOptimistic?.(creator.username, prevSaved);
        for (const folderId of prevFolders) {
          onFoldersOptimistic?.(creator.username, folderId, true);
        }
      }
    });
  };

  const toggleFolder = async (folderId: string, checked: boolean) => {
    const prevFolders = inFoldersLocal;
    const prevSaved = savedLocal;
    const prevFoldersKey = foldersKeyRef.current;
    setFolderMembership(folderId, checked);
    if (checked && !savedLocal) setSaved(true);

    await runPending(async () => {
      try {
        if (checked) {
          if (!prevSaved) {
            const res = await saveCreator(creator);
            if (res.error) {
              setInFoldersLocal(prevFolders);
              foldersKeyRef.current = prevFoldersKey;
              setSavedLocal(prevSaved);
              savedPropRef.current = prevSaved;
              onFoldersOptimistic?.(creator.username, folderId, false);
              onSavedOptimistic?.(creator.username, prevSaved);
              if (res.status === 402) onUpgrade?.();
              return;
            }
          }
          await addToFolder(folderId, creator.username);
        } else {
          await removeFromFolder(folderId, creator.username);
        }
        syncWorkspace();
      } catch {
        setInFoldersLocal(prevFolders);
        foldersKeyRef.current = prevFoldersKey;
        setSavedLocal(prevSaved);
        savedPropRef.current = prevSaved;
        onFoldersOptimistic?.(creator.username, folderId, !checked);
        if (checked && !prevSaved) onSavedOptimistic?.(creator.username, prevSaved);
      }
    });
  };

  const onCreateList = async () => {
    const name = newList.trim();
    if (!name || busy) return;
    if (!isPaid) {
      onUpgrade?.();
      return;
    }
    setBusy(true);
    try {
      const folder = await createFolder(name);
      setNewList("");
      if (!folder) return;
      if (!(await ensureSaved())) return;
      setFolderMembership(folder.id, true);
      await addToFolder(folder.id, creator.username);
      syncWorkspace();
    } finally {
      setBusy(false);
    }
  };

  const onRemoveSaved = async () => {
    if (!savedLocal) return;
    const prevSaved = savedLocal;
    const prevFolders = inFoldersLocal;
    const prevFoldersKey = foldersKeyRef.current;
    setSaved(false);
    setInFoldersLocal(new Set());
    foldersKeyRef.current = "";
    for (const folderId of prevFolders) {
      onFoldersOptimistic?.(creator.username, folderId, false);
    }
    setOpen(false);

    await runPending(async () => {
      try {
        for (const folderId of prevFolders) {
          void removeFromFolder(folderId, creator.username);
        }
        const res = await unsave(creator.username);
        if (res.error) {
          setSavedLocal(prevSaved);
          savedPropRef.current = prevSaved;
          setInFoldersLocal(prevFolders);
          foldersKeyRef.current = prevFoldersKey;
          onSavedOptimistic?.(creator.username, prevSaved);
          for (const folderId of prevFolders) {
            onFoldersOptimistic?.(creator.username, folderId, true);
          }
          return;
        }
        syncWorkspace();
      } catch {
        setSavedLocal(prevSaved);
        savedPropRef.current = prevSaved;
        setInFoldersLocal(prevFolders);
        foldersKeyRef.current = prevFoldersKey;
        onSavedOptimistic?.(creator.username, prevSaved);
        for (const folderId of prevFolders) {
          onFoldersOptimistic?.(creator.username, folderId, true);
        }
      }
    });
  };

  const listCount = inFoldersLocal.size;
  const label = savedLocal ? t.saved : t.save;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        style={{
          fontFamily: actionFont,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: savedLocal ? "#FFFFFF" : "var(--ws-text)",
          background: savedLocal ? "var(--ws-accent)" : "var(--ws-surface)",
          border: `1px solid ${savedLocal ? "var(--ws-accent)" : "var(--ws-border)"}`,
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {listCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.9 }}>({listCount})</span>
        )}
        <span style={{ fontSize: 10, opacity: 0.75 }}>▾</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 200,
            width: 248,
            maxWidth: 248,
            background: "var(--ws-surface)",
            border: "1px solid var(--ws-border)",
            borderRadius: 12,
            boxShadow: "var(--ws-shadow)",
            padding: "10px 0",
            fontFamily: actionFont,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "4px 14px 8px" }}>
            {t.saveToList}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              margin: "0 8px 4px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ws-text)",
              letterSpacing: "-0.01em",
              background: savedLocal ? "var(--ws-accent-soft)" : "transparent",
              minWidth: 0,
            }}
          >
            <input
              type="checkbox"
              checked={savedLocal}
              onChange={() => void toggleSaved(!savedLocal)}
              style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.saveWithoutList}</span>
          </label>

          {isPaid ? (
            <>
              {folders.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px 10px 6px" }}>
                  {t.folders}
                </div>
              )}

              {folders.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--ws-text-dim)", padding: "4px 10px 10px", lineHeight: 1.45 }}>
                  {t.noListsYet}
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto", overflowX: "hidden", padding: "0 4px" }}>
                  {folders.map((f) => {
                    const checked = inFoldersLocal.has(f.id);
                    return (
                      <label
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 8px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 13,
                          color: "var(--ws-text)",
                          letterSpacing: "-0.01em",
                          minWidth: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ws-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => void toggleFolder(f.id, !checked)}
                          style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ borderTop: "1px solid #F0F0F0", margin: "8px 6px 0", padding: "10px 8px 6px", boxSizing: "border-box" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 6,
                    width: "100%",
                    maxWidth: "100%",
                    alignItems: "center",
                  }}
                >
                  <input
                    value={newList}
                    onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void onCreateList(); }}
                    placeholder={t.listNamePlaceholder}
                    disabled={busy}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      maxWidth: "100%",
                      fontSize: 12,
                      padding: "7px 8px",
                      border: "1px solid var(--ws-border)",
                      borderRadius: 8,
                      fontFamily: actionFont,
                      letterSpacing: "-0.01em",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void onCreateList()}
                    disabled={busy || !newList.trim()}
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: "#0047FF",
                      background: "#E8EEFC",
                      border: "none",
                      borderRadius: 8,
                      padding: "7px 10px",
                      cursor: busy || !newList.trim() ? "default" : "pointer",
                      fontFamily: actionFont,
                      letterSpacing: "-0.01em",
                      opacity: busy || !newList.trim() ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.createList}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "#7A7A7A", padding: "4px 14px 10px", lineHeight: 1.5 }}>
              {t.listsPaidOnly}{" "}
              <button
                type="button"
                onClick={() => { onUpgrade?.(); setOpen(false); }}
                style={{ background: "none", border: "none", color: "#0047FF", fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: actionFont, fontSize: 12 }}
              >
                {t.upgradePlan}
              </button>
            </div>
          )}

          {savedLocal && (
            <div style={{ borderTop: "1px solid #F0F0F0", marginTop: 8, padding: "8px 14px 2px" }}>
              <button
                type="button"
                onClick={() => void onRemoveSaved()}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9A1F1F",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: actionFont,
                  letterSpacing: "-0.01em",
                }}
              >
                {t.removeFromSaved}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
