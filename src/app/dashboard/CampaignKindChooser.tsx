"use client";

import type { CampaignKind } from "@/lib/dashboard-navigation";

const CHOICES: { kind: CampaignKind; title: string; text: string }[] = [
  {
    kind: "affiliate",
    title: "Affiliation",
    text: "A code, a commission, and the sales tied to the campaign.",
  },
  {
    kind: "gifting",
    title: "Gifting",
    text: "A gifted product, a frozen contract, a parcel, then the video.",
  },
  {
    kind: "rpm",
    title: "RPM",
    text: "A rate per thousand views, tracked on the published videos.",
  },
];

export function CampaignKindChooser({
  isMobile,
  onPick,
  onClose,
}: {
  isMobile?: boolean;
  onPick: (kind: CampaignKind) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ minHeight: "100%", background: "var(--ws-bg)", color: "var(--ws-text)", padding: isMobile ? 16 : "48px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <button type="button" onClick={onClose} style={quiet}>
          Back
        </button>
        <h1 style={{ fontSize: isMobile ? 28 : 36, letterSpacing: "-0.04em", margin: "18px 0 8px" }}>
          Create a campaign
        </h1>
        <p style={{ margin: "0 0 28px", color: "var(--ws-text-muted)" }}>
          One start. The rest of the flow depends on what you want to measure.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {CHOICES.map((choice) => (
            <button key={choice.kind} type="button" onClick={() => onPick(choice.kind)} style={card}>
              <strong style={{ fontSize: 18 }}>{choice.title}</strong>
              <span style={{ color: "var(--ws-text-muted)" }}>{choice.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const quiet: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "var(--ws-text-muted)",
  padding: 0,
  cursor: "pointer",
  font: "inherit",
};

const card: React.CSSProperties = {
  display: "grid",
  gap: 6,
  textAlign: "left",
  padding: "18px 18px",
  borderRadius: 16,
  border: "1px solid var(--ws-border)",
  background: "var(--ws-surface)",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
};
