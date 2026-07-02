"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { supabase } from "@/lib/supabase";
import {
  formatContentBytes,
  isImageContentFile,
  isVideoContentFile,
  safeContentFileName,
  type ContentListItem,
} from "@/lib/content-shared";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { CreatorAvatar } from "./CreatorAvatar";
import { AddBrandContentOnboarding } from "./AddBrandContentOnboarding";

const BLUE = "#0047FF";

const primaryBtn: React.CSSProperties = {
  background: "#1A1A1A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

function formatDate(iso: string, lang: "fr" | "en") {
  try {
    return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ContentCard({ item, lang }: { item: ContentListItem; lang: "fr" | "en" }) {
  const isImage = isImageContentFile(item);
  const isVideo = isVideoContentFile(item);

  return (
    <article
      style={{
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        overflow: "hidden",
        background: "#FFFFFF",
      }}
    >
      <div
        style={{
          aspectRatio: isImage || isVideo ? "16/10" : "auto",
          minHeight: isImage || isVideo ? 160 : 0,
          background: "#F5F5F5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isImage ? (
          <img src={item.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : isVideo ? (
          <video src={item.file_url} controls style={{ width: "100%", maxHeight: 280, background: "#000" }} />
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 13 }}>
            {item.file_name}
          </div>
        )}
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 4, letterSpacing: "-0.02em" }}>
          {item.title}
        </div>
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 8 }}>
          {item.creatorName || (item.creatorHandle ? `@${item.creatorHandle}` : "—")}
          {" · "}
          {formatDate(item.created_at, lang)}
          {item.file_size ? ` · ${formatContentBytes(item.file_size)}` : ""}
        </div>
        {item.notes ? (
          <p style={{ fontSize: 13, color: "#4B5563", margin: "0 0 10px", lineHeight: 1.5 }}>{item.notes}</p>
        ) : null}
        {item.campaignNames && item.campaignNames.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {item.campaignNames.map((name) => (
              <span
                key={name}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: BLUE,
                  background: "rgba(0,71,255,0.08)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  letterSpacing: "-0.01em",
                }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 500, color: BLUE, textDecoration: "none" }}
        >
          {lang === "fr" ? "Télécharger" : "Download"} →
        </a>
      </div>
    </article>
  );
}

export function BrandContentView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const { navState, navigate } = useDashboardNavigation();
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/content?brandId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
      setItems(res.ok && data?.ok ? (data.items ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdated = () => void load();
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => window.removeEventListener("trackit:content-updated", onUpdated);
  }, [load]);

  if (navState.contentScreen?.type === "add") {
    return (
      <AddBrandContentOnboarding
        brandId={userId}
        isMobile={isMobile}
        onClose={() => navigate({ view: "content" }, { replace: true })}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent("trackit:content-updated"));
          navigate({ view: "content" }, { replace: true });
        }}
      />
    );
  }

  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: pagePad }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: isMobile ? 28 : 32,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: "0 0 8px",
                letterSpacing: "-0.03em",
              }}
            >
              {lang === "fr" ? "Contenu" : "Content"}
            </h1>
            <p style={{ fontSize: 15, color: "#6B7280", margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Tous les contenus envoyés par vos créateurs — aussi visibles dans Gérer et dans leurs campagnes."
                : "All content uploaded by your creators — also visible in Manage and in their campaigns."}
            </p>
          </div>
          <button
            type="button"
            style={{ ...primaryBtn, alignSelf: isMobile ? "stretch" : "flex-start", whiteSpace: "nowrap" }}
            onClick={() => navigate({ view: "content", contentScreen: { type: "add" } })}
          >
            {lang === "fr" ? "+ Ajouter du contenu" : "+ Add content"}
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
        ) : items.length === 0 ? (
          <div
            style={{
              border: "1px dashed #E5E5E5",
              borderRadius: 16,
              padding: "48px 24px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Aucun contenu pour le moment. Vos créateurs peuvent en envoyer depuis leur dashboard, ou ajoutez-en vous-même."
                : "No content yet. Creators can upload from their dashboard, or add some yourself."}
            </p>
            <button
              type="button"
              style={primaryBtn}
              onClick={() => navigate({ view: "content", contentScreen: { type: "add" } })}
            >
              {lang === "fr" ? "Ajouter du contenu" : "Add content"}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            {items.map((item) => (
              <ContentCard key={item.id} item={item} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
