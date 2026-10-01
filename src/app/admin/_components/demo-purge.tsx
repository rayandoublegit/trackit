"use client";

import { useState } from "react";
import type { PurgeReport, PurgeTable } from "@/lib/admin-demo-purge";
import { useLang } from "@/lib/useLang";
import { Card, Empty, LoadState, useAdminData, useAdminFormat, useT } from "./ui";

const TABLE_LABEL: Record<PurgeTable, [string, string]> = {
  campaigns: ["“Trackit” demo campaigns", "Campagnes démo « Trackit »"],
  creators: ["Fake creators", "Créateurs fictifs"],
  sales: ["Fake sales", "Ventes fictives"],
  campaign_creators: ["Campaign ↔ creator links", "Liens campagne ↔ créateur"],
  campaign_content: ["Campaign content links", "Contenus liés aux campagnes"],
  affiliate_links: ["Affiliate links", "Liens d’affiliation"],
  creator_content: ["Fake content (mock stats)", "Contenus fictifs (stats inventées)"],
  discovery_saved: ["Saved demo creators", "Créateurs démo enregistrés"],
  discovery_folder_items: ["Items in “Trackit” lists", "Éléments des listes « Trackit »"],
  discovery_folders: ["Empty “Trackit” lists", "Listes « Trackit » vides"],
};

/** Counts and deletes the rows the old demo preset seeded into real accounts. */
export function DemoPurgeCard() {
  const scan = useAdminData<PurgeReport>("/api/admin/purge-demo");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PurgeReport | null>(null);
  const [failure, setFailure] = useState("");
  const { num } = useAdminFormat();
  const t = useT();
  const lang = useLang() === "fr" ? 1 : 0;

  const report = result ?? scan.data;
  const total = report ? Object.values(report.counts).reduce((s, n) => s + n, 0) : 0;

  const purge = async () => {
    if (!window.confirm(t(`Delete ${total} demo rows from every account? This can't be undone.`, `Supprimer ${total} lignes de démo de tous les comptes ? C’est définitif.`))) return;
    setBusy(true);
    setFailure("");
    try {
      const res = await fetch("/api/admin/purge-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = (await res.json().catch(() => ({}))) as PurgeReport & { error?: string };
      if (!res.ok && res.status !== 207) {
        setFailure(body.error || t(`Refused (${res.status})`, `Refusé (${res.status})`));
        return;
      }
      setResult(body);
      scan.reload();
    } catch {
      setFailure(t("Could not connect.", "Connexion impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={t("Demo data in real accounts", "Données de démo dans les vrais comptes")}
      aside={
        <button type="button" className="tc-btn tc-btn--danger" disabled={busy || scan.loading || total === 0 || Boolean(result)} onClick={() => void purge()}>
          {busy ? t("Deleting…", "Suppression…") : t("Delete all demo data", "Supprimer toutes les données de démo")}
        </button>
      }
    >
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ad-muted)", lineHeight: 1.5 }}>
        {t(
          "The old demo preset wrote a fake “Trackit” campaign, fake creators and fake sales into every brand account. It no longer runs. Only rows with its markers are deleted; real data is never touched.",
          "L’ancien preset de démo écrivait une fausse campagne « Trackit », de faux créateurs et de fausses ventes dans chaque compte marque. Il ne tourne plus. Seules les lignes portant ses marqueurs sont supprimées, jamais les vraies données.",
        )}
      </p>
      {!report ? <LoadState loading={scan.loading} error={scan.error} onRetry={scan.reload} /> : null}
      {failure ? <div className="tc-error" role="alert"><p>{failure}</p></div> : null}
      {result ? (
        <div className="tc-warn" role="status" style={{ marginBottom: 12 }}>
          <strong>{t(`Deleted ${num(total)} rows.`, `${num(total)} lignes supprimées.`)}</strong>
          {result.errors.length ? <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}
      {report && !result ? (
        total === 0 ? (
          <Empty>{t("No demo data left. Everything shown is real.", "Plus aucune donnée de démo. Tout ce qui s’affiche est réel.")}</Empty>
        ) : (
          <div className="tc-facts">
            {(Object.keys(TABLE_LABEL) as PurgeTable[])
              .filter((k) => report.counts[k] > 0)
              .map((k) => (
                <div className="tc-fact" key={k}>
                  <span>{TABLE_LABEL[k][lang]}</span>
                  <strong>{num(report.counts[k])}</strong>
                </div>
              ))}
          </div>
        )
      ) : null}
      {report && !result && report.errors.length ? (
        <div className="tc-warn" role="status" style={{ marginTop: 12 }}>
          <ul>{report.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}
