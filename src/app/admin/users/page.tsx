"use client";

import { useEffect, useMemo, useState } from "react";
import { billingOf, isOffered, isPaying, type BillingSource } from "@/lib/admin-billing";
import { useLang } from "@/lib/useLang";
import type { AdminUser, ConsoleData, UserDetail } from "../_components/console-types";
import { billingLabels, invoiceStatus, planLabels, subscriptionStatus } from "../_components/labels";
import { Card, Empty, LoadState, PageHead, Pill, RefreshButton, useAdminData, useAdminFormat, useT } from "../_components/ui";

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
    <span className="tc-avatar" style={{ background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 65% 48%))` }} aria-hidden>
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
  const { dateFr, num } = useAdminFormat();
  const t = useT();
  const lang = useLang();
  const PLAN_LABELS = planLabels(lang);
  const BILLING_LABELS = billingLabels(lang);

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
        title={t("Users", "Utilisateurs")}
        lead={t("Every account, its billing and its real usage. Actions are logged.", "Chaque compte, sa facturation et son usage réel. Les actions sont journalisées.")}
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <Card className="tc-card--flush">
          <div className="tc-toolbar">
            <input
              className="tc-input"
              placeholder={t("Search an email, a name, an ID…", "Rechercher un e-mail, un nom, un ID…")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(100);
              }}
              aria-label={t("Search users", "Rechercher des utilisateurs")}
            />
            <div className="tc-seg" role="group" aria-label={t("Account type", "Type de compte")}>
              {(
                [
                  ["all", t("All", "Tous")],
                  ["brand", t("Brands", "Marques")],
                  ["creator", t("Creators", "Créateurs")],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={typeFilter === id ? "is-on" : ""} onClick={() => setTypeFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="tc-seg" role="group" aria-label={t("Billing", "Facturation")}>
              {(
                [
                  ["all", `${t("All", "Tous")} (${num(data.users.length)})`],
                  ["paying", `${t("Paying", "Payants")} (${num(counts.paying)})`],
                  ["offered", `${t("Comped", "Offerts")} (${num(counts.offered)})`],
                  ["free", `${t("Free", "Gratuits")} (${num(counts.free)})`],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={billingFilter === id ? "is-on" : ""} onClick={() => setBillingFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <select className="tc-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t("Sort", "Trier")}>
              <option value="recent">{t("Most recent", "Plus récents")}</option>
              <option value="name">{t("Name A-Z", "Nom A-Z")}</option>
              <option value="plan">{t("Highest plan", "Offre la plus haute")}</option>
            </select>
          </div>
          <div className="tc-table-wrap">
            <table className="tc-table">
              <thead>
                <tr>
                  <th>{t("Account", "Compte")}</th>
                  <th>{t("Type", "Type")}</th>
                  <th>{t("Plan", "Offre")}</th>
                  <th>{t("Billing", "Facturation")}</th>
                  <th>{t("Role", "Rôle")}</th>
                  <th className="tc-num">{t("Joined", "Inscription")}</th>
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
                      <span className="tc-who">
                        <Avatar name={displayName(user)} />
                        <span>
                          <strong>{displayName(user)}</strong>
                          <small>{user.email ?? "—"}</small>
                        </span>
                      </span>
                    </td>
                    <td>{(user.account_type ?? "").toLowerCase() === "creator" ? <Pill>{t("Creator", "Créateur")}</Pill> : <Pill tone="accent">{t("Brand", "Marque")}</Pill>}</td>
                    <td>{PLAN_LABELS[billing.plan]}</td>
                    <td>
                      <Pill tone={billingTone(billing.source)}>{BILLING_LABELS[billing.source]}</Pill>
                    </td>
                    <td>{(user.role ?? "user") === "user" ? <span style={{ color: "var(--ad-muted)" }}>—</span> : <Pill tone="bad">{user.role}</Pill>}</td>
                    <td className="tc-num">{dateFr(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <Empty>{t("No matching accounts.", "Aucun compte correspondant.")}</Empty> : null}
            {rows.length > limit ? (
              <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
                <button type="button" className="tc-btn" onClick={() => setLimit((l) => l + 200)}>
                  {lang === "fr" ? (
                    <>
                      Afficher {Math.min(200, rows.length - limit)} de plus ({num(rows.length - limit)} restants)
                    </>
                  ) : (
                    <>
                      Show {Math.min(200, rows.length - limit)} more ({num(rows.length - limit)} remaining)
                    </>
                  )}
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
  const [plan, setPlan] = useState<string>(billingOf(user).plan);
  const [role, setRole] = useState<string>(user.role ?? "user");
  const billing = billingOf(user);
  const { ago, dateFr, eur, num } = useAdminFormat();
  const t = useT();
  const lang = useLang();
  const PLAN_LABELS = planLabels(lang);
  const BILLING_LABELS = billingLabels(lang);

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
        setToast(body.error || t(`Refused (${res.status})`, `Refusé (${res.status})`));
        return;
      }
      const canceled = Array.isArray(body.canceled) && body.canceled.length > 0 ? ` (${body.canceled.join(", ")})` : "";
      setToast(t(`Change saved${canceled ? `, canceled${canceled}` : ""}. The account sees it on its next page load.`, `Modification enregistrée${canceled ? `, résilié${canceled}` : ""}. Le compte la voit dès son prochain chargement.`));
      onChanged();
      reload();
    } catch {
      setToast(t("Could not connect.", "Connexion impossible."));
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
      <button type="button" className="tc-drawer-bg" aria-label={t("Close", "Fermer")} onClick={onClose} />
      <aside className="tc-drawer" role="dialog" aria-modal="true" aria-label={`${t("Account", "Compte")} ${displayName(user)}`}>
        <div className="tc-drawer__head">
          <span className="tc-who">
            <Avatar name={displayName(user)} />
            <span>
              <h2>{displayName(user)}</h2>
              <p>{user.email ?? "—"}</p>
            </span>
          </span>
          <button type="button" className="tc-btn" onClick={onClose}>
            {t("Close", "Fermer")}
          </button>
        </div>

        <div className="tc-facts">
          <div className="tc-fact">
            <span>{t("Applied plan", "Offre appliquée")}</span>
            <strong>{PLAN_LABELS[billing.plan]}</strong>
          </div>
          <div className="tc-fact">
            <span>{t("Billing", "Facturation")}</span>
            <strong>
              {BILLING_LABELS[billing.source]}
              {billing.until ? t(` · until ${dateFr(billing.until)}`, ` · jusqu’au ${dateFr(billing.until)}`) : ""}
            </strong>
          </div>
          <div className="tc-fact">
            <span>{t("Joined", "Inscription")}</span>
            <strong>{dateFr(user.created_at)}</strong>
          </div>
          <div className="tc-fact">
            <span>{t("Last activity", "Dernière activité")}</span>
            <strong>{sessions[0] ? ago(sessions[0].last_active_at) : loading ? "…" : "—"}</strong>
          </div>
        </div>

        {error ? <LoadState loading={false} error={error} onRetry={reload} /> : null}

        <Card title={t("Product usage", "Usage du produit")}>
          <div className="tc-facts">
            <div className="tc-fact"><span>{t("Campaigns", "Campagnes")}</span><strong>{loading ? "…" : num(usage?.campaigns)}</strong></div>
            <div className="tc-fact"><span>{t("Managed creators", "Créateurs gérés")}</span><strong>{loading ? "…" : num(usage?.creators)}</strong></div>
            <div className="tc-fact"><span>{t("Tracked sales", "Ventes suivies")}</span><strong>{loading ? "…" : num(usage?.sales)}</strong></div>
            <div className="tc-fact"><span>{t("Tracked revenue", "CA suivi")}</span><strong>{loading ? "…" : eur(usage?.salesRevenue)}</strong></div>
            <div className="tc-fact"><span>{t("Messages sent", "Messages envoyés")}</span><strong>{loading ? "…" : num(usage?.outreach)}</strong></div>
            <div className="tc-fact"><span>{t("Gifting missions", "Missions gifting")}</span><strong>{loading ? "…" : num(usage?.giftMissions)}</strong></div>
          </div>
        </Card>

        <Card title={t("Actions", "Actions")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="tc-actions">
              <select className="tc-select" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t("Plan", "Offre")}>
                <option value="basic">Growth</option>
                <option value="pro">Pro</option>
                <option value="scale">Scale</option>
                <option value="free">{t("Free", "Gratuit")}</option>
              </select>
              <button
                type="button"
                className="tc-btn tc-btn--primary"
                disabled={busy}
                onClick={() =>
                  void act(
                    "setPlan",
                    plan,
                    plan === "free"
                      ? t(
                          "Move this account to Free? Every Stripe subscription and Whop membership of this account is canceled immediately, so the paywall applies right away.",
                          "Passer ce compte en Gratuit ? Tous ses abonnements Stripe et Whop sont résiliés immédiatement : la paywall s’applique tout de suite.",
                        )
                      : t(
                          `Apply the ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan} plan? Without a Stripe subscription, access is comped.`,
                          `Appliquer l’offre ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan} ? Sans abonnement Stripe, l’accès est offert.`,
                        ),
                  )
                }
              >
                {t("Apply plan", "Appliquer l’offre")}
              </button>
              {plan !== "free" ? (
                <button
                  type="button"
                  className="tc-btn"
                  disabled={busy}
                  onClick={() => void act("giftMonth", plan, t(`Gift 1 month of ${plan}?`, `Offrir 1 mois de ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS] ?? plan} ?`))}
                >
                  {t("Gift 1 month", "Offrir 1 mois")}
                </button>
              ) : null}
              <button
                type="button"
                className="tc-btn"
                disabled={busy}
                title={t("Free plan discovery allowance back to zero, to test the paywall again.", "Remet à zéro les découvertes gratuites utilisées, pour retester la paywall.")}
                onClick={() => void act("resetQuota", undefined, t("Reset this account's free usage quota?", "Remettre à zéro le quota gratuit de ce compte ?"))}
              >
                {t("Reset free quota", "Réinitialiser le quota gratuit")}
              </button>
              {isOffered(billing.source) ? (
                <button
                  type="button"
                  className="tc-btn tc-btn--danger"
                  disabled={busy}
                  onClick={() => void act("revokeComp", undefined, t("Revoke comped access?", "Révoquer l’accès offert ?"))}
                >
                  {t("Revoke comped access", "Révoquer l’accès offert")}
                </button>
              ) : null}
            </div>
            <div className="tc-actions">
              <select className="tc-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("Role", "Rôle")}>
                <option value="user">{t("User", "Utilisateur")}</option>
                <option value="staff">{t("Staff", "Équipe")}</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                className="tc-btn"
                disabled={busy || role === (user.role ?? "user")}
                onClick={() => void act("role", role, t(`Give this account the "${role}" role?`, `Donner le rôle « ${role} » à ce compte ?`))}
              >
                {t("Change role", "Changer le rôle")}
              </button>
            </div>
            {user.stripe_subscription_id ? (
              <div className="tc-actions">
                <button
                  type="button"
                  className="tc-btn"
                  disabled={busy}
                  onClick={() => void act("cancel", undefined, t("Cancel the Stripe subscription at the end of the period?", "Résilier l’abonnement Stripe à la fin de la période ?"))}
                >
                  {t("Cancel at period end", "Résilier en fin de période")}
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn--danger"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      "cancelNow",
                      undefined,
                      t(
                        "Cancel the Stripe subscription immediately? The account goes back to Free.",
                        "Résilier l’abonnement Stripe immédiatement ? Le compte repasse en Gratuit.",
                      ),
                    )
                  }
                >
                  {t("Cancel now", "Résilier maintenant")}
                </button>
              </div>
            ) : null}
            {stripeMode === "test" ? <Pill tone="warn">{t("Stripe in test mode", "Stripe en mode test")}</Pill> : null}
          </div>
        </Card>

        {sub ? (
          <Card title={t("Stripe subscription", "Abonnement Stripe")}>
            <div className="tc-facts">
              <div className="tc-fact"><span>{t("Status", "Statut")}</span><strong>{subscriptionStatus(sub.status, lang)}{sub.cancelAtPeriodEnd ? t(" · ending", " · se termine") : ""}</strong></div>
              <div className="tc-fact"><span>{t("Amount", "Montant")}</span><strong>{eur(sub.amount)} / {sub.interval === "year" ? t("year", "an") : t("month", "mois")}</strong></div>
              <div className="tc-fact"><span>{t("Period end", "Fin de période")}</span><strong>{dateFr(sub.currentPeriodEnd)}</strong></div>
              <div className="tc-fact"><span>{t("Price", "Prix")}</span><strong>{sub.priceId ?? "—"}</strong></div>
            </div>
            {detail && detail.invoices.length > 0 ? (
              <table className="tc-table" style={{ marginTop: 12 }}>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{dateFr(inv.created)}</td>
                      <td>
                        <Pill tone={inv.status === "paid" ? "good" : inv.status === "open" ? "warn" : "muted"}>{inv.status === null ? "—" : invoiceStatus(inv.status, lang)}</Pill>
                      </td>
                      <td className="tc-num">{eur(inv.amountPaid, 2)}</td>
                      <td className="tc-num">
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

        <Card title={t("Recent sessions", "Sessions récentes")}>
          {sessions.length === 0 ? (
            <Empty>{loading ? t("Loading…", "Chargement…") : t("No sessions recorded.", "Aucune session enregistrée.")}</Empty>
          ) : (
            <table className="tc-table">
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={`${s.last_active_at}-${i}`}>
                    <td>{s.device_label ?? "—"}</td>
                    <td>{s.location_label ?? "—"}</td>
                    <td style={{ color: "var(--ad-muted)" }}>{s.ip_address ?? "—"}</td>
                    <td className="tc-num">{ago(s.last_active_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={t("Technical details", "Détails techniques")}>
          <dl className="tc-kv">
            {shownKeys.map((k) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{profile[k] === undefined || profile[k] === null || profile[k] === "" ? "—" : String(profile[k])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
      {toast ? <div className="tc-toast" role="status">{toast}</div> : null}
    </>
  );
}
