"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WsIcon } from "@/app/dashboard/workspace/WorkspaceIcons";
import { MinoCompanion } from "@/components/MinoCompanion";
import { HeroTrustedTicker } from "@/components/HeroTrustedTicker";
import { useLang } from "@/lib/useLang";
import {
  HeroPreviewPageView,
  PAGE_RAIL,
  RAIL_DEFAULT_PAGE,
  type HeroPreviewPage,
} from "./HeroPreviewPages";
import "@/app/dashboard/workspace/workspace.css";
import "./hero-preview.css";

const RAIL = [
  { id: "home", label: "Home", icon: "home" as const },
  { id: "findit", label: "Discover", icon: "findit" as const },
  { id: "trackit", label: "Track", icon: "trackit" as const },
  { id: "payit", label: "Pay it", icon: "payit" as const },
  { id: "planner", label: "Planner", icon: "planner" as const },
  { id: "whiteboard", label: "Board", icon: "whiteboard" as const },
  { id: "integrations", label: "Integrations", icon: "integrations" as const },
  { id: "ai", label: "Mino", icon: "ai" as const },
];

const HOME_LINKS = [
  { id: "inbox", label: "Inbox", icon: "inbox" as const },
  { id: "outreach", label: "Outreach", icon: "invite" as const },
  { id: "tasks", label: "Tasks", icon: "tasks" as const },
];

const SPACES = [
  { id: "m2grab", label: "M's To Grab" },
  { id: "trackit", label: "Trackit" },
];

const CHATS = [{ id: "ask", label: "Ask, Build, Create" }];

const CHIPS = [
  "Add a meeting tomorrow at 2pm",
  "Pay a creator",
  "Create a task: follow up with creators",
  "Create a new campaign",
  "Open Inbox",
];

function heroCopy(lang: "en" | "fr") {
  if (lang === "fr") {
    return {
      affiliates: "Affiliés",
      solutions: "Solutions",
      learn: "Ressources",
      product: "Produit",
      pricing: "Tarifs",
      login: "Connexion",
      signup: "Inscription",
      getStarted: "Commencer",
      forFree: "Gratuit !!",
      badge: "Nouveauté : Ask Mino",
      titleBefore: "Toute l'affiliation dans un seul ",
      titleEm: "Workspace",
      points: [
        {
          strong: "Trouver des créateurs.",
          rest: "Trouvez les bons créateurs et invitez-les au même endroit.",
        },
        {
          strong: "Gérer les affiliés.",
          rest: "Campagnes, outreach et conversations, ensemble.",
        },
        {
          strong: "Suivre et payer.",
          rest: "Suivez les ventes et payez les commissions automatiquement.",
        },
      ],
      affiliateItems: [
        { label: "Commencer", href: "/affiliation" },
        { label: "Mon compte", href: "/auth?mode=login&role=creator" },
      ],
      solutionItems: [
        "Découverte de créateurs",
        "Outreach IA",
        "Campagnes",
        "Liens d'affiliation",
        "Suivi des ventes",
        "Scripts",
        "Contenu créateur",
        "Inbox",
        "Paiements",
        "Analytics",
        "Planner",
        "Tableaux",
        "Ask Mino",
        "Intégration Shopify",
      ],
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
    };
  }
  return {
    affiliates: "Affiliates",
    solutions: "Solutions",
    learn: "Learn",
    product: "Product",
    pricing: "Pricing",
    login: "Login",
    signup: "Sign Up",
    getStarted: "Get started",
    forFree: "For free!!",
    badge: "New: Ask Mino",
    titleBefore: "All your affiliation in one ",
    titleEm: "Workspace",
    points: [
      {
        strong: "Discover Creators.",
        rest: "Find the right creators and invite them in one place.",
      },
      {
        strong: "Handle Affiliates.",
        rest: "Manage campaigns, outreach, and conversations together.",
      },
      {
        strong: "Track and Pay.",
        rest: "Follow sales and pay commissions automatically.",
      },
    ],
    affiliateItems: [
      { label: "Get Started", href: "/affiliation" },
      { label: "My Account", href: "/auth?mode=login&role=creator" },
    ],
    solutionItems: [
      "Creator Discovery",
      "AI Outreach",
      "Campaigns",
      "Affiliate Links",
      "Sales Tracking",
      "Scripts",
      "Creator Content",
      "Inbox",
      "Payouts",
      "Analytics",
      "Planner",
      "Boards",
      "Ask Mino",
      "Shopify Integration",
    ],
    openMenu: "Open menu",
    closeMenu: "Close menu",
  };
}

const SEARCH_HITS: { label: string; group: string; page?: HeroPreviewPage }[] = [
  { label: "Planner", group: "Tools", page: "planner" },
  { label: "Discover", group: "Discover", page: "discovery" },
  { label: "Settings", group: "More" },
  { label: "Inbox", group: "Home", page: "inbox" },
  { label: "Campaigns", group: "Track", page: "campaigns" },
];

type SideLink = { id: string; label: string; icon: Parameters<typeof WsIcon>[0]["name"]; page: HeroPreviewPage };
type SideSection = { label: string; links: SideLink[] };

function sidebarFor(rail: string): { title: string; sections: SideSection[] } {
  if (rail === "findit") {
    return {
      title: "Discover",
      sections: [
        { label: "Navigation", links: [{ id: "discovery", label: "Discovery", icon: "findit", page: "discovery" }] },
        {
          label: "Manage",
          links: [
            { id: "findit-inbox", label: "Inbox", icon: "inbox", page: "findit-inbox" },
            { id: "creators", label: "Manage", icon: "users", page: "creators" },
          ],
        },
      ],
    };
  }
  if (rail === "trackit") {
    return {
      title: "Track It",
      sections: [
        { label: "Home", links: [{ id: "campaigns", label: "All campaigns", icon: "grid", page: "campaigns" }] },
        { label: "Creators", links: [{ id: "invitations", label: "Invitations", icon: "invite", page: "invitations" }] },
        { label: "Manage", links: [{ id: "content", label: "Content", icon: "camera", page: "content" }] },
        {
          label: "Tracking",
          links: [
            { id: "campaigns-list", label: "Campaigns", icon: "campaign", page: "campaigns" },
            { id: "links", label: "Links", icon: "list", page: "links" },
          ],
        },
      ],
    };
  }
  if (rail === "payit") {
    return {
      title: "Pay it",
      sections: [
        {
          label: "Pay it",
          links: [
            { id: "payouts", label: "Pay it", icon: "payit", page: "payouts" },
            { id: "transactions", label: "Payments", icon: "list", page: "transactions" },
          ],
        },
      ],
    };
  }
  if (rail === "planner") {
    return {
      title: "Planner",
      sections: [
        { label: "Planify", links: [{ id: "planner", label: "Planner", icon: "planner", page: "planner" }] },
        { label: "Take Notes", links: [{ id: "planner-notes", label: "Notes", icon: "notes", page: "planner-notes" }] },
      ],
    };
  }
  if (rail === "whiteboard") {
    return { title: "Whiteboard", sections: [] };
  }
  if (rail === "integrations") {
    return {
      title: "Integrations",
      sections: [
        {
          label: "Integrations",
          links: [{ id: "integrations", label: "Integrations", icon: "integrations", page: "integrations" }],
        },
      ],
    };
  }
  if (rail === "ai") {
    return {
      title: "Mino",
      sections: [{ label: "Mino", links: [{ id: "ask", label: "Ask, Build, Create", icon: "ai", page: "ai" }] }],
    };
  }
  return {
    title: "Home",
    sections: [
      {
        label: "Home",
        links: HOME_LINKS.map((link) => ({
          id: link.id,
          label: link.label,
          icon: link.icon,
          page: link.id as HeroPreviewPage,
        })),
      },
    ],
  };
}

function noop(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
}

export function HeroPreviewShell() {
  const lang = useLang();
  const [rail, setRail] = useState("home");
  const [page, setPage] = useState<HeroPreviewPage>("ai");
  const [space, setSpace] = useState("trackit");
  const lastPageByRail = useRef<Record<string, HeroPreviewPage>>({ home: "ai" });
  const [prompt, setPrompt] = useState("");
  const [chatMode, setChatMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".ws-workspace-switcher")) setWsOpen(false);
      if (!t.closest(".hp-profile")) setProfileOpen(false);
      if (!t.closest(".ai-chat-head")) setChatOpen(false);
      if (!t.closest(".ws-search-wrap")) setSearchOpen(false);
      if (!t.closest(".hp-nav")) setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        if (search.trim()) setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setChatOpen(false);
        setWsOpen(false);
        setProfileOpen(false);
        setSearchOpen(false);
        setNavOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [search]);

  useLayoutEffect(() => {
    const frame = rootRef.current;
    const dash = dashRef.current;
    const mark = cutRef.current;
    if (!frame || !dash || !mark) return;

    const BASE = 0.86;
    const align = () => {
      if (window.innerWidth <= 720) {
        const mobile = window.innerWidth <= 480 ? 0.52 : 0.62;
        dash.style.transform = `scale(${mobile})`;
        dash.style.width = `${100 / mobile}%`;
        return;
      }
      dash.style.transform = `scale(${BASE})`;
      dash.style.width = `${100 / BASE}%`;
      const frameBox = frame.getBoundingClientRect();
      const fromLeft = mark.getBoundingClientRect().left - frameBox.left;
      if (fromLeft < 80) return;
      const visible = Math.min(frameBox.right, window.innerWidth) - frameBox.left - 8;
      const next = Math.min(1.35, Math.max(0.72, BASE * (visible / fromLeft)));
      dash.style.transform = `scale(${next})`;
      dash.style.width = `${100 / next}%`;
    };

    align();
    void document.fonts?.ready.then(align);
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, [page]);

  const searchHits = SEARCH_HITS.filter((h) =>
    !search.trim() ? false : h.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const goToPage = (
    next: HeroPreviewPage,
    nextRail = next === "ai" && rail === "home" ? "home" : PAGE_RAIL[next],
  ) => {
    lastPageByRail.current[nextRail] = next;
    setRail(nextRail);
    setPage(next);
  };

  const goToRail = (id: string) => {
    const next = lastPageByRail.current[id] ?? RAIL_DEFAULT_PAGE[id] ?? "ai";
    lastPageByRail.current[id] = next;
    setRail(id);
    setPage(next);
  };

  const side = sidebarFor(rail);
  const t = heroCopy(lang);

  return (
    <div className="hp-page">
      <nav className="hp-nav">
        <div className="hp-nav__inner">
          <a className="hp-nav__brand" href="/" onClick={noop}>
            <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" />
          </a>
          <div className="hp-nav__links">
            {([
              { label: t.affiliates, items: t.affiliateItems },
              { label: t.solutions, items: t.solutionItems.map((label) => ({ label })) },
            ] as { label: string; items: { label: string; href?: string }[] }[]).map((item) => (
              <div key={item.label} className="hp-nav__item">
                <button type="button" className="hp-nav__link">
                  {item.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className="hp-nav__menu">
                  {item.items.map((sub) =>
                    sub.href ? (
                      <a key={sub.label} href={sub.href} className="hp-nav__menu-item">
                        {sub.label}
                      </a>
                    ) : (
                      <button key={sub.label} type="button" className="hp-nav__menu-item" onClick={noop}>
                        {sub.label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
            <div className="hp-nav__item">
              <button type="button" className="hp-nav__link">
                {t.learn}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="hp-nav__menu">
                <a href="/blog" className="hp-nav__menu-item">
                  Blog
                </a>
                <a href="#faq" className="hp-nav__menu-item">
                  FAQ
                </a>
              </div>
            </div>
            <a href="#pricing" className="hp-nav__link">
              {t.product}
            </a>
            <a href="#pricing" className="hp-nav__link">
              {t.pricing}
            </a>
          </div>
          <div className="hp-nav__actions">
            <a href="/auth?mode=login" className="hp-nav__login">
              {t.login}
            </a>
            <a href="/auth?mode=signup" className="hp-nav__signup">
              {t.signup}
            </a>
            <button
              type="button"
              className="hp-nav__toggle"
              aria-label={navOpen ? t.closeMenu : t.openMenu}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {navOpen ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
        {navOpen ? (
          <div className="hp-nav__sheet">
            {[t.affiliates, t.solutions].map((label) => (
              <button key={label} type="button" className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
                {label}
              </button>
            ))}
            <a href="/blog" className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
              Blog
            </a>
            <a href="#faq" className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
              FAQ
            </a>
            <a href="#pricing" className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
              {t.product}
            </a>
            <a href="#pricing" className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
              {t.pricing}
            </a>
            <a href="/auth?mode=login" className="hp-nav__login" onClick={() => setNavOpen(false)}>
              {t.login}
            </a>
            <a href="/auth?mode=signup" className="hp-nav__signup" onClick={() => setNavOpen(false)}>
              {t.signup}
            </a>
          </div>
        ) : null}
      </nav>
      <section className="hp-hero">
        <div className="hp-copy">
          <div className="hp-badge">
            <span className="hp-badge__led" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </span>
            <span className="hp-badge__label">
              <MinoCompanion size={16} />
              {t.badge}
            </span>
          </div>
          <h1>
            {t.titleBefore}
            <span className="hp-copy__cursive">{t.titleEm}</span>.
          </h1>
          <ul className="hp-points">
            {t.points.map((point) => (
              <li key={point.strong}>
                <span className="hp-check" aria-hidden />
                <span>
                  <strong>{point.strong}</strong> {point.rest}
                </span>
              </li>
            ))}
          </ul>
          <div className="hp-cta-row">
            <a href="/auth?mode=signup" className="hp-cta">
              <span className="hp-cta__swap">
                <span>{t.getStarted}</span>
                <span>{t.forFree}</span>
              </span>
            </a>
            <HeroTrustedTicker lang={lang} />
          </div>
        </div>

        <div className="hp-stage">
          <div className="hp-frame" ref={rootRef}>
            <div className="hp-dash" data-dashboard-theme="light" ref={dashRef}>
              <div className="ws-shell">
                <header className="ws-topbar">
                  <div className="ws-workspace-switcher">
                    <button
                      type="button"
                      className="ws-workspace-btn"
                      onClick={() => {
                        setWsOpen((v) => !v);
                        setProfileOpen(false);
                        setSearchOpen(false);
                      }}
                    >
                      <img
                        className="ws-workspace-mark is-photo"
                        src="/hero-preview-avatar.png"
                        alt=""
                        aria-hidden
                      />
                      <span className="label">{space === "m2grab" ? "M's To Grab" : "Trackit"}</span>
                      <WsIcon name="chevron" size={14} />
                    </button>
                    {wsOpen ? (
                      <div className="ws-workspace-menu">
                        <div className="ws-workspace-menu__label">Workspaces</div>
                        {SPACES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`ws-workspace-menu__item${space === s.id ? " is-active" : ""}`}
                            onClick={() => {
                              setSpace(s.id);
                              setWsOpen(false);
                            }}
                          >
                            <span className="ws-workspace-mark" aria-hidden>
                              {s.label.slice(0, 1)}
                            </span>
                            <span className="ws-workspace-menu__name">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="ws-search-wrap">
                    <div className="ws-search-wrap__led" aria-hidden>
                      <span className="ws-search-wrap__led-spin" />
                    </div>
                    <div className="ws-search-wrap__inner">
                      <WsIcon name="search" size={16} />
                      <input
                        ref={searchRef}
                        value={search}
                        placeholder="Search"
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setSearchOpen(e.target.value.trim().length > 0);
                        }}
                        onFocus={() => {
                          if (search.trim()) setSearchOpen(true);
                        }}
                      />
                      <span className="ws-search-kbd">⌘K</span>
                      <button type="button" className="ws-ai-pill" onClick={() => goToPage("ai")}>
                        <WsIcon name="sparkle" size={16} />
                        <span>Ask Mino</span>
                      </button>
                    </div>
                    {searchOpen && search.trim() ? (
                      <div className="ws-search-panel">
                        {searchHits.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className="ws-search-panel__item"
                            onClick={() => {
                              setSearch("");
                              setSearchOpen(false);
                              if (item.page) goToPage(item.page);
                            }}
                          >
                            {item.label}
                            <span className="ws-search-panel__meta">{item.group}</span>
                          </button>
                        ))}
                        {searchHits.length === 0 ? (
                          <div style={{ padding: 14, color: "var(--ws-text-muted)", fontSize: 13 }}>
                            No results
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="ws-top-actions">
                    <button type="button" className="ws-icon-btn" onClick={noop}>
                      <WsIcon name="call" size={17} />
                    </button>
                    <button type="button" className="ws-icon-btn" onClick={noop}>
                      <WsIcon name="mic" size={17} />
                    </button>
                    <div className="hp-profile" style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="ws-avatar-btn"
                        onClick={() => {
                          setProfileOpen((v) => !v);
                          setWsOpen(false);
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--ws-pill)",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          M
                        </span>
                      </button>
                      {profileOpen ? (
                        <div className="ws-menu">
                          <div className="ws-menu__user">
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: "var(--ws-pill)",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 700,
                              }}
                            >
                              M
                            </div>
                            <div>
                              <div className="ws-menu__name">m&apos;s</div>
                              <div className="ws-menu__meta">Online</div>
                            </div>
                          </div>
                          <div className="ws-menu__sep" />
                          <button type="button" className="ws-menu__item" onClick={() => setProfileOpen(false)}>
                            <WsIcon name="settings" size={16} />
                            Settings
                          </button>
                          <button type="button" className="ws-menu__item" onClick={() => setProfileOpen(false)}>
                            <WsIcon name="theme" size={16} />
                            Themes
                            <span className="muted">Light</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </header>

                <div className="ws-shell__body">
                  <aside className="ws-rail">
                    <div className="ws-rail__items">
                      {RAIL.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`ws-rail__item${rail === item.id ? " is-active" : ""}`}
                          onClick={() => goToRail(item.id)}
                          title={item.label}
                        >
                          <WsIcon name={item.icon} size={18} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ws-rail__foot">
                      <button type="button" className="ws-rail__item" onClick={noop} title="Help">
                        <WsIcon name="help" size={18} />
                        <span>Help</span>
                      </button>
                    </div>
                  </aside>

                  <div className="ws-stage">
                    <div className="ws-stage__body">
                      <aside className="ws-sidebar">
                        <div className="ws-sidebar__head">
                          <h2 className="ws-sidebar__title">{side.title}</h2>
                        </div>
                        <div className="ws-sidebar__body">
                          {side.sections.map((section) => (
                            <div key={section.label} className="ws-sidebar__section">
                              <div className="ws-sidebar__section-label">{section.label}</div>
                              {section.links.map((link) => (
                                <button
                                  key={link.id}
                                  type="button"
                                  className={`ws-sidebar__link${page === link.page ? " is-active" : ""}`}
                                  onClick={() => goToPage(link.page, rail)}
                                >
                                  <WsIcon name={link.icon} size={15} />
                                  <span>{link.label}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                          {rail === "home" ? (
                            <>
                              <div className="ws-sidebar__section">
                                <div className="ws-sidebar__section-label">Spaces</div>
                                {SPACES.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={`ws-sidebar__link${space === s.id ? " is-active" : ""}`}
                                    onClick={() => setSpace(s.id)}
                                  >
                                    {s.id === "trackit" ? (
                                      <img
                                        className="ws-workspace-mark is-photo"
                                        src="/hero-preview-trackit.png"
                                        alt=""
                                        aria-hidden
                                        style={{ width: 16, height: 16, borderRadius: 4 }}
                                      />
                                    ) : (
                                      <img
                                        className="ws-workspace-mark is-photo"
                                        src="/hero-preview-avatar.png"
                                        alt=""
                                        aria-hidden
                                        style={{ width: 16, height: 16, borderRadius: 4 }}
                                      />
                                    )}
                                    <span>{s.label}</span>
                                  </button>
                                ))}
                                <button type="button" className="ws-sidebar__link ws-spaces-new" onClick={noop}>
                                  <WsIcon name="plus" size={15} />
                                  <span>New Space</span>
                                </button>
                              </div>
                              <div className="ws-sidebar__section">
                                <div className="ws-sidebar__section-label">Mino</div>
                                {CHATS.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className={`ws-sidebar__link${page === "ai" ? " is-active" : ""}`}
                                    onClick={() => goToPage("ai", "home")}
                                  >
                                    <WsIcon name="sparkle" size={15} />
                                    <span>{c.label}</span>
                                  </button>
                                ))}
                                <button type="button" className="ws-sidebar__link ws-spaces-new" onClick={noop}>
                                  <WsIcon name="plus" size={15} />
                                  <span>New chat</span>
                                </button>
                              </div>
                            </>
                          ) : null}
                          {rail === "whiteboard" ? (
                            <div className="ws-sidebar__section">
                              <div className="ws-sidebar__section-label">Whiteboards</div>
                              <button type="button" className="ws-sidebar__link is-active">
                                <span className="wb-sidebar-swatch" style={{ background: "#F5D76E" }} aria-hidden />
                                <span>Board</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </aside>

                      <div className="ws-main">
                        <div className="ws-content">
                          {page !== "ai" ? (
                            <div className="hp-readonly">
                              <HeroPreviewPageView page={page} />
                            </div>
                          ) : null}
                          {page === "ai" ? (
                          <div className="ai-page">
                            <div className="ai-hero">
                              <div className="ai-chat-head">
                                <button
                                  type="button"
                                  className={`ai-chat-dropdown${chatOpen ? " is-open" : ""}`}
                                  onClick={() => setChatOpen((v) => !v)}
                                >
                                  <span className="ai-chat-dropdown__label">Ask, Build, Create</span>
                                  <span className="ai-chat-dropdown__chev">{chatOpen ? "▴" : "▾"}</span>
                                </button>
                                {chatOpen ? (
                                  <div className="ai-chat-dropdown__menu">
                                    <button
                                      type="button"
                                      className="ai-chat-dropdown__item is-new"
                                      onClick={() => setChatOpen(false)}
                                    >
                                      + New chat
                                    </button>
                                    <button
                                      type="button"
                                      className="ai-chat-dropdown__item is-active"
                                      onClick={() => setChatOpen(false)}
                                    >
                                      Ask, Build, Create
                                    </button>
                                  </div>
                                ) : null}
                              </div>

                              <div className="ai-hero__mino">
                                <MinoCompanion size={52} />
                              </div>
                              <h1 className="ai-hero__title">
                                What do you want to ask Mino today,
                                <span className="hp-cut-mark" ref={cutRef} aria-hidden />
                                {" "}
                                m&apos;s?
                              </h1>

                              <div className="mtg-promptbox">
                                <div className="mtg-promptbox__led" aria-hidden>
                                  <span className="mtg-promptbox__led-spin" />
                                </div>
                                <div className="mtg-promptbox__glow" aria-hidden>
                                  <span className="mtg-promptbox__led-spin" />
                                </div>
                                <div className="mtg-promptbox__inner">
                                  <div className="mtg-promptbox__row">
                                    <svg className="mtg-promptbox__search" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                                      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                                      <path d="M16.2 16.2 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                    <textarea
                                      ref={textareaRef}
                                      value={prompt}
                                      onChange={(e) => setPrompt(e.target.value)}
                                      placeholder={chatMode ? "Talk to Mino…" : "Ask, build, create…"}
                                      rows={2}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") e.preventDefault();
                                      }}
                                    />
                                  </div>
                                  <div className="mtg-promptbox__bar">
                                    <span className="mtg-promptbox__meta">
                                      Powered by
                                      <img src="/claude-logo.svg" alt="" className="mtg-promptbox__claude" width={16} height={16} />
                                    </span>
                                    <div className="mtg-promptbox__actions">
                                      <button
                                        type="button"
                                        className={`mtg-promptbox__chat${chatMode ? " is-active" : ""}`}
                                        onClick={() => setChatMode((v) => !v)}
                                      >
                                        {chatMode ? "Ask" : "Chat"}
                                      </button>
                                      <button
                                        type="button"
                                        className="mtg-promptbox__send"
                                        disabled={!prompt.trim()}
                                        onClick={noop}
                                        aria-label="Send"
                                      >
                                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                                          <path
                                            d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mtg-chips">
                                {CHIPS.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    className="mtg-chip"
                                    onClick={() => {
                                      setPrompt(s);
                                      textareaRef.current?.focus();
                                    }}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="hp-fade" aria-hidden />
          </div>
        </div>
      </section>
    </div>
  );
}
