"use client";

import type { AuditData, SystemData } from "@/lib/admin-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, ago, compact, useAdminData } from "../_components/ui";

const ACTION_LABEL: Record<string, string> = {
  "user.role": "Rôle changé",
  "user.setPlan": "Plan appliqué",
  "user.changePlan": "Plan Stripe changé",
  "user.giftMonth": "Mois offert",
  "user.revokeComp": "Accès offert retiré",
  "user.cancel": "Abonnement annulé (fin de période)",
  "user.cancelNow": "Abonnement annulé (immédiat)",
};

export default function AdminSystemPage() {
  const system = useAdminData<SystemData>("/api/admin/system");
  const audit = useAdminData<AuditData>("/api/admin/audit");
  const data = system.data;
  const missing = data?.tables.filter((t) => t.missing) ?? [];
  const failing = data?.tables.filter((t) => !t.missing && t.error) ?? [];
  const envKo = data?.env.filter((e) => !e.ok) ?? [];

  return (
    <>
      <PageHead
        title="Système & audit"
        lead="Branchements, tables et actions du staff. Les clés ne sont jamais affichées : seule leur présence est vérifiée."
        actions={
          <RefreshButton
            onClick={() => {
              system.reload();
              audit.reload();
            }}
            loading={system.loading || audit.loading}
          />
        }
      />
      {!data ? <LoadState loading={system.loading} error={system.error} onRetry={system.reload} /> : null}
      {data ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="Services branchés" value={data.env.length - envKo.length} tone={envKo.length ? "warn" : "good"} sub={<>sur {data.env.length}</>} />
            <Kpi label="Tables présentes" value={data.tables.length - missing.length} delay={60} tone={missing.length ? "warn" : "good"} sub={<>sur {data.tables.length}</>} />
            <Kpi label="Tables en erreur" value={failing.length} delay={120} tone={failing.length ? "warn" : undefined} />
            <div className="ad-kpi" style={{ animationDelay: "180ms" }}>
              <span className="ad-kpi__label">Déploiement</span>
              <strong className="ad-kpi__value" style={{ fontSize: 20 }}>{data.deploy.commit ?? "local"}</strong>
              <span className="ad-kpi__sub">
                {data.deploy.environment}
                {data.deploy.branch ? ` · ${data.deploy.branch}` : ""}
                {data.deploy.region ? ` · ${data.deploy.region}` : ""}
              </span>
            </div>
          </div>

          <Card title="Services" delay={80}>
            <ul className="ad-checks">
              {data.env.map((e, i) => (
                <li key={e.key} style={{ animationDelay: `${i * 30}ms` }}>
                  <i className={e.ok ? "is-ok" : "is-ko"}>{e.ok ? "✓" : "!"}</i>
                  <span>{e.label}</span>
                  {e.detail ? <small>{e.detail}</small> : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Tables" delay={120}>
            <ul className="ad-checks">
              {data.tables.map((t, i) => (
                <li key={t.table} style={{ animationDelay: `${i * 25}ms` }}>
                  <i className={t.missing || t.error ? "is-ko" : "is-ok"}>{t.missing || t.error ? "!" : "✓"}</i>
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 }}>{t.table}</span>
                  <small>{t.missing ? "absente" : t.error ? "erreur" : `${compact(t.count)} lignes`}</small>
                </li>
              ))}
            </ul>
            {missing.length > 0 ? (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
                Les tables absentes désactivent la fonction correspondante. Les migrations sont dans <code>supabase/migrations</code> ; à appliquer sur la
                base de production après sauvegarde.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card title="Journal d’audit" className="ad-card--flush" delay={160}>
        {audit.data?.missing ? (
          <div style={{ padding: 16 }}>
            <Pill tone="warn">Table admin_audit_log absente</Pill>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
              Les actions staff sont écrites dans les logs serveur en attendant. Appliquez la migration <code>20260928_000042_admin_audit_log.sql</code>.
            </p>
          </div>
        ) : !audit.data ? (
          <div style={{ padding: 16 }}>
            <LoadState loading={audit.loading} error={audit.error} onRetry={audit.reload} />
          </div>
        ) : audit.data.entries.length === 0 ? (
          <Empty>Aucune action staff enregistrée.</Empty>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Compte visé</th>
                  <th>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{ago(e.created_at)}</td>
                    <td>{e.actor_email}</td>
                    <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                    <td>{e.target_email ?? e.target_user_id ?? "—"}</td>
                    <td style={{ color: "var(--ad-muted)" }}>{e.details && "value" in e.details && e.details.value ? String(e.details.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
