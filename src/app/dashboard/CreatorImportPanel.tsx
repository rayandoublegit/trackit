"use client";

import { useRef, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { parseCreatorImportFile } from "@/lib/parse-creator-import";
import { importCreatorRows } from "@/lib/import-creators-client";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const IMPORT_EXAMPLE_COLUMNS = [
  { key: "username", required: true },
  { key: "display_name", required: false },
  { key: "platform", required: false },
  { key: "followers", required: false },
  { key: "engagement_rate", required: false },
  { key: "email", required: false },
  { key: "status", required: false },
  { key: "notes", required: false },
] as const;

const IMPORT_EXAMPLE_ROWS: Record<(typeof IMPORT_EXAMPLE_COLUMNS)[number]["key"], string>[] = [
  {
    username: "@mrbeast",
    display_name: "MrBeast",
    platform: "tiktok",
    followers: "128.9M",
    engagement_rate: "4.2%",
    email: "—",
    status: "contacted",
    notes: "—",
  },
  {
    username: "@medina_grillo",
    display_name: "Medina Grillo",
    platform: "instagram",
    followers: "1.1M",
    engagement_rate: "3.1%",
    email: "m.grillo@example.com",
    status: "saved",
    notes: "UGC home",
  },
];

function downloadCsvTemplate(lang: "en" | "fr") {
  const headers = IMPORT_EXAMPLE_COLUMNS.map((c) => c.key).join(",");
  const row1 = "mrbeast,MrBeast,tiktok,128900000,4.2,,contacted,";
  const row2 = "medina_grillo,Medina Grillo,instagram,1100000,3.1,m.grillo@example.com,saved,UGC home";
  const blob = new Blob([`${headers}\n${row1}\n${row2}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = lang === "fr" ? "modele-import-createurs.csv" : "creator-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ImportExamplesTable({ lang }: { lang: "en" | "fr" }) {
  const t = discoveryCopy(lang);

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        overflow: "hidden",
        background: "#FFFFFF",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #F0F0F0" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px" }}>{t.importExamplesTitle}</p>
        <p style={{ fontSize: 12, color: "#7A7A7A", margin: 0, lineHeight: 1.45 }}>{t.importExamplesSubtitle}</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              {IMPORT_EXAMPLE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: "10px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: col.required ? "#0047FF" : "#7A7A7A",
                    background: "#FAFAFA",
                    borderBottom: "1px solid #EFEFEF",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {col.key}
                  {col.required && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: "#0047FF", fontWeight: 700 }}>*</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {IMPORT_EXAMPLE_ROWS.map((row, i) => (
              <tr key={i}>
                {IMPORT_EXAMPLE_COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: row[col.key] === "—" ? "#C4C4C4" : "#1A1A1A",
                      borderBottom: i < IMPORT_EXAMPLE_ROWS.length - 1 ? "1px solid #F5F5F5" : "none",
                      whiteSpace: "nowrap",
                      fontFamily: col.key === "username" || col.key === "email" ? "inherit" : "inherit",
                    }}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #F0F0F0",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginRight: 2 }}>{t.importExamplesRequired}:</span>
          {IMPORT_EXAMPLE_COLUMNS.filter((c) => c.required).map((c) => (
            <span
              key={c.key}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#0047FF",
                background: "#EEF4FF",
                padding: "2px 8px",
                borderRadius: 20,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {c.key}
            </span>
          ))}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", marginLeft: 6, marginRight: 2 }}>
            {t.importExamplesOptional}:
          </span>
          {IMPORT_EXAMPLE_COLUMNS.filter((c) => !c.required).map((c) => (
            <span
              key={c.key}
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "#7A7A7A",
                background: "#F5F5F5",
                padding: "2px 8px",
                borderRadius: 20,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {c.key}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => downloadCsvTemplate(lang)}
          style={{
            border: "none",
            background: "transparent",
            color: "#0047FF",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            whiteSpace: "nowrap",
          }}
        >
          {t.importExamplesDownload}
        </button>
      </div>
    </div>
  );
}

export function CreatorImportPanel({
  lang,
  isMobile,
  folderId,
  onClose,
  onImported,
}: {
  lang: Lang;
  isMobile?: boolean;
  /** When set, imported creators are also added to this folder/list. */
  folderId?: string | null;
  onClose: () => void;
  onImported?: () => void;
}) {
  const t = discoveryCopy(lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);

  const processFile = async (file: File | undefined) => {
    if (!file || importing) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      setFeedback({ kind: "error", message: t.importInvalidFile });
      return;
    }

    setFileName(file.name);
    setFeedback(null);
    setImporting(true);

    try {
      const rows = await parseCreatorImportFile(file);
      if (rows.length === 0) {
        setFeedback({ kind: "error", message: t.importEmpty });
        return;
      }

      const result = await importCreatorRows(rows, { folderId: folderId ?? null });
      if (result.errors.some((e) => e.startsWith("limit:"))) {
        setFeedback({ kind: "error", message: t.importLimit });
        if (result.imported > 0) {
          onImported?.();
        }
        return;
      }

      if (result.imported === 0) {
        setFeedback({ kind: "error", message: t.importEmpty });
        return;
      }

      const message =
        result.skipped > 0
          ? t.importPartial(result.imported, result.skipped)
          : t.importSuccess(result.imported, Boolean(folderId));

      setFeedback({ kind: "success", message });
      onImported?.();

      if (result.skipped === 0) {
        window.setTimeout(() => onClose(), 1200);
      }
    } catch {
      setFeedback({ kind: "error", message: t.importError });
    } finally {
      setImporting(false);
    }
  };

  const requirements = [t.importReqProfile, t.importReqHandle, t.importReqEmail];

  return (
    <div style={{ minHeight: "100%" }}>
      <img
        src={TRACKIT_LOGO}
        alt="Trackit"
        style={{ height: 40, width: "auto", display: "block", marginBottom: 20, opacity: 0.9 }}
      />
      <button
        type="button"
        onClick={onClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "inherit",
          padding: 0,
          marginBottom: 28,
          letterSpacing: "-0.02em",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t.importTitle}
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 28 : 40,
          alignItems: "start",
        }}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void processFile(e.dataTransfer.files[0]);
          }}
          style={{
            background: dragOver ? "#F0F4FF" : "#F7F7F7",
            border: dragOver ? "2px dashed #0047FF" : "2px solid transparent",
            borderRadius: 16,
            minHeight: isMobile ? 280 : 360,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            textAlign: "center",
            transition: "background 0.15s, border-color 0.15s",
            opacity: importing ? 0.7 : 1,
            pointerEvents: importing ? "none" : "auto",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8 12l4-4 4 4M12 8v9M6 20h12a2 2 0 002-2V9l-5-5H8L6 9v9a2 2 0 002 2z"
                stroke="#1A1A1A"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            {t.importDragTitle}
          </p>
          <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 20px" }}>{t.importFileTypes}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{
              background: "#0047FF",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: importing ? "wait" : "pointer",
              fontFamily: "inherit",
              opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? t.importProcessing : t.importChooseFile}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => void processFile(e.target.files?.[0])}
          />
          {fileName && !importing && (
            <p style={{ fontSize: 12, color: "#7A7A7A", marginTop: 16, marginBottom: 0 }}>{fileName}</p>
          )}
        </div>

        <div>
          <h2
            style={{
              fontSize: isMobile ? 22 : 26,
              fontWeight: 600,
              color: "#1A1A1A",
              margin: "0 0 10px",
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
            }}
          >
            {t.importHeading}
          </h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 28px", lineHeight: 1.55 }}>{t.importBody}</p>

          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 14px", lineHeight: 1.45 }}>
            {t.importReqTitle}
          </p>
          <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {requirements.map((item) => (
              <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#1A1A1A" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                  <path d="M5 12l5 5L20 7" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{t.importAdvancedTitle}</p>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 16px", lineHeight: 1.55 }}>{t.importAdvancedBody}</p>

          <button
            type="button"
            onClick={() => setShowExamples((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#F5F5F5",
              border: "1px solid #EFEFEF",
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#1A1A1A",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.importSeeExamples}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{ transform: showExamples ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            >
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showExamples && <ImportExamplesTable lang={lang} />}

          {feedback && (
            <p
              style={{
                fontSize: 13,
                color: feedback.kind === "success" ? "#15803D" : feedback.kind === "error" ? "#B45309" : "#1A1A1A",
                margin: "24px 0 0",
                background: feedback.kind === "success" ? "#F0FDF4" : feedback.kind === "error" ? "#FFFBEB" : "#F5F5F5",
                padding: "12px 14px",
                borderRadius: 10,
                lineHeight: 1.45,
              }}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
