"use client";

import { useState } from "react";
import type { RequestGroup, RequestsData } from "@/lib/admin-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, Warnings, useAdminData, useAdminFormat, useT } from "../_components/ui";

function GroupTable({ rows, empty, prefix = "" }: { rows: RequestGroup[] | null; empty: string; prefix?: string }) {
  const [limit, setLimit] = useState(15);
  const { ago, num } = useAdminFormat();
  const t = useT();
  if (rows === null) return <Empty>{t("Table could not be read.", "La table n’a pas pu être lue.")}</Empty>;
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <>
      <table className="tc-table">
        <thead>
          <tr>
            <th>{t("Request", "Demande")}</th>
            <th className="tc-num">{t("Times", "Fois")}</th>
            <th className="tc-num">{t("Last", "Dernière")}</th>
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
                  {r.count >= 5 ? <Pill tone="warn">{t("high demand", "forte demande")}</Pill> : null}
                </div>
                <div className="tc-barlist__track" style={{ marginTop: 6 }}>
                  <span style={{ ["--w" as string]: `${(r.count / max) * 100}%` }} />
                </div>
              </td>
              <td className="tc-num">{num(r.count)}</td>
              <td className="tc-num">{ago(r.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <div style={{ padding: 12, display: "flex", justifyContent: "center" }}>
          <button type="button" className="tc-btn" onClick={() => setLimit((l) => l + 30)}>
            {t("Show more", "Voir plus")} ({num(rows.length - limit)})
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function AdminRequestsPage() {
  const { data, error, loading, reload } = useAdminData<RequestsData>("/api/admin/requests");
  const total = (rows: RequestGroup[] | null) => (rows ? rows.reduce((s, r) => s + r.count, 0) : null);
  const { dateFr, num } = useAdminFormat();
  const t = useT();

  return (
    <>
      <PageHead
        title={t("Requests", "Demandes")}
        lead={t(
          "What customers searched for without finding it, over 6 months. Frequent requests show what to add to the catalog first.",
          "Ce que les clients ont cherché sans le trouver, sur 6 mois. Les demandes fréquentes montrent quoi ajouter au catalogue en priorité.",
        )}
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="tc-grid tc-grid--kpi">
            <Kpi
              label={t("Requested niches", "Niches demandées")}
              value={total(data.niches)}
              tone="accent"
              sub={<>{num(data.niches?.length)} {t("distinct niches", "niches distinctes")}</>}
            />
            <Kpi
              label={t("Creators not found", "Créateurs introuvables")}
              value={total(data.lookups)}
              delay={60}
              sub={<>{num(data.lookups?.length)} {t("distinct profiles", "profils distincts")}</>}
            />
            <Kpi label={t("v2 waitlist", "Liste d’attente v2")} value={data.waitlist?.length ?? null} delay={120} />
          </div>
          <div className="tc-grid tc-grid--2">
            <Card title={t("Missing niches", "Niches manquantes")} className="tc-card--flush" delay={80}>
              <GroupTable rows={data.niches} empty={t("No niches requested.", "Aucune niche demandée.")} />
            </Card>
            <Card title={t("Creator searches with no result", "Recherches de créateurs sans résultat")} className="tc-card--flush" delay={120}>
              <GroupTable rows={data.lookups} empty={t("No searches without results.", "Aucune recherche sans résultat.")} prefix="@" />
            </Card>
          </div>
          <Card title={t("v2 waitlist", "Liste d’attente v2")} className="tc-card--flush" delay={160}>
            {data.waitlist === null ? (
              <Empty>{t("Table could not be read.", "La table n’a pas pu être lue.")}</Empty>
            ) : data.waitlist.length === 0 ? (
              <Empty>{t("Nobody on the list yet.", "Personne sur la liste pour l’instant.")}</Empty>
            ) : (
              <div className="tc-table-wrap">
                <table className="tc-table">
                  <thead>
                    <tr>
                      <th>{t("First name", "Prénom")}</th>
                      <th>{t("Email", "E-mail")}</th>
                      <th>{t("Expectations", "Attentes")}</th>
                      <th className="tc-num">{t("Joined", "Inscription")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.waitlist.map((w) => (
                      <tr key={w.email}>
                        <td>{w.first_name ?? "—"}</td>
                        <td>{w.email}</td>
                        <td style={{ color: "var(--ad-muted)" }}>{w.expectations ?? "—"}</td>
                        <td className="tc-num">{dateFr(w.created_at)}</td>
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
