"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StageDef } from "@/lib/pipeline";
import { stageColor } from "@/lib/pipeline";
import type { SavedRow } from "@/lib/workspace-client";
import { avatarFromDiscoverySavedRow } from "@/lib/creator-avatar";
import { crmFromSnapshot, emailFromRow, metricsFromRow, type CreatorCrm } from "@/lib/creator-crm";
import { CreatorAvatar } from "./CreatorAvatar";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import type { discoveryCopy } from "@/lib/discovery-copy";

type Copy = ReturnType<typeof discoveryCopy>;

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

function platformLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "instagram") return "Instagram";
  if (p === "youtube") return "YouTube";
  return "TikTok";
}

function TextPill({ value }: { value: string }) {
  if (!value) return <span style={{ color: "#B0B0B0", fontSize: 14 }}>—</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#F5F5F5",
        border: "1px solid #EFEFEF",
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 14,
        color: "#1A1A1A",
        maxWidth: 180,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

function isValidEmailAddress(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(v);
}

function isValidCommissionPercent(value: string): boolean {
  const v = value.trim().replace(/%$/, "").replace(",", ".");
  if (!v) return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function EditablePercentCell({
  value,
  placeholder,
  onSave,
  width = 72,
  invalidMessage,
}: {
  value: number | undefined;
  placeholder: string;
  onSave: (v: number | null) => void;
  width?: number;
  invalidMessage?: string;
}) {
  const displayValue = value != null && Number.isFinite(value) ? String(value) : "";
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const commit = () => {
    const trimmed = draft.trim().replace(/%$/, "").replace(",", ".");
    if (!isValidCommissionPercent(trimmed)) {
      setError(invalidMessage ?? "Invalid percentage");
      setDraft(displayValue);
      return;
    }
    setError(null);
    setFocused(false);
    if (!trimmed) {
      if (displayValue) onSave(null);
      return;
    }
    const n = Number(trimmed);
    if (n !== value) onSave(n);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        <input
          type="text"
          inputMode="decimal"
          value={focused ? draft : displayValue || draft}
          placeholder={placeholder}
          onFocus={(e) => {
            e.stopPropagation();
            setDraft(displayValue);
            setFocused(true);
            setError(null);
          }}
          onBlur={() => {
            commit();
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width,
            maxWidth: "100%",
            border: error ? "1px solid #DC2626" : focused ? "1px solid #0047FF" : "1px solid transparent",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 14,
            fontFamily: "inherit",
            color: displayValue || focused ? "#1A1A1A" : "#B0B0B0",
            background: focused || error ? "#FFFFFF" : "transparent",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {(focused || displayValue) && (
          <span style={{ fontSize: 14, color: displayValue || focused ? "#1A1A1A" : "#B0B0B0" }}>%</span>
        )}
      </div>
      {error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#DC2626", lineHeight: 1.35, maxWidth: width + 60 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function EditableTextCell({
  value,
  placeholder,
  onSave,
  width = 120,
  validate,
  invalidMessage,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  width?: number;
  validate?: (v: string) => boolean;
  invalidMessage?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    const trimmed = draft.trim();
    if (validate && trimmed && !validate(trimmed)) {
      setError(invalidMessage ?? "Invalid email");
      setDraft(value);
      return;
    }
    setError(null);
    setFocused(false);
    if (trimmed !== value) onSave(trimmed);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <input
        type="text"
        value={focused ? draft : value || draft}
        placeholder={placeholder}
        onFocus={(e) => {
          e.stopPropagation();
          setDraft(value);
          setFocused(true);
          setError(null);
        }}
        onBlur={() => {
          commit();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{
          width,
          maxWidth: "100%",
          border: error ? "1px solid #DC2626" : focused ? "1px solid #0047FF" : "1px solid transparent",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 14,
          fontFamily: "inherit",
          color: value || focused ? "#1A1A1A" : "#B0B0B0",
          background: focused || error ? "#FFFFFF" : "transparent",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#DC2626", lineHeight: 1.35, maxWidth: width + 40 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ScriptCell({
  scripts,
  addLabel,
  onOpen,
}: {
  scripts: { id: string; title: string }[];
  addLabel: string;
  onOpen: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          border: "1px solid #E5E5E5",
          background: "#FFF",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "#1A1A1A",
        }}
      >
        + {addLabel}
      </button>
      {scripts.length > 0 && (
        <span style={{ fontSize: 13, color: "#7A7A7A" }} title={scripts.map((s) => s.title).join(", ")}>
          {scripts.length}
        </span>
      )}
    </div>
  );
}

function DocumentsCell({
  documents,
  addLabel,
  onAdd,
}: {
  documents: string[];
  addLabel: string;
  onAdd: (names: string[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        style={{
          border: "1px solid #E5E5E5",
          background: "#FFF",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "#1A1A1A",
        }}
      >
        + {addLabel}
      </button>
      {documents.length > 0 && (
        <span style={{ fontSize: 13, color: "#7A7A7A" }} title={documents.join(", ")}>
          {documents.length}
        </span>
      )}
      <input
        ref={ref}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const names = Array.from(e.target.files ?? []).map((f) => f.name);
          if (names.length) onAdd(names);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StatusPillSelect({
  value,
  stages,
  onChange,
}: {
  value: string;
  stages: StageDef[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  const current = stages.find((s) => s.key === value) ?? stages[0];
  const dotColor = stageColor(value).color;

  const updateMenuPosition = () => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuHeight = menu?.offsetHeight ?? stages.length * 44 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuHeight + 12 && rect.top > menuHeight + 12;

    setMenuStyle({
      position: "fixed",
      left: rect.left,
      minWidth: Math.max(rect.width, 160),
      top: openAbove ? rect.top - menuHeight - 4 : rect.bottom + 4,
      visibility: "visible",
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, stages.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      style={{
        ...menuStyle,
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
        zIndex: 10000,
        padding: 4,
      }}
    >
      {stages.map((s) => {
        const c = stageColor(s.key);
        return (
          <button
            key={s.key}
            type="button"
            role="option"
            aria-selected={s.key === value}
            onClick={() => {
              onChange(s.key);
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 14px",
              border: "none",
              borderRadius: 8,
              background: s.key === value ? "#FAFAFA" : "transparent",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: "#1A1A1A",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            {s.label}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          borderRadius: 999,
          border: "1px solid #E5E5E5",
          background: "#FFFFFF",
          fontSize: 14,
          fontWeight: 500,
          color: "#1A1A1A",
          fontFamily: "inherit",
          cursor: "pointer",
          whiteSpace: "nowrap",
          minWidth: 140,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span>{current?.label ?? value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#B0B0B0", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 14,
  fontWeight: 600,
  color: "#1A1A1A",
  textAlign: "left",
  borderBottom: "1px solid #EFEFEF",
  background: "#FAFAFA",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 15,
  color: "#1A1A1A",
  borderBottom: "1px solid #F5F5F5",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

export function CreatorListTable({
  rows,
  stages,
  t,
  onRowClick,
  onStatusChange,
  onNotesChange,
  onCrmChange,
  onOpenScript,
  onDelete,
}: {
  rows: SavedRow[];
  stages: StageDef[];
  t: Copy;
  onRowClick: (row: SavedRow) => void;
  onStatusChange: (username: string, status: string) => void;
  onNotesChange: (username: string, notes: string) => void;
  onCrmChange: (username: string, patch: Partial<CreatorCrm>) => void;
  onOpenScript: (row: SavedRow) => void;
  onDelete: (username: string) => void;
}) {
  const columns: { key: string; label: string; minWidth: number }[] = [
    { key: "creator", label: t.creatorCol(rows.length), minWidth: 230 },
    { key: "channel", label: t.channelCol, minWidth: 80 },
    { key: "username", label: t.usernameCol, minWidth: 160 },
    { key: "status", label: t.statusCol, minWidth: 170 },
    { key: "followers", label: t.followers, minWidth: 110 },
    { key: "email", label: t.emailCol, minWidth: 180 },
    { key: "lastEmail", label: t.colLastEmail, minWidth: 160 },
    { key: "conversation", label: t.colConversation, minWidth: 150 },
    { key: "commission", label: t.colCommission, minWidth: 120 },
    { key: "promoCode", label: t.colPromoCode, minWidth: 130 },
    { key: "label", label: t.colLabel, minWidth: 120 },
    { key: "documents", label: t.colDocuments, minWidth: 140 },
    { key: "scripts", label: t.colScripts, minWidth: 140 },
    { key: "notes", label: t.colNotes, minWidth: 180 },
    { key: "birthday", label: t.colBirthday, minWidth: 120 },
    { key: "address", label: t.colAddress, minWidth: 160 },
    { key: "phone", label: t.colPhone, minWidth: 140 },
    { key: "engagement", label: t.engagement, minWidth: 110 },
    { key: "avgViews", label: t.colAvgViews, minWidth: 110 },
    { key: "avgLikes", label: t.colAvgLikes, minWidth: 110 },
    { key: "avgComments", label: t.colAvgComments, minWidth: 120 },
    { key: "avgShares", label: t.colAvgShares, minWidth: 120 },
    { key: "delete", label: t.colDelete, minWidth: 100 },
  ];

  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: "calc(100vh - 180px)",
        WebkitOverflowScrolling: "touch",
        width: "100%",
      }}
    >
      <table style={{ borderCollapse: "collapse", minWidth: columns.reduce((s, c) => s + c.minWidth, 0) }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ ...thStyle, minWidth: col.minWidth }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const snap = r.snapshot as Record<string, unknown> | null;
            const platform = r.platform ?? "tiktok";
            const email = emailFromRow(snap);
            const crm = crmFromSnapshot(snap);
            const metrics = metricsFromRow(snap, r.engagement_rate);
            const docs = crm.documents ?? [];
            const scriptRefs = crm.scripts ?? [];
            const convoEmail = email || crm.lastEmail;

            return (
              <tr
                key={r.creator_username}
                onClick={() => onRowClick(r)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#FAFAFA";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#FFFFFF";
                }}
              >
                <td style={{ ...tdStyle, minWidth: 230 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <CreatorAvatar
                      username={r.creator_username}
                      src={avatarFromDiscoverySavedRow({ avatar_url: r.avatar_url, snapshot: r.snapshot })}
                      displayName={r.display_name}
                      size={44}
                      alt={r.display_name}
                    />
                    <span style={{ fontWeight: 500 }}>{r.display_name}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span title={platformLabel(platform)}>
                    <PlatformBrandIcon platform={platform} size={22} />
                  </span>
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <TextPill value={`@${r.creator_username}`} />
                </td>
                <td style={tdStyle}>
                  <StatusPillSelect
                    value={r.pipeline_status}
                    stages={stages}
                    onChange={(status) => onStatusChange(r.creator_username, status)}
                  />
                </td>
                <td style={tdStyle}>{fmtCount(r.followers)}</td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <TextPill value={email} />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.lastEmail ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { lastEmail: v })}
                    validate={isValidEmailAddress}
                    invalidMessage={t.invalidEmail}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  {convoEmail ? (
                    <a
                      href={`mailto:${convoEmail}`}
                      style={{ fontSize: 14, color: "#0047FF", textDecoration: "none", fontWeight: 500 }}
                    >
                      {t.sendEmail}
                    </a>
                  ) : (
                    <span style={{ color: "#B0B0B0", fontSize: 14 }}>—</span>
                  )}
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditablePercentCell
                    value={crm.commissionRate ?? undefined}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { commissionRate: v })}
                    invalidMessage={t.invalidCommission}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.promoCode ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { promoCode: v })}
                    width={90}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.label ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { label: v })}
                    width={90}
                  />
                </td>
                <td style={tdStyle}>
                  <DocumentsCell
                    documents={docs}
                    addLabel={t.uploadDoc}
                    onAdd={(names) => onCrmChange(r.creator_username, { documents: [...docs, ...names] })}
                  />
                </td>
                <td style={tdStyle}>
                  <ScriptCell
                    scripts={scriptRefs}
                    addLabel={t.uploadScript}
                    onOpen={() => onOpenScript(r)}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={r.notes ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onNotesChange(r.creator_username, v)}
                    width={140}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.birthday ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { birthday: v })}
                    width={100}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.address ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { address: v })}
                    width={130}
                  />
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <EditableTextCell
                    value={crm.phone ?? ""}
                    placeholder={t.addField}
                    onSave={(v) => onCrmChange(r.creator_username, { phone: v })}
                    width={110}
                  />
                </td>
                <td style={tdStyle}>{metrics.engagement > 0 ? `${metrics.engagement.toFixed(1)}%` : "—"}</td>
                <td style={tdStyle}>{metrics.avgViews > 0 ? fmtCount(metrics.avgViews) : "—"}</td>
                <td style={tdStyle}>{metrics.avgLikes > 0 ? fmtCount(metrics.avgLikes) : "—"}</td>
                <td style={tdStyle}>{metrics.avgComments > 0 ? fmtCount(metrics.avgComments) : "—"}</td>
                <td style={tdStyle}>{metrics.avgShares > 0 ? fmtCount(metrics.avgShares) : "—"}</td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onDelete(r.creator_username)}
                    style={{
                      border: "1px solid #FECACA",
                      background: "#FFFFFF",
                      color: "#DC2626",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.colDelete}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
