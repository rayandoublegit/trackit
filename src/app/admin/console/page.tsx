"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const BLUE = "#0047FF";

type Metrics = {
  mrr: number;
  arr: number;
  activeSubscribers: number;
  trialing: number;
  pastDue: number;
  canceledThisMonth: number;
  newThisMonth: number;
  churnRatePct: number;
  mrrByPlan: Record<string, number>;
  countByPlan: Record<string, number>;
  currency: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  plan: string | null;
  role: string | null;
  subscription_active: boolean | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  account_type: string | null;
  created_at: string | null;
};

type GrowthPoint = { month: string; newSubs: number; canceledSubs: number; netMrrAdded: number };
type Funnel = { signups: number; onboarded: number; paying: number; onboardRatePct: number; payRatePct: number };
type Growth = { monthly: GrowthPoint[]; arpu: number; ltv: number; funnel: Funnel; currency: string };

type ConsoleData = {
  metrics: Metrics;
  growth: Growth;
  users: AdminUser[];
  stripeMode: string;
  me: { email: string; role: string };
};

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: (currency || "eur").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

function dateShort(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
}

function MetricCard({ label, value, hint, accent, danger }: { label: string; value: string | number; hint?: string; accent?: boolean; danger?: boolean }) {
  return (
    <div
      style={{
        background: accent ? BLUE : "#FFFFFF",
        border: accent ? "none" : "1px solid #EFEFEF",
        borderRadius: 16,
        padding: "22px 24px",
        boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.15)" : "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: accent ? "rgba(255,255,255,0.8)" : "#9A9A9A", marginBottom: 10, letterSpacing: "-0.01em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent ? "#FFFFFF" : danger ? "#D93838" : "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.65)" : "#B0B0B0", marginTop: 8, letterSpacing: "-0.01em" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const planLabel = (plan: string | null): string => {
  const p = (plan ?? "free").toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
};

const roleStyle = (role: string | null): React.CSSProperties => {
  const r = (role ?? "user").toLowerCase();
  if (r === "admin") return { background: BLUE, color: "#fff" };
  if (r === "staff") return { background: "#EAF0FF", color: BLUE };
  return { background: "#F5F5F5", color: "#7A7A7A" };
};

function shortMonth(m: string): string {
  const [, mm] = m.split("-");
  const names = ["", "jan", "fev", "mar", "avr", "mai", "juin", "juil", "aou", "sep", "oct", "nov", "dec"];
  return names[parseInt(mm, 10)] ?? m;
}

function MrrChart({ points, currency }: { points: GrowthPoint[]; currency: string }) {
  const W = 720, H = 200, padL = 8, padR = 8, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.netMrrAdded));
  const n = points.length;
  const barGap = 14;
  const barW = n > 0 ? (innerW - barGap * (n - 1)) / n : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {points.map((p, i) => {
        const h = (p.netMrrAdded / max) * innerH;
        const x = padL + i * (barW + barGap);
        const y = padT + innerH - h;
        return (
          <g key={p.month}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx={6} fill="#0047FF" opacity={0.9} />
            <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="#9A9A9A" fontFamily="InterDisplay, sans-serif">
              {shortMonth(p.month)}
            </text>
            {p.netMrrAdded > 0 && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="#1A1A1A" fontFamily="InterDisplay, sans-serif" fontWeight={600}>
                {Math.round(p.netMrrAdded)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function FunnelBar({ label, count, total, pct, color }: { label: string; count: number; total: number; pct: number; color: string }) {
  const width = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 500, letterSpacing: "-0.01em" }}>{label}</span>
        <span style={{ fontSize: 13, color: "#7A7A7A" }}>{count} · {pct}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "#F2F2F2", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, borderRadius: 999, background: color, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export default function AdminConsolePage() {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/console", { cache: "no-store" });
      if (res.status === 403) {
        setError("Acces refuse. Connecte-toi avec un compte admin pour voir cette page.");
        setData(null);
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Erreur de chargement");
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const act = useCallback(
    async (userId: string, action: string, value?: string, confirmMsg?: string) => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      setBusyId(userId);
      try {
        const res = await fetch("/api/admin/console/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action, value }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          flash(`Echec: ${json.error || res.status}`);
        } else {
          flash("Fait");
          await load();
        }
      } catch (e) {
        flash(`Erreur: ${e}`);
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u) =>
      [u.email, u.full_name, u.username, u.plan, u.role].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q))
    );
  }, [data, query]);

  const m = data?.metrics;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "InterDisplay, system-ui, -apple-system, sans-serif", color: "#1A1A1A" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #EFEFEF", background: "#FFFFFF", padding: "28px 40px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>Console staff</h1>
            <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: "6px 0 0" }}>
              {data ? `${data.me.email} · ${data.me.role}` : "Vue d'ensemble du SaaS"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {data && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  letterSpacing: "-0.01em",
                  background: data.stripeMode === "live" ? "#EAF7EE" : "#FFF4E5",
                  color: data.stripeMode === "live" ? "#1B873F" : "#B25E09",
                }}
              >
                Stripe {data.stripeMode}
              </span>
            )}
            <button
              onClick={() => load()}
              style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #EFEFEF", background: "#FFFFFF", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit", letterSpacing: "-0.01em" }}
            >
              Rafraichir
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 40px 64px", maxWidth: 1200, margin: "0 auto" }}>
        {error && (
          <div style={{ border: "1px solid #FFD9D9", background: "#FFF5F5", color: "#D93838", borderRadius: 14, padding: "16px 18px", fontSize: 14, letterSpacing: "-0.01em" }}>
            {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: 48, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>Chargement...</div>
        )}

        {m && (
          <>
            {/* Metriques principales */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
              <MetricCard label="MRR" value={money(m.mrr, m.currency)} hint={`${money(m.arr, m.currency)} ARR`} accent />
              <MetricCard label="Abonnes actifs" value={m.activeSubscribers} hint={`+${m.newThisMonth} ce mois`} />
              <MetricCard label="Churn (mois)" value={`${m.churnRatePct}%`} hint={`${m.canceledThisMonth} annulations`} danger={m.churnRatePct > 5} />
              <MetricCard label="En essai" value={m.trialing} hint={m.pastDue > 0 ? `${m.pastDue} impayes` : "aucun impaye"} />
            </div>

            {/* MRR par plan */}
            {Object.keys(m.mrrByPlan).length > 0 && (
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "20px 24px", marginBottom: 28, background: "#FFFFFF" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 16, letterSpacing: "-0.01em" }}>MRR PAR PLAN</div>
                <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                  {Object.entries(m.mrrByPlan).sort((a, b) => b[1] - a[1]).map(([plan, val]) => (
                    <div key={plan}>
                      <div style={{ fontSize: 13, color: "#7A7A7A", fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 4 }}>{planLabel(plan)}</div>
                      <div style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{money(val, m.currency)}</div>
                      <div style={{ fontSize: 12, color: "#B0B0B0", marginTop: 2 }}>{m.countByPlan[plan] ?? 0} abonnes</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Croissance: ARPU / LTV + graphe MRR + funnel */}
            {data?.growth && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <MetricCard label="ARPU (par abonne)" value={money(data.growth.arpu, data.growth.currency)} hint="revenu moyen mensuel" />
                  <MetricCard label="LTV estimee" value={money(data.growth.ltv, data.growth.currency)} hint="ARPU / churn" />
                  <MetricCard label="Taux de conversion" value={`${data.growth.funnel.payRatePct}%`} hint={`${data.growth.funnel.paying} payants / ${data.growth.funnel.signups} inscrits`} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14, marginBottom: 28 }}>
                  {/* Graphe MRR ajoute par mois */}
                  <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "20px 24px", background: "#FFFFFF" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 16, letterSpacing: "-0.01em" }}>MRR AJOUTE PAR MOIS (6 MOIS)</div>
                    <MrrChart points={data.growth.monthly} currency={data.growth.currency} />
                  </div>

                  {/* Funnel */}
                  <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "20px 24px", background: "#FFFFFF" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 16, letterSpacing: "-0.01em" }}>FUNNEL DE CONVERSION</div>
                    <FunnelBar label="Inscrits" count={data.growth.funnel.signups} total={data.growth.funnel.signups} pct={100} color="#1A1A1A" />
                    <FunnelBar label="Onboarding fini" count={data.growth.funnel.onboarded} total={data.growth.funnel.signups} pct={data.growth.funnel.onboardRatePct} color="#6E9BFF" />
                    <FunnelBar label="Payants" count={data.growth.funnel.paying} total={data.growth.funnel.signups} pct={data.growth.funnel.payRatePct} color="#0047FF" />
                  </div>
                </div>
              </>
            )}

            {/* Recherche */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>Utilisateurs</h2>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                style={{ width: 280, padding: "9px 14px", borderRadius: 10, border: "1px solid #EFEFEF", fontSize: 14, fontFamily: "inherit", letterSpacing: "-0.01em", outline: "none" }}
              />
            </div>

            {/* Table users */}
            <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden", background: "#FFFFFF" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#FAFAFA", textAlign: "left", color: "#9A9A9A" }}>
                      <th style={{ padding: "12px 16px", fontWeight: 500, letterSpacing: "-0.01em" }}>Utilisateur</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Plan</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Abonnement</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Role</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Inscrit</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} style={{ borderTop: "1px solid #F2F2F2" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.01em" }}>{u.email ?? "(sans email)"}</div>
                          <div style={{ fontSize: 11, color: "#B0B0B0", marginTop: 2 }}>{u.full_name || u.username || u.id.slice(0, 8)}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontWeight: 500, color: "#1A1A1A" }}>{planLabel(u.plan)}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 12, color: u.subscription_active ? "#1B873F" : "#B0B0B0" }}>
                            {u.subscription_status ?? (u.subscription_active ? "active" : "-")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={(u.role ?? "user").toLowerCase()}
                            disabled={busyId === u.id}
                            onChange={(e) => act(u.id, "role", e.target.value, `Passer ${u.email} en "${e.target.value}" ?`)}
                            style={{ ...roleStyle(u.role), border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", appearance: "none", fontFamily: "inherit", letterSpacing: "-0.01em" }}
                          >
                            <option value="user">user</option>
                            <option value="staff">staff</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#9A9A9A" }}>{dateShort(u.created_at)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {u.stripe_subscription_id ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                disabled={busyId === u.id}
                                onClick={() => act(u.id, "cancel", undefined, `Programmer l'annulation de ${u.email} a la fin de la periode payee ?`)}
                                style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #EFEFEF", background: "#FFFFFF", cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: "#5A5A5A", letterSpacing: "-0.01em" }}
                              >
                                Annuler (fin periode)
                              </button>
                              <button
                                disabled={busyId === u.id}
                                onClick={() => act(u.id, "cancelNow", undefined, `ANNULER MAINTENANT l'abonnement de ${u.email} ? Acces coupe immediatement.`)}
                                style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #FFD9D9", background: "#FFF5F5", color: "#D93838", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "inherit", letterSpacing: "-0.01em" }}
                              >
                                Annuler now
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#C8C8C8" }}>pas d&apos;abonnement</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#B0B0B0", marginTop: 10, letterSpacing: "-0.01em" }}>
              {filtered.length} / {data?.users.length} utilisateurs
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1A1A1A", color: "#fff", padding: "11px 20px", borderRadius: 12, fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
