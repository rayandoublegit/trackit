"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  loadStoredOutreachHistory,
  type StoredOutreachEntry,
} from "@/lib/outreach-history-storage";
import { OUTREACH_HISTORY_UPDATED_EVENT } from "@/lib/outreach-history-events";
import { getOutreachHistory } from "@/lib/db";

function countByStatus(rows: Array<{ status?: string | null }>) {
  let sent = 0;
  let replied = 0;
  let opened = 0;
  let converted = 0;
  for (const row of rows) {
    const s = String(row.status || "").toLowerCase();
    sent += 1;
    if (s === "replied") replied += 1;
    else if (s === "opened") opened += 1;
    else if (s === "converted") converted += 1;
  }
  return { sent, replied, opened, converted };
}

export function OutreachAnalyticsCards({
  userId,
  refreshKey,
}: {
  userId?: string;
  refreshKey?: number;
}) {
  const lang = useLang();
  const [stats, setStats] = useState({ sent: 0, replied: 0, opened: 0, converted: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const local = loadStoredOutreachHistory(userId || "") as StoredOutreachEntry[];
      let rows: Array<{ status?: string | null }> = local;
      if (userId) {
        try {
          const remote = await getOutreachHistory(userId);
          if (Array.isArray(remote) && remote.length) rows = remote as Array<{ status?: string | null }>;
        } catch {
          /* keep local */
        }
      }
      if (!cancelled) setStats(countByStatus(rows));
    };
    void load();
    const onUpd = () => void load();
    window.addEventListener(OUTREACH_HISTORY_UPDATED_EVENT, onUpd);
    return () => {
      cancelled = true;
      window.removeEventListener(OUTREACH_HISTORY_UPDATED_EVENT, onUpd);
    };
  }, [userId, refreshKey]);

  const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
  const cards = [
    { label: lang === "fr" ? "Envoyés" : "Sent", value: String(stats.sent) },
    { label: lang === "fr" ? "Ouverts" : "Opened", value: String(stats.opened) },
    { label: lang === "fr" ? "Réponses" : "Replies", value: String(stats.replied) },
    { label: lang === "fr" ? "Taux de réponse" : "Reply rate", value: `${replyRate}%` },
    { label: lang === "fr" ? "Convertis" : "Converted", value: String(stats.converted) },
  ];

  return (
    <div className="ou-kpis">
      {cards.map((card, i) => (
        <div key={card.label} className="ou-kpi" style={{ borderLeft: i === 0 ? "none" : undefined }}>
          <div className="ou-kpi__label">{card.label}</div>
          <div className="ou-kpi__value">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
