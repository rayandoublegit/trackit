"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

const I = {
  overview: <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z" />,
  users: <path d="M9 11a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H2zm15-9a3 3 0 100-6M22 20a6 6 0 00-4-5.6" />,
  revenue: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  catalog: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  requests: <path d="M4 5h16v11H8l-4 4V5z" />,
  system: <path d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" />,
  add: <path d="M12 5v14M5 12h14" />,
};

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Pilotage",
    items: [
      { href: "/admin", label: "Vue d’ensemble", icon: <Icon d={I.overview} />, exact: true },
      { href: "/admin/revenue", label: "Revenus", icon: <Icon d={I.revenue} /> },
      { href: "/admin/activity", label: "Activité", icon: <Icon d={I.activity} /> },
    ],
  },
  {
    section: "Comptes",
    items: [{ href: "/admin/users", label: "Utilisateurs", icon: <Icon d={I.users} /> }],
  },
  {
    section: "Produit",
    items: [
      { href: "/admin/catalog", label: "Catalogue créateurs", icon: <Icon d={I.catalog} /> },
      { href: "/admin/add", label: "Ajouter un créateur", icon: <Icon d={I.add} /> },
      { href: "/admin/requests", label: "Demandes", icon: <Icon d={I.requests} /> },
    ],
  },
  {
    section: "Technique",
    items: [{ href: "/admin/system", label: "Système & audit", icon: <Icon d={I.system} /> }],
  },
];

type Me = { ok: boolean; email?: string; role?: string };

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/admin";
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({ ok: false }))) as Me;
        if (!cancelled) setMe(res.ok ? body : { ok: false });
      })
      .catch(() => {
        if (!cancelled) setMe({ ok: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (me === null) {
    return (
      <div className="ad-gate">
        <span className="ad-gate__spinner" aria-label="Vérification de l’accès" />
      </div>
    );
  }

  if (!me.ok) {
    return (
      <div className="ad-gate">
        <div className="ad-gate__box">
          <span className="ad-gate__lock" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 118 0v4" />
            </svg>
          </span>
          <h1>Console staff</h1>
          <p>Cet espace est réservé à l’équipe Trackit. Connectez-vous avec un compte staff.</p>
          <Link className="ad-btn ad-btn--primary" href="/auth?redirectTo=/admin">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const current = NAV.flatMap((s) => s.items).find(isActive);

  return (
    <div className={`ad-shell${menuOpen ? " is-menu-open" : ""}`}>
      <aside className="ad-side">
        <Link href="/admin" className="ad-brand">
          <span className="ad-brand__mark">T</span>
          <span>
            <strong>Trackit</strong>
            <small>Console staff</small>
          </span>
        </Link>
        <nav aria-label="Admin">
          {NAV.map((section) => (
            <div key={section.section} className="ad-nav__section">
              <p>{section.section}</p>
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className={`ad-nav__link${isActive(item) ? " is-active" : ""}`}>
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="ad-side__foot">
          <Link href="/dashboard" className="ad-nav__link">
            <Icon d={<path d="M15 18l-6-6 6-6" />} />
            <span>Retour au SaaS</span>
          </Link>
          <div className="ad-me">
            <span className="ad-me__dot" />
            <span>
              <strong>{me.email}</strong>
              <small>{me.role === "user" ? "admin (liste)" : me.role}</small>
            </span>
          </div>
        </div>
      </aside>
      {menuOpen ? <button type="button" className="ad-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} /> : null}
      <div className="ad-main">
        <div className="ad-topbar">
          <button type="button" className="ad-burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="ad-crumb">
            Console <b>/</b> {current?.label ?? "Admin"}
          </span>
        </div>
        <main className="ad-content" key={pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
