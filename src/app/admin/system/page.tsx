"use client";

import type { AuditData, SystemCheck, SystemData } from "@/lib/admin-types";
import { useLang } from "@/lib/useLang";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, useAdminData, useAdminFormat, useT } from "../_components/ui";

const ACTION_LABEL: Record<string, string> = {
  "user.role": "Role changed",
  "user.setPlan": "Plan applied",
  "user.changePlan": "Stripe plan changed",
  "user.giftMonth": "Month gifted",
  "user.revokeComp": "Comped access revoked",
  "user.cancel": "Subscription canceled (end of period)",
  "user.cancelNow": "Subscription canceled (immediately)",
};

const ACTION_LABEL_FR: Record<string, string> = {
  "user.role": "Rôle modifié",
  "user.setPlan": "Offre appliquée",
  "user.changePlan": "Offre Stripe modifiée",
  "user.giftMonth": "Mois offert",
  "user.revokeComp": "Accès offert révoqué",
  "user.cancel": "Abonnement résilié (fin de période)",
  "user.cancelNow": "Abonnement résilié (immédiatement)",
};

// Service checks come from the API in English; keyed labels for the French console.
const SERVICE_LABEL_FR: Record<string, string> = {
  supabase: "Supabase (URL + clé publique)",
  service: "Clé de service Supabase (serveur)",
  "stripe-webhook": "Secret du webhook Stripe",
  whop: "Whop (API)",
  "whop-webhook": "Secret du webhook Whop",
  resend: "Resend (e-mails)",
  rapidapi: "RapidAPI (recherche de créateurs)",
  scrapecreators: "ScrapeCreators (stats vidéo)",
  shopify: "Shopify (OAuth de l’app)",
  cron: "Secret des tâches planifiées (CRON)",
  admins: "Liste ADMIN_EMAILS",
};

function serviceDetailFr(detail: string): string {
  if (detail === "missing") return "absente";
  if (detail === "code default") return "valeur par défaut du code";
  const mode = /^(\w+) mode$/.exec(detail);
  return mode ? `mode ${mode[1]}` : detail;
}

function serviceLabel(e: SystemCheck, fr: boolean): string {
  return fr ? (SERVICE_LABEL_FR[e.key] ?? e.label) : e.label;
}

export default function AdminSystemPage() {
  const system = useAdminData<SystemData>("/api/admin/system");
  const audit = useAdminData<AuditData>("/api/admin/audit");
  const data = system.data;
  const missing = data?.tables.filter((t) => t.missing) ?? [];
  const failing = data?.tables.filter((t) => !t.missing && t.error) ?? [];
  const envKo = data?.env.filter((e) => !e.ok) ?? [];
  const { ago, compact } = useAdminFormat();
  const tr = useT();
  const fr = useLang() === "fr";

  return (
    <>
      <PageHead
        title={tr("System & audit", "Système et audit")}
        lead={tr(
          "Integrations, tables and staff actions. Keys are never shown: only their presence is checked.",
          "Intégrations, tables et actions de l’équipe. Les clés ne sont jamais affichées : seule leur présence est vérifiée.",
        )}
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
            <Kpi
              label={tr("Connected services", "Services connectés")}
              value={data.env.length - envKo.length}
              tone={envKo.length ? "warn" : "good"}
              sub={
                <>
                  {tr("of", "sur")} {data.env.length}
                </>
              }
            />
            <Kpi
              label={tr("Tables present", "Tables présentes")}
              value={data.tables.length - missing.length}
              delay={60}
              tone={missing.length ? "warn" : "good"}
              sub={
                <>
                  {tr("of", "sur")} {data.tables.length}
                </>
              }
            />
            <Kpi label={tr("Tables with errors", "Tables en erreur")} value={failing.length} delay={120} tone={failing.length ? "warn" : undefined} />
            <div className="ad-kpi" style={{ animationDelay: "180ms" }}>
              <span className="ad-kpi__label">{tr("Deployment", "Déploiement")}</span>
              <strong className="ad-kpi__value" style={{ fontSize: 20 }}>{data.deploy.commit ?? tr("local", "local")}</strong>
              <span className="ad-kpi__sub">
                {data.deploy.environment}
                {data.deploy.branch ? ` · ${data.deploy.branch}` : ""}
                {data.deploy.region ? ` · ${data.deploy.region}` : ""}
              </span>
            </div>
          </div>

          <Card title={tr("Services", "Services")} delay={80}>
            <ul className="ad-checks">
              {data.env.map((e, i) => (
                <li key={e.key} style={{ animationDelay: `${i * 30}ms` }}>
                  <i className={e.ok ? "is-ok" : "is-ko"}>{e.ok ? "✓" : "!"}</i>
                  <span>{serviceLabel(e, fr)}</span>
                  {e.detail ? <small>{fr ? serviceDetailFr(e.detail) : e.detail}</small> : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={tr("Tables", "Tables")} delay={120}>
            <ul className="ad-checks">
              {data.tables.map((t, i) => (
                <li key={t.table} style={{ animationDelay: `${i * 25}ms` }}>
                  <i className={t.missing || t.error ? "is-ko" : "is-ok"}>{t.missing || t.error ? "!" : "✓"}</i>
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 }}>{t.table}</span>
                  <small>{t.missing ? tr("missing", "absente") : t.error ? tr("error", "erreur") : `${compact(t.count)} ${tr("rows", "lignes")}`}</small>
                </li>
              ))}
            </ul>
            {missing.length > 0 ? (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
                {fr ? (
                  <>
                    Une table absente désactive la fonctionnalité correspondante. Les migrations sont dans <code>supabase/migrations</code> ;
                    appliquez-les à la base de production après une sauvegarde.
                  </>
                ) : (
                  <>
                    Missing tables disable the matching feature. Migrations live in <code>supabase/migrations</code>; apply them to the
                    production database after a backup.
                  </>
                )}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card title={tr("Audit log", "Journal d’audit")} className="ad-card--flush" delay={160}>
        {audit.data?.missing ? (
          <div style={{ padding: 16 }}>
            <Pill tone="warn">{tr("admin_audit_log table missing", "Table admin_audit_log absente")}</Pill>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ad-muted)" }}>
              {fr ? (
                <>
                  En attendant, les actions de l’équipe sont écrites dans les logs du serveur. Appliquez la migration <code>20260928_000042_admin_audit_log.sql</code>.
                </>
              ) : (
                <>
                  Staff actions are written to the server logs in the meantime. Apply the <code>20260928_000042_admin_audit_log.sql</code> migration.
                </>
              )}
            </p>
          </div>
        ) : !audit.data ? (
          <div style={{ padding: 16 }}>
            <LoadState loading={audit.loading} error={audit.error} onRetry={audit.reload} />
          </div>
        ) : audit.data.entries.length === 0 ? (
          <Empty>{tr("No staff actions recorded.", "Aucune action de l’équipe enregistrée.")}</Empty>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>{tr("When", "Quand")}</th>
                  <th>{tr("Staff", "Équipe")}</th>
                  <th>{tr("Action", "Action")}</th>
                  <th>{tr("Target account", "Compte ciblé")}</th>
                  <th>{tr("Value", "Valeur")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{ago(e.created_at)}</td>
                    <td>{e.actor_email}</td>
                    <td>{(fr ? ACTION_LABEL_FR : ACTION_LABEL)[e.action] ?? e.action}</td>
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
