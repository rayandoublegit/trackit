"use client";

import { useState } from "react";
import type { RequestGroup, RequestsData } from "@/lib/admin-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, Warnings, ago, dateFr, num, useAdminData } from "../_components/ui";

function GroupTable({ rows, empty, prefix = "" }: { rows: RequestGroup[] | null; empty: string; prefix?: string }) {
  const [limit, setLimit] = useState(15);
  if (rows === null) return <Empty>Table illisible.</Empty>;
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <>
      <table className="ad-table">
        <thead>
          <tr>
            <th>Demande</th>
            <th className="ad-num">Fois</th>
            <th className="ad-num">Dernière</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr key={r.key}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {prefix}
                    {r.label.replace(/^@/, "")}
                  </span>
                  {r.count >= 5 ? <Pill tone="warn">forte demande</Pill> : null}
                </div>
                <div className="ad-barlist__track" style={{ marginTop: 6 }}>
                  <span style={{ ["--w" as string]: `${(r.count / max) * 100}%` }} />
                </div>
              </td>
              <td className="ad-num">{num(r.count)}</td>
              <td className="ad-num">{ago(r.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <div style={{ padding: 12, display: "flex", justifyContent: "center" }}>
          <button type="button" className="ad-btn" onClick={() => setLimit((l) => l + 30)}>
            Voir plus ({num(rows.length - limit)})
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function AdminRequestsPage() {
  const { data, error, loading, reload } = useAdminData<RequestsData>("/api/admin/requests");
  const total = (rows: RequestGroup[] | null) => (rows ? rows.reduce((s, r) => s + r.count, 0) : null);

  return (
    <>
      <PageHead
        title="Demandes"
        lead="Ce que les clients cherchent sans le trouver, sur 6 mois. Les demandes fréquentes disent quoi ajouter au catalogue en priorité."
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="Niches demandées" value={total(data.niches)} tone="accent" sub={<>{num(data.niches?.length)} niches distinctes</>} />
            <Kpi label="Créateurs introuvables" value={total(data.lookups)} delay={60} sub={<>{num(data.lookups?.length)} profils distincts</>} />
            <Kpi label="Liste d’attente v2" value={data.waitlist?.length ?? null} delay={120} />
          </div>
          <div className="ad-grid ad-grid--2">
            <Card title="Niches manquantes" className="ad-card--flush" delay={80}>
              <GroupTable rows={data.niches} empty="Aucune niche demandée." />
            </Card>
            <Card title="Créateurs recherchés sans résultat" className="ad-card--flush" delay={120}>
              <GroupTable rows={data.lookups} empty="Aucune recherche sans résultat." prefix="@" />
            </Card>
          </div>
          <Card title="Liste d’attente v2" className="ad-card--flush" delay={160}>
            {data.waitlist === null ? (
              <Empty>Table illisible.</Empty>
            ) : data.waitlist.length === 0 ? (
              <Empty>Personne sur la liste.</Empty>
            ) : (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Prénom</th>
                      <th>Email</th>
                      <th>Attentes</th>
                      <th className="ad-num">Inscrit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.waitlist.map((w) => (
                      <tr key={w.email}>
                        <td>{w.first_name ?? "—"}</td>
                        <td>{w.email}</td>
                        <td style={{ color: "var(--ad-muted)" }}>{w.expectations ?? "—"}</td>
                        <td className="ad-num">{dateFr(w.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
