"use client";

import { useState } from "react";
import type { Lang } from "@/lib/useLang";
import { deleteBrandContent } from "@/lib/content-shared";

const BLUE = "#0047FF";

const deleteBtnStyle: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FFF",
  color: "#DC2626",
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
};

export function ContentFileActions({
  lang,
  brandId,
  contentId,
  fileUrl,
  fileName,
  openLabel,
  onDeleted,
}: {
  lang: Lang;
  brandId?: string;
  contentId: string;
  fileUrl: string;
  fileName?: string;
  openLabel: string;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!brandId || deleting) return;
    const ok = window.confirm(
      lang === "fr"
        ? "Supprimer ce contenu ? Cette action est irréversible."
        : "Delete this content? This cannot be undone.",
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const success = await deleteBrandContent(brandId, contentId);
      if (success) {
        window.dispatchEvent(new CustomEvent("trackit:content-updated"));
        onDeleted?.();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName}
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 13,
          fontWeight: 500,
          color: BLUE,
          textDecoration: "none",
          letterSpacing: "-0.01em",
        }}
      >
        {openLabel} →
      </a>
      {brandId ? (
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          style={{
            ...deleteBtnStyle,
            opacity: deleting ? 0.6 : 1,
            cursor: deleting ? "wait" : "pointer",
          }}
        >
          {lang === "fr" ? "Supprimer" : "Delete"}
        </button>
      ) : null}
    </div>
  );
}
