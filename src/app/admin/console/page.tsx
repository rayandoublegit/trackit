"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type ConsoleData = {
  metrics: Metrics;
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
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: "18px 20px",
  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.04)",
};

const roleBadge = (role: string | null): React.CSSProperties => {
  const r = (role ?? "user").toLowerCase();
  if (r === "admin") return { background: "#0047FF", color: "#fff" };
  if (r === "staff") return { background: "#e8f0ff", color: "#0047FF" };
  return { background: "#f0f0f0", color: "#666" };
};

const planColor = (plan: string | null): string => {
  const p = (plan ?? "free").toLowerCase();
  if (p === "scale") return "#7c3aed";
  if (p === "pro") return "#0047FF";
  if (p === "growth" || p === "basic") return "#0891b2";
  return "#999";
};

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
        setError("Acces refuse. Tu dois etre connecte avec un compte admin.");
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
          flash("Action effectuee");
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
      [u.email, u.full_name, u.username, u.plan, u.role]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q))
    );
  }, [data, query]);

  const m = data?.metrics;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        letterSpacing: "-0.01em",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 64px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 40 }} />
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Console staff</h1>
              <div style={{ fontSize: 12, color: "#888" }}>
                {data ? `${data.me.email} (${data.me.role})` : "..."}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {data && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: data.stripeMode === "live" ? "#e8f5e9" : "#fff3e0",
                  color: data.stripeMode === "live" ? "#2e7d32" : "#e65100",
                  textTransform: "uppercase",
                }}
              >
                Stripe {data.stripeMode}
              </span>
            )}
            <button
              onClick={() => load()}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Rafraichir
            </button>
          </div>
        </div>

        {error && (
          <div style={{ ...card, color: "#c62828", marginBottom: 20 }}>{error}</div>
        )}

        {loading && !data && (
          <div style={{ ...card, textAlign: "center", color: "#999", padding: 48 }}>Chargement...</div>
        )}

        {m && (
          <>
            {/* Metriques principales */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
              <div style={card}>
                <div style={{ fontSize: 13, color: "#888" }}>MRR</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: "#0047FF" }}>{money(m.mrr, m.currency)}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 13, color: "#888" }}>ARR</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{money(m.arr, m.currency)}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 13, color: "#888" }}>Abonnes actifs</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{m.activeSubscribers}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 13, color: "#888" }}>Churn (mois)</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: m.churnRatePct > 5 ? "#c62828" : "#2e7d32" }}>
                  {m.churnRatePct}%
                </div>
              </div>
            </div>

            {/* Metriques secondaires */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 14 }}>
              <div style={card}>
                <div style={{ fontSize: 12, color: "#888" }}>Nouveaux (mois)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#2e7d32" }}>+{m.newThisMonth}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 12, color: "#888" }}>Annules (mois)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#c62828" }}>-{m.canceledThisMonth}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 12, color: "#888" }}>En essai</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{m.trialing}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 12, color: "#888" }}>Impayes</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.pastDue > 0 ? "#e65100" : "#111" }}>{m.pastDue}</div>
              </div>
            </div>

            {/* MRR par plan */}
            {Object.keys(m.mrrByPlan).length > 0 && (
              <div style={{ ...card, marginBottom: 22 }}>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>MRR par plan</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {Object.entries(m.mrrByPlan).sort((a, b) => b[1] - a[1]).map(([plan, val]) => (
                    <div key={plan}>
                      <div style={{ fontSize: 12, color: planColor(plan), fontWeight: 700, textTransform: "capitalize" }}>{plan}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{money(val, m.currency)}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{m.countByPlan[plan] ?? 0} abonnes</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recherche */}
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par email, nom, plan, role..."
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e5e5", fontSize: 14, fontFamily: "inherit" }}
              />
              <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap" }}>{filtered.length} / {data?.users.length}</span>
            </div>

            {/* Table users */}
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f7f7f8", textAlign: "left", color: "#666" }}>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>User</th>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>Plan</th>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>Abo</th>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>Role</th>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>Inscrit</th>
                      <th style={{ padding: "12px 14px", fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{u.email ?? "(sans email)"}</div>
                          <div style={{ fontSize: 11, color: "#999" }}>{u.full_name || u.username || u.id.slice(0, 8)}</div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ color: planColor(u.plan), fontWeight: 700, textTransform: "capitalize" }}>{u.plan ?? "free"}</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontSize: 11, color: u.subscription_active ? "#2e7d32" : "#999" }}>
                            {u.subscription_status ?? (u.subscription_active ? "active" : "-")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <select
                            value={(u.role ?? "user").toLowerCase()}
                            disabled={busyId === u.id}
                            onChange={(e) =>
                              act(u.id, "role", e.target.value, `Changer le role de ${u.email} en "${e.target.value}" ?`)
                            }
                            style={{ ...roleBadge(u.role), border: "none", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", appearance: "none" }}
                          >
                            <option value="user">user</option>
                            <option value="staff">staff</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#888" }}>{dateShort(u.created_at)}</td>
                        <td style={{ padding: "12px 14px" }}>
                          {u.stripe_subscription_id ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                disabled={busyId === u.id}
                                onClick={() => act(u.id, "cancel", undefined, `Programmer l'annulation de l'abonnement de ${u.email} a la fin de la periode ?`)}
                                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e5e5e5", background: "#fff", cursor: "pointer", fontSize: 11 }}
                              >
                                Annuler (fin periode)
                              </button>
                              <button
                                disabled={busyId === u.id}
                                onClick={() => act(u.id, "cancelNow", undefined, `ANNULER IMMEDIATEMENT l'abonnement de ${u.email} ? Le client perd l'acces tout de suite.`)}
                                style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #fdd", background: "#fff5f5", color: "#c62828", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                              >
                                Annuler now
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#bbb" }}>pas d&apos;abo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
