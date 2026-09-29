"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WsIcon } from "@/app/dashboard/workspace/WorkspaceIcons";
import { MinoCompanion } from "@/components/MinoCompanion";
import { PlatformLogo, type PlatformName } from "@/components/PlatformLogo";
import { PayoutsPulse, type PulseBucket } from "@/app/dashboard/PayoutsPulse";
import { RevenueChart } from "@/app/dashboard/SampleCampaignPreview";
import { CountUp, prefersReducedMotion, useLiveFeed } from "@/app/dashboard/sample-motion";
import "@/app/dashboard/home-mino.css";
import "./premium-demo.css";

// Landing preview of the brand dashboard, shown as a program at full speed:
// thousands of creators, millions in tracked sales. Same shell, rail and views
// as the real dashboard. People and brands are fictional; faces and products
// are free Unsplash photos, videos are free Mixkit clips, all hotlinked.

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

type Creator = {
  id: string;
  name: string;
  handle: string;
  platform: PlatformName;
  niche: string;
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
const BY_ID = new Map(CREATORS.map((c) => [c.id, c]));

type Campaign = {
  id: string;
  name: string;
  cover: string;
  status: "live" | "gifting" | "draft";
  started: string;
  revenue: number;
  sales: number;
  creators: number;
  conversion: number;
  crew: string[];
  trend: number[];
};

const CAMPAIGNS: Campaign[] = [
  { id: "serum", name: "Glow Serum launch", cover: "1576426863848-c21f53c60b19", status: "live", started: "Sep 2", revenue: 1_184_320, sales: 18_402, creators: 342, conversion: 4.8, crew: ["luna", "sarah", "maya", "zoe"], trend: [4, 6, 5, 8, 9, 12, 14, 13, 17, 21] },
  { id: "bf", name: "Black Friday bundle", cover: "1631730486572-226d1f595b68", status: "live", started: "Sep 14", revenue: 742_610, sales: 11_290, creators: 268, conversion: 5.6, crew: ["sarah", "ines", "chloe", "ava"], trend: [2, 3, 3, 5, 7, 8, 11, 15, 19, 24] },
  { id: "spf", name: "Summer SPF drop", cover: "1623143445418-40c192fa3d11", status: "live", started: "Aug 21", revenue: 486_930, sales: 7_604, creators: 191, conversion: 3.9, crew: ["zoe", "nora", "jade", "luna"], trend: [9, 11, 10, 12, 11, 13, 12, 14, 13, 15] },
  { id: "night", name: "Night Repair gifting", cover: "1718490953028-021d352b14fd", status: "gifting", started: "Sep 9", revenue: 263_480, sales: 4_122, creators: 124, conversion: 4.2, crew: ["maya", "chloe", "ines", "mike"], trend: [1, 2, 4, 4, 6, 7, 7, 9, 10, 12] },
  { id: "oil", name: "Body oil UGC", cover: "1631729371254-42c2892f0e6e", status: "live", started: "Aug 30", revenue: 170_050, sales: 2_689, creators: 88, conversion: 3.4, crew: ["ava", "jade", "nora", "mike"], trend: [3, 4, 4, 5, 6, 6, 7, 8, 8, 9] },
];
const TOTAL_REVENUE = CAMPAIGNS.reduce((s, c) => s + c.revenue, 0);
const TOTAL_SALES = 48_217;
const NEW_CAMPAIGN_COVER = "1741896135512-084b251887f7";

const LISTS = [
  { name: "Skincare top 1%", count: 48, crew: ["luna", "ines", "sarah", "maya"] },
  { name: "Q4 gifting wave", count: 126, crew: ["chloe", "maya", "zoe", "ava"] },
  { name: "Fitness closers", count: 37, crew: ["mike", "nora", "jade", "zoe"] },
  { name: "Ready to sign", count: 212, crew: ["sarah", "ava", "luna", "chloe"] },
];

const INTEGRATIONS = [
  { name: "Shopify", logo: "/shopify-logo.svg", note: "Orders and discount codes synced live", on: true },
  { name: "TikTok", logo: "/tiktok-logo.svg", note: "Creator stats and videos", on: true },
  { name: "Instagram", logo: "/instagram-logo.svg", note: "Profiles, reels and reach", on: true },
  { name: "Gmail", logo: "/gmail-logo.svg", note: "Outreach from your own inbox", on: true },
  { name: "Stripe", logo: "/stripe-logo.svg", note: "Commission payouts", on: true },
  { name: "Notion", logo: "/notion-logo.svg", note: "Briefs and scripts", on: false },
  { name: "Google Drive", logo: "/google-drive-logo.svg", note: "Raw creator footage", on: true },
  { name: "Zapier", logo: "/zapier-logo.svg", note: "Automate anything", on: false },
  { name: "Make", logo: "/make-logo.svg", note: "Visual workflows", on: false },
];

// ── Numbers ───────────────────────────────────────────────────
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => usd0.format(Math.round(n));
const cents = (n: number) => usd2.format(n);
const int = (n: number) => Math.round(n).toLocaleString("en-US");
function compact(n: number, prefix = ""): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${prefix}${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}K`;
  return `${prefix}${Math.round(n)}`;
}

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
  { id: "7d", label: "7D", days: 7, total: 842_610 },
  { id: "30d", label: "30D", days: 30, total: TOTAL_REVENUE },
  { id: "90d", label: "90D", days: 90, total: 6_912_480 },
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

// ── Live events ───────────────────────────────────────────────
type LiveEvent =
  | { type: "sale"; who: string; amount: number; campaign: string }
  | { type: "video"; who: string; views: number }
  | { type: "signed"; who: string }
  | { type: "joined"; who: string }
  | { type: "paid"; count: number; amount: number };

const EVENTS: LiveEvent[] = [
  { type: "sale", who: "luna", amount: 184, campaign: "Glow Serum launch" },
  { type: "video", who: "zoe", views: 1_240_000 },
  { type: "sale", who: "sarah", amount: 312, campaign: "Black Friday bundle" },
  { type: "signed", who: "maya" },
  { type: "sale", who: "mike", amount: 96, campaign: "Summer SPF drop" },
  { type: "paid", count: 38, amount: 24_860 },
  { type: "sale", who: "ines", amount: 148, campaign: "Glow Serum launch" },
  { type: "joined", who: "chloe" },
  { type: "sale", who: "ava", amount: 226, campaign: "Body oil UGC" },
  { type: "video", who: "luna", views: 684_000 },
  { type: "sale", who: "nora", amount: 132, campaign: "Black Friday bundle" },
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
  return (
    <svg className="pd-verified" width="13" height="13" viewBox="0 0 24 24" aria-label="Verified">
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

function eventLine(e: LiveEvent): { face?: string; text: ReactNode; value?: string; tone: string } {
  const first = (id: string) => BY_ID.get(id)?.name.split(" ")[0] ?? "";
  switch (e.type) {
    case "sale":
      return { face: e.who, tone: "sale", text: <><b>{first(e.who)}</b> drove a sale · {e.campaign}</>, value: `+${money(e.amount)}` };
    case "video":
      return { face: e.who, tone: "video", text: <><b>{first(e.who)}</b> posted a video</>, value: `${compact(e.views)} views` };
    case "signed":
      return { face: e.who, tone: "signed", text: <><b>{first(e.who)}</b> signed the contract</> };
    case "joined":
      return { face: e.who, tone: "joined", text: <><b>{first(e.who)}</b> joined your program</> };
    case "paid":
      return { tone: "paid", text: <>Payout sent to <b>{e.count} creators</b></>, value: money(e.amount) };
  }
}

// ── Mino ──────────────────────────────────────────────────────
const ROTATING = [
  "Find micro fitness creators on TikTok",
  "Skincare creators who already sell, 100K+",
  "Who drove the most sales this week?",
  "Pay every creator owed this month",
  "Create a campaign for the holiday drop",
];

function useTypedPlaceholder(active: boolean): string {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [back, setBack] = useState(false);
  const full = ROTATING[i];
  useEffect(() => {
    if (!active) return;
    const done = back ? n === 0 : n >= full.length;
    const t = window.setTimeout(
      () => {
        if (!back && n >= full.length) return setBack(true);
        if (back && n === 0) {
          setBack(false);
          setI((x) => (x + 1) % ROTATING.length);
          return;
        }
        setN((x) => x + (back ? -1 : 1));
      },
      done ? (back ? 300 : 2000) : back ? 20 : 50,
    );
    return () => window.clearTimeout(t);
  }, [n, back, full.length, active]);
  return active ? full.slice(0, n) : ROTATING[0];
}

const HOME_CHIPS: { text: string; icon: ReactNode }[] = [
  { text: "Find micro fitness creators on TikTok", icon: <PlatformLogo platform="tiktok" size={15} /> },
  { text: "Find beauty creators on Instagram", icon: <PlatformLogo platform="instagram" size={15} /> },
  { text: "Create a new campaign", icon: <IconMega /> },
  {
    text: "Pay every creator owed",
    icon: (
      <Svg size={15}>
        <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
        <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
      </Svg>
    ),
  },
];

function minoMatches(q: string): Creator[] {
  const s = q.toLowerCase();
  const pick = (test: (c: Creator) => boolean) => CREATORS.filter(test);
  let hits: Creator[] = [];
  if (/fit|gym|sport/.test(s)) hits = pick((c) => c.niche === "Fitness");
  else if (/skin|serum|spf/.test(s)) hits = pick((c) => c.niche === "Skincare");
  else if (/beaut|makeup|make-up/.test(s)) hits = pick((c) => ["Beauty", "Makeup", "Skincare"].includes(c.niche));
  else if (/food|recipe|cook/.test(s)) hits = pick((c) => c.niche === "Food");
  if (/tiktok/.test(s)) hits = (hits.length ? hits : CREATORS).filter((c) => c.platform === "tiktok");
  else if (/insta/.test(s)) hits = (hits.length ? hits : CREATORS).filter((c) => c.platform === "instagram");
  const rest = CREATORS.filter((c) => !hits.includes(c));
  return [...hits, ...rest].slice(0, 6);
}

function MinoResults({ query, onOpenCreators }: { query: string; onOpenCreators: () => void }) {
  const [t, setT] = useState(() => (prefersReducedMotion() ? 99_999 : 0));
  const [saved, setSaved] = useState(false);
  const results = useMemo(() => minoMatches(query), [query]);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setT(elapsed);
      if (elapsed > 4200) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, []);
  const steps = ["Reading your request", "Scanning 1,284,302 creators", "Ranking by real sales and views"];
  const scanned = Math.min(1_284_302, Math.round((t / 1500) * 1_284_302));
  const showResults = t > 1650;
  return (
    <div className="pd-page pd-mino">
      <div className="pd-mino__me">
        <span>{query}</span>
        <Face id={OWNER.face} size={28} />
      </div>
      <div className="pd-mino__bot">
        <span className="pd-mino__avatar">
          <MinoCompanion size={26} />
        </span>
        <div className="pd-mino__body">
          <ul className="pd-mino__steps">
            {steps.map((s, i) => {
              const done = t > 450 + i * 450;
              return (
                <li key={s} className={done ? "is-done" : t > i * 450 ? "is-active" : ""}>
                  <span className="pd-mino__tick">{done ? <IconCheck size={11} /> : null}</span>
                  {i === 1 && !done ? `Scanning ${int(scanned)} creators` : s}
                </li>
              );
            })}
          </ul>
          {showResults ? (
            <>
              <p className="pd-mino__answer">
                Found <b>{results.length} creators</b> who already sell in this niche. Together they drove{" "}
                <b>{money(results.reduce((s, c) => s + c.revenue, 0))}</b> for brands like yours.
              </p>
              <div className="pd-mino__grid">
                {results.map((c, i) => (
                  <article key={c.id} className="pd-mcard" style={{ animationDelay: `${i * 110}ms` }}>
                    <div className="pd-mcard__media">
                      <Clip id={c.video} />
                      <span className="pd-mcard__views">
                        <IconPlay /> {compact(c.avgViews)}
                      </span>
                    </div>
                    <div className="pd-mcard__who">
                      <Face id={c.face} size={30} />
                      <span>
                        <strong>
                          {c.name} <Verified />
                        </strong>
                        <small>
                          <PlatformLogo platform={c.platform} size={11} /> @{c.handle}
                        </small>
                      </span>
                    </div>
                    <div className="pd-mcard__stats">
                      <span>
                        <b>{compact(c.followers)}</b> followers
                      </span>
                      <span>
                        <b>{c.engagement}%</b> eng.
                      </span>
                      <span className="is-money">
                        <b>{compact(c.revenue, "$")}</b> sold
                      </span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="pd-mino__actions">
                <button type="button" className={`pd-btn is-primary${saved ? " is-done" : ""}`} onClick={() => setSaved(true)}>
                  {saved ? (
                    <>
                      <IconCheck /> Saved to “Ready to sign”
                    </>
                  ) : (
                    `Save all ${results.length} to a list`
                  )}
                </button>
                <button type="button" className="pd-btn" onClick={onOpenCreators}>
                  Open in Creators
                </button>
              </div>
            </>
          ) : null}
        </div>
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
  const [text, setText] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("30d");
  const placeholder = useTypedPlaceholder(typing && !text);
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
        <h1 className="hm-hero__title">Hi {OWNER.first}, what should Mino do?</h1>
        <p className="hm-hero__sub">Mino finds creators across TikTok and Instagram, starts campaigns and pays everyone owed.</p>
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
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || "Ask Mino"} aria-label="Ask Mino" />
            <button type="submit" className="hm-hero__send" disabled={!text.trim()} aria-label="Send to Mino">
              <IconArrowUp />
            </button>
          </div>
        </form>
        <div className="hm-hero__chips">
          {HOME_CHIPS.map((c, i) => (
            <button key={c.text} type="button" className="hm-chip" style={{ ["--i" as string]: i }} onClick={() => onAsk(c.text)}>
              <span className="hm-chip__icon">{c.icon}</span>
              {c.text}
            </button>
          ))}
        </div>
      </section>

      <div className="pd-home__body">
        <div className="hm-section-title">
          <h2>Your program</h2>
          <span>
            <i className="pd-live-dot" aria-hidden /> Live · updated just now
          </span>
        </div>
        <div className="hm-metrics pd-metrics">
          <button type="button" className="hm-metric is-accent pd-metric" style={{ ["--i" as string]: 0 }} onClick={() => onGo("campaigns")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">Revenue</span>
              <span className="hm-metric__icon">
                <IconBag />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={revenue} format={(n) => compact(n, "$")} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up is-light">▲ 38.4%</span>
              <Spark values={[3, 4, 4, 6, 7, 9, 8, 11, 13, 16]} tone="white" />
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 1 }} onClick={() => onGo("discovery")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">Creators</span>
              <span className="hm-metric__icon">
                <WsIcon name="users" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={1_284} format={int} />
            </div>
            <div className="pd-metric__foot">
              <Stack ids={["luna", "sarah", "maya", "zoe"]} size={20} />
              <span className="pd-up">+86 new</span>
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 2 }} onClick={() => onGo("campaigns")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">Sales</span>
              <span className="hm-metric__icon">
                <WsIcon name="billing" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={sales} format={int} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up">▲ 21.7%</span>
              <Spark values={[5, 6, 5, 7, 8, 8, 10, 11, 12, 14]} />
            </div>
          </button>
          <button type="button" className="hm-metric pd-metric" style={{ ["--i" as string]: 3 }} onClick={() => onGo("payouts")}>
            <div className="hm-metric__top">
              <span className="hm-metric__label">Paid out</span>
              <span className="hm-metric__icon">
                <WsIcon name="payit" size={16} />
              </span>
            </div>
            <div className="hm-metric__value">
              <CountUp value={PAID_START} format={(n) => compact(n, "$")} />
            </div>
            <div className="pd-metric__foot">
              <span className="pd-up">14 live campaigns</span>
            </div>
          </button>
        </div>

        <div className="pd-row">
          <section className="pd-card pd-revenue">
            <header className="pd-card__head">
              <div>
                <span className="pd-card__label">Revenue from creators</span>
                <div className="pd-revenue__total">
                  <CountUp value={p.total + (period === "30d" ? bonus : 0)} format={money} />
                  <span className="pd-up">▲ {period === "7d" ? "12.9" : period === "30d" ? "38.4" : "71.2"}%</span>
                </div>
              </div>
              <div className="pd-seg" role="tablist" aria-label="Period">
                {PERIODS.map((x) => (
                  <button key={x.id} type="button" role="tab" aria-selected={period === x.id} className={period === x.id ? "is-active" : ""} onClick={() => setPeriod(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </header>
            <RevenueChart key={period} lang="en" days={days} />
          </section>

          <section className="pd-card pd-feed">
            <header className="pd-card__head">
              <span className="pd-card__title">
                <i className="pd-live-dot" aria-hidden /> Live activity
              </span>
              <span className="pd-card__meta">{int(sales)} orders</span>
            </header>
            <ul className="pd-feed__list" ref={feedHost}>
              {feed.map(({ item, key }, i) => {
                const line = eventLine(item);
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
                      <small>{i === 0 ? "just now" : `${i * 3} min ago`}</small>
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
              <span className="pd-card__title">Top creators this month</span>
              <button type="button" className="pd-link" onClick={() => onGo("discovery")}>
                See all
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
                  <b className="pd-leaders__value">{compact(c.revenue, "$")}</b>
                </li>
              ))}
            </ol>
          </section>
          <section className="pd-card">
            <header className="pd-card__head">
              <span className="pd-card__title">Fresh content</span>
              <button type="button" className="pd-link" onClick={() => onGo("content")}>
                Library
              </button>
            </header>
            <div className="pd-reels">
              {["zoe", "luna", "maya"].map((id) => {
                const c = BY_ID.get(id)!;
                return (
                  <button key={id} type="button" className="pd-reel" onClick={() => onGo("content")}>
                    <Clip id={c.video} />
                    <span className="pd-reel__top">
                      <IconPlay /> {compact(c.avgViews * 1.8)}
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
const PRESETS = [
  { id: "all", label: "All creators" },
  { id: "sellers", label: "Top sellers" },
  { id: "viral", label: "Viral videos" },
  { id: "gems", label: "Weekly gems" },
  { id: "ready", label: "Ready to contact" },
] as const;
const FILTERS = ["Niche", "Followers", "Avg views", "Engagement", "Country", "With email", "Verified"];

function DiscoveryPage() {
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("all");
  const [platform, setPlatform] = useState<PlatformName | "all">("all");
  const [mode, setMode] = useState<"creators" | "videos">("creators");
  const [saved, setSaved] = useState<Set<string>>(() => new Set(["luna"]));
  const [invited, setInvited] = useState<Set<string>>(() => new Set());

  const list = useMemo(() => {
    let l = CREATORS.filter((c) => platform === "all" || c.platform === platform);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((c) => `${c.name} ${c.handle} ${c.niche} ${c.country}`.toLowerCase().includes(s));
    if (preset === "sellers") l = [...l].sort((a, b) => b.revenue - a.revenue);
    if (preset === "viral") l = [...l].sort((a, b) => b.avgViews - a.avgViews);
    if (preset === "gems") l = [...l].sort((a, b) => b.engagement - a.engagement);
    if (preset === "ready") l = l.filter((c) => !invited.has(c.id));
    return l;
  }, [q, preset, platform, invited]);

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
          Creators <span className="pd-badge">1,284,302 creators</span>
        </h1>
        <label className="pd-search">
          <WsIcon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators, @handles, niches…" aria-label="Search creators" />
        </label>
        <div className="pd-head__actions">
          <span className="pd-chip-btn">
            <WsIcon name="list" size={14} /> My lists
          </span>
          <span className="pd-chip-btn is-dark">
            <WsIcon name="invite" size={14} /> Outreach
          </span>
        </div>
      </div>

      <div className="pd-tabs">
        <div className="pd-tabs__left">
          {PRESETS.map((x) => (
            <button key={x.id} type="button" className={preset === x.id ? "is-active" : ""} onClick={() => setPreset(x.id)}>
              {x.label}
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
            <WsIcon name="users" size={13} /> Creators
          </button>
          <button type="button" className={mode === "videos" ? "is-active" : ""} onClick={() => setMode("videos")}>
            <WsIcon name="camera" size={13} /> Videos
          </button>
        </div>
        {FILTERS.map((f) => (
          <span key={f} className="pd-filter">
            {f}
            <WsIcon name="chevron" size={11} />
          </span>
        ))}
      </div>

      {mode === "creators" ? (
        <div className="pd-cgrid" key={`${preset}-${platform}`}>
          {list.map((c, i) => (
            <article key={c.id} className="pd-ccard" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="pd-ccard__media">
                <Clip id={c.video} />
                <span className="pd-ccard__niche">{c.niche}</span>
                <span className="pd-ccard__views">
                  <IconPlay /> {compact(c.avgViews)} avg
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
                  <b>{compact(c.followers)}</b>
                  <small>Followers</small>
                </span>
                <span>
                  <b>{c.engagement}%</b>
                  <small>Engagement</small>
                </span>
                <span className="is-money">
                  <b>{compact(c.revenue, "$")}</b>
                  <small>Sales driven</small>
                </span>
              </div>
              <div className="pd-ccard__actions">
                <button type="button" className={`pd-btn is-icon${saved.has(c.id) ? " is-saved" : ""}`} aria-pressed={saved.has(c.id)} aria-label="Save" onClick={() => setSaved((s) => toggle(s, c.id))}>
                  <IconHeart />
                </button>
                <button type="button" className={`pd-btn is-primary is-grow${invited.has(c.id) ? " is-done" : ""}`} onClick={() => setInvited((s) => toggle(s, c.id))}>
                  {invited.has(c.id) ? (
                    <>
                      <IconCheck /> Invited
                    </>
                  ) : (
                    "Invite to campaign"
                  )}
                </button>
              </div>
            </article>
          ))}
          {list.length === 0 ? <p className="pd-empty">No creator matches “{q}”. Try another niche.</p> : null}
        </div>
      ) : (
        <div className="pd-vgrid">
          {list.map((c, i) => (
            <article key={c.id} className="pd-vcard" style={{ animationDelay: `${i * 60}ms` }}>
              <Clip id={c.video} />
              <span className="pd-vcard__top">
                <IconPlay /> {compact(c.avgViews * 2.3)}
              </span>
              <div className="pd-vcard__foot">
                <Face id={c.face} size={22} ring />
                <span>@{c.handle}</span>
                <b>{compact(c.revenue / 6, "$")}</b>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ListsPage({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>My lists</h1>
      </div>
      <div className="pd-lists">
        {LISTS.map((l, i) => (
          <button key={l.name} type="button" className="pd-list" style={{ animationDelay: `${i * 70}ms` }} onClick={onOpen}>
            <Stack ids={l.crew} size={34} more={`+${l.count - l.crew.length}`} />
            <strong>{l.name}</strong>
            <span>{l.count} creators</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Campaigns ─────────────────────────────────────────────────
function CampaignsPage({ campaigns, onCreate, fresh }: { campaigns: Campaign[]; onCreate: () => void; fresh: string | null }) {
  const [tab, setTab] = useState<"active" | "gifting" | "drafts">("active");
  const [open, setOpen] = useState<string | null>("serum");
  const shown = campaigns.filter((c) => (tab === "active" ? c.status === "live" : tab === "gifting" ? c.status === "gifting" : c.status === "draft"));
  const live = campaigns.filter((c) => c.status !== "draft");
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>Campaigns</h1>
        <p className="pd-head__sub">Manage your campaigns and track creator performance and commissions.</p>
        <div className="pd-head__actions">
          <button
            type="button"
            className="pd-btn is-dark"
            onClick={() => {
              onCreate();
              setTab("drafts");
            }}
          >
            <WsIcon name="plus" size={14} /> Create a campaign
          </button>
        </div>
      </div>

      <div className="pd-tiles">
        <div className="pd-tile" style={{ animationDelay: "0ms" }}>
          <span>Revenue</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.revenue, 0)} format={money} />
          </b>
          <small className="pd-up">▲ 38.4% vs last month</small>
        </div>
        <div className="pd-tile" style={{ animationDelay: "70ms" }}>
          <span>Creators on campaigns</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.creators, 0)} format={int} />
          </b>
          <Stack ids={["luna", "sarah", "maya", "mike", "zoe"]} size={20} />
        </div>
        <div className="pd-tile" style={{ animationDelay: "140ms" }}>
          <span>Orders</span>
          <b>
            <CountUp value={live.reduce((s, c) => s + c.sales, 0)} format={int} />
          </b>
          <small>4.7% avg conversion</small>
        </div>
      </div>

      <div className="pd-subtabs">
        {(
          [
            ["active", `Active (${campaigns.filter((c) => c.status === "live").length})`],
            ["gifting", `Gifting (${campaigns.filter((c) => c.status === "gifting").length})`],
            ["drafts", `Drafts (${campaigns.filter((c) => c.status === "draft").length})`],
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
                <strong>{c.name}</strong>
                <small>
                  {c.status === "draft" ? "Draft · not launched" : `Started ${c.started}`} · {c.creators} creators
                </small>
              </span>
              <span className={`pd-pill is-${c.status}`}>{c.status === "live" ? "Live" : c.status === "gifting" ? "Gifting" : "Draft"}</span>
              <Stack ids={c.crew} size={22} />
              <span className="pd-camp__num">
                <b>{c.revenue ? money(c.revenue) : "—"}</b>
                <small>{c.sales ? `${int(c.sales)} orders` : "No orders yet"}</small>
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
                      <b>{money(c.revenue * share)}</b>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
        {shown.length === 0 ? <p className="pd-empty">Nothing here yet.</p> : null}
      </div>
    </div>
  );
}

function ContentPage() {
  const [approved, setApproved] = useState<Set<string>>(() => new Set(["zoe", "luna", "sarah", "mike"]));
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>
          Content <span className="pd-badge">2,318 videos</span>
        </h1>
        <p className="pd-head__sub">Every video your creators delivered, with ad rights attached.</p>
      </div>
      <div className="pd-vgrid is-content">
        {CREATORS.map((c, i) => {
          const ok = approved.has(c.id);
          return (
            <article key={c.id} className="pd-vcard" style={{ animationDelay: `${i * 60}ms` }}>
              <Clip id={c.video} />
              <span className={`pd-vcard__status${ok ? " is-ok" : ""}`}>{ok ? "Approved" : "To review"}</span>
              <div className="pd-vcard__foot">
                <Face id={c.face} size={22} ring />
                <span>@{c.handle}</span>
                {ok ? (
                  <b>{compact(c.avgViews * 1.6)}</b>
                ) : (
                  <button type="button" className="pd-approve" onClick={() => setApproved((s) => new Set(s).add(c.id))}>
                    <IconCheck size={12} /> Approve
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
  const buckets = useMemo(payoutBuckets, []);
  const owed = CREATORS.filter((c) => !paid.has(c.id)).reduce((s, c) => s + c.owed, 0);
  const paidNow = PAID_START + (OWED_START - owed);
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>Overview</h1>
        <div className="pd-head__actions">
          <button type="button" className={`pd-btn is-primary${owed === 0 ? " is-done" : ""}`} onClick={onPayAll} disabled={owed === 0}>
            {owed === 0 ? (
              <>
                <IconCheck /> Everyone is paid
              </>
            ) : (
              <>Pay all · {money(owed)}</>
            )}
          </button>
        </div>
      </div>
      <PayoutsPulse
        title="Commissions earned"
        amount={PAYOUT_EARNED}
        salesLine={`${int(TOTAL_SALES)} sales in period`}
        periodControl={
          <span className="pd-period">
            Last 30 days <WsIcon name="chevron" size={12} />
          </span>
        }
        buckets={buckets}
        owed={owed}
        owedHint={`${CREATORS.filter((c) => !paid.has(c.id)).length} creators pending`}
        paid={paidNow}
        paidLabel="Paid in period"
        paidHint="Payments in period"
        avgPerSale={PAYOUT_EARNED / TOTAL_SALES}
        salesCount={TOTAL_SALES}
        format={money}
      />
      <section className="pd-card pd-card--flush">
        <div className="pd-table">
          <div className="pd-table__row is-head">
            <span>Creator</span>
            <span>Amount owed</span>
            <span>Payment</span>
            <span>Total earned</span>
            <span>Sales</span>
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
                <span className="pd-num">{done ? "$0" : money(c.owed)}</span>
                <span>
                  <span className="pd-method">{c.method}</span>
                </span>
                <span className="pd-num">{money(c.revenue * 0.12 + (done ? c.owed : 0))}</span>
                <span className="pd-num">{int(c.sales)}</span>
                <span className="pd-right">
                  <button type="button" className={`pd-btn is-sm${done ? " is-done" : " is-primary"}`} disabled={done} onClick={() => onPay(c.id)}>
                    {done ? (
                      <>
                        <IconCheck size={12} /> Paid
                      </>
                    ) : (
                      "Pay"
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
  const rows = CREATORS.flatMap((c, i) => [
    { c, amount: Math.round(c.owed * 1.9), date: `Sep ${28 - i}`, ref: `PO-${48213 - i * 7}` },
    { c, amount: Math.round(c.owed * 1.4), date: `Aug ${29 - i}`, ref: `PO-${46102 - i * 5}` },
  ]).slice(0, 14);
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>Payments</h1>
        <p className="pd-head__sub">{money(PAID_START)} paid to creators in the last 30 days.</p>
      </div>
      <section className="pd-card pd-card--flush">
        <div className="pd-table is-tx">
          <div className="pd-table__row is-head">
            <span>Creator</span>
            <span>Amount</span>
            <span>Method</span>
            <span>Date</span>
            <span>Status</span>
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
              <span className="pd-num">{money(r.amount)}</span>
              <span>
                <span className="pd-method">{r.c.method}</span>
              </span>
              <span className="pd-muted">{r.date}</span>
              <span>
                <span className="pd-pill is-live">Paid</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntegrationsPage() {
  const [on, setOn] = useState(() => new Set(INTEGRATIONS.filter((x) => x.on).map((x) => x.name)));
  return (
    <div className="pd-page pd-pad">
      <div className="pd-head">
        <h1>Integrations</h1>
        <p className="pd-head__sub">Connect your store and tools. Sales, codes and payouts stay in sync.</p>
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
                <small>{x.note}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={`${x.name} connection`}
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
const RAIL: { id: Rail; label: string; icon: IconName; page: Page }[] = [
  { id: "home", label: "Home", icon: "home", page: "home" },
  { id: "findit", label: "Creators", icon: "findit", page: "discovery" },
  { id: "trackit", label: "Campaigns", icon: "trackit", page: "campaigns" },
  { id: "payit", label: "Payouts", icon: "payit", page: "payouts" },
  { id: "integrations", label: "Integrations", icon: "integrations", page: "integrations" },
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

const CHATS = ["Top skincare creators in France", "Black Friday brief", "Who to pay this week"];

const SEARCH_ITEMS: { label: string; meta: string; page: Page; face?: string }[] = [
  { label: "Creators", meta: "Search", page: "discovery" },
  { label: "Campaigns", meta: "Track", page: "campaigns" },
  { label: "Payouts", meta: "Pay", page: "payouts" },
  { label: "Content", meta: "Videos", page: "content" },
  { label: "Integrations", meta: "Shopify, TikTok…", page: "integrations" },
  ...CREATORS.map((c) => ({ label: c.name, meta: `@${c.handle}`, page: "discovery" as Page, face: c.face })),
];

export function PremiumWorkspaceDemo() {
  const [page, setPage] = useState<Page>("home");
  const rail = PAGE_RAIL[page];
  const lastPage = useRef<Partial<Record<Rail, Page>>>({});
  const [brand, setBrand] = useState(BRANDS[0].id);
  const [brandOpen, setBrandOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [minoQuery, setMinoQuery] = useState(CHATS[0]);
  const [minoKey, setMinoKey] = useState(0);
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
    setPage(next);
    setSearchOpen(false);
  };

  const ask = (q: string) => {
    const s = q.toLowerCase();
    if (/\bpay\b|payout/.test(s)) return go("payouts");
    if (/campaign/.test(s)) return createCampaign();
    setMinoQuery(q);
    setMinoKey((k) => k + 1);
    go("mino");
  };

  const createCampaign = () => {
    const id = `new-${Date.now()}`;
    setCampaigns((list) => [
      { id, name: "Holiday gift set", cover: NEW_CAMPAIGN_COVER, status: "draft", started: "", revenue: 0, sales: 0, creators: 0, conversion: 0, crew: ["luna", "sarah", "zoe"], trend: [] },
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
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".ws-workspace-switcher")) setBrandOpen(false);
      if (!t.closest(".pd-profile")) setProfileOpen(false);
      if (!t.closest(".ws-search-wrap")) setSearchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBrandOpen(false);
        setProfileOpen(false);
        setSearchOpen(false);
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
  const hits = search.trim() ? SEARCH_ITEMS.filter((x) => `${x.label} ${x.meta}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [];
  const toastCreator = toast ? BY_ID.get(toast.who) : null;

  const sidebar: { title: string; action?: { label: string; run: () => void }; sections: { label: string; links: { label: string; icon: IconName; page: Page }[] }[] } =
    rail === "findit"
      ? {
          title: "Creators",
          sections: [
            { label: "Discover", links: [{ label: "Search", icon: "findit", page: "discovery" }] },
            { label: "Manage", links: [{ label: "My lists", icon: "users", page: "lists" }] },
          ],
        }
      : rail === "trackit"
        ? {
            title: "Campaigns",
            action: { label: "Create a campaign", run: createCampaign },
            sections: [
              {
                label: "Track",
                links: [
                  { label: "Campaigns", icon: "grid", page: "campaigns" },
                  { label: "Content", icon: "camera", page: "content" },
                ],
              },
            ],
          }
        : rail === "payit"
          ? {
              title: "Payouts",
              sections: [
                {
                  label: "Pay it",
                  links: [
                    { label: "To pay", icon: "payit", page: "payouts" },
                    { label: "Payments", icon: "list", page: "transactions" },
                  ],
                },
              ],
            }
          : rail === "integrations"
            ? { title: "Integrations", sections: [{ label: "Connected", links: [{ label: "Integrations", icon: "integrations", page: "integrations" }] }] }
            : { title: "Home", sections: [] };

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
              <div className="ws-workspace-menu__label">Workspaces</div>
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
              placeholder="Search creators, campaigns…"
              aria-label="Search"
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (search.trim()) setSearchOpen(true);
              }}
            />
            <span className="ws-search-kbd">⌘K</span>
            <button type="button" className="ws-ai-pill" onClick={() => go("home")}>
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
              {hits.length === 0 ? <div className="pd-search-empty">No results</div> : null}
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
              aria-label="Profile"
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
                    <div className="ws-menu__meta">Scale plan · Online</div>
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
                onClick={() => go(item.id === "home" ? "home" : (lastPage.current[item.id] ?? item.page))}
                title={item.label}
              >
                <WsIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="ws-rail__foot">
            <button type="button" className="ws-rail__item" title="Help">
              <WsIcon name="help" size={18} />
              <span>Help</span>
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
                    <button type="button" className="ws-sidebar__link ws-spaces-new" onClick={() => go("home")}>
                      <WsIcon name="plus" size={15} />
                      <span>New chat</span>
                    </button>
                    <div className="ws-sidebar__section">
                      <div className="ws-sidebar__section-label">Chats</div>
                      {CHATS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`ws-sidebar__link${page === "mino" && minoQuery === c ? " is-active" : ""}`}
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
                <span className="pd-side-foot__label">This month</span>
                <b>
                  <CountUp value={live.revenue} format={money} />
                </b>
                <span className="pd-bar is-accent">
                  <i style={{ ["--w" as string]: "78%" }} />
                </span>
                <small>78% of your $3.6M goal</small>
              </div>
            </aside>

            <div className="ws-main">
              <div className="ws-content pd-content">
                <div className="pd-view" key={page === "mino" ? `mino-${minoKey}` : page}>
                  {page === "home" ? <HomePage revenue={live.revenue} sales={live.sales} onAsk={ask} onGo={go} typing={inView} /> : null}
                  {page === "mino" ? <MinoResults query={minoQuery} onOpenCreators={() => go("discovery")} /> : null}
                  {page === "discovery" ? <DiscoveryPage /> : null}
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
                      New sale <em>+{money(toast.amount)}</em>
                    </strong>
                    <small>
                      {toastCreator.name} · {toast.campaign}
                    </small>
                  </span>
                  <span className="pd-toast__shopify">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/shopify-logo.svg" alt="" width={16} height={16} />
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
