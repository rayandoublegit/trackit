"use client";

import type { AuditData, SystemData } from "@/lib/admin-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, ago, compact, useAdminData } from "../_components/ui";

const ACTION_LABEL: Record<string, string> = {
  "user.role": "Role changed",
  "user.setPlan": "Plan applied",
  "user.changePlan": "Stripe plan changed",
  "user.giftMonth": "Month gifted",
  "user.revokeComp": "Comped access revoked",
  "user.cancel": "Subscription canceled (end of period)",
  "user.cancelNow": "Subscription canceled (immediately)",
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
        title="System & audit"
        lead="Integrations, tables and staff actions. Keys are never shown: only their presence is checked."
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
            <Kpi label="Connected services" value={data.env.length - envKo.length} tone={envKo.length ? "warn" : "good"} sub={<>of {data.env.length}</>} />
            <Kpi label="Tables present" value={data.tables.length - missing.length} delay={60} tone={missing.length ? "warn" : "good"} sub={<>of {data.tables.length}</>} />
            <Kpi label="Tables with errors" value={failing.length} delay={120} tone={failing.length ? "warn" : undefined} />
            <div className="ad-kpi" style={{ animationDelay: "180ms" }}>
              <span className="ad-kpi__label">Deployment</span>
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
                  <small>{t.missing ? "missing" : t.error ? "error" : `${compact(t.count)} rows`}</small>
                </li>
              ))}
            </ul>
            {missing.length > 0 ? (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
                Missing tables disable the matching feature. Migrations live in <code>supabase/migrations</code>; apply them to the
                production database after a backup.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card title="Audit log" className="ad-card--flush" delay={160}>
        {audit.data?.missing ? (
          <div style={{ padding: 16 }}>
            <Pill tone="warn">admin_audit_log table missing</Pill>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
              Staff actions are written to the server logs in the meantime. Apply the <code>20260928_000042_admin_audit_log.sql</code> migration.
            </p>
          </div>
        ) : !audit.data ? (
          <div style={{ padding: 16 }}>
            <LoadState loading={audit.loading} error={audit.error} onRetry={audit.reload} />
          </div>
        ) : audit.data.entries.length === 0 ? (
          <Empty>No staff actions recorded.</Empty>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Target account</th>
                  <th>Value</th>
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
