"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WsIcon } from "@/app/dashboard/workspace/WorkspaceIcons";
import { MinoCompanion } from "@/components/MinoCompanion";
import { PlatformLogo, type PlatformName } from "@/components/PlatformLogo";
import { PayoutsPulse, type PulseBucket } from "@/app/dashboard/PayoutsPulse";
import { RevenueChart } from "@/app/dashboard/SampleCampaignPreview";
import { CountUp, prefersReducedMotion, useLiveFeed } from "@/app/dashboard/sample-motion";
import { useLang, type Lang } from "@/lib/useLang";
import "@/app/dashboard/home-mino.css";
import "./premium-demo.css";

// Landing preview of the brand dashboard, shown as a program at full speed:
// thousands of creators, millions in tracked sales. Same shell, rail and views
// as the real dashboard. People and brands are fictional; faces and products
// are free Unsplash photos, videos are free Mixkit clips, all hotlinked.
// French visitors get French copy and the same numbers in euros.

type IconName = Parameters<typeof WsIcon>[0]["name"];
type Rail = "home" | "findit" | "trackit" | "payit" | "integrations";
type Page =
  | "home"
  | "mino"
  | "discovery"
  | "lists"
  | "campaigns"
  | "content"
  | "payouts"
  | "transactions"
  | "integrations";

const unsplash = (id: string, w: number, h = w, faces = true) =>
  `https://images.unsplash.com/photo-${id}?w=${w * 2}&h=${h * 2}&fit=crop${faces ? "&crop=faces" : ""}&auto=format&q=70`;
const clip = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`;
const clipPoster = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`;

const OWNER = { first: "Sofia", name: "Sofia Reyes", face: "1611695434369-a8f5d76ceb7b" };
const BRANDS = [
  { id: "lumiere", name: "Lumière Skin", photo: "1576426863848-c21f53c60b19" },
  { id: "atelier", name: "Atelier Hair", photo: "1623143445418-40c192fa3d11" },
];

type Niche = "Skincare" | "Beauty" | "Makeup" | "Fitness" | "Lifestyle" | "Food";
const NICHE_FR: Record<Niche, string> = {
  Skincare: "Skincare",
  Beauty: "Beauté",
  Makeup: "Maquillage",
  Fitness: "Fitness",
  Lifestyle: "Lifestyle",
  Food: "Cuisine",
};
const nicheLabel = (niche: Niche, lang: Lang) => (lang === "fr" ? NICHE_FR[niche] : niche);

type Creator = {
  id: string;
  name: string;
  handle: string;
  platform: PlatformName;
  niche: Niche;
  face: string;
  video: number;
  followers: number;
  avgViews: number;
  engagement: number;
  revenue: number;
  sales: number;
  owed: number;
  method: "PayPal" | "Wise" | "Revolut";
  country: string;
};

const CREATORS: Creator[] = [
  { id: "luna", name: "Luna Park", handle: "lunaglow", platform: "tiktok", niche: "Skincare", face: "1489278353717-f64c6ee8a4d2", video: 50423, followers: 2_410_000, avgViews: 684_000, engagement: 8.4, revenue: 412_860, sales: 6_214, owed: 8_240, method: "PayPal", country: "US" },
  { id: "sarah", name: "Sarah Cole", handle: "sarahcole", platform: "instagram", niche: "Beauty", face: "1580489944761-15a19d654956", video: 42323, followers: 1_860_000, avgViews: 421_000, engagement: 6.9, revenue: 356_420, sales: 5_103, owed: 6_910, method: "Wise", country: "UK" },
  { id: "maya", name: "Maya Chen", handle: "mayamakes", platform: "tiktok", niche: "Makeup", face: "1630939687530-241d630735df", video: 49141, followers: 986_000, avgViews: 312_000, engagement: 9.1, revenue: 284_190, sales: 4_388, owed: 5_420, method: "Revolut", country: "CA" },
  { id: "mike", name: "Mike Alvarez", handle: "mikelifts", platform: "youtube", niche: "Fitness", face: "1625241152315-4a698f74ceb7", video: 5053, followers: 1_240_000, avgViews: 268_000, engagement: 5.8, revenue: 231_760, sales: 3_902, owed: 4_870, method: "PayPal", country: "US" },
  { id: "ines", name: "Inès Morel", handle: "inesmorel", platform: "instagram", niche: "Skincare", face: "1534180477871-5d6cc81f3920", video: 50422, followers: 742_000, avgViews: 198_000, engagement: 7.6, revenue: 188_340, sales: 2_977, owed: 3_960, method: "Wise", country: "FR" },
  { id: "zoe", name: "Zoé Martin", handle: "zoemoves", platform: "tiktok", niche: "Lifestyle", face: "1544507888-56d73eb6046e", video: 42315, followers: 3_120_000, avgViews: 902_000, engagement: 10.2, revenue: 167_920, sales: 2_540, owed: 3_480, method: "PayPal", country: "FR" },
  { id: "ava", name: "Ava Rossi", handle: "avaeats", platform: "tiktok", niche: "Food", face: "1562337404-3044c84ac061", video: 51252, followers: 528_000, avgViews: 146_000, engagement: 8.8, revenue: 121_450, sales: 1_968, owed: 2_730, method: "Revolut", country: "IT" },
  { id: "chloe", name: "Chloé Dubois", handle: "chloebeauty", platform: "instagram", niche: "Makeup", face: "1623717217554-72ca676de535", video: 367, followers: 412_000, avgViews: 118_000, engagement: 7.1, revenue: 98_760, sales: 1_502, owed: 2_140, method: "Wise", country: "BE" },
  { id: "nora", name: "Nora Diallo", handle: "norafit", platform: "tiktok", niche: "Fitness", face: "1662850886700-4ec19bd30d11", video: 40246, followers: 694_000, avgViews: 231_000, engagement: 9.4, revenue: 86_310, sales: 1_311, owed: 1_860, method: "PayPal", country: "US" },
  { id: "jade", name: "Jade Moreau", handle: "jadedaily", platform: "instagram", niche: "Lifestyle", face: "1567516364473-233c4b6fcfbe", video: 41181, followers: 358_000, avgViews: 97_000, engagement: 6.4, revenue: 71_980, sales: 1_096, owed: 1_570, method: "Revolut", country: "ES" },
];
// Creators Mino can find who do not work with the brand yet (micro and French
// profiles, so every example prompt has real matches).
const PROSPECTS: Creator[] = [
  { id: "amara", name: "Amara Okafor", handle: "amarasweats", platform: "tiktok", niche: "Fitness", face: "1531123897727-8f129e1688ce", video: 23056, followers: 64_300, avgViews: 41_800, engagement: 11.2, revenue: 38_420, sales: 612, owed: 0, method: "PayPal", country: "US" },
  { id: "leo", name: "Leo Santos", handle: "leolifts", platform: "tiktok", niche: "Fitness", face: "1507003211169-0a1dd7228f2d", video: 40248, followers: 82_100, avgViews: 57_300, engagement: 9.8, revenue: 29_870, sales: 488, owed: 0, method: "Wise", country: "PT" },
  { id: "tom", name: "Tom Becker", handle: "tombuilds", platform: "instagram", niche: "Fitness", face: "1500648767791-00dcc994a43e", video: 4506, followers: 47_600, avgViews: 22_400, engagement: 7.9, revenue: 17_240, sales: 301, owed: 0, method: "Revolut", country: "DE" },
  { id: "camille", name: "Camille Laurent", handle: "camilleglow", platform: "instagram", niche: "Beauty", face: "1529626455594-4ff0802cfb7e", video: 52039, followers: 88_400, avgViews: 36_900, engagement: 8.6, revenue: 46_130, sales: 702, owed: 0, method: "Wise", country: "FR" },
  { id: "lea", name: "Léa Bernard", handle: "leabeaute", platform: "tiktok", niche: "Makeup", face: "1488426862026-3ee34a7d66df", video: 40552, followers: 71_200, avgViews: 64_100, engagement: 12.4, revenue: 33_560, sales: 540, owed: 0, method: "PayPal", country: "FR" },
  { id: "manon", name: "Manon Petit", handle: "manonskin", platform: "tiktok", niche: "Skincare", face: "1438761681033-6461ffad8d80", video: 52057, followers: 54_800, avgViews: 38_200, engagement: 10.6, revenue: 27_910, sales: 455, owed: 0, method: "Revolut", country: "FR" },
  { id: "priya", name: "Priya Shah", handle: "priyaglam", platform: "instagram", niche: "Makeup", face: "1534528741775-53994a69daeb", video: 371, followers: 136_000, avgViews: 48_900, engagement: 7.4, revenue: 52_300, sales: 811, owed: 0, method: "Wise", country: "UK" },
  { id: "emma", name: "Emma Walsh", handle: "emmacooks", platform: "tiktok", niche: "Food", face: "1494790108377-be9c29b29330", video: 42316, followers: 39_500, avgViews: 28_700, engagement: 9.3, revenue: 14_680, sales: 266, owed: 0, method: "PayPal", country: "UK" },
  { id: "julia", name: "Julia Navarro", handle: "julianavarro", platform: "instagram", niche: "Lifestyle", face: "1524504388940-b1c1722653e1", video: 49647, followers: 92_700, avgViews: 31_500, engagement: 6.8, revenue: 21_050, sales: 344, owed: 0, method: "Revolut", country: "ES" },
];
const EVERYONE = [...CREATORS, ...PROSPECTS];
const BY_ID = new Map(EVERYONE.map((c) => [c.id, c]));
const IN_PROGRAM = new Set(CREATORS.map((c) => c.id));

/** People who joined the program recently (shown in revenue answers). */
const NEWCOMERS: { name: string; handle: string; platform: PlatformName; face: string; daysAgo: number; firstSales: number }[] = [
  { name: "Clara Weiss", handle: "claraweiss", platform: "instagram", face: "1517841905240-472988babdf9", daysAgo: 1, firstSales: 1_240 },
  { name: "Noah Blake", handle: "noahblake", platform: "tiktok", face: "1539571696357-5a69c17a67c6", daysAgo: 2, firstSales: 860 },
  { name: "Hannah Lee", handle: "hannahlee", platform: "tiktok", face: "1573496359142-b8d87734a5a2", daysAgo: 4, firstSales: 2_310 },
  { name: "Sam Rivera", handle: "samrivera", platform: "youtube", face: "1506794778202-cad84cf45f1d", daysAgo: 6, firstSales: 540 },
  { name: "Grace Miller", handle: "gracemiller", platform: "instagram", face: "1508214751196-bcfd4ca60f91", daysAgo: 11, firstSales: 3_120 },
  { name: "Lina Haddad", handle: "linahaddad", platform: "tiktok", face: "1531746020798-e6953c6e8e04", daysAgo: 19, firstSales: 4_480 },
];

const COUNTRY_NAMES: Record<string, [string, string]> = {
  FR: ["France", "France"],
  UK: ["United Kingdom", "Royaume-Uni"],
  US: ["United States", "États-Unis"],
  CA: ["Canada", "Canada"],
  IT: ["Italy", "Italie"],
  ES: ["Spain", "Espagne"],
  BE: ["Belgium", "Belgique"],
  DE: ["Germany", "Allemagne"],
  PT: ["Portugal", "Portugal"],
};
const countryName = (code: string, lang: Lang) => COUNTRY_NAMES[code]?.[lang === "fr" ? 1 : 0] ?? code;

type Campaign = {
  id: string;
  name: string;
  nameFr: string;
  cover: string;
  status: "live" | "gifting" | "draft";
  /** Launch date as [month, day]; null while still a draft. */
  started: [number, number] | null;
  revenue: number;
  sales: number;
  creators: number;
  conversion: number;
  crew: string[];
  trend: number[];
};

const CAMPAIGNS: Campaign[] = [
  { id: "serum", name: "Glow Serum launch", nameFr: "Lancement Glow Serum", cover: "1576426863848-c21f53c60b19", status: "live", started: [9, 2], revenue: 1_184_320, sales: 18_402, creators: 342, conversion: 4.8, crew: ["luna", "sarah", "maya", "zoe"], trend: [4, 6, 5, 8, 9, 12, 14, 13, 17, 21] },
  { id: "bf", name: "Black Friday bundle", nameFr: "Coffret Black Friday", cover: "1631730486572-226d1f595b68", status: "live", started: [9, 14], revenue: 742_610, sales: 11_290, creators: 268, conversion: 5.6, crew: ["sarah", "ines", "chloe", "ava"], trend: [2, 3, 3, 5, 7, 8, 11, 15, 19, 24] },
  { id: "spf", name: "Summer SPF drop", nameFr: "Drop SPF de l’été", cover: "1623143445418-40c192fa3d11", status: "live", started: [8, 21], revenue: 486_930, sales: 7_604, creators: 191, conversion: 3.9, crew: ["zoe", "nora", "jade", "luna"], trend: [9, 11, 10, 12, 11, 13, 12, 14, 13, 15] },
  { id: "night", name: "Night Repair gifting", nameFr: "Gifting Night Repair", cover: "1718490953028-021d352b14fd", status: "gifting", started: [9, 9], revenue: 263_480, sales: 4_122, creators: 124, conversion: 4.2, crew: ["maya", "chloe", "ines", "mike"], trend: [1, 2, 4, 4, 6, 7, 7, 9, 10, 12] },
  { id: "oil", name: "Body oil UGC", nameFr: "UGC huile pour le corps", cover: "1631729371254-42c2892f0e6e", status: "live", started: [8, 30], revenue: 170_050, sales: 2_689, creators: 88, conversion: 3.4, crew: ["ava", "jade", "nora", "mike"], trend: [3, 4, 4, 5, 6, 6, 7, 8, 8, 9] },
];
const TOTAL_REVENUE = CAMPAIGNS.reduce((s, c) => s + c.revenue, 0);
const TOTAL_SALES = 48_217;
const NEW_CAMPAIGN_COVER = "1741896135512-084b251887f7";
const campaignName = (c: Pick<Campaign, "name" | "nameFr">, lang: Lang) => (lang === "fr" ? c.nameFr : c.name);
const campaignNameById = (id: string, lang: Lang) => {
  const c = CAMPAIGNS.find((x) => x.id === id);
  return c ? campaignName(c, lang) : "";
};

type ProductId = "serum" | "night" | "spf" | "oil" | "gift" | "bundle";
const PRODUCTS: { id: ProductId; name: string; nameFr: string; photo: string }[] = [
  { id: "serum", name: "Glow Serum", nameFr: "Sérum Glow", photo: "1576426863848-c21f53c60b19" },
  { id: "night", name: "Night Repair cream", nameFr: "Crème Night Repair", photo: "1718490953028-021d352b14fd" },
  { id: "spf", name: "SPF 50 fluid", nameFr: "Fluide SPF 50", photo: "1623143445418-40c192fa3d11" },
  { id: "oil", name: "Body oil", nameFr: "Huile pour le corps", photo: "1631729371254-42c2892f0e6e" },
  { id: "gift", name: "Holiday gift set", nameFr: "Coffret cadeau des fêtes", photo: NEW_CAMPAIGN_COVER },
  { id: "bundle", name: "Black Friday bundle", nameFr: "Coffret Black Friday", photo: "1631730486572-226d1f595b68" },
];

const LISTS = [
  { name: "Skincare top 1%", nameFr: "Top 1 % skincare", count: 48, crew: ["luna", "ines", "sarah", "maya"] },
  { name: "Q4 gifting wave", nameFr: "Vague de gifting Q4", count: 126, crew: ["chloe", "maya", "zoe", "ava"] },
  { name: "Fitness closers", nameFr: "Fitness : ceux qui convertissent", count: 37, crew: ["mike", "nora", "jade", "zoe"] },
  { name: "Ready to sign", nameFr: "Prêts à signer", count: 212, crew: ["sarah", "ava", "luna", "chloe"] },
];

const INTEGRATIONS = [
  { name: "Shopify", logo: "/shopify-logo.svg", note: "Orders and discount codes synced live", noteFr: "Commandes et codes promo synchronisés en direct", on: true },
  { name: "TikTok", logo: "/tiktok-logo.svg", note: "Creator stats and videos", noteFr: "Statistiques et vidéos des créateurs", on: true },
  { name: "Instagram", logo: "/instagram-logo.svg", note: "Profiles, reels and reach", noteFr: "Profils, reels et portée", on: true },
  { name: "Gmail", logo: "/gmail-logo.svg", note: "Outreach from your own inbox", noteFr: "Outreach depuis votre propre boîte mail", on: true },
  { name: "Stripe", logo: "/stripe-logo.svg", note: "Commission payouts", noteFr: "Paiement des commissions", on: true },
  { name: "Notion", logo: "/notion-logo.svg", note: "Briefs and scripts", noteFr: "Briefs et scripts", on: false },
  { name: "Google Drive", logo: "/google-drive-logo.svg", note: "Raw creator footage", noteFr: "Rushs des créateurs", on: true },
  { name: "Zapier", logo: "/zapier-logo.svg", note: "Automate anything", noteFr: "Automatisez tout", on: false },
  { name: "Make", logo: "/make-logo.svg", note: "Visual workflows", noteFr: "Workflows visuels", on: false },
];

// ── Numbers ───────────────────────────────────────────────────
// English shows dollars (en-US), French shows euros (fr-FR). Same figures.
function makeFormat(lang: Lang) {
  const fr = lang === "fr";
  const locale = fr ? "fr-FR" : "en-US";
  const currency0 = new Intl.NumberFormat(locale, { style: "currency", currency: fr ? "EUR" : "USD", maximumFractionDigits: 0 });
  const decimal = (n: number, digits: number) => (fr ? n.toFixed(digits).replace(".", ",") : n.toFixed(digits));
  return {
    money: (n: number) => currency0.format(Math.round(n)),
    int: (n: number) => Math.round(n).toLocaleString(locale),
    pct: (n: number) => (fr ? `${String(n).replace(".", ",")} %` : `${n}%`),
    compact(n: number, cash = false): string {
      const a = Math.abs(n);
      const [body, suffix] =
        a >= 1e6 ? [decimal(n / 1e6, 2), "M"] : a >= 1e4 ? [String(Math.round(n / 1e3)), "K"] : a >= 1e3 ? [decimal(n / 1e3, 1), "K"] : [String(Math.round(n)), ""];
      if (!fr) return `${cash ? "$" : ""}${body}${suffix}`;
      const unit = suffix === "K" ? "k" : suffix;
      const num = unit ? `${body} ${unit}` : body;
      if (!cash) return num;
      return unit ? `${num}€` : `${num} €`;
    },
    /** Short day like "Sep 2" / "2 sept.". */
    day: (month: number, dayOfMonth: number) => new Date(2026, month - 1, dayOfMonth).toLocaleDateString(locale, { month: "short", day: "numeric" }),
    /** A day `ago` days before today, like "Sep 24" / "24 sept.". */
    ago: (ago: number) => new Date(Date.now() - ago * 86_400_000).toLocaleDateString(locale, { month: "short", day: "numeric" }),
  };
}
const FORMAT = { en: makeFormat("en"), fr: makeFormat("fr") };

/** Deterministic rising revenue curve that sums to `total`. */
function revenueDays(count: number, total: number, seed: number): number[] {
  const raw = Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1);
    const wave = Math.sin(i * 1.7 + seed) * 0.11 + Math.sin(i * 0.53 + seed * 2) * 0.07;
    return (0.55 + t * 0.9) * (1 + wave);
  });
  const sum = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => Math.round((v / sum) * total));
}

const PERIODS = [
  { id: "7d", label: "7D", labelFr: "7 j", days: 7, total: 842_610, growth: 12.9 },
  { id: "30d", label: "30D", labelFr: "30 j", days: 30, total: TOTAL_REVENUE, growth: 38.4 },
  { id: "90d", label: "90D", labelFr: "90 j", days: 90, total: 6_912_480, growth: 71.2 },
] as const;

const PAYOUT_EARNED = 384_920;
const OWED_START = CREATORS.reduce((s, c) => s + c.owed, 0);
const PAID_START = PAYOUT_EARNED - OWED_START;

function payoutBuckets(): PulseBucket[] {
  const days = revenueDays(30, PAYOUT_EARNED, 3);
  const now = new Date();
  return days.map((earned, i) => {
    const d = new Date(now.getTime() - (29 - i) * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { dateKey: key, earned, paid: Math.round(earned * 0.9) };
  });
}

// ── Copy ──────────────────────────────────────────────────────
const COPY = {
  en: {
    verified: "Verified",
    sale: "drove a sale",
    video: "posted a video",
    views: "views",
    signed: "signed the contract",
    joined: "joined your program",
    payoutSent: (n: number) => <>Payout sent to <b>{n} creators</b></>,
    rotating: [
      "Find micro fitness creators on TikTok",
      "How much did I generate with Luna this week?",
      "Skincare creators who already sell, 100K+",
      "Who drove the most sales this week?",
      "Pay every creator owed this month",
      "Create a campaign for the holiday drop",
    ],
    chips: [
      "Find micro fitness creators on TikTok",
      "How much did I generate with Luna?",
      "Beauty creators in France",
      "Who drove the most sales this week?",
      "Create a campaign for the holiday drop",
      "Pay every creator owed",
    ],
    minoSteps: ["Reading your request", "Scanning 1,284,302 creators", "Ranking by real sales and views"],
    scanning: (n: string) => `Scanning ${n} creators`,
    followersLower: "followers",
    engShort: "eng.",
    sold: "sold",
    savedToList: "Saved to “Ready to sign”",
    saveAll: (n: number) => `Save all ${n} to a list`,
    openInCreators: "Open in Creators",
    greeting: (name: string) => `Hi ${name}, what should Mino do?`,
    homeSub: "Mino finds creators across TikTok and Instagram, starts campaigns and pays everyone owed.",
    askMino: "Ask Mino",
    sendToMino: "Send to Mino",
    yourProgram: "Your program",
    liveUpdated: "Live · updated just now",
    revenue: "Revenue",
    creators: "Creators",
    newCreators: (n: number) => `+${n} new`,
    sales: "Sales",
    paidOut: "Paid out",
    liveCampaigns: (n: number) => `${n} live campaigns`,
    revenueFromCreators: "Revenue from creators",
    period: "Period",
    liveActivity: "Live activity",
    orders: (n: string) => `${n} orders`,
    justNow: "just now",
    minAgo: (n: number) => `${n} min ago`,
    topCreators: "Top creators this month",
    seeAll: "See all",
    freshContent: "Fresh content",
    library: "Library",
    presets: { all: "All creators", sellers: "Top sellers", viral: "Viral videos", gems: "Weekly gems", ready: "Ready to contact" },
    filters: ["Niche", "Followers", "Avg views", "Engagement", "Country", "With email", "Verified"],
    creatorsCount: (n: string) => `${n} creators`,
    searchCreatorsPlaceholder: "Search creators, @handles, niches…",
    searchCreators: "Search creators",
    myLists: "My lists",
    outreach: "Outreach",
    videos: "Videos",
    avg: "avg",
    followers: "Followers",
    engagement: "Engagement",
    salesDriven: "Sales driven",
    save: "Save",
    invited: "Invited",
    inviteToCampaign: "Invite to campaign",
    noMatch: (q: string) => `No creator matches “${q}”. Try another niche.`,
    campaigns: "Campaigns",
    campaignsSub: "Manage your campaigns and track creator performance and commissions.",
    createCampaign: "Create a campaign",
    vsLastMonth: (p: string) => `▲ ${p} vs last month`,
    creatorsOnCampaigns: "Creators on campaigns",
    ordersTitle: "Orders",
    avgConversion: (p: string) => `${p} avg conversion`,
    tabActive: (n: number) => `Active (${n})`,
    tabGifting: (n: number) => `Gifting (${n})`,
    tabDrafts: (n: number) => `Drafts (${n})`,
    draftNotLaunched: "Draft · not launched",
    started: (d: string) => `Started ${d}`,
    statusLive: "Live",
    statusGifting: "Gifting",
    statusDraft: "Draft",
    noOrdersYet: "No orders yet",
    nothingYet: "Nothing here yet.",
    content: "Content",
    videosCount: (n: string) => `${n} videos`,
    contentSub: "Every video your creators delivered, with ad rights attached.",
    approved: "Approved",
    toReview: "To review",
    approve: "Approve",
    overview: "Overview",
    everyonePaid: "Everyone is paid",
    payAll: (amount: string) => `Pay all · ${amount}`,
    commissionsEarned: "Commissions earned",
    salesInPeriod: (n: string) => `${n} sales in period`,
    last30Days: "Last 30 days",
    creatorsPending: (n: number) => `${n} creators pending`,
    paidInPeriod: "Paid in period",
    paymentsInPeriod: "Payments in period",
    creator: "Creator",
    amountOwed: "Amount owed",
    payment: "Payment",
    totalEarned: "Total earned",
    paid: "Paid",
    pay: "Pay",
    payments: "Payments",
    paidLast30: (amount: string) => `${amount} paid to creators in the last 30 days.`,
    amount: "Amount",
    method: "Method",
    date: "Date",
    status: "Status",
    integrations: "Integrations",
    integrationsSub: "Connect your store and tools. Sales, codes and payouts stay in sync.",
    connection: (name: string) => `${name} connection`,
    rail: { home: "Home", findit: "Creators", trackit: "Campaigns", payit: "Payouts", integrations: "Integrations" },
    chats: ["Top skincare creators in France", "Black Friday brief", "Who to pay this week"],
    searchMeta: { discovery: "Search", campaigns: "Track", payouts: "Pay", content: "Videos", integrations: "Shopify, TikTok…" },
    discover: "Discover",
    search: "Search",
    manage: "Manage",
    track: "Track",
    payIt: "Pay it",
    toPay: "To pay",
    paymentsLink: "Payments",
    connected: "Connected",
    home: "Home",
    newCampaignName: "Holiday gift set",
    workspaces: "Workspaces",
    searchPlaceholder: "Search creators, campaigns…",
    noResults: "No results",
    profile: "Profile",
    planOnline: "Scale plan · Online",
    settings: "Settings",
    themes: "Themes",
    light: "Light",
    help: "Help",
    newChat: "New chat",
    chatsLabel: "Chats",
    thisMonth: "This month",
    goal: "78% of your $3.6M goal",
    newSale: "New sale",
    // Mino thread
    revenueSteps: ["Reading your request", "Matching Shopify orders to creators", "Building your dashboard"],
    matching: (n: string) => `Matching ${n} Shopify orders`,
    paySteps: ["Checking commissions owed", "Verifying payout details", "Preparing payments"],
    campaignSteps: ["Reading your brief", "Picking product and commission", "Drafting the campaign"],
    helpSteps: ["Reading your request"],
    found: (n: number, what: ReactNode, total: string) => (
      <>
        Found <b>{n === 1 ? "1 creator" : `${n} creators`}</b>
        {what ? <> for {what}</> : null}. {n === 1 ? "They drove" : "Together they drove"} <b>{total}</b> in sales.
      </>
    ),
    noExact: (what: ReactNode) => <>No exact match for {what} yet. Here are the closest creators.</>,
    profileAnswer: (name: string, followers: string, sold: string) => (
      <>
        Here is <b>{name}</b>: {followers} followers and <b>{sold}</b> in sales driven.
      </>
    ),
    understood: "Mino understood",
    micro: "Micro · 10K–100K",
    mid: "Mid · 100K–1M",
    macro: "Macro · 1M+",
    minFollowers: (n: string) => `${n}+ followers`,
    bestMatches: "Best matches",
    closeMatches: "Close to your request",
    inProgram: "In your program",
    newTag: "New",
    contact: "Contact",
    contacted: "Contacted",
    profileShort: "Profile",
    viewProfile: "View profile",
    saved: "Saved",
    savedOne: "Saved to “Ready to sign”",
    removedOne: "Removed from “Ready to sign”",
    periodTag: (d: number) => `Last ${d} days`,
    periodPhrase: (d: number) => `over the last ${d} days`,
    creatorRevenue: (name: string, total: string, period: string, orders: string, growth: string) => (
      <>
        With <b>{name}</b> you generated <b>{total}</b> {period}, from <b>{orders} orders</b>. That is <b className="pd-up">▲ {growth}</b> vs the period before.
      </>
    ),
    programRevenue: (who: string, total: string, period: string, orders: string, leader: string, leaderValue: string) => (
      <>
        {who} generated <b>{total}</b> {period}, from <b>{orders} orders</b>. <b>{leader}</b> leads with <b>{leaderValue}</b>.
      </>
    ),
    yourCreators: "Your creators",
    yourGroup: (label: string) => `Your ${label} creators`,
    commission: "Commission",
    ofRevenue: (p: string) => `${p} of revenue`,
    avgBasket: (v: string) => `${v} avg basket`,
    vsPrev: (p: string) => `▲ ${p} vs period before`,
    newCreatorsTitle: "New creators",
    joinedCount: (n: number) => `+${n} joined`,
    joinedAgo: (n: number) => (n <= 1 ? "joined yesterday" : `joined ${n} days ago`),
    firstSales: "first sales",
    dailyRevenue: "Daily revenue",
    bestDay: (d: string, v: string) => `Best day ${d} · ${v}`,
    topCreatorsShort: "Top creators",
    bestVideo: "Best video",
    recentSales: "Recent sales",
    byCampaign: "By campaign",
    openCampaigns: "Open Campaigns",
    openPayouts: "Open Payouts",
    payName: (name: string, amount: string) => `Pay ${name} · ${amount}`,
    paidName: (name: string) => `${name} is paid`,
    payAnswer: (n: number, amount: string) => (
      <>
        <b>{n} creators</b> are owed <b>{amount}</b>. Payout details are verified, you can pay them from here.
      </>
    ),
    paySingle: (name: string, amount: string) => (
      <>
        You owe <b>{amount}</b> to <b>{name}</b>. Payout details are verified.
      </>
    ),
    allPaid: "Everyone is paid. Nothing is owed right now.",
    paying: "Paying…",
    showMore: (n: number) => `Show ${n} more`,
    campaignAnswer: "Here is your draft. Check it and launch when you are ready.",
    campaignNameLabel: "Campaign name",
    product: "Product",
    creatorsToInvite: "Creators to invite",
    launch: "Launch campaign",
    saveDraft: "Save as draft",
    launched: "Campaign is live",
    draftSaved: "Saved in drafts",
    viewInCampaigns: "View in Campaigns",
    helpAnswer: "I can find creators, build a sales dashboard, pay your creators or draft a campaign. Try one of these:",
    helpChips: ["Find micro fitness creators on TikTok", "How much did I generate with Luna this week?", "Pay every creator owed"],
    followUps: ["Top creators this month", "How much did I generate with Maya?", "Skincare creators in France"],
    askFollowUp: "Ask Mino a follow-up…",
    minoWelcome: "What should Mino do?",
    minoWelcomeSub: "Ask for creators, sales, payouts or a new campaign. Mino builds the answer for you.",
    // Contact and profile
    newMessage: "New message",
    to: "To",
    subject: "Subject",
    viaGmail: "via Gmail",
    contactSubject: (brand: string) => `Paid collab with ${brand}`,
    contactBody: (first: string, brand: string, niche: string, product: string) =>
      `Hi ${first},\n\nI’m Sofia from ${brand}. We love your ${niche} content and think our ${product} would be a great fit for your audience.\n\nWe pay 15% on every sale you drive, plus a free kit. Want me to send you the details?\n\nSofia`,
    fromLine: (email: string) => `From ${email}`,
    send: "Send",
    sending: "Sending…",
    sent: "Sent",
    close: "Close",
    avgViews: "Avg views",
    soldForBrands: "Sold for similar brands",
    audience: "Audience",
    audienceRows: ["Women 18–34", "Men 18–34", "35 and over"],
    topCountry: (c: string) => `Top country: ${c}`,
    notInProgram: "Not in your program yet",
  },
  fr: {
    verified: "Vérifié",
    sale: "a généré une vente",
    video: "a publié une vidéo",
    views: "vues",
    signed: "a signé le contrat",
    joined: "a rejoint votre programme",
    payoutSent: (n: number) => <>Paiement envoyé à <b>{n} créateurs</b></>,
    rotating: [
      "Trouver des micro-créateurs fitness sur TikTok",
      "Combien j’ai généré avec Luna cette semaine ?",
      "Créatrices skincare qui vendent déjà, 100 k+",
      "Qui a généré le plus de ventes cette semaine ?",
      "Payer tous les créateurs à régler ce mois-ci",
      "Créer une campagne pour le drop des fêtes",
    ],
    chips: [
      "Trouver des micro-créateurs fitness sur TikTok",
      "Combien j’ai généré avec Luna ?",
      "Créatrices beauté en France",
      "Qui a généré le plus de ventes cette semaine ?",
      "Créer une campagne pour le drop des fêtes",
      "Payer tous les créateurs en attente",
    ],
    minoSteps: ["Lecture de votre demande", "Analyse de 1 284 302 créateurs", "Classement par ventes et vues réelles"],
    scanning: (n: string) => `Analyse de ${n} créateurs`,
    followersLower: "abonnés",
    engShort: "eng.",
    sold: "vendus",
    savedToList: "Enregistrés dans « Prêts à signer »",
    saveAll: (n: number) => `Enregistrer les ${n} dans une liste`,
    openInCreators: "Ouvrir dans Créateurs",
    greeting: (name: string) => `Bonjour ${name}, que doit faire Mino ?`,
    homeSub: "Mino trouve des créateurs sur TikTok et Instagram, lance des campagnes et paie tout ce qui est dû.",
    askMino: "Demandez à Mino",
    sendToMino: "Envoyer à Mino",
    yourProgram: "Votre programme",
    liveUpdated: "En direct · mis à jour à l’instant",
    revenue: "Chiffre d’affaires",
    creators: "Créateurs",
    newCreators: (n: number) => `+${n} nouveaux`,
    sales: "Ventes",
    paidOut: "Versé",
    liveCampaigns: (n: number) => `${n} campagnes en cours`,
    revenueFromCreators: "CA généré par les créateurs",
    period: "Période",
    liveActivity: "Activité en direct",
    orders: (n: string) => `${n} commandes`,
    justNow: "à l’instant",
    minAgo: (n: number) => `il y a ${n} min`,
    topCreators: "Top créateurs du mois",
    seeAll: "Tout voir",
    freshContent: "Nouveaux contenus",
    library: "Bibliothèque",
    presets: { all: "Tous les créateurs", sellers: "Meilleures ventes", viral: "Vidéos virales", gems: "Pépites de la semaine", ready: "Prêts à contacter" },
    filters: ["Niche", "Abonnés", "Vues moy.", "Engagement", "Pays", "Avec e-mail", "Vérifié"],
    creatorsCount: (n: string) => `${n} créateurs`,
    searchCreatorsPlaceholder: "Rechercher créateurs, @comptes, niches…",
    searchCreators: "Rechercher des créateurs",
    myLists: "Mes listes",
    outreach: "Outreach",
    videos: "Vidéos",
    avg: "en moy.",
    followers: "Abonnés",
    engagement: "Engagement",
    salesDriven: "Ventes générées",
    save: "Enregistrer",
    invited: "Invité",
    inviteToCampaign: "Inviter à une campagne",
    noMatch: (q: string) => `Aucun créateur ne correspond à « ${q} ». Essayez une autre niche.`,
    campaigns: "Campagnes",
    campaignsSub: "Gérez vos campagnes et suivez les performances et commissions de vos créateurs.",
    createCampaign: "Créer une campagne",
    vsLastMonth: (p: string) => `▲ ${p} vs mois dernier`,
    creatorsOnCampaigns: "Créateurs en campagne",
    ordersTitle: "Commandes",
    avgConversion: (p: string) => `${p} de conversion moyenne`,
    tabActive: (n: number) => `En cours (${n})`,
    tabGifting: (n: number) => `Gifting (${n})`,
    tabDrafts: (n: number) => `Brouillons (${n})`,
    draftNotLaunched: "Brouillon · pas encore lancée",
    started: (d: string) => `Lancée le ${d}`,
    statusLive: "En cours",
    statusGifting: "Gifting",
    statusDraft: "Brouillon",
    noOrdersYet: "Aucune commande pour l’instant",
    nothingYet: "Rien ici pour l’instant.",
    content: "Contenus",
    videosCount: (n: string) => `${n} vidéos`,
    contentSub: "Toutes les vidéos livrées par vos créateurs, droits publicitaires inclus.",
    approved: "Validée",
    toReview: "À valider",
    approve: "Valider",
    overview: "Vue d’ensemble",
    everyonePaid: "Tout le monde est payé",
    payAll: (amount: string) => `Tout payer · ${amount}`,
    commissionsEarned: "Commissions générées",
    salesInPeriod: (n: string) => `${n} ventes sur la période`,
    last30Days: "30 derniers jours",
    creatorsPending: (n: number) => `${n} créateurs en attente`,
    paidInPeriod: "Versé sur la période",
    paymentsInPeriod: "Paiements sur la période",
    creator: "Créateur",
    amountOwed: "Montant dû",
    payment: "Paiement",
    totalEarned: "Total gagné",
    paid: "Payé",
    pay: "Payer",
    payments: "Historique des paiements",
    paidLast30: (amount: string) => `${amount} versés aux créateurs ces 30 derniers jours.`,
    amount: "Montant",
    method: "Moyen",
    date: "Date",
    status: "Statut",
    integrations: "Intégrations",
    integrationsSub: "Connectez votre boutique et vos outils. Ventes, codes et paiements restent synchronisés.",
    connection: (name: string) => `Connexion ${name}`,
    rail: { home: "Accueil", findit: "Créateurs", trackit: "Campagnes", payit: "Paiements", integrations: "Intégrations" },
    chats: ["Top créatrices skincare en France", "Brief Black Friday", "Qui payer cette semaine"],
    searchMeta: { discovery: "Recherche", campaigns: "Suivi", payouts: "Paiement", content: "Vidéos", integrations: "Shopify, TikTok…" },
    discover: "Découvrir",
    search: "Recherche",
    manage: "Gérer",
    track: "Suivi",
    payIt: "Payer",
    toPay: "À payer",
    paymentsLink: "Historique",
    connected: "Connectées",
    home: "Accueil",
    newCampaignName: "Coffret cadeau des fêtes",
    workspaces: "Workspaces",
    searchPlaceholder: "Rechercher créateurs, campagnes…",
    noResults: "Aucun résultat",
    profile: "Profil",
    planOnline: "Plan Scale · En ligne",
    settings: "Paramètres",
    themes: "Thèmes",
    light: "Clair",
    help: "Aide",
    newChat: "Nouvelle conversation",
    chatsLabel: "Conversations",
    thisMonth: "Ce mois-ci",
    goal: "78 % de votre objectif de 3,6 M€",
    newSale: "Nouvelle vente",
    // Mino thread
    revenueSteps: ["Lecture de votre demande", "Rapprochement des commandes Shopify", "Construction de votre tableau de bord"],
    matching: (n: string) => `Rapprochement de ${n} commandes Shopify`,
    paySteps: ["Vérification des commissions dues", "Contrôle des moyens de paiement", "Préparation des paiements"],
    campaignSteps: ["Lecture de votre brief", "Choix du produit et de la commission", "Rédaction de la campagne"],
    helpSteps: ["Lecture de votre demande"],
    found: (n: number, what: ReactNode, total: string) => (
      <>
        <b>{n === 1 ? "1 créateur" : `${n} créateurs`}</b> {n === 1 ? "trouvé" : "trouvés"}{what ? <> pour {what}</> : null}. {n === 1 ? "Ce profil a" : "Ensemble, ils ont"} généré <b>{total}</b> de ventes.
      </>
    ),
    noExact: (what: ReactNode) => <>Pas encore de correspondance exacte pour {what}. Voici les créateurs les plus proches.</>,
    profileAnswer: (name: string, followers: string, sold: string) => (
      <>
        Voici <b>{name}</b> : {followers} abonnés et <b>{sold}</b> de ventes générées.
      </>
    ),
    understood: "Mino a compris",
    micro: "Micro · 10 k–100 k",
    mid: "Moyen · 100 k–1 M",
    macro: "Macro · 1 M+",
    minFollowers: (n: string) => `${n}+ abonnés`,
    bestMatches: "Meilleurs résultats",
    closeMatches: "Proches de votre demande",
    inProgram: "Dans votre programme",
    newTag: "Nouveau",
    contact: "Contacter",
    contacted: "Contacté",
    profileShort: "Profil",
    viewProfile: "Voir le profil",
    saved: "Enregistré",
    savedOne: "Enregistré dans « Prêts à signer »",
    removedOne: "Retiré de « Prêts à signer »",
    periodTag: (d: number) => `${d} derniers jours`,
    periodPhrase: (d: number) => `sur les ${d} derniers jours`,
    creatorRevenue: (name: string, total: string, period: string, orders: string, growth: string) => (
      <>
        Avec <b>{name}</b>, vous avez généré <b>{total}</b> {period}, sur <b>{orders} commandes</b>. Soit <b className="pd-up">▲ {growth}</b> par rapport à la période précédente.
      </>
    ),
    programRevenue: (who: string, total: string, period: string, orders: string, leader: string, leaderValue: string) => (
      <>
        {who} ont généré <b>{total}</b> {period}, sur <b>{orders} commandes</b>. <b>{leader}</b> arrive en tête avec <b>{leaderValue}</b>.
      </>
    ),
    yourCreators: "Vos créateurs",
    yourGroup: (label: string) => `Vos créateurs ${label}`,
    commission: "Commission",
    ofRevenue: (p: string) => `${p} du CA`,
    avgBasket: (v: string) => `Panier moyen ${v}`,
    vsPrev: (p: string) => `▲ ${p} vs période précédente`,
    newCreatorsTitle: "Nouveaux créateurs",
    joinedCount: (n: number) => `+${n} arrivés`,
    joinedAgo: (n: number) => (n <= 1 ? "arrivé hier" : `arrivé il y a ${n} jours`),
    firstSales: "premières ventes",
    dailyRevenue: "CA par jour",
    bestDay: (d: string, v: string) => `Meilleur jour : ${d} · ${v}`,
    topCreatorsShort: "Top créateurs",
    bestVideo: "Meilleure vidéo",
    recentSales: "Ventes récentes",
    byCampaign: "Par campagne",
    openCampaigns: "Ouvrir Campagnes",
    openPayouts: "Ouvrir Paiements",
    payName: (name: string, amount: string) => `Payer ${name} · ${amount}`,
    paidName: (name: string) => `Paiement envoyé à ${name}`,
    payAnswer: (n: number, amount: string) => (
      <>
        <b>{n} créateurs</b> attendent <b>{amount}</b>. Les moyens de paiement sont vérifiés, vous pouvez les payer d’ici.
      </>
    ),
    paySingle: (name: string, amount: string) => (
      <>
        Vous devez <b>{amount}</b> à <b>{name}</b>. Son moyen de paiement est vérifié.
      </>
    ),
    allPaid: "Tout le monde est payé. Rien n’est dû pour l’instant.",
    paying: "Paiement…",
    showMore: (n: number) => `Voir ${n} de plus`,
    campaignAnswer: "Voici votre brouillon. Vérifiez-le et lancez-le quand vous êtes prêt.",
    campaignNameLabel: "Nom de la campagne",
    product: "Produit",
    creatorsToInvite: "Créateurs à inviter",
    launch: "Lancer la campagne",
    saveDraft: "Enregistrer en brouillon",
    launched: "Campagne lancée",
    draftSaved: "Enregistrée dans les brouillons",
    viewInCampaigns: "Voir dans Campagnes",
    helpAnswer: "Je peux trouver des créateurs, construire un tableau de vos ventes, payer vos créateurs ou préparer une campagne. Essayez par exemple :",
    helpChips: ["Trouver des micro-créateurs fitness sur TikTok", "Combien j’ai généré avec Luna cette semaine ?", "Payer tous les créateurs en attente"],
    followUps: ["Top créateurs du mois", "Combien j’ai généré avec Maya ?", "Créatrices skincare en France"],
    askFollowUp: "Posez une autre question à Mino…",
    minoWelcome: "Que doit faire Mino ?",
    minoWelcomeSub: "Demandez des créateurs, vos ventes, vos paiements ou une nouvelle campagne. Mino construit la réponse pour vous.",
    // Contact and profile
    newMessage: "Nouveau message",
    to: "À",
    subject: "Objet",
    viaGmail: "via Gmail",
    contactSubject: (brand: string) => `Collaboration rémunérée avec ${brand}`,
    contactBody: (first: string, brand: string, niche: string, product: string) =>
      `Bonjour ${first},\n\nJe suis Sofia, de ${brand}. Nous adorons vos contenus ${niche} et pensons que notre ${product} plairait beaucoup à votre communauté.\n\nNous versons 15 % sur chaque vente générée, avec un kit offert. Je vous envoie les détails ?\n\nSofia`,
    fromLine: (email: string) => `De ${email}`,
    send: "Envoyer",
    sending: "Envoi…",
    sent: "Envoyé",
    close: "Fermer",
    avgViews: "Vues moyennes",
    soldForBrands: "Vendu pour des marques similaires",
    audience: "Audience",
    audienceRows: ["Femmes 18–34 ans", "Hommes 18–34 ans", "35 ans et plus"],
    topCountry: (c: string) => `Premier pays : ${c}`,
    notInProgram: "Pas encore dans votre programme",
  },
} satisfies Record<Lang, unknown>;

/** Copy and number formats for the page language. */
function useCopy() {
  const lang = useLang();
  return { lang, t: COPY[lang], f: FORMAT[lang] };
}

// ── Live events ───────────────────────────────────────────────
type LiveEvent =
  | { type: "sale"; who: string; amount: number; campaign: string }
  | { type: "video"; who: string; views: number }
  | { type: "signed"; who: string }
  | { type: "joined"; who: string }
  | { type: "paid"; count: number; amount: number };

// `campaign` is a campaign id, named in the page language when shown.
const EVENTS: LiveEvent[] = [
  { type: "sale", who: "luna", amount: 184, campaign: "serum" },
  { type: "video", who: "zoe", views: 1_240_000 },
  { type: "sale", who: "sarah", amount: 312, campaign: "bf" },
  { type: "signed", who: "maya" },
  { type: "sale", who: "mike", amount: 96, campaign: "spf" },
  { type: "paid", count: 38, amount: 24_860 },
  { type: "sale", who: "ines", amount: 148, campaign: "serum" },
  { type: "joined", who: "chloe" },
  { type: "sale", who: "ava", amount: 226, campaign: "oil" },
  { type: "video", who: "luna", views: 684_000 },
  { type: "sale", who: "nora", amount: 132, campaign: "bf" },
];
const SALES = EVENTS.filter((e): e is Extract<LiveEvent, { type: "sale" }> => e.type === "sale");

// ── Small pieces ──────────────────────────────────────────────
function Face({ id, size = 32, ring }: { id: string; size?: number; ring?: boolean }) {
  return (
    <span className={`pd-face${ring ? " has-ring" : ""}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={unsplash(id, size)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    </span>
  );
}

function CreatorFace({ id, size = 32, ring }: { id: string; size?: number; ring?: boolean }) {
  const c = BY_ID.get(id);
  return c ? <Face id={c.face} size={size} ring={ring} /> : null;
}

function Stack({ ids, size = 24, more }: { ids: string[]; size?: number; more?: string }) {
  return (
    <span className="pd-stack">
      {ids.map((id) => (
        <CreatorFace key={id} id={id} size={size} ring />
      ))}
      {more ? <span className="pd-stack__more">{more}</span> : null}
    </span>
  );
}

function Photo({ id, w, h, className }: { id: string; w: number; h: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={unsplash(id, w, h, false)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

/** Plays only while on screen; never downloads a clip that is not shown. */
function Clip({ id, className }: { id: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      className={className}
      src={clip(id)}
      poster={clipPoster(id)}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
    />
  );
}

function Spark({ values, tone = "blue" }: { values: number[]; tone?: "blue" | "white" | "green" }) {
  const w = 96;
  const h = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / Math.max(1, max - min)) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className={`pd-spark is-${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} className="pd-spark__area" />
      <path d={d} className="pd-spark__line" pathLength={1} />
    </svg>
  );
}

function Verified() {
  const { t } = useCopy();
  return (
    <svg className="pd-verified" width="13" height="13" viewBox="0 0 24 24" aria-label={t.verified}>
      <path d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1L2.7 15.6l1-3-1-3 2.8-1.6.9-3.1 3.2.4z" fill="#0047ff" />
      <path d="M8.2 12.3l2.5 2.4 5.1-5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);
const IconBag = () => (
  <Svg>
    <path d="M6 7h12l1 13H5L6 7z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
  </Svg>
);
const IconMega = () => (
  <Svg>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
);
const IconPlay = () => (
  <Svg size={12}>
    <path d="M7 4l13 8-13 8z" fill="currentColor" />
  </Svg>
);
const IconHeart = () => (
  <Svg size={14}>
    <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" />
  </Svg>
);
const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function eventLine(e: LiveEvent, lang: Lang): { face?: string; text: ReactNode; value?: string; tone: string } {
  const t = COPY[lang];
  const f = FORMAT[lang];
  const first = (id: string) => BY_ID.get(id)?.name.split(" ")[0] ?? "";
  switch (e.type) {
    case "sale":
      return { face: e.who, tone: "sale", text: <><b>{first(e.who)}</b> {t.sale} · {campaignNameById(e.campaign, lang)}</>, value: `+${f.money(e.amount)}` };
    case "video":
      return { face: e.who, tone: "video", text: <><b>{first(e.who)}</b> {t.video}</>, value: `${f.compact(e.views)} ${t.views}` };
    case "signed":
      return { face: e.who, tone: "signed", text: <><b>{first(e.who)}</b> {t.signed}</> };
    case "joined":
      return { face: e.who, tone: "joined", text: <><b>{first(e.who)}</b> {t.joined}</> };
    case "paid":
      return { tone: "paid", text: t.payoutSent(e.count), value: f.money(e.amount) };
  }
}

// ── Mino ──────────────────────────────────────────────────────
function useTypedPlaceholder(active: boolean, phrases: readonly string[]): string {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [back, setBack] = useState(false);
  const full = phrases[i % phrases.length];
  useEffect(() => {
    if (!active) return;
    const done = back ? n === 0 : n >= full.length;
    const t = window.setTimeout(
      () => {
        if (!back && n >= full.length) return setBack(true);
        if (back && n === 0) {
          setBack(false);
          setI((x) => (x + 1) % phrases.length);
          return;
        }
        setN((x) => x + (back ? -1 : 1));
      },
      done ? (back ? 300 : 2000) : back ? 20 : 50,
    );
    return () => window.clearTimeout(t);
  }, [n, back, full.length, active, phrases.length]);
  return active ? full.slice(0, n) : phrases[0];
}

const IconWallet = ({ size = 15 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
    <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
  </Svg>
);
const IconChart = () => (
  <Svg size={15}>
    <path d="M4 19V5M4 19h16" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Svg>
);
const IconTrophy = () => (
  <Svg size={15}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M16 6h3a2 2 0 0 1-2 4h-1M8 6H5a2 2 0 0 0 2 4h1M12 13v4M8 20h8" />
  </Svg>
);
const IconPin = () => (
  <Svg size={15}>
    <path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </Svg>
);
const IconClose = () => (
  <Svg size={16}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
const IconSend = () => (
  <Svg size={14}>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />
  </Svg>
);
const IconMail = () => (
  <Svg size={14}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
);
const IconUser = () => (
  <Svg size={14}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

const CHIP_ICONS: ReactNode[] = [
  <PlatformLogo key="tiktok" platform="tiktok" size={15} />,
  <IconChart key="chart" />,
  <IconPin key="pin" />,
  <IconTrophy key="trophy" />,
  <IconMega key="mega" />,
  <IconWallet key="wallet" />,
];

// ── Mino: reading the ask ─────────────────────────────────────
// Understands the English and French prompts the demo offers, and close
// variations: creator searches, revenue questions, payouts and campaigns.
type NicheKey = "fitness" | "skincare" | "makeup" | "beauty" | "food" | "lifestyle";
const NICHE_GROUPS: Record<NicheKey, Niche[]> = {
  fitness: ["Fitness"],
  skincare: ["Skincare"],
  makeup: ["Makeup"],
  beauty: ["Beauty", "Makeup", "Skincare"],
  food: ["Food"],
  lifestyle: ["Lifestyle"],
};
const NICHE_KEY_LABEL: Record<NicheKey, Niche> = { fitness: "Fitness", skincare: "Skincare", makeup: "Makeup", beauty: "Beauty", food: "Food", lifestyle: "Lifestyle" };
type Size = "micro" | "mid" | "macro";
const SIZE_RANGE: Record<Size, [number, number]> = { micro: [10_000, 100_000], mid: [100_000, 1_000_000], macro: [1_000_000, Infinity] };
type Filters = { niche: NicheKey | null; platform: PlatformName | null; size: Size | null; min: number | null; country: string | null };
type Scope = { kind: "all" } | { kind: "creator"; id: string } | { kind: "group"; filters: Filters };
type Intent =
  | { kind: "search"; filters: Filters; ids: string[] | null }
  | { kind: "revenue"; days: number; scope: Scope }
  | { kind: "pay"; id: string | null }
  | { kind: "campaign"; name: string | null; product: ProductId; commission: number; niche: NicheKey | null }
  | { kind: "help" };
type Turn = { id: number; q: string; intent: Intent };

const norm = (q: string) =>
  q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`]/g, " ");

function namedCreator(s: string, pool: Creator[]): Creator | null {
  return pool.find((c) => new RegExp(`\\b(${norm(c.name.split(" ")[0])}|${c.handle})\\b`).test(s)) ?? null;
}

const COUNTRY_RX: [string, RegExp][] = [
  ["FR", /\bfrance\b|\bfrench\b|\bfrancais|\bfr\b/],
  ["UK", /\buk\b|united kingdom|\bbritish|britain|london|londres|royaume|angleterre/],
  ["US", /\busa\b|united states|\bamerica|americain|etats.unis/],
  ["CA", /canad/],
  ["IT", /\bital/],
  ["ES", /spain|spanish|espagn/],
  ["BE", /belgi|\bbelge/],
  ["DE", /german|allemagne|allemand/],
  ["PT", /portug/],
];

function parseFilters(s: string): Filters {
  const niche: NicheKey | null = /\bfit|\bgym|sport|muscu|workout|training/.test(s)
    ? "fitness"
    : /make ?-?up|maquill|lipstick|rouge a levres/.test(s)
      ? "makeup"
      : /skin|serum|\bspf\b|\bpeau\b|\bsoins?\b/.test(s)
        ? "skincare"
        : /beaut/.test(s)
          ? "beauty"
          : /\bfood|recipe|\bcook|cuisine|recette/.test(s)
            ? "food"
            : /lifestyle|\bvlog|quotidien/.test(s)
              ? "lifestyle"
              : null;
  const platform: PlatformName | null = /tik ?tok/.test(s) ? "tiktok" : /insta|\breels?\b/.test(s) ? "instagram" : /youtube|\byt\b|\bshorts\b/.test(s) ? "youtube" : null;
  const size: Size | null = /micro|nano/.test(s) ? "micro" : /\bmid\b|mid.tier|\bmoyens?\b/.test(s) ? "mid" : /macro|\bbig\b|\blarge\b|\bmega\b|\bgros/.test(s) ? "macro" : null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(k|m)\s*\+/) ?? s.match(/(?:more than|over|above|at least|plus de|au moins)\s*(\d+(?:[.,]\d+)?)\s*(k|m)\b/);
  const min = m ? parseFloat(m[1].replace(",", ".")) * (m[2] === "m" ? 1e6 : 1e3) : null;
  const country = COUNTRY_RX.find(([, rx]) => rx.test(s))?.[0] ?? null;
  return { niche, platform, size, min, country };
}
const hasFilters = (f: Filters) => Boolean(f.niche || f.platform || f.size || f.min || f.country);

function parseDays(s: string): number | null {
  const m = s.match(/(\d{1,2})\s*(?:days?|jours?|j\b|d\b)/);
  if (m) return Math.max(2, Math.min(90, Number(m[1])));
  if (/two weeks|2 weeks|fortnight|2 semaines|deux semaines|15 jours|quinzaine/.test(s)) return 14;
  if (/\bweek|semaine|\bhebdo/.test(s)) return 7;
  if (/quarter|trimestre|3 months|3 mois|trois mois/.test(s)) return 90;
  if (/\bmonth|\bmois\b|mensuel/.test(s)) return 30;
  return null;
}

function parseCampaign(q: string, s: string, filters: Filters): Intent {
  const pct = s.match(/(\d{1,2})\s*%/);
  const commission = pct ? Math.max(5, Math.min(40, Number(pct[1]))) : 15;
  let name: string | null = null;
  if (/black friday/.test(s)) name = "Black Friday";
  else {
    const m = q.match(
      /(?:campaign|campagne)\s+(?:for|about|called|named|on|around|pour|sur|nommée|nommee|appelée|appelee|autour de)\s+(?:(?:the|a|an|our|my|la|le|les|un|une|notre|nos|mon|ma|mes)\s+|l['’])?([^,.!?%\d]{3,40})/i,
    );
    if (m) {
      const raw = m[1].trim().replace(/\s+(with|avec|at|à|a|and|et)$/i, "");
      name = raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  }
  const product: ProductId = /black friday/.test(s)
    ? "bundle"
    : /gift|holiday|christmas|noel|fetes|coffret/.test(s)
      ? "gift"
      : /\bspf\b|\bsun|solaire|summer|\bete\b/.test(s)
        ? "spf"
        : /night|nuit/.test(s)
          ? "night"
          : /\boil\b|huile/.test(s)
            ? "oil"
            : /serum/.test(s) || name
              ? "serum"
              : "gift";
  return { kind: "campaign", name, product, commission, niche: filters.niche };
}

function parseAsk(q: string): Intent {
  const s = norm(q);
  const filters = parseFilters(s);
  const days = parseDays(s);
  const member = namedCreator(s, CREATORS);
  const anyone = member ?? namedCreator(s, PROSPECTS);
  if (/\bpay|paiement|\bverser\b|\bregler\b|\bowed\b/.test(s)) return { kind: "pay", id: member?.id ?? null };
  if (/campaign|campagne|\bbrief\b/.test(s)) return parseCampaign(q, s, filters);
  const money =
    /how much|combien|generat|genere|revenue|chiffre|\bca\b|\bsales\b|\bventes?\b|\bsold\b|vendu|\bearn|gagne|\bmade\b|rapporte|\bdrove\b|\borders\b|commandes|performance|dashboard|tableau de bord|\bmost\b|le plus|\bbest\b|meilleur|\btop\b/.test(s);
  const strongMoney = /how much|combien|generat|genere|revenue|chiffre|rapporte|\bearn/.test(s);
  if (member && (money || days)) return { kind: "revenue", days: days ?? 30, scope: { kind: "creator", id: member.id } };
  if (anyone && !hasFilters(filters)) return { kind: "search", filters, ids: [anyone.id] };
  if (hasFilters(filters)) {
    return strongMoney ? { kind: "revenue", days: days ?? 30, scope: { kind: "group", filters } } : { kind: "search", filters, ids: null };
  }
  if (money || days) return { kind: "revenue", days: days ?? 30, scope: { kind: "all" } };
  if (/\bfind\b|search|look for|discover|show me|trouve|cherche|montre|creat(?:or|eur|rice)|influenc|\bugc\b/.test(s)) return { kind: "search", filters, ids: null };
  return { kind: "help" };
}

// ── Mino: answers from the demo data ──────────────────────────
function fits(c: Creator, f: Filters): boolean {
  if (f.niche && !NICHE_GROUPS[f.niche].includes(c.niche)) return false;
  if (f.platform && c.platform !== f.platform) return false;
  if (f.size && (c.followers < SIZE_RANGE[f.size][0] || c.followers >= SIZE_RANGE[f.size][1])) return false;
  if (f.min && c.followers < f.min) return false;
  if (f.country && c.country !== f.country) return false;
  return true;
}
function closeness(c: Creator, f: Filters): number {
  let s = 0;
  if (f.niche && NICHE_GROUPS[f.niche].includes(c.niche)) s += 3;
  if (f.platform && c.platform === f.platform) s += 2;
  if (f.size && c.followers >= SIZE_RANGE[f.size][0] && c.followers < SIZE_RANGE[f.size][1]) s += 1.5;
  if (f.min && c.followers >= f.min) s += 1.5;
  if (f.country && c.country === f.country) s += 2;
  return s;
}
function searchCreators(f: Filters, ids: string[] | null): { best: Creator[]; close: Creator[] } {
  const byRevenue = (a: Creator, b: Creator) => b.revenue - a.revenue;
  if (ids) {
    const best = ids.map((id) => BY_ID.get(id)).filter((c): c is Creator => Boolean(c));
    const close = EVERYONE.filter((c) => !ids.includes(c.id) && best.some((b) => b.niche === c.niche || (b.niche !== "Fitness" && NICHE_GROUPS.beauty.includes(b.niche) && NICHE_GROUPS.beauty.includes(c.niche))))
      .sort(byRevenue)
      .slice(0, 4);
    return { best, close };
  }
  if (!hasFilters(f)) return { best: [...EVERYONE].sort(byRevenue).slice(0, 6), close: [] };
  const best = EVERYONE.filter((c) => fits(c, f)).sort(byRevenue).slice(0, 6);
  const close = EVERYONE.filter((c) => !best.includes(c))
    .map((c) => ({ c, s: closeness(c, f) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || b.c.revenue - a.c.revenue)
    .slice(0, 4)
    .map((x) => x.c);
  return { best, close };
}

const COMMISSION_RATE = PAYOUT_EARNED / TOTAL_REVENUE;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Program revenue over the last `days`, consistent with the 7/30/90-day tabs on Home. */
function periodTotal(days: number): number {
  if (days <= 7) return (PERIODS[0].total * days) / 7;
  if (days <= 30) return lerp(PERIODS[0].total, PERIODS[1].total, (days - 7) / 23);
  return lerp(PERIODS[1].total, PERIODS[2].total, (days - 30) / 60);
}
function periodGrowth(days: number): number {
  const g = days <= 7 ? (PERIODS[0].growth * days) / 7 : days <= 30 ? lerp(PERIODS[0].growth, PERIODS[1].growth, (days - 7) / 23) : lerp(PERIODS[1].growth, PERIODS[2].growth, (days - 30) / 60);
  return Math.round(g * 10) / 10;
}
function scopeCreators(scope: Scope): Creator[] {
  if (scope.kind === "creator") return [BY_ID.get(scope.id) ?? CREATORS[0]];
  if (scope.kind === "group") {
    const group = CREATORS.filter((c) => fits(c, { ...scope.filters, size: null, min: null }));
    return group.length ? group : CREATORS;
  }
  return CREATORS;
}
function revenueView(days: number, scope: Scope) {
  const list = scopeCreators(scope);
  const factor = periodTotal(days) / TOTAL_REVENUE;
  const whole = scope.kind === "all";
  const target = whole ? periodTotal(days) : list.reduce((s, c) => s + c.revenue, 0) * factor;
  const orders = Math.round((whole ? TOTAL_SALES : list.reduce((s, c) => s + c.sales, 0)) * factor);
  const series = revenueDays(days, target, days + (list[0].id.charCodeAt(0) % 7));
  const total = series.reduce((s, v) => s + v, 0);
  const growth = whole ? periodGrowth(days) : Math.round(periodGrowth(days) * (0.55 + list[0].engagement / 20) * 10) / 10;
  const top = [...list]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((c) => ({ c, value: c.revenue * factor }));
  const bestIndex = series.reduce((bi, v, i) => (v > series[bi] ? i : bi), 0);
  return { list, total, orders, commission: total * COMMISSION_RATE, growth, series, top, bestIndex };
}

function recentSales(c: Creator) {
  const basket = c.revenue / Math.max(1, c.sales);
  const camps = CAMPAIGNS.filter((x) => x.crew.includes(c.id));
  return [1.4, 0.9, 2.1, 1.15].map((k, i) => ({
    amount: Math.round(basket * k),
    campaign: camps.length ? camps[i % camps.length].id : "serum",
    mins: [2, 14, 38, 57][i],
  }));
}

function filterTags(f: Filters, lang: Lang): { key: string; icon: ReactNode; label: string }[] {
  const t = COPY[lang];
  const fm = FORMAT[lang];
  const tags: { key: string; icon: ReactNode; label: string }[] = [];
  if (f.niche) tags.push({ key: "niche", icon: <IconHeart />, label: nicheLabel(NICHE_KEY_LABEL[f.niche], lang) });
  if (f.platform) tags.push({ key: "platform", icon: <PlatformLogo platform={f.platform} size={12} />, label: f.platform === "tiktok" ? "TikTok" : f.platform === "instagram" ? "Instagram" : "YouTube" });
  if (f.size) tags.push({ key: "size", icon: <IconUser />, label: t[f.size] });
  if (f.min) tags.push({ key: "min", icon: <IconUser />, label: t.minFollowers(fm.compact(f.min)) });
  if (f.country) tags.push({ key: "country", icon: <IconPin />, label: countryName(f.country, lang) });
  return tags;
}

type DraftInput = { name: string; product: ProductId; commission: number; crew: string[]; live: boolean };
type MinoActions = {
  saved: Set<string>;
  toggleSave: (id: string) => void;
  saveMany: (ids: string[]) => void;
  contacted: Set<string>;
  contact: (id: string) => void;
  profile: (id: string) => void;
  paid: Set<string>;
  pay: (id: string) => void;
  payMany: (ids: string[]) => void;
  launch: (turnId: number, draft: DraftInput) => void;
  launched: Record<number, "live" | "draft">;
  go: (page: Page) => void;
};

const STEP_MS = 420;

/** Milliseconds since mount, ticking until `limit` (instantly past it with reduced motion). */
function useClock(limit: number): number {
  const [t, setT] = useState(() => (prefersReducedMotion() ? 99_999 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setT(elapsed);
      if (elapsed > limit) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [limit]);
  return t;
}

function stepsFor(intent: Intent, lang: Lang): readonly string[] {
  const t = COPY[lang];
  switch (intent.kind) {
    case "search":
      return t.minoSteps;
    case "revenue":
      return t.revenueSteps;
    case "pay":
      return t.paySteps;
    case "campaign":
      return t.campaignSteps;
    default:
      return t.helpSteps;
  }
}

function MinoTurn({ turn, actions, onAsk }: { turn: Turn; actions: MinoActions; onAsk: (q: string) => void }) {
  const { lang, t: copy, f } = useCopy();
  const steps = stepsFor(turn.intent, lang);
  const doneAt = steps.length * STEP_MS + 180;
  const t = useClock(doneAt + 100);
  const intent = turn.intent;
  const orders = useMemo(() => (intent.kind === "revenue" ? revenueView(intent.days, intent.scope).orders : 0), [intent]);
  const counter =
    intent.kind === "search" ? { total: 1_284_302, label: copy.scanning } : intent.kind === "revenue" ? { total: orders, label: copy.matching } : null;
  return (
    <section className="pd-turn">
      <div className="pd-mino__me">
        <span>{turn.q}</span>
        <Face id={OWNER.face} size={28} />
      </div>
      <div className="pd-mino__bot">
        <span className="pd-mino__avatar">
          <MinoCompanion size={26} />
        </span>
        <div className="pd-mino__body">
          <ul className={`pd-mino__steps${t > doneAt ? " is-finished" : ""}`}>
            {steps.map((s, i) => {
              const done = t > STEP_MS + i * STEP_MS;
              const shown = i === 1 && counter && !done ? counter.label(f.int(Math.min(counter.total, Math.round((t / (2 * STEP_MS)) * counter.total)))) : s;
              return (
                <li key={s} className={done ? "is-done" : t > i * STEP_MS ? "is-active" : ""}>
                  <span className="pd-mino__tick">{done ? <IconCheck size={11} /> : null}</span>
                  {shown}
                </li>
              );
            })}
          </ul>
          {t > doneAt ? (
            <div className="pd-answer">
              {intent.kind === "search" ? <SearchAnswer intent={intent} actions={actions} /> : null}
              {intent.kind === "revenue" ? <RevenueAnswer intent={intent} actions={actions} /> : null}
              {intent.kind === "pay" ? <PayAnswer intent={intent} actions={actions} /> : null}
              {intent.kind === "campaign" ? <CampaignAnswer turnId={turn.id} intent={intent} actions={actions} /> : null}
              {intent.kind === "help" ? <HelpAnswer onAsk={onAsk} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// Creator search: profiles with playing videos, save / contact / profile.
function SearchAnswer({ intent, actions }: { intent: Extract<Intent, { kind: "search" }>; actions: MinoActions }) {
  const { lang, t, f } = useCopy();
  const { best, close } = useMemo(() => searchCreators(intent.filters, intent.ids), [intent]);
  const tags = filterTags(intent.filters, lang);
  const [flash, setFlash] = useState<{ id: string; on: boolean; key: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 1900);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const save = (id: string) => {
    setFlash({ id, on: !actions.saved.has(id), key: Date.now() });
    actions.toggleSave(id);
  };
  const main = best.length ? best : close;
  const others = best.length ? close : [];
  const what = tags.length ? <b>{tags.map((x) => x.label).join(" · ")}</b> : null;
  const allSaved = main.every((c) => actions.saved.has(c.id));
  const single = intent.ids && best[0];

  return (
    <>
      <p className="pd-mino__answer">
        {single
          ? t.profileAnswer(best[0].name, f.compact(best[0].followers), f.compact(best[0].revenue, true))
          : best.length
            ? t.found(best.length, what, f.money(best.reduce((s, c) => s + c.revenue, 0)))
            : t.noExact(what)}
      </p>
      {tags.length ? (
        <div className="pd-understood">
          <span>{t.understood}</span>
          {tags.map((x, i) => (
            <span key={x.key} className="pd-tag" style={{ animationDelay: `${i * 70}ms` }}>
              {x.icon}
              {x.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="pd-sec-head">
        <strong>{t.bestMatches}</strong>
        <span>{main.length}</span>
      </div>
      <div className="pd-rgrid">
        {main.map((c, i) => {
          const isSaved = actions.saved.has(c.id);
          const isContacted = actions.contacted.has(c.id);
          return (
            <article key={c.id} className="pd-rcard" style={{ animationDelay: `${i * 110}ms` }}>
              <button type="button" className="pd-rcard__media" onClick={() => actions.profile(c.id)} aria-label={`${t.viewProfile} · ${c.name}`}>
                <Clip id={c.video} />
                <span className={`pd-rcard__badge${IN_PROGRAM.has(c.id) ? " is-member" : ""}`}>{IN_PROGRAM.has(c.id) ? t.inProgram : t.newTag}</span>
                <span className="pd-mcard__views">
                  <IconPlay /> {f.compact(c.avgViews)}
                </span>
              </button>
              <div className="pd-rcard__who">
                <Face id={c.face} size={40} ring />
                <span>
                  <strong>
                    {c.name} <Verified />
                  </strong>
                  <small>
                    <PlatformLogo platform={c.platform} size={11} /> @{c.handle} · {nicheLabel(c.niche, lang)} · {c.country}
                  </small>
                </span>
              </div>
              <div className="pd-ccard__stats pd-rcard__stats">
                <span>
                  <b>{f.compact(c.followers)}</b>
                  <small>{t.followers}</small>
                </span>
                <span>
                  <b>{f.pct(c.engagement)}</b>
                  <small>{t.engagement}</small>
                </span>
                <span className="is-money">
                  <b>{f.compact(c.revenue, true)}</b>
                  <small>{t.salesDriven}</small>
                </span>
              </div>
              <div className="pd-rcard__actions">
                <button type="button" className={`pd-btn is-icon${isSaved ? " is-saved" : ""}`} aria-pressed={isSaved} aria-label={isSaved ? t.saved : t.save} onClick={() => save(c.id)}>
                  <IconHeart />
                </button>
                <button type="button" className={`pd-btn is-primary is-grow${isContacted ? " is-done" : ""}`} onClick={() => actions.contact(c.id)}>
                  {isContacted ? (
                    <>
                      <IconCheck /> {t.contacted}
                    </>
                  ) : (
                    <>
                      <IconMail /> {t.contact}
                    </>
                  )}
                </button>
                <button type="button" className="pd-btn" onClick={() => actions.profile(c.id)}>
                  {t.profileShort}
                </button>
              </div>
              {flash?.id === c.id ? (
                <span key={flash.key} className={`pd-flash${flash.on ? "" : " is-off"}`} role="status">
                  {flash.on ? <IconCheck size={12} /> : null} {flash.on ? t.savedOne : t.removedOne}
                </span>
              ) : null}
            </article>
          );
        })}
      </div>
      {others.length ? (
        <>
          <div className="pd-sec-head">
            <strong>{t.closeMatches}</strong>
            <span>{others.length}</span>
          </div>
          <div className="pd-rrows">
            {others.map((c, i) => {
              const isSaved = actions.saved.has(c.id);
              return (
                <div key={c.id} className="pd-rrow" style={{ animationDelay: `${300 + i * 80}ms` }}>
                  <button type="button" className="pd-rrow__who" onClick={() => actions.profile(c.id)}>
                    <Face id={c.face} size={34} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        <PlatformLogo platform={c.platform} size={10} /> @{c.handle} · {nicheLabel(c.niche, lang)} · {c.country}
                      </small>
                    </span>
                  </button>
                  <span className="pd-rrow__num">
                    <b>{f.compact(c.followers)}</b>
                    <small>{t.followersLower}</small>
                  </span>
                  <span className="pd-rrow__num is-money">
                    <b>{f.compact(c.revenue, true)}</b>
                    <small>{t.sold}</small>
                  </span>
                  <button type="button" className={`pd-btn is-icon is-sm${isSaved ? " is-saved" : ""}`} aria-pressed={isSaved} aria-label={isSaved ? t.saved : t.save} onClick={() => save(c.id)}>
                    <IconHeart />
                  </button>
                  <button type="button" className="pd-btn is-sm" onClick={() => actions.contact(c.id)}>
                    {actions.contacted.has(c.id) ? <IconCheck size={12} /> : <IconMail />}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="pd-mino__actions">
        <button type="button" className={`pd-btn is-primary${allSaved ? " is-done" : ""}`} onClick={() => actions.saveMany(main.map((c) => c.id))}>
          {allSaved ? (
            <>
              <IconCheck /> {t.savedToList}
            </>
          ) : (
            t.saveAll(main.length)
          )}
        </button>
        <button type="button" className="pd-btn" onClick={() => actions.go("discovery")}>
          {t.openInCreators}
        </button>
      </div>
    </>
  );
}

// Revenue: a small animated dashboard, for the program, a niche or one creator.
function RevenueAnswer({ intent, actions }: { intent: Extract<Intent, { kind: "revenue" }>; actions: MinoActions }) {
  const { lang, t, f } = useCopy();
  const v = useMemo(() => revenueView(intent.days, intent.scope), [intent]);
  const days = intent.days;
  const creator = intent.scope.kind === "creator" ? v.list[0] : null;
  const leader = v.top[0];
  const period = t.periodPhrase(days);
  const groupLabel = intent.scope.kind === "group" ? filterTags({ ...intent.scope.filters, size: null, min: null }, lang).map((x) => x.label).join(" · ") : "";
  const who = intent.scope.kind === "group" && groupLabel ? t.yourGroup(groupLabel) : t.yourCreators;
  const newcomers = NEWCOMERS.filter((n) => n.daysAgo < days);
  const newCount = Math.max(newcomers.length, Math.round((86 * days) / 30));
  const featured = creator ?? leader.c;
  const camps = creator ? CAMPAIGNS.filter((c) => c.crew.includes(creator.id)) : [];
  const campWeight = camps.reduce((s, c) => s + c.revenue, 0) || 1;
  const owed = creator && !actions.paid.has(creator.id) ? creator.owed : 0;
  const first = (c: Creator) => c.name.split(" ")[0];

  return (
    <>
      <p className="pd-mino__answer">
        {creator
          ? t.creatorRevenue(creator.name, f.money(v.total), period, f.int(v.orders), f.pct(v.growth))
          : t.programRevenue(who, f.money(v.total), period, f.int(v.orders), leader.c.name, f.money(leader.value))}
      </p>
      <div className="pd-dash">
        <header className="pd-dash__head">
          {creator ? (
            <button type="button" className="pd-dash__who" onClick={() => actions.profile(creator.id)}>
              <Face id={creator.face} size={40} ring />
              <span>
                <strong>
                  {creator.name} <Verified />
                </strong>
                <small>
                  <PlatformLogo platform={creator.platform} size={11} /> @{creator.handle} · {nicheLabel(creator.niche, lang)}
                </small>
              </span>
            </button>
          ) : (
            <span className="pd-dash__who">
              <Stack ids={v.top.slice(0, 4).map((x) => x.c.id)} size={30} />
              <span>
                <strong>{who}</strong>
                <small>{t.creatorsCount(f.int(intent.scope.kind === "all" ? 1_284 : v.list.length))}</small>
              </span>
            </span>
          )}
          <span className="pd-dash__period">
            <i className="pd-live-dot" aria-hidden /> {t.periodTag(days)}
          </span>
        </header>

        <div className="pd-kpis">
          <div className="pd-kpi is-accent" style={{ animationDelay: "0ms" }}>
            <span>{t.revenue}</span>
            <b>
              <CountUp value={v.total} format={f.money} />
            </b>
            <small>{t.vsPrev(f.pct(v.growth))}</small>
          </div>
          <div className="pd-kpi" style={{ animationDelay: "80ms" }}>
            <span>{t.ordersTitle}</span>
            <b>
              <CountUp value={v.orders} format={f.int} delayMs={120} />
            </b>
            <small>{t.avgBasket(f.money(v.total / Math.max(1, v.orders)))}</small>
          </div>
          <div className="pd-kpi" style={{ animationDelay: "160ms" }}>
            <span>{t.commission}</span>
            <b>
              <CountUp value={v.commission} format={f.money} delayMs={240} />
            </b>
            <small>{t.ofRevenue(f.pct(Math.round(COMMISSION_RATE * 1000) / 10))}</small>
          </div>
          {creator ? (
            <div className="pd-kpi" style={{ animationDelay: "240ms" }}>
              <span>{t.engagement}</span>
              <b>
                <CountUp value={creator.engagement} format={(n) => f.pct(Math.round(n * 10) / 10)} delayMs={360} />
              </b>
              <small>
                {f.compact(creator.avgViews)} {t.views}
              </small>
            </div>
          ) : (
            <div className="pd-kpi" style={{ animationDelay: "240ms" }}>
              <span>{t.newCreatorsTitle}</span>
              <b>
                <CountUp value={newCount} format={(n) => `+${f.int(n)}`} delayMs={360} />
              </b>
              <span className="pd-stack">
                {newcomers.slice(0, 4).map((n) => (
                  <Face key={n.handle} id={n.face} size={20} ring />
                ))}
              </span>
            </div>
          )}
        </div>

        <section className="pd-dash__chart">
          <header>
            <span>{t.dailyRevenue}</span>
            <small>{t.bestDay(f.ago(days - 1 - v.bestIndex), f.money(v.series[v.bestIndex]))}</small>
          </header>
          <RevenueChart lang={lang} days={v.series} />
        </section>

        <div className="pd-dash__grid">
          <section className="pd-dash__card">
            <header>{creator ? t.byCampaign : t.topCreatorsShort}</header>
            {creator ? (
              <ol className="pd-rank">
                {camps.map((c, i) => {
                  const value = (v.total * c.revenue) / campWeight;
                  return (
                    <li key={c.id} style={{ animationDelay: `${200 + i * 90}ms` }}>
                      <Photo id={c.cover} w={30} h={30} className="pd-rank__cover" />
                      <span className="pd-rank__who">
                        <strong>{campaignName(c, lang)}</strong>
                        <span className="pd-bar">
                          <i style={{ ["--w" as string]: `${(c.revenue / campWeight) * 100}%`, animationDelay: `${400 + i * 90}ms` }} />
                        </span>
                      </span>
                      <b>{f.compact(value, true)}</b>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ol className="pd-rank">
                {v.top.map(({ c, value }, i) => (
                  <li key={c.id} style={{ animationDelay: `${200 + i * 90}ms` }}>
                    <button type="button" className="pd-rank__btn" onClick={() => actions.profile(c.id)}>
                      <span className="pd-rank__n">{i + 1}</span>
                      <Face id={c.face} size={30} />
                      <span className="pd-rank__who">
                        <strong>
                          {c.name} <PlatformLogo platform={c.platform} size={10} />
                        </strong>
                        <span className="pd-bar">
                          <i style={{ ["--w" as string]: `${(value / v.top[0].value) * 100}%`, animationDelay: `${400 + i * 90}ms` }} />
                        </span>
                      </span>
                      <b>{f.compact(value, true)}</b>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {creator || intent.scope.kind === "group" ? (
            <section className="pd-dash__card pd-dash__video">
              <header>{t.bestVideo}</header>
              <button type="button" className="pd-reel pd-dash__reel" onClick={() => actions.profile(featured.id)}>
                <Clip id={featured.video} />
                <span className="pd-reel__top">
                  <IconPlay /> {f.compact(featured.avgViews * 2.4)}
                </span>
                <span className="pd-reel__who">
                  <Face id={featured.face} size={22} ring />@{featured.handle}
                </span>
              </button>
              <ul className="pd-sales">
                {recentSales(featured)
                  .slice(0, 3)
                  .map((s, i) => (
                    <li key={i} style={{ animationDelay: `${500 + i * 120}ms` }}>
                      <span>
                        <b>+{f.money(s.amount)}</b>
                        <small>{campaignNameById(s.campaign, lang)}</small>
                      </span>
                      <small>{t.minAgo(s.mins)}</small>
                    </li>
                  ))}
              </ul>
            </section>
          ) : (
            <section className="pd-dash__card">
              <header>
                {t.newCreatorsTitle} <span className="pd-up">{t.joinedCount(newCount)}</span>
              </header>
              <ul className="pd-newbies">
                {newcomers.map((n, i) => (
                  <li key={n.handle} style={{ animationDelay: `${300 + i * 90}ms` }}>
                    <Face id={n.face} size={30} />
                    <span>
                      <strong>
                        {n.name} <PlatformLogo platform={n.platform} size={10} />
                      </strong>
                      <small>{t.joinedAgo(n.daysAgo)}</small>
                    </span>
                    <b>+{f.money(n.firstSales)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      <div className="pd-mino__actions">
        {creator ? (
          <>
            <button type="button" className="pd-btn is-primary" onClick={() => actions.profile(creator.id)}>
              {t.viewProfile}
            </button>
            {creator.owed ? (
              <button type="button" className={`pd-btn${owed ? "" : " is-done"}`} disabled={!owed} onClick={() => actions.pay(creator.id)}>
                {owed ? (
                  <>
                    <IconWallet size={14} /> {t.payName(first(creator), f.money(owed))}
                  </>
                ) : (
                  <>
                    <IconCheck /> {t.paidName(first(creator))}
                  </>
                )}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" className="pd-btn is-primary" onClick={() => actions.go("campaigns")}>
              {t.openCampaigns}
            </button>
            <button type="button" className="pd-btn" onClick={() => actions.go("payouts")}>
              {t.openPayouts}
            </button>
          </>
        )}
      </div>
    </>
  );
}

// Payouts: who is owed, with a working "Pay all".
function PayAnswer({ intent, actions }: { intent: Extract<Intent, { kind: "pay" }>; actions: MinoActions }) {
  const { t, f } = useCopy();
  const rows = useMemo(() => (intent.id ? CREATORS.filter((c) => c.id === intent.id) : [...CREATORS].sort((a, b) => b.owed - a.owed)), [intent.id]);
  const [more, setMore] = useState(false);
  const [paying, setPaying] = useState(false);
  const due = rows.filter((c) => !actions.paid.has(c.id));
  const owed = due.reduce((s, c) => s + c.owed, 0);
  const shown = more ? rows : rows.slice(0, 5);
  const payAll = () => {
    setPaying(true);
    window.setTimeout(() => {
      actions.payMany(due.map((c) => c.id));
      setPaying(false);
    }, 900);
  };
  return (
    <>
      <p className="pd-mino__answer">{owed === 0 ? t.allPaid : intent.id ? t.paySingle(rows[0].name, f.money(owed)) : t.payAnswer(due.length, f.money(owed))}</p>
      <div className="pd-paylist">
        {shown.map((c, i) => {
          const done = actions.paid.has(c.id);
          return (
            <div key={c.id} className={`pd-prow${done ? " is-paid" : ""}`} style={{ animationDelay: `${i * 70}ms`, transitionDelay: paying ? "0ms" : `${i * 60}ms` }}>
              <button type="button" className="pd-who" onClick={() => actions.profile(c.id)}>
                <Face id={c.face} size={32} />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    @{c.handle} · <span className="pd-method">{c.method}</span>
                  </small>
                </span>
              </button>
              <span className="pd-num">{f.money(done ? 0 : c.owed)}</span>
              <button type="button" className={`pd-btn is-sm${done ? " is-done" : " is-primary"}`} disabled={done || paying} onClick={() => actions.pay(c.id)}>
                {done ? (
                  <>
                    <IconCheck size={12} /> {t.paid}
                  </>
                ) : (
                  t.pay
                )}
              </button>
            </div>
          );
        })}
        {rows.length > 5 && !more ? (
          <button type="button" className="pd-paylist__more" onClick={() => setMore(true)}>
            <Stack ids={rows.slice(5, 9).map((c) => c.id)} size={20} /> {t.showMore(rows.length - 5)}
          </button>
        ) : null}
      </div>
      <div className="pd-mino__actions">
        <button type="button" className={`pd-btn is-primary${owed === 0 ? " is-done" : ""}`} disabled={owed === 0 || paying} onClick={payAll}>
          {owed === 0 ? (
            <>
              <IconCheck /> {t.everyonePaid}
            </>
          ) : paying ? (
            <>
              <span className="pd-spinner" aria-hidden /> {t.paying}
            </>
          ) : (
            <>
              <IconWallet size={14} /> {t.payAll(f.money(owed))}
            </>
          )}
        </button>
        <button type="button" className="pd-btn" onClick={() => actions.go("payouts")}>
          {t.openPayouts}
        </button>
      </div>
    </>
  );
}

// Campaign: a draft filled from the text, launchable from the thread.
function CampaignAnswer({ turnId, intent, actions }: { turnId: number; intent: Extract<Intent, { kind: "campaign" }>; actions: MinoActions }) {
  const { lang, t, f } = useCopy();
  const [name, setName] = useState(intent.name ?? (lang === "fr" ? PRODUCTS.find((p) => p.id === intent.product)?.nameFr : PRODUCTS.find((p) => p.id === intent.product)?.name) ?? t.newCampaignName);
  const [product, setProduct] = useState<ProductId>(intent.product);
  const [commission, setCommission] = useState(intent.commission);
  const status = actions.launched[turnId];
  const p = PRODUCTS.find((x) => x.id === product) ?? PRODUCTS[0];
  const pool = intent.niche ? CREATORS.filter((c) => NICHE_GROUPS[intent.niche as NicheKey].includes(c.niche)) : [];
  const crew = (pool.length >= 2 ? pool : CREATORS).slice(0, 4).map((c) => c.id);
  const launch = (live: boolean) => actions.launch(turnId, { name: name.trim() || t.newCampaignName, product, commission, crew, live });
  return (
    <>
      <p className="pd-mino__answer">{t.campaignAnswer}</p>
      <div className={`pd-draft${status ? " is-sent" : ""}`}>
        <div className="pd-draft__cover">
          <Photo id={p.photo} w={200} h={240} />
          <span className={`pd-pill is-${status === "live" ? "live" : "draft"}`}>{status === "live" ? t.statusLive : t.statusDraft}</span>
        </div>
        <div className="pd-draft__form">
          <label>
            <span>{t.campaignNameLabel}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={Boolean(status)} />
          </label>
          <label>
            <span>{t.product}</span>
            <select value={product} onChange={(e) => setProduct(e.target.value as ProductId)} disabled={Boolean(status)}>
              {PRODUCTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {lang === "fr" ? x.nameFr : x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pd-draft__row">
            <div>
              <span>{t.commission}</span>
              <div className="pd-stepper">
                <button type="button" onClick={() => setCommission((c) => Math.max(5, c - 1))} disabled={Boolean(status)} aria-label="-">
                  −
                </button>
                <b>{f.pct(commission)}</b>
                <button type="button" onClick={() => setCommission((c) => Math.min(40, c + 1))} disabled={Boolean(status)} aria-label="+">
                  +
                </button>
              </div>
            </div>
            <div>
              <span>{t.creatorsToInvite}</span>
              <Stack ids={crew} size={26} more={`+${f.int(crew.length * 9)}`} />
            </div>
          </div>
        </div>
      </div>
      <div className="pd-mino__actions">
        {status ? (
          <>
            <span className="pd-btn is-done">
              <IconCheck /> {status === "live" ? t.launched : t.draftSaved}
            </span>
            <button type="button" className="pd-btn" onClick={() => actions.go("campaigns")}>
              {t.viewInCampaigns}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="pd-btn is-primary" onClick={() => launch(true)}>
              <IconMega /> {t.launch}
            </button>
            <button type="button" className="pd-btn" onClick={() => launch(false)}>
              {t.saveDraft}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function HelpAnswer({ onAsk }: { onAsk: (q: string) => void }) {
  const { t } = useCopy();
  return (
    <>
      <p className="pd-mino__answer">{t.helpAnswer}</p>
      <div className="pd-suggest">
        {t.helpChips.map((chip, i) => (
          <button key={chip} type="button" className="hm-chip" style={{ ["--i" as string]: i }} onClick={() => onAsk(chip)}>
            <span className="hm-chip__icon">{[CHIP_ICONS[0], CHIP_ICONS[1], CHIP_ICONS[5]][i]}</span>
            {chip}
          </button>
        ))}
      </div>
    </>
  );
}

function MinoDock({ onAsk, focusKey }: { onAsk: (q: string) => void; focusKey: number }) {
  const { t } = useCopy();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusKey) ref.current?.focus({ preventScroll: true });
  }, [focusKey]);
  return (
    <div className="pd-dock">
      <div className="pd-dock__chips">
        {t.followUps.map((q) => (
          <button key={q} type="button" onClick={() => onAsk(q)}>
            <WsIcon name="sparkle" size={12} /> {q}
          </button>
        ))}
      </div>
      <form
        className="mtg-promptbox pd-dock__box"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAsk(text.trim());
          setText("");
        }}
      >
        <div className="mtg-promptbox__led" aria-hidden>
          <span className="mtg-promptbox__led-spin" />
        </div>
        <div className="hm-hero__field">
          <MinoCompanion size={20} />
          <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.askFollowUp} aria-label={t.askMino} />
          <button type="submit" className="hm-hero__send" disabled={!text.trim()} aria-label={t.sendToMino}>
            <IconArrowUp />
          </button>
        </div>
      </form>
    </div>
  );
}

function MinoPage({ thread, actions, onAsk, focusKey }: { thread: Turn[]; actions: MinoActions; onAsk: (q: string) => void; focusKey: number }) {
  const { t } = useCopy();
  const hostRef = useRef<HTMLDivElement>(null);
  // A follow-up scrolls the thread (never the landing page) to the new question.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || thread.length < 2) return;
    const scroller = host.closest(".ws-content") as HTMLElement | null;
    const turns = host.querySelectorAll<HTMLElement>(".pd-turn");
    const last = turns[turns.length - 1];
    if (!scroller || !last) return;
    // The newest turn gets at least a screen of room, so its question can sit
    // at the top while the answer builds below it.
    const dock = host.querySelector<HTMLElement>(".pd-dock");
    turns.forEach((el) => (el.style.minHeight = ""));
    last.style.minHeight = `${Math.max(0, scroller.clientHeight - (dock?.offsetHeight ?? 0) - 40)}px`;
    const box = scroller.getBoundingClientRect();
    const scale = box.height / (scroller.offsetHeight || 1) || 1;
    const top = scroller.scrollTop + (last.getBoundingClientRect().top - box.top) / scale - 14;
    scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [thread.length]);
  return (
    <div className="pd-page pd-mino-page" ref={hostRef}>
      <div className="pd-mino">
        {thread.length === 0 ? (
          <div className="pd-welcome">
            <div className="hm-hero__mino" aria-hidden>
              <MinoCompanion size={52} />
            </div>
            <h2>{t.minoWelcome}</h2>
            <p>{t.minoWelcomeSub}</p>
            <div className="pd-suggest is-center">
              {t.chips.slice(0, 4).map((chip, i) => (
                <button key={chip} type="button" className="hm-chip" style={{ ["--i" as string]: i }} onClick={() => onAsk(chip)}>
                  <span className="hm-chip__icon">{CHIP_ICONS[i]}</span>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          thread.map((turn) => <MinoTurn key={turn.id} turn={turn} actions={actions} onAsk={onAsk} />)
        )}
      </div>
      <MinoDock onAsk={onAsk} focusKey={focusKey} />
    </div>
  );
}

// ── Creator profile and contact (overlays inside the demo) ────
function ProfileDrawer({ id, actions, onClose }: { id: string; actions: MinoActions; onClose: () => void }) {
  const { lang, t, f } = useCopy();
  const c = BY_ID.get(id);
  if (!c) return null;
  const member = IN_PROGRAM.has(c.id);
  const isSaved = actions.saved.has(c.id);
  const women = c.niche === "Fitness" ? 46 + (c.followers % 9) : 66 + (c.followers % 17);
  const men = Math.round((100 - women) * 0.7);
  const audience = [women, men, 100 - women - men];
  const camps = CAMPAIGNS.filter((x) => x.crew.includes(c.id));
  return (
    <div className="pd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="pd-drawer" role="dialog" aria-label={c.name}>
        <button type="button" className="pd-drawer__close" onClick={onClose} aria-label={t.close}>
          <IconClose />
        </button>
        <div className="pd-drawer__hero">
          <Clip id={c.video} />
          <span className="pd-reel__top">
            <IconPlay /> {f.compact(c.avgViews * 2.4)}
          </span>
          <div className="pd-drawer__id">
            <Face id={c.face} size={54} ring />
            <span>
              <strong>
                {c.name} <Verified />
              </strong>
              <small>
                <PlatformLogo platform={c.platform} size={12} /> @{c.handle}
              </small>
            </span>
          </div>
        </div>
        <div className="pd-drawer__body">
          <div className="pd-drawer__tags">
            <span className="pd-tag">{nicheLabel(c.niche, lang)}</span>
            <span className="pd-tag">
              <IconPin /> {countryName(c.country, lang)}
            </span>
            <span className={`pd-tag${member ? " is-member" : ""}`}>{member ? t.inProgram : t.notInProgram}</span>
          </div>
          <div className="pd-drawer__stats">
            <span>
              <b>
                <CountUp value={c.followers} format={(n) => f.compact(n)} />
              </b>
              <small>{t.followers}</small>
            </span>
            <span>
              <b>
                <CountUp value={c.avgViews} format={(n) => f.compact(n)} />
              </b>
              <small>{t.avgViews}</small>
            </span>
            <span>
              <b>{f.pct(c.engagement)}</b>
              <small>{t.engagement}</small>
            </span>
            <span className="is-money">
              <b>
                <CountUp value={c.revenue} format={(n) => f.compact(n, true)} />
              </b>
              <small>{member ? t.salesDriven : t.soldForBrands}</small>
            </span>
          </div>
          {member ? (
            <section>
              <h4>{t.recentSales}</h4>
              <ul className="pd-sales">
                {recentSales(c).map((s, i) => (
                  <li key={i} style={{ animationDelay: `${150 + i * 90}ms` }}>
                    <span>
                      <b>+{f.money(s.amount)}</b>
                      <small>{campaignNameById(s.campaign, lang)}</small>
                    </span>
                    <small>{t.minAgo(s.mins)}</small>
                  </li>
                ))}
              </ul>
              {camps.length ? (
                <div className="pd-drawer__camps">
                  {camps.map((x) => (
                    <span key={x.id} className="pd-tag">
                      <Photo id={x.cover} w={16} h={16} className="pd-tag__img" /> {campaignName(x, lang)}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <section>
            <h4>{t.audience}</h4>
            <ul className="pd-audience">
              {t.audienceRows.map((label, i) => (
                <li key={label}>
                  <span>{label}</span>
                  <span className="pd-bar">
                    <i style={{ ["--w" as string]: `${audience[i]}%`, animationDelay: `${200 + i * 100}ms` }} />
                  </span>
                  <b>{f.pct(audience[i])}</b>
                </li>
              ))}
            </ul>
            <small className="pd-muted">{t.topCountry(`${countryName(c.country, lang)} · ${f.pct(58 + (c.followers % 21))}`)}</small>
          </section>
        </div>
        <footer className="pd-drawer__foot">
          <button type="button" className={`pd-btn${isSaved ? " is-saved-text" : ""}`} aria-pressed={isSaved} onClick={() => actions.toggleSave(c.id)}>
            <IconHeart /> {isSaved ? t.saved : t.save}
          </button>
          <button type="button" className={`pd-btn is-primary is-grow${actions.contacted.has(c.id) ? " is-done" : ""}`} onClick={() => actions.contact(c.id)}>
            {actions.contacted.has(c.id) ? (
              <>
                <IconCheck /> {t.contacted}
              </>
            ) : (
              <>
                <IconMail /> {t.contact}
              </>
            )}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function ContactModal({ id, brand, onClose, onSent }: { id: string; brand: string; onClose: () => void; onSent: (id: string) => void }) {
  const { lang, t } = useCopy();
  const c = BY_ID.get(id);
  const product = lang === "fr" ? PRODUCTS[0].nameFr : PRODUCTS[0].name;
  const [subject, setSubject] = useState(() => t.contactSubject(brand));
  const [body, setBody] = useState(() => (c ? t.contactBody(c.name.split(" ")[0], brand, nicheLabel(c.niche, lang).toLowerCase(), product) : ""));
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  // The shell re-renders on every live sale: keep the timers off its callbacks.
  const done = useRef({ onSent, onClose });
  done.current = { onSent, onClose };
  useEffect(() => {
    if (state === "sending") {
      const timer = window.setTimeout(() => setState("sent"), 850);
      return () => window.clearTimeout(timer);
    }
    if (state === "sent") {
      const timer = window.setTimeout(() => {
        done.current.onSent(id);
        done.current.onClose();
      }, 1100);
      return () => window.clearTimeout(timer);
    }
  }, [state, id]);
  if (!c) return null;
  return (
    <div className="pd-overlay is-center" onMouseDown={(e) => e.target === e.currentTarget && state === "idle" && onClose()}>
      <div className={`pd-compose${state === "sent" ? " is-sent" : ""}`} role="dialog" aria-label={t.newMessage}>
        <header>
          <strong>
            <IconMail /> {t.newMessage}
          </strong>
          <button type="button" className="pd-drawer__close is-inline" onClick={onClose} aria-label={t.close}>
            <IconClose />
          </button>
        </header>
        <div className="pd-compose__to">
          <span>{t.to}</span>
          <Face id={c.face} size={24} />
          <strong>{c.name}</strong>
          <small>
            <PlatformLogo platform={c.platform} size={10} /> @{c.handle} · {t.viaGmail}
          </small>
        </div>
        <label className="pd-compose__subject">
          <span>{t.subject}</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={state !== "idle"} />
        </label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} disabled={state !== "idle"} aria-label={t.newMessage} />
        <footer>
          <small>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gmail-logo.svg" alt="" width={14} height={14} /> {t.fromLine("sofia@lumiereskin.com")}
          </small>
          <button type="button" className={`pd-btn is-primary${state === "sent" ? " is-done" : ""}`} disabled={state !== "idle"} onClick={() => setState("sending")}>
            {state === "idle" ? (
              <>
                <IconSend /> {t.send}
              </>
            ) : state === "sending" ? (
              <>
                <span className="pd-spinner" aria-hidden /> {t.sending}
              </>
            ) : (
              <>
                <IconCheck /> {t.sent}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────
function HomePage({
  revenue,
  sales,
  onAsk,
  onGo,
  typing,
}: {
  revenue: number;
  sales: number;
  onAsk: (q: string) => void;
  onGo: (page: Page) => void;
  typing: boolean;
}) {
  const { lang, t, f } = useCopy();
  const [text, setText] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("30d");
  const placeholder = useTypedPlaceholder(typing && !text, t.rotating);
  const p = PERIODS.find((x) => x.id === period) ?? PERIODS[1];
  const days = useMemo(() => revenueDays(p.days, p.total, p.days), [p.days, p.total]);
  const feedHost = useRef<HTMLUListElement>(null);
  const feed = useLiveFeed(EVENTS, 6, 2600, feedHost);
  const bonus = revenue - TOTAL_REVENUE;
  const top = CREATORS.slice(0, 5);
  const maxTop = top[0].revenue;

  return (
    <div className="pd-page pd-home">
      <section className="hm-hero pd-hero" aria-label="Ask Mino">
        <div className="hm-hero__aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="hm-hero__mino" aria-hidden>
          <MinoCompanion size={56} />
        </div>
        <h1 className="hm-hero__title">{t.greeting(OWNER.first)}</h1>
        <p className="hm-hero__sub">{t.homeSub}</p>
        <form
          className="mtg-promptbox hm-hero__box"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAsk(text.trim());
          }}
        >
          <div className="mtg-promptbox__led" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="mtg-promptbox__glow" aria-hidden>
            <span className="mtg-promptbox__led-spin" />
          </div>
          <div className="hm-hero__field">
            <MinoCompanion size={20} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || t.askMino} aria-label={t.askMino} />
            <button type="submit" className="hm-hero__send" disabled={!text.trim()} aria-label={t.sendToMino}>
              <IconArrowUp />
            </button>
          </div>
        </form>
        <div className="hm-hero__chips">
          {t.chips.map((chip, i) => (
            <button key={chip} type="button" className="hm-chip" style={{ ["--i" as string]: i }} onClick={() => onAsk(chip)}>
              <span className="hm-chip__icon">{CHIP_ICONS[i]}</span>
              {chip}
            </button>
          ))}
        </div>
      </section>

      <div className="pd-home__body">
        <div className="hm-section-title">
          <h2>{t.yourProgram}</h2>
          <span>
            <i className="pd-live-dot" aria-hidden /> {t.liveUpdated}
          </span>
        </div>
        <div className="hm-metrics pd-metrics">
          <button type="button" className="hm-metric is-accent pd-metric" style={{ ["--i" as string]: 0 }} onClick={() => onGo("campaigns")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">{t.revenue}</span>
              <span className="hm-metric__icon">
                <IconBag />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={revenue} format={(n) => f.compact(n, true)} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up is-light">▲ {f.pct(38.4)}</span>
              <Spark values={[3, 4, 4, 6, 7, 9, 8, 11, 13, 16]} tone="white" />
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 1 }} onClick={() => onGo("discovery")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">{t.creators}</span>
              <span className="hm-metric__icon">
                <WsIcon name="users" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={1_284} format={f.int} />
            </div>
            <div className="pd-metric__foot">
              <Stack ids={["luna", "sarah", "maya", "zoe"]} size={20} />
              <span className="pd-up">{t.newCreators(86)}</span>
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 2 }} onClick={() => onGo("campaigns")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">{t.sales}</span>
              <span className="hm-metric__icon">
                <WsIcon name="billing" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={sales} format={f.int} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up">▲ {f.pct(21.7)}</span>
              <Spark values={[5, 6, 5, 7, 8, 8, 10, 11, 12, 14]} />
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 3 }} onClick={() => onGo("payouts")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">{t.paidOut}</span>
              <span className="hm-metric__icon">
                <WsIcon name="payit" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={PAID_START} format={(n) => f.compact(n, true)} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up">{t.liveCampaigns(14)}</span>
            </div>
          </button>
        </div>

        <div className="pd-row">
          <section className="pd-card pd-revenue">
            <header className="pd-card__head">
              <div>
                <span className="pd-card__label">{t.revenueFromCreators}</span>
                <div className="pd-revenue__total">
                  <CountUp value={p.total + (period === "30d" ? bonus : 0)} format={f.money} />
                  <span className="pd-up">▲ {f.pct(p.growth)}</span>
                </div>
              </div>
              <div className="pd-seg" role="tablist" aria-label={t.period}>
                {PERIODS.map((x) => (
                  <button key={x.id} type="button" role="tab" aria-selected={period === x.id} className={period === x.id ? "is-active" : ""} onClick={() => setPeriod(x.id)}>
                    {lang === "fr" ? x.labelFr : x.label}
                  </button>
                ))}
              </div>
            </header>
            <RevenueChart key={period} lang={lang} days={days} />
          </section>

          <section className="pd-card pd-feed">
            <header className="pd-card__head">
              <span className="pd-card__title">
                <i className="pd-live-dot" aria-hidden /> {t.liveActivity}
              </span>
              <span className="pd-card__meta">{t.orders(f.int(sales))}</span>
            </header>
            <ul className="pd-feed__list" ref={feedHost}>
              {feed.map(({ item, key }, i) => {
                const line = eventLine(item, lang);
                return (
                  <li key={key} className={`pd-feed__item is-${line.tone}`}>
                    {line.face ? (
                      <CreatorFace id={line.face} size={30} />
                    ) : (
                      <span className="pd-feed__glyph">
                        <WsIcon name="payit" size={15} />
                      </span>
                    )}
                    <div>
                      <p>{line.text}</p>
                      <small>{i === 0 ? t.justNow : t.minAgo(i * 3)}</small>
                    </div>
                    {line.value ? <strong>{line.value}</strong> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="pd-row pd-row--even">
          <section className="pd-card">
            <header className="pd-card__head">
              <span className="pd-card__title">{t.topCreators}</span>
              <button type="button" className="pd-link" onClick={() => onGo("discovery")}>
                {t.seeAll}
              </button>
            </header>
            <ol className="pd-leaders">
              {top.map((c, i) => (
                <li key={c.id} style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="pd-leaders__rank">{i + 1}</span>
                  <Face id={c.face} size={34} />
                  <div className="pd-leaders__who">
                    <strong>
                      {c.name} <PlatformLogo platform={c.platform} size={11} />
                    </strong>
                    <span className="pd-bar">
                      <i style={{ ["--w" as string]: `${(c.revenue / maxTop) * 100}%`, animationDelay: `${300 + i * 90}ms` }} />
                    </span>
                  </div>
                  <b className="pd-leaders__value">{f.compact(c.revenue, true)}</b>
                </li>
              ))}
            </ol>
          </section>
          <section className="pd-card">
            <header className="pd-card__head">
              <span className="pd-card__title">{t.freshContent}</span>
              <button type="button" className="pd-link" onClick={() => onGo("content")}>
                {t.library}
              </button>
            </header>
            <div className="pd-reels">
              {["zoe", "luna", "maya"].map((id) => {
                const c = BY_ID.get(id)!;
                return (
                  <button key={id} type="button" className="pd-reel" onClick={() => onGo("content")}>
                    <Clip id={c.video} />
                    <span className="pd-reel__top">
                      <IconPlay /> {f.compact(c.avgViews * 1.8)}
                    </span>
                    <span className="pd-reel__who">
                      <Face id={c.face} size={22} ring />@{c.handle}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Creators ──────────────────────────────────────────────────
const PRESET_IDS = ["all", "sellers", "viral", "gems", "ready"] as const;

function DiscoveryPage({ saved, onToggleSave, onProfile }: { saved: Set<string>; onToggleSave: (id: string) => void; onProfile: (id: string) => void }) {
  const { lang, t, f } = useCopy();
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState<(typeof PRESET_IDS)[number]>("all");
  const [platform, setPlatform] = useState<PlatformName | "all">("all");
  const [mode, setMode] = useState<"creators" | "videos">("creators");
  const [invited, setInvited] = useState<Set<string>>(() => new Set());

  const list = useMemo(() => {
    let l = EVERYONE.filter((c) => platform === "all" || c.platform === platform);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((c) => `${c.name} ${c.handle} ${c.niche} ${nicheLabel(c.niche, lang)} ${c.country}`.toLowerCase().includes(s));
    if (preset === "sellers") l = [...l].sort((a, b) => b.revenue - a.revenue);
    if (preset === "viral") l = [...l].sort((a, b) => b.avgViews - a.avgViews);
    if (preset === "gems") l = [...l].sort((a, b) => b.engagement - a.engagement);
    if (preset === "ready") l = l.filter((c) => !invited.has(c.id));
    return l;
  }, [q, preset, platform, invited, lang]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>
          {t.creators} <span className="pd-badge">{t.creatorsCount(f.int(1_284_302))}</span>
        </h1>
        <label className="pd-search">
          <WsIcon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchCreatorsPlaceholder} aria-label={t.searchCreators} />
        </label>
        <div className="pd-head__actions">
          <span className="pd-chip-btn">
            <WsIcon name="list" size={14} /> {t.myLists}
          </span>
          <span className="pd-chip-btn is-dark">
            <WsIcon name="invite" size={14} /> {t.outreach}
          </span>
        </div>
      </div>

      <div className="pd-tabs">
        <div className="pd-tabs__left">
          {PRESET_IDS.map((id) => (
            <button key={id} type="button" className={preset === id ? "is-active" : ""} onClick={() => setPreset(id)}>
              {t.presets[id]}
            </button>
          ))}
        </div>
        <div className="pd-tabs__right">
          {(["tiktok", "instagram", "youtube"] as const).map((pl) => (
            <button key={pl} type="button" className={platform === pl ? "is-active" : ""} onClick={() => setPlatform((cur) => (cur === pl ? "all" : pl))}>
              <PlatformLogo platform={pl} size={13} /> {pl === "tiktok" ? "TikTok" : pl === "instagram" ? "Instagram" : "YouTube"}
            </button>
          ))}
        </div>
      </div>

      <div className="pd-filters">
        <div className="pd-seg">
          <button type="button" className={mode === "creators" ? "is-active" : ""} onClick={() => setMode("creators")}>
            <WsIcon name="users" size={13} /> {t.creators}
          </button>
          <button type="button" className={mode === "videos" ? "is-active" : ""} onClick={() => setMode("videos")}>
            <WsIcon name="camera" size={13} /> {t.videos}
          </button>
        </div>
        {t.filters.map((label) => (
          <span key={label} className="pd-filter">
            {label}
            <WsIcon name="chevron" size={11} />
          </span>
        ))}
      </div>

      {mode === "creators" ? (
        <div className="pd-cgrid" key={`${preset}-${platform}`}>
          {list.map((c, i) => (
            <article key={c.id} className="pd-ccard" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="pd-ccard__media" onClick={() => onProfile(c.id)}>
                <Clip id={c.video} />
                <span className="pd-ccard__niche">{nicheLabel(c.niche, lang)}</span>
                <span className="pd-ccard__views">
                  <IconPlay /> {f.compact(c.avgViews)} {t.avg}
                </span>
              </div>
              <div className="pd-ccard__who">
                <Face id={c.face} size={38} ring />
                <span>
                  <strong>
                    {c.name} <Verified />
                  </strong>
                  <small>
                    <PlatformLogo platform={c.platform} size={11} /> @{c.handle} · {c.country}
                  </small>
                </span>
              </div>
              <div className="pd-ccard__stats">
                <span>
                  <b>{f.compact(c.followers)}</b>
                  <small>{t.followers}</small>
                </span>
                <span>
                  <b>{f.pct(c.engagement)}</b>
                  <small>{t.engagement}</small>
                </span>
                <span className="is-money">
                  <b>{f.compact(c.revenue, true)}</b>
                  <small>{t.salesDriven}</small>
                </span>
              </div>
              <div className="pd-ccard__actions">
                <button type="button" className={`pd-btn is-icon${saved.has(c.id) ? " is-saved" : ""}`} aria-pressed={saved.has(c.id)} aria-label={t.save} onClick={() => onToggleSave(c.id)}>
                  <IconHeart />
                </button>
                <button type="button" className={`pd-btn is-primary is-grow${invited.has(c.id) ? " is-done" : ""}`} onClick={() => setInvited((s) => toggle(s, c.id))}>
                  {invited.has(c.id) ? (
                    <>
                      <IconCheck /> {t.invited}
                    </>
                  ) : (
                    t.inviteToCampaign
                  )}
                </button>
              </div>
            </article>
          ))}
          {list.length === 0 ? <p className="pd-empty">{t.noMatch(q)}</p> : null}
        </div>
      ) : (
        <div className="pd-vgrid">
          {list.map((c, i) => (
            <article key={c.id} className="pd-vcard" style={{ animationDelay: `${i * 60}ms` }}>
              <Clip id={c.video} />
              <span className="pd-vcard__top">
                <IconPlay /> {f.compact(c.avgViews * 2.3)}
              </span>
              <div className="pd-vcard__foot">
                <Face id={c.face} size={22} ring />
                <span>@{c.handle}</span>
                <b>{f.compact(c.revenue / 6, true)}</b>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ListsPage({ onOpen }: { onOpen: () => void }) {
  const { lang, t, f } = useCopy();
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>{t.myLists}</h1>
      </div>
      <div className="pd-lists">
        {LISTS.map((l, i) => (
          <button key={l.name} type="button" className="pd-list" style={{ animationDelay: `${i * 70}ms` }} onClick={onOpen}>
            <Stack ids={l.crew} size={34} more={`+${l.count - l.crew.length}`} />
            <strong>{lang === "fr" ? l.nameFr : l.name}</strong>
            <span>{t.creatorsCount(f.int(l.count))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Campaigns ─────────────────────────────────────────────────
function CampaignsPage({ campaigns, onCreate, fresh }: { campaigns: Campaign[]; onCreate: () => void; fresh: string | null }) {
  const { lang, t, f } = useCopy();
  const [tab, setTab] = useState<"active" | "gifting" | "drafts">(() => (campaigns.find((c) => c.id === fresh)?.status === "draft" ? "drafts" : "active"));
  const [open, setOpen] = useState<string | null>("serum");
  const shown = campaigns.filter((c) => (tab === "active" ? c.status === "live" : tab === "gifting" ? c.status === "gifting" : c.status === "draft"));
  const live = campaigns.filter((c) => c.status !== "draft");
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>{t.campaigns}</h1>
        <p className="pd-head__sub">{t.campaignsSub}</p>
        <div className="pd-head__actions">
          <button
            type="button"
            className="pd-btn is-dark"
            onClick={() => {
              onCreate();
              setTab("drafts");
            }}
          >
            <WsIcon name="plus" size={14} /> {t.createCampaign}
          </button>
        </div>
      </div>

      <div className="pd-tiles">
        <div className="pd-tile" style={{ animationDelay: "0ms" }}>
          <span>{t.revenue}</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.revenue, 0)} format={f.money} />
          </b>
          <small className="pd-up">{t.vsLastMonth(f.pct(38.4))}</small>
        </div>
        <div className="pd-tile" style={{ animationDelay: "70ms" }}>
          <span>{t.creatorsOnCampaigns}</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.creators, 0)} format={f.int} />
          </b>
          <Stack ids={["luna", "sarah", "maya", "mike", "zoe"]} size={20} />
        </div>
        <div className="pd-tile" style={{ animationDelay: "140ms" }}>
          <span>{t.ordersTitle}</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.sales, 0)} format={f.int} />
          </b>
          <small>{t.avgConversion(f.pct(4.7))}</small>
        </div>
      </div>

      <div className="pd-subtabs">
        {(
          [
            ["active", t.tabActive(campaigns.filter((c) => c.status === "live").length)],
            ["gifting", t.tabGifting(campaigns.filter((c) => c.status === "gifting").length)],
            ["drafts", t.tabDrafts(campaigns.filter((c) => c.status === "draft").length)],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="pd-camps" key={tab}>
        {shown.map((c, i) => (
          <article key={c.id} className={`pd-camp${open === c.id ? " is-open" : ""}${fresh === c.id ? " is-fresh" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
            <button type="button" className="pd-camp__row" onClick={() => setOpen((o) => (o === c.id ? null : c.id))}>
              <Photo id={c.cover} w={44} h={44} className="pd-camp__cover" />
              <span className="pd-camp__name">
                <strong>{campaignName(c, lang)}</strong>
                <small>
                  {c.status === "draft" || !c.started ? t.draftNotLaunched : t.started(f.day(c.started[0], c.started[1]))} · {t.creatorsCount(f.int(c.creators))}
                </small>
              </span>
              <span className={`pd-pill is-${c.status}`}>{c.status === "live" ? t.statusLive : c.status === "gifting" ? t.statusGifting : t.statusDraft}</span>
              <Stack ids={c.crew} size={22} />
              <span className="pd-camp__num">
                <b>{c.revenue ? f.money(c.revenue) : "—"}</b>
                <small>{c.sales ? t.orders(f.int(c.sales)) : t.noOrdersYet}</small>
              </span>
              {c.trend.length ? <Spark values={c.trend} tone="green" /> : <span className="pd-spark-empty" />}
            </button>
            {open === c.id && c.status !== "draft" ? (
              <div className="pd-camp__detail">
                {c.crew.map((id, k) => {
                  const cr = BY_ID.get(id)!;
                  const share = [0.34, 0.24, 0.17, 0.11][k];
                  return (
                    <div key={id} className="pd-camp__creator" style={{ animationDelay: `${k * 60}ms` }}>
                      <Face id={cr.face} size={28} />
                      <span>
                        <strong>{cr.name}</strong>
                        <small>
                          <PlatformLogo platform={cr.platform} size={10} /> @{cr.handle}
                        </small>
                      </span>
                      <b>{f.money(c.revenue * share)}</b>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
        {shown.length === 0 ? <p className="pd-empty">{t.nothingYet}</p> : null}
      </div>
    </div>
  );
}

function ContentPage() {
  const { t, f } = useCopy();
  const [approved, setApproved] = useState<Set<string>>(() => new Set(["zoe", "luna", "sarah", "mike"]));
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>
          {t.content} <span className="pd-badge">{t.videosCount(f.int(2_318))}</span>
        </h1>
        <p className="pd-head__sub">{t.contentSub}</p>
      </div>
      <div className="pd-vgrid is-content">
        {CREATORS.map((c, i) => {
          const ok = approved.has(c.id);
          return (
            <article key={c.id} className="pd-vcard" style={{ animationDelay: `${i * 60}ms` }}>
              <Clip id={c.video} />
              <span className={`pd-vcard__status${ok ? " is-ok" : ""}`}>{ok ? t.approved : t.toReview}</span>
              <div className="pd-vcard__foot">
                <Face id={c.face} size={22} ring />
                <span>@{c.handle}</span>
                {ok ? (
                  <b>{f.compact(c.avgViews * 1.6)}</b>
                ) : (
                  <button type="button" className="pd-approve" onClick={() => setApproved((s) => new Set(s).add(c.id))}>
                    <IconCheck size={12} /> {t.approve}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── Payouts ───────────────────────────────────────────────────
function PayoutsPage({ paid, onPay, onPayAll }: { paid: Set<string>; onPay: (id: string) => void; onPayAll: () => void }) {
  const { lang, t, f } = useCopy();
  const buckets = useMemo(payoutBuckets, []);
  const owed = CREATORS.filter((c) => !paid.has(c.id)).reduce((s, c) => s + c.owed, 0);
  const paidNow = PAID_START + (OWED_START - owed);
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>{t.overview}</h1>
        <div className="pd-head__actions">
          <button type="button" className={`pd-btn is-primary${owed === 0 ? " is-done" : ""}`} onClick={onPayAll} disabled={owed === 0}>
            {owed === 0 ? (
              <>
                <IconCheck /> {t.everyonePaid}
              </>
            ) : (
              <>{t.payAll(f.money(owed))}</>
            )}
          </button>
        </div>
      </div>
      <PayoutsPulse
        lang={lang}
        title={t.commissionsEarned}
        amount={PAYOUT_EARNED}
        salesLine={t.salesInPeriod(f.int(TOTAL_SALES))}
        periodControl={
          <span className="pd-period">
            {t.last30Days} <WsIcon name="chevron" size={12} />
          </span>
        }
        buckets={buckets}
        owed={owed}
        owedHint={t.creatorsPending(CREATORS.filter((c) => !paid.has(c.id)).length)}
        paid={paidNow}
        paidLabel={t.paidInPeriod}
        paidHint={t.paymentsInPeriod}
        avgPerSale={PAYOUT_EARNED / TOTAL_SALES}
        salesCount={TOTAL_SALES}
        format={f.money}
      />
      <section className="pd-card pd-card--flush">
        <div className="pd-table">
          <div className="pd-table__row is-head">
            <span>{t.creator}</span>
            <span>{t.amountOwed}</span>
            <span>{t.payment}</span>
            <span>{t.totalEarned}</span>
            <span>{t.sales}</span>
            <span />
          </div>
          {CREATORS.map((c, i) => {
            const done = paid.has(c.id);
            return (
              <div key={c.id} className={`pd-table__row${done ? " is-paid" : ""}`} style={{ animationDelay: `${i * 45}ms` }}>
                <span className="pd-who">
                  <Face id={c.face} size={32} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>@{c.handle}</small>
                  </span>
                </span>
                <span className="pd-num">{f.money(done ? 0 : c.owed)}</span>
                <span>
                  <span className="pd-method">{c.method}</span>
                </span>
                <span className="pd-num">{f.money(c.revenue * 0.12 + (done ? c.owed : 0))}</span>
                <span className="pd-num">{f.int(c.sales)}</span>
                <span className="pd-right">
                  <button type="button" className={`pd-btn is-sm${done ? " is-done" : " is-primary"}`} disabled={done} onClick={() => onPay(c.id)}>
                    {done ? (
                      <>
                        <IconCheck size={12} /> {t.paid}
                      </>
                    ) : (
                      t.pay
                    )}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TransactionsPage() {
  const { t, f } = useCopy();
  const rows = CREATORS.flatMap((c, i) => [
    { c, amount: Math.round(c.owed * 1.9), date: f.day(9, 28 - i), ref: `PO-${48213 - i * 7}` },
    { c, amount: Math.round(c.owed * 1.4), date: f.day(8, 29 - i), ref: `PO-${46102 - i * 5}` },
  ]).slice(0, 14);
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>{t.payments}</h1>
        <p className="pd-head__sub">{t.paidLast30(f.money(PAID_START))}</p>
      </div>
      <section className="pd-card pd-card--flush">
        <div className="pd-table is-tx">
          <div className="pd-table__row is-head">
            <span>{t.creator}</span>
            <span>{t.amount}</span>
            <span>{t.method}</span>
            <span>{t.date}</span>
            <span>{t.status}</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.ref} className="pd-table__row" style={{ animationDelay: `${i * 35}ms` }}>
              <span className="pd-who">
                <Face id={r.c.face} size={30} />
                <span>
                  <strong>{r.c.name}</strong>
                  <small>{r.ref}</small>
                </span>
              </span>
              <span className="pd-num">{f.money(r.amount)}</span>
              <span>
                <span className="pd-method">{r.c.method}</span>
              </span>
              <span className="pd-muted">{r.date}</span>
              <span>
                <span className="pd-pill is-live">{t.paid}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntegrationsPage() {
  const { lang, t } = useCopy();
  const [on, setOn] = useState(() => new Set(INTEGRATIONS.filter((x) => x.on).map((x) => x.name)));
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>{t.integrations}</h1>
        <p className="pd-head__sub">{t.integrationsSub}</p>
      </div>
      <div className="pd-integrations">
        {INTEGRATIONS.map((x, i) => {
          const active = on.has(x.name);
          return (
            <div key={x.name} className="pd-integration" style={{ animationDelay: `${i * 50}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.logo} alt="" width={30} height={30} />
              <span>
                <strong>{x.name}</strong>
                <small>{lang === "fr" ? x.noteFr : x.note}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={t.connection(x.name)}
                className={`pd-switch${active ? " is-on" : ""}`}
                onClick={() =>
                  setOn((s) => {
                    const n = new Set(s);
                    if (n.has(x.name)) n.delete(x.name);
                    else n.add(x.name);
                    return n;
                  })
                }
              >
                <i />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────
const RAIL: { id: Rail; icon: IconName; page: Page }[] = [
  { id: "home", icon: "home", page: "home" },
  { id: "findit", icon: "findit", page: "discovery" },
  { id: "trackit", icon: "trackit", page: "campaigns" },
  { id: "payit", icon: "payit", page: "payouts" },
  { id: "integrations", icon: "integrations", page: "integrations" },
];
const PAGE_RAIL: Record<Page, Rail> = {
  home: "home",
  mino: "home",
  discovery: "findit",
  lists: "findit",
  campaigns: "trackit",
  content: "trackit",
  payouts: "payit",
  transactions: "payit",
  integrations: "integrations",
};

const SEARCH_PAGES = ["discovery", "campaigns", "payouts", "content", "integrations"] as const;

export function PremiumWorkspaceDemo() {
  const { lang, t, f } = useCopy();
  const [page, setPage] = useState<Page>("home");
  const rail = PAGE_RAIL[page];
  const lastPage = useRef<Partial<Record<Rail, Page>>>({});
  const [brand, setBrand] = useState(BRANDS[0].id);
  const [brandOpen, setBrandOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [thread, setThread] = useState<Turn[]>([]);
  const [threadKey, setThreadKey] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [dockFocus, setDockFocus] = useState(0);
  const turnSeq = useRef(0);
  const [saved, setSaved] = useState<Set<string>>(() => new Set(["luna"]));
  const [contacted, setContacted] = useState<Set<string>>(() => new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [launched, setLaunched] = useState<Record<number, "live" | "draft">>({});
  const [campaigns, setCampaigns] = useState<Campaign[]>(CAMPAIGNS);
  const [fresh, setFresh] = useState<string | null>(null);
  const [paid, setPaid] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState({ revenue: TOTAL_REVENUE, sales: TOTAL_SALES });
  const [toast, setToast] = useState<{ key: number; who: string; amount: number; campaign: string } | null>(null);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inViewRef = useRef(false);

  const go = (next: Page) => {
    lastPage.current[PAGE_RAIL[next]] = next;
    const scroller = rootRef.current?.querySelector<HTMLElement>(".ws-content");
    if (scroller) scroller.scrollTop = 0;
    setPage(next);
    setSearchOpen(false);
  };

  /** Starts a new Mino chat, or continues the open one when `followUp`. */
  const ask = (q: string, followUp = false) => {
    const text = q.trim();
    if (!text) return;
    turnSeq.current += 1;
    const turn: Turn = { id: turnSeq.current, q: text, intent: parseAsk(text) };
    setProfileId(null);
    setContactId(null);
    if (followUp && page === "mino" && thread.length) {
      setThread((list) => [...list, turn]);
      return;
    }
    setThread([turn]);
    setThreadKey((k) => k + 1);
    if (!COPY.en.chats.includes(text) && !COPY.fr.chats.includes(text)) setRecent((r) => [text, ...r.filter((x) => x !== text)].slice(0, 3));
    go("mino");
  };
  const followUp = (q: string) => ask(q, true);

  const newChat = () => {
    setThread([]);
    setThreadKey((k) => k + 1);
    setDockFocus((n) => n + 1);
    go("mino");
  };

  const launchCampaign = (turnId: number, d: DraftInput) => {
    const id = `new-${Date.now()}`;
    const now = new Date();
    const p = PRODUCTS.find((x) => x.id === d.product) ?? PRODUCTS[0];
    setCampaigns((list) => [
      { id, name: d.name, nameFr: d.name, cover: p.photo, status: d.live ? "live" : "draft", started: d.live ? [now.getMonth() + 1, now.getDate()] : null, revenue: 0, sales: 0, creators: d.crew.length, conversion: 0, crew: d.crew, trend: [] },
      ...list,
    ]);
    setFresh(id);
    setLaunched((m) => ({ ...m, [turnId]: d.live ? "live" : "draft" }));
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const actions: MinoActions = {
    saved,
    toggleSave: (id) => setSaved((s) => toggle(s, id)),
    saveMany: (ids) => setSaved((s) => new Set([...s, ...ids])),
    contacted,
    contact: (id) => setContactId(id),
    profile: (id) => setProfileId(id),
    paid,
    pay: (id) => setPaid((s) => new Set(s).add(id)),
    payMany: (ids) => setPaid((s) => new Set([...s, ...ids])),
    launch: launchCampaign,
    launched,
    go: (p) => {
      setProfileId(null);
      go(p);
    },
  };

  const createCampaign = () => {
    const id = `new-${Date.now()}`;
    setCampaigns((list) => [
      { id, name: COPY.en.newCampaignName, nameFr: COPY.fr.newCampaignName, cover: NEW_CAMPAIGN_COVER, status: "draft", started: null, revenue: 0, sales: 0, creators: 0, conversion: 0, crew: ["luna", "sarah", "zoe"], trend: [] },
      ...list,
    ]);
    setFresh(id);
    go("campaigns");
  };

  // Only animate while the preview is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      inViewRef.current = e.isIntersecting;
      setInView(e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A sale lands every few seconds: toast, revenue and orders tick up.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let n = 0;
    const id = window.setInterval(() => {
      if (document.hidden || !inViewRef.current) return;
      const sale = SALES[n % SALES.length];
      const amount = sale.amount + ((n * 37) % 90);
      n += 1;
      setLive((l) => ({ revenue: l.revenue + amount, sales: l.sales + 1 }));
      setToast({ key: n, who: sale.who, amount, campaign: sale.campaign });
    }, 4600);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".ws-workspace-switcher")) setBrandOpen(false);
      if (!target.closest(".pd-profile")) setProfileOpen(false);
      if (!target.closest(".ws-search-wrap")) setSearchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBrandOpen(false);
        setProfileOpen(false);
        setSearchOpen(false);
        setProfileId(null);
        setContactId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = BRANDS.find((b) => b.id === brand) ?? BRANDS[0];
  const searchItems: { label: string; meta: string; page: Page; face?: string }[] = [
    ...SEARCH_PAGES.map((p) => ({
      label: p === "discovery" ? t.creators : p === "campaigns" ? t.campaigns : p === "payouts" ? t.rail.payit : p === "content" ? t.content : t.integrations,
      meta: t.searchMeta[p],
      page: p as Page,
    })),
    ...CREATORS.map((c) => ({ label: c.name, meta: `@${c.handle}`, page: "discovery" as Page, face: c.face })),
  ];
  const hits = search.trim() ? searchItems.filter((x) => `${x.label} ${x.meta}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [];
  const toastCreator = toast ? BY_ID.get(toast.who) : null;

  const sidebar: { title: string; action?: { label: string; run: () => void }; sections: { label: string; links: { label: string; icon: IconName; page: Page }[] }[] } =
    rail === "findit"
      ? {
          title: t.creators,
          sections: [
            { label: t.discover, links: [{ label: t.search, icon: "findit", page: "discovery" }] },
            { label: t.manage, links: [{ label: t.myLists, icon: "users", page: "lists" }] },
          ],
        }
      : rail === "trackit"
        ? {
            title: t.campaigns,
            action: { label: t.createCampaign, run: createCampaign },
            sections: [
              {
                label: t.track,
                links: [
                  { label: t.campaigns, icon: "grid", page: "campaigns" },
                  { label: t.content, icon: "camera", page: "content" },
                ],
              },
            ],
          }
        : rail === "payit"
          ? {
              title: t.rail.payit,
              sections: [
                {
                  label: t.payIt,
                  links: [
                    { label: t.toPay, icon: "payit", page: "payouts" },
                    { label: t.paymentsLink, icon: "list", page: "transactions" },
                  ],
                },
              ],
            }
          : rail === "integrations"
            ? { title: t.integrations, sections: [{ label: t.connected, links: [{ label: t.integrations, icon: "integrations", page: "integrations" }] }] }
            : { title: t.home, sections: [] };

  return (
    <div className="ws-shell pd-shell" ref={rootRef}>
      <header className="ws-topbar">
        <div className="ws-workspace-switcher">
          <button
            type="button"
            className="ws-workspace-btn"
            onClick={() => {
              setBrandOpen((v) => !v);
              setProfileOpen(false);
            }}
          >
            <Photo id={current.photo} w={22} h={22} className="ws-workspace-mark is-photo" />
            <span className="label">{current.name}</span>
            <span className="pd-plan">Scale</span>
            <WsIcon name="chevron" size={14} />
          </button>
          {brandOpen ? (
            <div className="ws-workspace-menu">
              <div className="ws-workspace-menu__label">{t.workspaces}</div>
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`ws-workspace-menu__item${brand === b.id ? " is-active" : ""}`}
                  onClick={() => {
                    setBrand(b.id);
                    setBrandOpen(false);
                  }}
                >
                  <Photo id={b.photo} w={22} h={22} className="ws-workspace-mark is-photo" />
                  <span className="ws-workspace-menu__name">{b.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="ws-search-wrap">
          <div className="ws-search-wrap__inner">
            <WsIcon name="search" size={16} />
            <input
              ref={searchRef}
              value={search}
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (search.trim()) setSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !search.trim()) return;
                e.preventDefault();
                const q = search.trim();
                setSearch("");
                setSearchOpen(false);
                ask(q);
              }}
            />
            <span className="ws-search-kbd">⌘K</span>
            <button
              type="button"
              className="ws-ai-pill"
              onClick={() => {
                const q = search.trim();
                setSearch("");
                setSearchOpen(false);
                if (q) return ask(q);
                setDockFocus((n) => n + 1);
                go("mino");
              }}
            >
              <WsIcon name="sparkle" size={16} />
              <span>Ask Mino</span>
            </button>
          </div>
          {searchOpen && search.trim() ? (
            <div className="ws-search-panel">
              {hits.map((item) => (
                <button
                  key={`${item.label}-${item.meta}`}
                  type="button"
                  className="ws-search-panel__item pd-search-hit"
                  onClick={() => {
                    setSearch("");
                    go(item.page);
                  }}
                >
                  {item.face ? <Face id={item.face} size={22} /> : <WsIcon name="search" size={14} />}
                  {item.label}
                  <span className="ws-search-panel__meta">{item.meta}</span>
                </button>
              ))}
              {hits.length === 0 ? <div className="pd-search-empty">{t.noResults}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="ws-top-actions">
          <span className="pd-bell">
            <WsIcon name="bell" size={17} />
            <i>9</i>
          </span>
          <div className="pd-profile" style={{ position: "relative" }}>
            <button
              type="button"
              className="ws-avatar-btn"
              aria-label={t.profile}
              onClick={() => {
                setProfileOpen((v) => !v);
                setBrandOpen(false);
              }}
            >
              <Face id={OWNER.face} size={28} />
            </button>
            {profileOpen ? (
              <div className="ws-menu">
                <div className="ws-menu__user">
                  <Face id={OWNER.face} size={40} />
                  <div>
                    <div className="ws-menu__name">{OWNER.name}</div>
                    <div className="ws-menu__meta">{t.planOnline}</div>
                  </div>
                </div>
                <div className="ws-menu__sep" />
                <button type="button" className="ws-menu__item" onClick={() => setProfileOpen(false)}>
                  <WsIcon name="settings" size={16} />
                  {t.settings}
                </button>
                <button type="button" className="ws-menu__item" onClick={() => setProfileOpen(false)}>
                  <WsIcon name="theme" size={16} />
                  {t.themes}
                  <span className="muted">{t.light}</span>
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
                onClick={() => go(item.id === "home" ? "home" : (lastPage.current[item.id] ?? item.page))}
                title={t.rail[item.id]}
              >
                <WsIcon name={item.icon} size={18} />
                <span>{t.rail[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="ws-rail__foot">
            <button type="button" className="ws-rail__item" title={t.help}>
              <WsIcon name="help" size={18} />
              <span>{t.help}</span>
            </button>
          </div>
        </aside>

        <div className="ws-stage">
          <div className="ws-stage__body">
            <aside className="ws-sidebar">
              <div className="ws-sidebar__head">
                <h2 className="ws-sidebar__title">{sidebar.title}</h2>
              </div>
              <div className="ws-sidebar__body">
                {rail === "home" ? (
                  <>
                    <button type="button" className="ws-sidebar__link ws-spaces-new" onClick={newChat}>
                      <WsIcon name="plus" size={15} />
                      <span>{t.newChat}</span>
                    </button>
                    <div className="ws-sidebar__section">
                      <div className="ws-sidebar__section-label">{t.chatsLabel}</div>
                      {[...recent, ...t.chats].slice(0, 6).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`ws-sidebar__link${page === "mino" && thread[0]?.q === c ? " is-active" : ""}`}
                          onClick={() => ask(c)}
                        >
                          <WsIcon name="sparkle" size={15} />
                          <span>{c}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {sidebar.action ? (
                  <button type="button" className="pd-side-cta" onClick={sidebar.action.run}>
                    <WsIcon name="plus" size={14} /> {sidebar.action.label}
                  </button>
                ) : null}
                {sidebar.sections.map((section) => (
                  <div key={section.label} className="ws-sidebar__section">
                    <div className="ws-sidebar__section-label">{section.label}</div>
                    {section.links.map((link) => (
                      <button key={link.label} type="button" className={`ws-sidebar__link${page === link.page ? " is-active" : ""}`} onClick={() => go(link.page)}>
                        <WsIcon name={link.icon} size={15} />
                        <span>{link.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="pd-side-foot">
                <span className="pd-side-foot__label">{t.thisMonth}</span>
                <b>
                  <CountUp value={live.revenue} format={f.money} />
                </b>
                <span className="pd-bar is-accent">
                  <i style={{ ["--w" as string]: "78%" }} />
                </span>
                <small>{t.goal}</small>
              </div>
            </aside>

            <div className="ws-main">
              <div className="ws-content pd-content">
                <div className={`pd-view${page === "mino" ? " is-mino" : ""}`} key={page === "mino" ? `mino-${threadKey}` : page}>
                  {page === "home" ? <HomePage revenue={live.revenue} sales={live.sales} onAsk={ask} onGo={go} typing={inView} /> : null}
                  {page === "mino" ? <MinoPage thread={thread} actions={actions} onAsk={followUp} focusKey={dockFocus} /> : null}
                  {page === "discovery" ? <DiscoveryPage saved={saved} onToggleSave={actions.toggleSave} onProfile={actions.profile} /> : null}
                  {page === "lists" ? <ListsPage onOpen={() => go("discovery")} /> : null}
                  {page === "campaigns" ? <CampaignsPage campaigns={campaigns} onCreate={createCampaign} fresh={fresh} /> : null}
                  {page === "content" ? <ContentPage /> : null}
                  {page === "payouts" ? (
                    <PayoutsPage
                      paid={paid}
                      onPay={(id) => setPaid((s) => new Set(s).add(id))}
                      onPayAll={() => setPaid(new Set(CREATORS.map((c) => c.id)))}
                    />
                  ) : null}
                  {page === "transactions" ? <TransactionsPage /> : null}
                  {page === "integrations" ? <IntegrationsPage /> : null}
                </div>
              </div>
              {toast && toastCreator ? (
                <div className="pd-toast" key={toast.key} role="status">
                  <Face id={toastCreator.face} size={34} />
                  <span>
                    <strong>
                      {t.newSale} <em>+{f.money(toast.amount)}</em>
                    </strong>
                    <small>
                      {toastCreator.name} · {campaignNameById(toast.campaign, lang)}
                    </small>
                  </span>
                  <span className="pd-toast__shopify">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/shopify-logo.svg" alt="" width={16} height={16} />
                  </span>
                </div>
              ) : null}
              {profileId ? <ProfileDrawer key={`profile-${profileId}`} id={profileId} actions={actions} onClose={() => setProfileId(null)} /> : null}
              {contactId ? (
                <ContactModal key={`contact-${contactId}`} id={contactId} brand={current.name} onClose={() => setContactId(null)} onSent={(id) => setContacted((s) => new Set(s).add(id))} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
