import type { DashboardView } from "@/lib/dashboard-view-storage";

export type DashboardSearchHit = {
  id: string;
  label: string;
  view: DashboardView;
  group: string;
  keywords: string[];
  campaignId?: string;
  boardId?: string;
  chatId?: string;
};

type CatalogOpts = {
  lang: "en" | "fr";
  isCreator?: boolean;
  campaigns?: Array<{ id: string; name: string }>;
  boards?: Array<{ id: string; name: string }>;
  chats?: Array<{ id: string; title: string }>;
};

function entry(
  id: string,
  label: string,
  view: DashboardView,
  group: string,
  keywords: string[] = [],
): DashboardSearchHit {
  return { id, label, view, group, keywords };
}

function brandCatalog(lang: "en" | "fr"): DashboardSearchHit[] {
  const fr = lang === "fr";
  return [
    entry("home", fr ? "Accueil" : "Home", "dashboard", fr ? "Accueil" : "Home", [
      "home",
      "accueil",
      "overview",
      "dashboard",
    ]),
    entry("inbox", "Inbox", "notifications", fr ? "Accueil" : "Home", [
      "inbox",
      "notifications",
      "notifs",
      "cloche",
      "bell",
    ]),
    entry("notifications", "Notifications", "notifications", fr ? "Accueil" : "Home", [
      "notifications",
      "inbox",
      "notifs",
      "alertes",
    ]),
    entry("outreach", "Outreach", "outreach", fr ? "Accueil" : "Home", [
      "outreach",
      "messages",
      "dm",
      "email",
      "prospection",
    ]),
    entry("tasks", fr ? "Tâches" : "Tasks", "tasks", fr ? "Accueil" : "Home", [
      "tasks",
      "taches",
      "tâches",
      "todo",
      "to-do",
    ]),
    entry("ai", "Ask Mino", "ai", "Mino", [
      "ai",
      "mino",
      "ask",
      "chat",
      "assistant",
      "intelligence",
    ]),
    entry("ai-chats", fr ? "Conversations Mino" : "Mino chats", "ai", "Mino", [
      "ai chats",
      "conversations",
      "mino",
      "chat",
    ]),
    entry("discovery", "Discover", "discovery", "Discover", [
      "discover",
      "discovery",
      "find it",
      "findit",
      "trouver",
      "créateurs",
      "creators",
      "recherche",
    ]),
    entry("findit-inbox", fr ? "Inbox Discover" : "Discover Inbox", "findit-inbox", "Discover", [
      "inbox",
      "discover inbox",
      "contenu créateurs",
      "uploads",
    ]),
    entry("creators", fr ? "Gérer" : "Manage", "creators", "Discover", [
      "manage",
      "gérer",
      "gerer",
      "créateurs",
      "creators",
      "liste",
    ]),
    entry("my-creators", fr ? "Mes créateurs" : "My creators", "my-creators", "Discover", [
      "my creators",
      "mes createurs",
      "saved",
    ]),
    entry("campaigns", fr ? "Campagnes" : "Campaigns", "campaigns", "Track", [
      "campaigns",
      "campagnes",
      "track",
      "trackit",
      "track it",
    ]),
    entry("invitations", "Invitations", "invitations", "Track", [
      "invitations",
      "invite",
      "inviter",
      "lien",
    ]),
    entry("links", fr ? "Liens" : "Links", "links", "Track", [
      "links",
      "liens",
      "affiliate",
      "affiliés",
      "tracking",
    ]),
    entry("community", fr ? "Communauté" : "Community", "community", "Track", [
      "community",
      "communauté",
      "chat",
      "messages",
      "groupe",
    ]),
    entry("affiliates", fr ? "Affiliés" : "Affiliates", "affiliates", "Track", [
      "affiliates",
      "affiliés",
      "partenaires",
    ]),
    entry("brand-content", fr ? "Contenu" : "Content", "brand-content", "Track", [
      "content",
      "contenu",
      "clips",
      "videos",
      "vidéos",
      "ugc",
    ]),
    entry("rpm", "RPM", "rpm", "Track", [
      "rpm",
      "vues",
      "views",
      "cpm",
      "paiement vues",
      "view payout",
    ]),
    entry("infos", fr ? "Informations" : "Information", "infos", "Track", [
      "infos",
      "informations",
      "information",
      "rules",
      "règles",
      "regles",
      "guidelines",
      "howto",
      "comment ça marche",
      "pricing",
      "gestion",
    ]),
    entry("hooks", "Hooks", "hooks", "Track", [
      "hooks",
      "hook",
      "accroche",
      "accroches",
      "ugc hook",
    ]),
    entry("payouts", "Pay it", "payouts", "Pay it", [
      "pay it",
      "payouts",
      "paiements",
      "pay",
      "commissions",
    ]),
    entry("balance", fr ? "Solde" : "Balance", "balance", "Pay it", [
      "balance",
      "solde",
      "wallet",
      "fonds",
    ]),
    entry("transactions", fr ? "Paiements" : "Payments", "transactions", "Pay it", [
      "transactions",
      "payments",
      "paiements",
      "historique",
    ]),
    entry("planner", "Planner", "planner", fr ? "Outils" : "Tools", [
      "planner",
      "planifier",
      "calendrier",
      "calendar",
      "agenda",
      "rdv",
    ]),
    entry("meetings", fr ? "Réunions" : "Meetings", "meetings", fr ? "Outils" : "Tools", [
      "meetings",
      "reunions",
      "réunions",
      "calls",
      "appels",
    ]),
    entry("planner-notes", fr ? "Notes planner" : "Planner Notes", "planner-notes", fr ? "Outils" : "Tools", [
      "planner notes",
      "notes",
      "memo",
    ]),
    entry("notes", fr ? "Bloc-notes" : "Notes", "notes", fr ? "Outils" : "Tools", [
      "notes",
      "notepad",
      "bloc-notes",
      "memo",
    ]),
    entry("whiteboard", "Whiteboard", "whiteboard", fr ? "Outils" : "Tools", [
      "whiteboard",
      "board",
      "tableau",
      "canvas",
    ]),
    entry("integrations", fr ? "Intégrations" : "Integrations", "integrations", fr ? "Outils" : "Tools", [
      "integrations",
      "intégrations",
      "shopify",
      "stripe",
      "apps",
    ]),
    entry("analytics", "Analytics", "analytics", fr ? "Plus" : "More", [
      "analytics",
      "stats",
      "statistiques",
      "performance",
    ]),
    entry("settings", fr ? "Paramètres" : "Settings", "settings", fr ? "Plus" : "More", [
      "settings",
      "paramètres",
      "parametres",
      "compte",
      "profil",
      "account",
      "preferences",
    ]),
    entry("workspace", fr ? "Espace de travail" : "Workspace", "workspace", fr ? "Plus" : "More", [
      "workspace",
      "espace",
      "space",
    ]),
    entry("billing", fr ? "Facturation" : "Billing", "billing", fr ? "Plus" : "More", [
      "billing",
      "facturation",
      "plan",
      "abonnement",
      "subscription",
    ]),
    entry("help", fr ? "Aide" : "Help", "help", fr ? "Plus" : "More", [
      "help",
      "aide",
      "support",
      "faq",
      "docs",
    ]),
    entry("feedback", fr ? "Avis" : "Feedback", "feedback", fr ? "Plus" : "More", [
      "feedback",
      "avis",
      "review",
      "étoiles",
      "stars",
    ]),
    entry("automation", fr ? "Automatisation" : "Automation", "automation", fr ? "Plus" : "More", [
      "automation",
      "automatisation",
    ]),
  ];
}

function creatorCatalog(lang: "en" | "fr"): DashboardSearchHit[] {
  const fr = lang === "fr";
  return [
    entry("home", fr ? "Accueil" : "Home", "dashboard", fr ? "Accueil" : "Home", [
      "home",
      "accueil",
      "overview",
    ]),
    entry("infos", fr ? "Règles" : "Rules", "infos", fr ? "Infos" : "Infos", [
      "infos",
      "règles",
      "regles",
      "rules",
      "guidelines",
    ]),
    entry(
      "infos-howto",
      fr ? "Comment ça marche" : "How it works",
      "infos-howto",
      fr ? "Infos" : "Infos",
      ["howto", "comment ça marche", "how it works", "infos"],
    ),
    entry(
      "infos-pricing",
      fr ? "Modèle de pricing" : "Pricing model",
      "infos-pricing",
      fr ? "Infos" : "Infos",
      ["pricing", "modèle", "modele", "rpm", "commission", "infos"],
    ),
    entry("hooks", "Hooks", "hooks", fr ? "Travail" : "Work", [
      "hooks",
      "hook",
      "accroche",
      "accroches",
    ]),
    entry("community", fr ? "Communauté" : "Community", "community", fr ? "Travail" : "Work", [
      "community",
      "communauté",
      "chat",
      "messages",
    ]),
    entry("content", fr ? "Contenu" : "Content", "content", fr ? "Travail" : "Work", [
      "content",
      "contenu",
      "upload",
      "videos",
      "ugc",
    ]),
    entry("analytics", fr ? "Stats" : "Analytics", "analytics", fr ? "Plus" : "More", [
      "analytics",
      "stats",
      "statistiques",
    ]),
    entry("payouts", "Pay it", "payouts", "Pay it", [
      "pay it",
      "payouts",
      "paiements",
      "commissions",
    ]),
    entry("balance", fr ? "Solde" : "Balance", "balance", "Pay it", [
      "balance",
      "solde",
      "wallet",
    ]),
    entry("whiteboard", "Whiteboard", "whiteboard", fr ? "Outils" : "Tools", [
      "whiteboard",
      "board",
      "tableau",
    ]),
    entry("ai", "Ask Mino", "ai", "Mino", ["ai", "mino", "ask", "chat", "assistant"]),
    entry("planner", "Planner", "planner", fr ? "Outils" : "Tools", [
      "planner",
      "planifier",
      "calendrier",
      "agenda",
    ]),
    entry("settings", fr ? "Paramètres" : "Settings", "settings", fr ? "Plus" : "More", [
      "settings",
      "paramètres",
      "parametres",
      "compte",
      "profil",
    ]),
    entry("feedback", fr ? "Avis" : "Feedback", "feedback", fr ? "Plus" : "More", [
      "feedback",
      "avis",
      "review",
    ]),
    entry("help", fr ? "Aide" : "Help", "help", fr ? "Plus" : "More", [
      "help",
      "aide",
      "support",
    ]),
  ];
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function scoreHit(hit: DashboardSearchHit, q: string): number {
  const label = normalize(hit.label);
  const group = normalize(hit.group);
  const keys = hit.keywords.map(normalize);
  if (label === q) return 100;
  if (keys.some((k) => k === q)) return 95;
  if (label.startsWith(q)) return 80;
  if (keys.some((k) => k.startsWith(q))) return 70;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (keys.some((k) => k.split(/\s+/).some((w) => w.startsWith(q)))) return 55;
  if (label.includes(q)) return 40;
  if (keys.some((k) => k.includes(q))) return 30;
  if (group.startsWith(q) || group.includes(q)) return 15;
  return 0;
}

export function buildDashboardSearchCatalog(opts: CatalogOpts): DashboardSearchHit[] {
  const fr = opts.lang === "fr";
  const base = opts.isCreator ? creatorCatalog(opts.lang) : brandCatalog(opts.lang);
  const extra: DashboardSearchHit[] = [];

  for (const campaign of opts.campaigns ?? []) {
    extra.push({
      id: `campaign-${campaign.id}`,
      label: campaign.name,
      view: "campaigns",
      group: fr ? "Campagnes" : "Campaigns",
      keywords: [campaign.name, "campagne", "campaign"],
      campaignId: campaign.id,
    });
  }

  for (const board of opts.boards ?? []) {
    extra.push({
      id: `board-${board.id}`,
      label: board.name,
      view: "whiteboard",
      group: "Whiteboard",
      keywords: [board.name, "whiteboard", "board", "tableau"],
      boardId: board.id,
    });
  }

  for (const chat of opts.chats ?? []) {
    extra.push({
      id: `chat-${chat.id}`,
      label: chat.title,
      view: "ai",
      group: "AI",
      keywords: [chat.title, "ai", "mino", "chat", "conversation"],
      chatId: chat.id,
    });
  }

  return [...base, ...extra];
}

export function searchDashboardCatalog(catalog: DashboardSearchHit[], query: string): DashboardSearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  return catalog
    .map((hit) => ({ hit, score: scoreHit(hit, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label))
    .slice(0, 12)
    .map((row) => row.hit);
}

export function highlightSearchMatch(label: string, query: string): { before: string; match: string; after: string } {
  const q = query.trim();
  if (!q) return { before: label, match: "", after: "" };
  const idx = normalize(label).indexOf(normalize(q));
  if (idx < 0) return { before: label, match: "", after: "" };
  return {
    before: label.slice(0, idx),
    match: label.slice(idx, idx + q.length),
    after: label.slice(idx + q.length),
  };
}
