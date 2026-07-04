"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { buildTrackitShortLink, createAffiliateShortLink } from "@/lib/affiliate-short-link";
import { loadAffiliates, saveAffiliates, type StoredAffiliate } from "@/lib/affiliates-storage";
import { supabase } from "@/lib/supabase";
import { CreatorAvatar } from "./CreatorAvatar";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

function codeFromHandle(handle: string, discount: string) {
  const base = handle.replace(/^@/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CREATOR";
  const pct = discount.replace(/\D/g, "") || "15";
  return `${base}${pct}`;
}

function mapAffiliatePlatform(platform?: string) {
  const value = (platform || "").toLowerCase();
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("instagram")) return "Instagram";
  if (value.includes("youtube")) return "YouTube";
  if (value.includes("twitter") || value === "x") return "Twitter";
  return "Other";
}

function handlesMatch(a: string, b: string) {
  return a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase();
}

export function CreatorAffiliatePanel({
  lang,
  isMobile,
  userId,
  creatorUsername,
  displayName,
  platform,
  avatarUrl,
  promoCode,
  commissionRate,
  affiliateRef: existingRef,
  onClose,
  onAssigned,
}: {
  lang: Lang;
  isMobile?: boolean;
  userId: string;
  creatorUsername: string;
  displayName: string;
  platform?: string;
  avatarUrl?: string | null;
  promoCode?: string | null;
  commissionRate?: number | null;
  affiliateRef?: string | null;
  onClose: () => void;
  onAssigned?: (payload: { promoCode: string; affiliateRef: string }) => void;
}) {
  const t = discoveryCopy(lang);
  const handle = creatorUsername.replace(/^@/, "").trim();
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [ref, setRef] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const name = displayName?.trim() || `@${handle}`;

  useEffect(() => {
    if (!userId || !handle) return;

    const existing = loadAffiliates(userId).find((a) => handlesMatch(a.creator, handle));
    const discount =
      promoCode?.match(/(\d{1,2})$/)?.[1] ||
      (commissionRate != null && Number.isFinite(commissionRate) ? String(Math.round(commissionRate)) : "15");

    const nextRef = existing?.ref || existingRef?.trim() || "";
    const nextCode = existing?.code || promoCode?.trim() || codeFromHandle(handle, discount);

    setRef(nextRef);
    setCode(nextCode);
    setLink(nextRef ? buildTrackitShortLink(nextRef) : "");
    setReady(true);

    if (supabase) {
      void supabase
        .from("profiles")
        .select("shopify_store_url")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.shopify_store_url) setDestinationUrl(String(data.shopify_store_url));
        });
    }
  }, [userId, handle, promoCode, commissionRate, existingRef]);

  const generateLink = async () => {
    if (!userId || !handle || !destinationUrl.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const existing = loadAffiliates(userId).find((a) => handlesMatch(a.creator, handle));
      const nextCode = existing?.code || code;

      const created = await createAffiliateShortLink({
        brandId: userId,
        creatorUsername: handle,
        destinationUrl: destinationUrl.trim(),
      });
      if (!created.ok || !created.slug) {
        setGenError(
          (lang === "fr" ? created.errorFr : undefined) ||
            created.error ||
            (lang === "fr" ? "Impossible de créer le lien." : "Could not create link."),
        );
        return;
      }

      const nextRef = created.slug;
      const nextLink = created.link || buildTrackitShortLink(nextRef);

      const row: StoredAffiliate = {
        creator: handle.startsWith("@") ? handle : `@${handle}`,
        platform: mapAffiliatePlatform(platform),
        ref: nextRef,
        code: nextCode,
        clicks: existing?.clicks ?? 0,
        conversions: existing?.conversions ?? 0,
        sales: existing?.sales ?? 0,
        commission: existing?.commission ?? 0,
        status: existing?.status ?? "Active",
      };
      const list = loadAffiliates(userId);
      saveAffiliates(userId, [row, ...list.filter((a) => !handlesMatch(a.creator, handle))]);

      await fetch("/api/affiliates/set-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, handle: `@${handle}`, code: nextCode, ref: nextRef }),
      }).catch(() => {});

      setRef(nextRef);
      setCode(nextCode);
      setLink(nextLink);
      onAssigned?.({ promoCode: nextCode, affiliateRef: nextRef });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const pad = isMobile ? 16 : 32;
  const externFont = "'InterDisplay', 'Inter Display', sans-serif";

  const fieldBox = useMemo(
    () =>
      ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid #E5E5E5",
        background: "#FAFAFA",
      }) as const,
    [],
  );

  return (
    <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%", fontFamily: externFont }}>
      <button
        type="button"
        onClick={onClose}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 15,
          color: "#7A7A7A",
          fontFamily: externFont,
          padding: 0,
          marginBottom: 20,
        }}
      >
        ← {t.affiliatePanelBack}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
        <CreatorAvatar
          src={avatarUrl}
          username={handle}
          displayName={name}
          size={52}
          alt={name}
          priority
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <img src={TRACKIT_LOGO} alt="" style={{ height: 22, width: "auto" }} />
            <h1
              style={{
                fontSize: isMobile ? 26 : 30,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: 0,
                letterSpacing: "-0.03em",
                fontFamily: externFont,
              }}
            >
              {t.colAffiliateLink}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
            {t.affiliatePanelSubtitle(name)}
          </p>
        </div>
      </div>

      {!ready ? (
        <div style={{ color: "#9A9A9A", fontSize: 14 }}>{t.loading}</div>
      ) : !link ? (
        <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>
              {lang === "fr" ? "URL de destination" : "Destination URL"}
            </label>
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://votre-boutique.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #E5E5E5",
                fontSize: 14,
                fontFamily: externFont,
              }}
            />
          </div>
          {genError ? <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{genError}</p> : null}
          <button
            type="button"
            disabled={generating || !destinationUrl.trim()}
            onClick={() => void generateLink()}
            style={{
              border: "none",
              background: "#0047FF",
              color: "#FFF",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: generating ? "default" : "pointer",
              opacity: generating || !destinationUrl.trim() ? 0.5 : 1,
              fontFamily: externFont,
            }}
          >
            {generating ? (lang === "fr" ? "Génération…" : "Generating…") : t.affiliateGenerate}
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#1A1A1A",
                marginBottom: 12,
                letterSpacing: "-0.02em",
                fontFamily: externFont,
              }}
            >
              {t.affiliateLinkLabel}
            </div>
            <div style={fieldBox}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  color: "#0047FF",
                  fontFamily: externFont,
                  letterSpacing: "-0.02em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {link}
              </div>
              <button
                type="button"
                onClick={() => void copyText(link, "link")}
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "#0047FF",
                  color: "#FFF",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: externFont,
                }}
              >
                {copied === "link" ? t.affiliateCopied : t.affiliateCopyLink}
              </button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#9A9A9A", fontFamily: externFont }}>
              /l/{ref}
            </p>
          </div>

          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#1A1A1A",
                marginBottom: 12,
                letterSpacing: "-0.02em",
                fontFamily: externFont,
              }}
            >
              {t.affiliateCodeLabel}
            </div>
            <div style={fieldBox}>
              <div
                style={{
                  flex: 1,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1A1A1A",
                  fontFamily: externFont,
                  letterSpacing: "-0.02em",
                }}
              >
                {code}
              </div>
              <button
                type="button"
                onClick={() => void copyText(code, "code")}
                style={{
                  flexShrink: 0,
                  border: "1px solid #E5E5E5",
                  background: "#FFF",
                  color: "#1A1A1A",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: externFont,
                }}
              >
                {copied === "code" ? t.affiliateCopied : t.affiliateCopyCode}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
