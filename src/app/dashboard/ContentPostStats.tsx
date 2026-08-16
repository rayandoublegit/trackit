"use client";

import type { Lang } from "@/lib/useLang";
import { formatCompactStat, type ContentPostStatsFields } from "@/lib/content-shared";

export function ContentPostStatsDisplay({
  item,
  lang,
}: {
  item: ContentPostStatsFields;
  lang: Lang;
}) {
  if (!item.post_url) return null;

  if (!item.stats_updated_at) {
    return (
      <span
        style={{
          display: "inline-block",
          marginTop: 8,
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ws-text-muted)",
          background: "var(--ws-surface-2)",
          borderRadius: 6,
          padding: "3px 8px",
          letterSpacing: "-0.01em",
        }}
      >
        {lang === "fr" ? "Stats en attente" : "Stats pending"}
      </span>
    );
  }

  const entries = [
    { label: lang === "fr" ? "vues" : "views", value: item.views },
    { label: "likes", value: item.likes },
    { label: lang === "fr" ? "com." : "cmts", value: item.comments },
    { label: lang === "fr" ? "part." : "shares", value: item.shares },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 12px",
        marginTop: 8,
        fontSize: 12,
        color: "var(--ws-text-muted)",
        letterSpacing: "-0.01em",
      }}
    >
      {entries.map(({ label, value }) => (
        <span key={label}>
          <span style={{ fontWeight: 600, color: "var(--ws-text)" }}>{formatCompactStat(value, lang)}</span>{" "}
          {label}
        </span>
      ))}
    </div>
  );
}
