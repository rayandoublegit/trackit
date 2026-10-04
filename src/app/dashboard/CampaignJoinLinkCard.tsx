"use client";

import { useEffect, useState } from "react";

/** Public link a brand shares so any creator can join this campaign on their own. */
export function campaignJoinPath(campaignId: string, lang: "en" | "fr"): string {
  return `${lang === "fr" ? "/fr" : ""}/join/${campaignId}`;
}

export function CampaignJoinLinkCard({
  campaignId,
  status,
  lang,
}: {
  campaignId: string;
  status: "Active" | "Paused" | "Completed" | "Draft";
  lang: "en" | "fr";
}) {
  const fr = lang === "fr";
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}${campaignJoinPath(campaignId, lang)}`;
  const open = status === "Active" || status === "Paused";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        marginBottom: 14,
        padding: "18px 20px",
        borderRadius: 14,
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", marginBottom: 4 }}>
        {fr ? "Lien d’inscription" : "Join link"}
      </div>
      <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
        {open
          ? fr
            ? "Envoyez ce lien à vos créateurs. Chacun crée son compte (ou se connecte) et rejoint la campagne tout seul."
            : "Send this link to your creators. Each one signs up (or signs in) and joins the campaign on their own."
          : status === "Draft"
            ? fr
              ? "Lancez la campagne pour activer ce lien."
              : "Launch the campaign to turn this link on."
            : fr
              ? "Cette campagne est terminée : le lien n’accepte plus d’inscriptions."
              : "This campaign has ended: the link no longer accepts sign-ups."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={fr ? "Lien d’inscription à la campagne" : "Campaign join link"}
          style={{
            flex: "1 1 240px",
            minWidth: 0,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "inherit",
            borderRadius: 10,
            border: "1px solid var(--ws-border)",
            background: "var(--ws-bg)",
            color: open ? "var(--ws-text)" : "var(--ws-text-dim)",
          }}
        />
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!open || !origin}
          style={{
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
            borderRadius: 10,
            border: "none",
            background: "var(--ws-accent)",
            color: "#FFFFFF",
            cursor: open ? "pointer" : "not-allowed",
            opacity: open ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier le lien" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
