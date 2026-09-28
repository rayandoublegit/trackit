"use client";

import { useEffect, useMemo, useState } from "react";
import { BILLING_LABELS, PLAN_LABELS, billingOf, isOffered, isPaying, type BillingSource } from "@/lib/admin-billing";
import type { AdminUser, ConsoleData, UserDetail } from "../_components/console-types";
import { Card, Empty, LoadState, PageHead, Pill, RefreshButton, ago, dateFr, eur, num, useAdminData } from "../_components/ui";

type TypeFilter = "all" | "brand" | "creator";
type BillingFilter = "all" | "paying" | "offered" | "free";
type SortKey = "recent" | "name" | "plan";

const PLAN_RANK: Record<string, number> = { scale: 3, pro: 2, basic: 1, free: 0 };

function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const h = hueOf(name);
  return (
    <span className="ad-avatar" style={{ background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 65% 48%))` }} aria-hidden>
      {initials || "?"}
    </span>
  );
}

function billingTone(source: BillingSource): "good" | "accent" | "warn" | "muted" {
  if (source === "stripe") return "good";
  if (source === "whop") return "accent";
  if (isOffered(source)) return "warn";
  return "muted";
}

function displayName(u: AdminUser): string {
  return u.full_name || u.username || u.email || u.id.slice(0, 8);
}

export default function AdminUsersPage() {
  const { data, error, loading, reload } = useAdminData<ConsoleData>("/api/admin/console");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [billingFilter, setBillingFilter] = useState<BillingFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [limit, setLimit] = useState(100);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.users ?? [])
      .map((u) => ({ user: u, billing: billingOf(u) }))
      .filter(({ user, billing }) => {
        const creator = (user.account_type ?? "").toLowerCase() === "creator";
        if (typeFilter === "brand" && creator) return false;
        if (typeFilter === "creator" && !creator) return false;
        if (billingFilter === "paying" && !isPaying(billing.source)) return false;
        if (billingFilter === "offered" && !isOffered(billing.source)) return false;
        if (billingFilter === "free" && billing.source !== "free") return false;
        if (!q) return true;
        return [user.email, user.full_name, user.username, user.id].some((v) => (v ?? "").toLowerCase().includes(q));
      });
    list.sort((a, b) => {
      if (sort === "name") return displayName(a.user).localeCompare(displayName(b.user));
      if (sort === "plan") return (PLAN_RANK[b.billing.plan] ?? 0) - (PLAN_RANK[a.billing.plan] ?? 0);
      return (b.user.created_at ?? "").localeCompare(a.user.created_at ?? "");
    });
    return list;
  }, [data, query, typeFilter, billingFilter, sort]);

  const counts = useMemo(() => {
    const all = (data?.users ?? []).map((u) => billingOf(u).source);
    return {
      paying: all.filter(isPaying).length,
      offered: all.filter(isOffered).length,
      free: all.filter((s) => s === "free").length,
    };
  }, [data]);

  const open = data?.users.find((u) => u.id === openId) ?? null;

  return (
    <>
      <PageHead
        title="Utilisateurs"
        lead="Chaque compte, sa facturation, son usage réel. Les actions sont journalisées."
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <Card className="ad-card--flush">
          <div className="ad-toolbar">
            <input
              className="ad-input"
              placeholder="Rechercher un email, un nom, un identifiant…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(100);
              }}
              aria-label="Rechercher un utilisateur"
            />
            <div className="ad-seg" role="group" aria-label="Type de compte">
              {(
                [
                  ["all", "Tous"],
                  ["brand", "Marques"],
                  ["creator", "Créateurs"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={typeFilter === id ? "is-on" : ""} onClick={() => setTypeFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ad-seg" role="group" aria-label="Facturation">
              {(
                [
                  ["all", `Tous (${num(data.users.length)})`],
                  ["paying", `Payants (${num(counts.paying)})`],
                  ["offered", `Offerts (${num(counts.offered)})`],
                  ["free", `Gratuits (${num(counts.free)})`],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={billingFilter === id ? "is-on" : ""} onClick={() => setBillingFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <select className="ad-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Trier">
              <option value="recent">Plus récents</option>
              <option value="name">Nom A-Z</option>
              <option value="plan">Plan le plus haut</option>
            </select>
          </div>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Type</th>
                  <th>Plan</th>
                  <th>Facturation</th>
                  <th>Rôle</th>
                  <th className="ad-num">Inscrit</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ user, billing }) => (
                  <tr
                    key={user.id}
                    className={openId === user.id ? "is-selected" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => setOpenId(user.id)}
                  >
                    <td>
                      <span className="ad-who">
                        <Avatar name={displayName(user)} />
                        <span>
                          <strong>{displayName(user)}</strong>
                          <small>{user.email ?? "—"}</small>
                        </span>
                      </span>
                    </td>
                    <td>{(user.account_type ?? "").toLowerCase() === "creator" ? <Pill>Créateur</Pill> : <Pill tone="accent">Marque</Pill>}</td>
                    <td>{PLAN_LABELS[billing.plan]}</td>
                    <td>
                      <Pill tone={billingTone(billing.source)}>{BILLING_LABELS[billing.source]}</Pill>
                    </td>
                    <td>{(user.role ?? "user") === "user" ? <span style={{ color: "var(--ad-muted)" }}>—</span> : <Pill tone="bad">{user.role}</Pill>}</td>
                    <td className="ad-num">{dateFr(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <Empty>Aucun compte ne correspond.</Empty> : null}
            {rows.length > limit ? (
              <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
                <button type="button" className="ad-btn" onClick={() => setLimit((l) => l + 200)}>
                  Voir {Math.min(200, rows.length - limit)} de plus ({num(rows.length - limit)} restants)
                </button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
      {open ? <UserDrawer user={open} stripeMode={data?.stripeMode ?? "off"} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </>
  );
}

function UserDrawer({
  user,
  stripeMode,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  stripeMode: ConsoleData["stripeMode"];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: detail, loading, error, reload } = useAdminData<UserDetail>(`/api/admin/console/user/detail?userId=${encodeURIComponent(user.id)}`);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [plan, setPlan] = useState<string>(user.plan && user.plan !== "free" ? user.plan : "pro");
  const [role, setRole] = useState<string>(user.role ?? "user");
  const billing = billingOf(user);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const act = async (action: string, value?: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/console/user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(body.error || `Refusé (${res.status})`);
        return;
      }
      setToast("Modification enregistrée.");
      onChanged();
      reload();
    } catch {
      setToast("Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  const usage = detail?.usage;
  const sessions = detail?.sessions ?? [];
  const sub = detail?.subscription ?? null;
  const profile = detail?.profile ?? {};
  const shownKeys = ["id", "business_name", "account_type", "referral_source", "onboarding_completed", "subscription_status", "stripe_customer_id", "stripe_subscription_id", "last_login_ip", "created_at"];

  return (
    <>
      <button type="button" className="ad-drawer-bg" aria-label="Fermer" onClick={onClose} />
      <aside className="ad-drawer" role="dialog" aria-modal="true" aria-label={`Compte ${displayName(user)}`}>
        <div className="ad-drawer__head">
          <span className="ad-who">
            <Avatar name={displayName(user)} />
            <span>
              <h2>{displayName(user)}</h2>
              <p>{user.email ?? "—"}</p>
            </span>
          </span>
          <button type="button" className="ad-btn" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="ad-facts">
          <div className="ad-fact">
            <span>Plan appliqué</span>
            <strong>{PLAN_LABELS[billing.plan]}</strong>
          </div>
          <div className="ad-fact">
            <span>Facturation</span>
            <strong>
              {BILLING_LABELS[billing.source]}
              {billing.until ? ` · jusqu’au ${dateFr(billing.until)}` : ""}
            </strong>
          </div>
          <div className="ad-fact">
            <span>Inscrit</span>
            <strong>{dateFr(user.created_at)}</strong>
          </div>
          <div className="ad-fact">
            <span>Dernière activité</span>
            <strong>{sessions[0] ? ago(sessions[0].last_active_at) : loading ? "…" : "—"}</strong>
          </div>
        </div>

        {error ? <LoadState loading={false} error={error} onRetry={reload} /> : null}

        <Card title="Usage du produit">
          <div className="ad-facts">
            <div className="ad-fact"><span>Campagnes</span><strong>{loading ? "…" : num(usage?.campaigns)}</strong></div>
            <div className="ad-fact"><span>Créateurs gérés</span><strong>{loading ? "…" : num(usage?.creators)}</strong></div>
            <div className="ad-fact"><span>Ventes suivies</span><strong>{loading ? "…" : num(usage?.sales)}</strong></div>
            <div className="ad-fact"><span>CA suivi</span><strong>{loading ? "…" : eur(usage?.salesRevenue)}</strong></div>
            <div className="ad-fact"><span>Messages envoyés</span><strong>{loading ? "…" : num(usage?.outreach)}</strong></div>
            <div className="ad-fact"><span>Missions gifting</span><strong>{loading ? "…" : num(usage?.giftMissions)}</strong></div>
          </div>
        </Card>

        <Card title="Actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="ad-actions">
              <select className="ad-select" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
                <option value="basic">Growth</option>
                <option value="pro">Pro</option>
                <option value="scale">Scale</option>
                <option value="free">Gratuit</option>
              </select>
              <button
                type="button"
                className="ad-btn ad-btn--primary"
                disabled={busy}
                onClick={() =>
                  void act(
                    "setPlan",
                    plan,
                    plan === "free"
                      ? "Passer ce compte en gratuit ? Un abonnement Stripe éventuel sera annulé immédiatement."
                      : `Appliquer le plan ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan} ? Sans abonnement Stripe, l’accès est offert.`,
                  )
                }
              >
                Appliquer le plan
              </button>
              {plan !== "free" ? (
                <button type="button" className="ad-btn" disabled={busy} onClick={() => void act("giftMonth", plan, `Offrir 1 mois de ${plan} ?`)}>
                  Offrir 1 mois
                </button>
              ) : null}
              {isOffered(billing.source) ? (
                <button type="button" className="ad-btn ad-btn--danger" disabled={busy} onClick={() => void act("revokeComp", undefined, "Retirer l’accès offert ?")}>
                  Retirer l’accès offert
                </button>
              ) : null}
            </div>
            <div className="ad-actions">
              <select className="ad-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rôle">
                <option value="user">Utilisateur</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                className="ad-btn"
                disabled={busy || role === (user.role ?? "user")}
                onClick={() => void act("role", role, `Donner le rôle « ${role} » à ce compte ?`)}
              >
                Changer le rôle
              </button>
            </div>
            {user.stripe_subscription_id ? (
              <div className="ad-actions">
                <button type="button" className="ad-btn" disabled={busy} onClick={() => void act("cancel", undefined, "Annuler l’abonnement Stripe à la fin de la période ?")}>
                  Annuler en fin de période
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn--danger"
                  disabled={busy}
                  onClick={() => void act("cancelNow", undefined, "Annuler l’abonnement Stripe immédiatement ? Le compte repasse en gratuit.")}
                >
                  Annuler maintenant
                </button>
              </div>
            ) : null}
            {stripeMode === "test" ? <Pill tone="warn">Stripe en mode test</Pill> : null}
          </div>
        </Card>

        {sub ? (
          <Card title="Abonnement Stripe">
            <div className="ad-facts">
              <div className="ad-fact"><span>Statut</span><strong>{sub.status}{sub.cancelAtPeriodEnd ? " · s’arrête" : ""}</strong></div>
              <div className="ad-fact"><span>Montant</span><strong>{eur(sub.amount)} / {sub.interval === "year" ? "an" : "mois"}</strong></div>
              <div className="ad-fact"><span>Fin de période</span><strong>{dateFr(sub.currentPeriodEnd)}</strong></div>
              <div className="ad-fact"><span>Prix</span><strong>{sub.priceId ?? "—"}</strong></div>
            </div>
            {detail && detail.invoices.length > 0 ? (
              <table className="ad-table" style={{ marginTop: 12 }}>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{dateFr(inv.created)}</td>
                      <td>
                        <Pill tone={inv.status === "paid" ? "good" : inv.status === "open" ? "warn" : "muted"}>{inv.status ?? "—"}</Pill>
                      </td>
                      <td className="ad-num">{eur(inv.amountPaid, 2)}</td>
                      <td className="ad-num">
                        {inv.pdf ? (
                          <a href={inv.pdf} target="_blank" rel="noopener noreferrer">
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Card>
        ) : null}

        <Card title="Sessions récentes">
          {sessions.length === 0 ? (
            <Empty>{loading ? "Chargement…" : "Aucune session enregistrée."}</Empty>
          ) : (
            <table className="ad-table">
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={`${s.last_active_at}-${i}`}>
                    <td>{s.device_label ?? "—"}</td>
                    <td>{s.location_label ?? "—"}</td>
                    <td style={{ color: "var(--ad-muted)" }}>{s.ip_address ?? "—"}</td>
                    <td className="ad-num">{ago(s.last_active_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Fiche technique">
          <dl className="ad-kv">
            {shownKeys.map((k) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{profile[k] === undefined || profile[k] === null || profile[k] === "" ? "—" : String(profile[k])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
      {toast ? <div className="ad-toast" role="status">{toast}</div> : null}
    </>
  );
}
