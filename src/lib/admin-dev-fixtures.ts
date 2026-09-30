// Local preview data for the staff console. Only served by the admin API when
// `adminDevPreview()` is true (next dev + NEXT_PUBLIC_DEV_BYPASS_PLAN, no database).
// Every person, email and amount here is fictional.
import type { AdminContext } from "@/lib/admin-auth";
import { acquisitionFunnel, type AcqProfile } from "@/lib/admin-acquisition";
import { countBy, emptyDays, type DayPoint } from "@/lib/admin-aggregate";
import type { ActivityData, AuditData, OverviewData, RequestsData, SystemCheck, SystemData } from "@/lib/admin-types";

function wave(days: number, base: number, amp: number, trend = 0, seed = 1): DayPoint[] {
  return emptyDays(days).map((p, i) => ({
    day: p.day,
    value: Math.max(0, Math.round(base + trend * i + amp * Math.sin((i + seed) / 2.3) + amp * 0.5 * Math.cos((i * seed) / 3.1))),
  }));
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const PEOPLE = [
  ["Maison Lune", "hello@maisonlune.example", "pro", "brand", "active"],
  ["Atelier Nord", "team@ateliernord.example", "scale", "brand", "active"],
  ["Sora Skin", "ops@soraskin.example", "basic", "brand", "active"],
  ["Kinetic Labs", "growth@kinetic.example", "pro", "brand", "comped"],
  ["Pâtisserie Clé", "contact@patisserie.example", "free", "brand", "inactive"],
  ["Nora Diallo", "nora@creator.example", "free", "creator", "inactive"],
  ["Luna Park", "luna@creator.example", "free", "creator", "inactive"],
  ["Verde Home", "admin@verde.example", "basic", "brand", `gifted:${new Date(Date.now() + 12 * 86_400_000).toISOString()}`],
  ["Tom Becker", "tom@creator.example", "free", "creator", "inactive"],
  ["Orbit Coffee", "hi@orbitcoffee.example", "pro", "brand", "whop:mem_demo_42"],
  ["Inès Moreau", "ines@creator.example", "free", "creator", "inactive"],
  ["Studio Halo", "studio@halo.example", "free", "brand", "inactive"],
] as const;

export function devUsers() {
  return PEOPLE.map(([name, email, plan, type, status], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    email,
    full_name: name,
    username: name.toLowerCase().replace(/[^a-z]+/g, "."),
    plan,
    role: i === 0 ? "admin" : "user",
    subscription_active: status === "active" || status === "comped" || status.startsWith("gifted:") || status.startsWith("whop:"),
    subscription_status: status,
    stripe_customer_id: status === "active" ? `cus_demo_${i}` : null,
    stripe_subscription_id: status === "active" ? `sub_demo_${i}` : null,
    account_type: type,
    created_at: daysAgo(3 + i * 9),
  }));
}

// Synthetic brand signups: [source, signups, onboarded, paying, of which in the last 30 days].
const DEV_SOURCES: [string, number, number, number, number][] = [
  ["tiktok", 168, 121, 38, 31],
  ["instagram", 112, 79, 24, 22],
  ["google", 46, 35, 11, 6],
  ["friend", 31, 26, 9, 4],
  ["youtube", 18, 12, 3, 5],
  ["twitter", 11, 6, 1, 2],
  ["other", 9, 5, 1, 1],
  ["", 17, 4, 0, 0],
];

function devAcquisitionRows(): AcqProfile[] {
  const rows: AcqProfile[] = [];
  for (const [source, signups, onboarded, paying, recent] of DEV_SOURCES) {
    for (let i = 0; i < signups; i += 1) {
      const pays = i < paying;
      rows.push({
        referral_source: source || null,
        onboarding_completed: i < onboarded,
        plan: pays ? "pro" : "free",
        subscription_active: pays,
        subscription_status: pays ? "active" : "inactive",
        stripe_subscription_id: pays ? `sub_demo_${source}_${i}` : null,
        created_at: daysAgo(i >= signups - recent ? 3 + (i % 25) : 45 + i),
      });
    }
  }
  return rows;
}

export function devOverview(): OverviewData {
  const signups = wave(30, 6, 3, 0.15, 2);
  const sales = wave(30, 900, 380, 18, 1);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    users: { total: 1284, brands: 412, creators: 872, new7d: 58, newPrev7d: 41, signups },
    active: { d1: 96, d7: 318, d30: 702 },
    paying: {
      count: 87,
      comped: 9,
      mrrEstimate: 6_843,
      byPlan: [
        { key: "pro", count: 41 },
        { key: "basic", count: 33 },
        { key: "scale", count: 13 },
      ],
    },
    campaigns: { total: 356, active: 142 },
    sales: { count30d: 1_931, revenue30d: sales.reduce((s, p) => s + p.value, 0), revenuePrev30d: 31_480, series: sales },
    catalog: { total: 48_612 },
    gifting: { missions: 64 },
    acquisition: {
      all: acquisitionFunnel(devAcquisitionRows()),
      d30: acquisitionFunnel(devAcquisitionRows(), { sinceMs: Date.now() - 30 * 86_400_000 }),
    },
    attention: [
      { kind: "billing", label: "Unpaid invoices", count: 3, href: "/admin/revenue" },
      { kind: "requests", label: "Niches requested this week", count: 12, href: "/admin/requests" },
      { kind: "lookups", label: "Creators not found this week", count: 27, href: "/admin/requests" },
      { kind: "schema", label: "admin_audit_log table missing", count: 1, href: "/admin/system" },
    ],
    warnings: [],
  };
}

export function devActivity(): ActivityData {
  const series = wave(30, 900, 380, 18, 1);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    campaigns: {
      byStatus: [
        { key: "active", count: 142 },
        { key: "draft", count: 96 },
        { key: "completed", count: 81 },
        { key: "paused", count: 37 },
      ],
      created: wave(30, 4, 2, 0.05, 3),
    },
    sales: { series, count: 1931, revenue: series.reduce((s, p) => s + p.value, 0), commission: 5_318.4 },
    topBrands: [
      { userId: "b1", label: "Atelier Nord", revenue: 9_812, orders: 402 },
      { userId: "b2", label: "Maison Lune", revenue: 7_240, orders: 311 },
      { userId: "b3", label: "Orbit Coffee", revenue: 4_904, orders: 268 },
      { userId: "b4", label: "Sora Skin", revenue: 3_115, orders: 142 },
      { userId: "b5", label: "Kinetic Labs", revenue: 2_380, orders: 97 },
      { userId: "b6", label: "Verde Home", revenue: 1_210, orders: 58 },
    ],
    payouts: {
      byStatus: [
        { key: "paid", count: 318, amount: 21_904.5 },
        { key: "pending", count: 44, amount: 3_180 },
        { key: "failed", count: 3, amount: 212.4 },
      ],
    },
    outreach: { sent30d: 2_418, series: wave(30, 80, 30, 1, 5) },
    gifting: {
      byStatus: countBy(
        [
          ...Array(18).fill({ s: "invited" }),
          ...Array(11).fill({ s: "signed" }),
          ...Array(9).fill({ s: "shipped" }),
          ...Array(7).fill({ s: "delivered" }),
          ...Array(6).fill({ s: "submitted" }),
          ...Array(13).fill({ s: "approved" }),
        ] as { s: string }[],
        (r) => r.s,
      ),
    },
    content: { uploads30d: 412, series: wave(30, 13, 6, 0.2, 7) },
    warnings: [],
  };
}

export function devRequests(): RequestsData {
  return {
    ok: true,
    niches: [
      { key: "padel", label: "Padel", count: 14, last: daysAgo(1) },
      { key: "pet care", label: "Pet care", count: 11, last: daysAgo(2) },
      { key: "saas b2b", label: "SaaS B2B", count: 8, last: daysAgo(4) },
      { key: "parenting", label: "Parenting", count: 6, last: daysAgo(6) },
      { key: "gaming mobile", label: "Gaming mobile", count: 4, last: daysAgo(9) },
    ],
    lookups: [
      { key: "lea.runs", label: "@lea.runs", count: 9, last: daysAgo(1) },
      { key: "chef.hugo", label: "@chef.hugo", count: 6, last: daysAgo(3) },
      { key: "makeupbysam", label: "@makeupbysam", count: 5, last: daysAgo(3) },
      { key: "travelwithkai", label: "@travelwithkai", count: 3, last: daysAgo(8) },
    ],
    waitlist: [
      { email: "julie@brand.example", first_name: "Julie", expectations: "Automate creator follow-ups", created_at: daysAgo(1) },
      { email: "marc@shop.example", first_name: "Marc", expectations: "Multi-currency payouts", created_at: daysAgo(5) },
    ],
    warnings: [],
  };
}

export function devSystem(env: SystemCheck[], deploy: SystemData["deploy"], stripeMode: SystemData["stripeMode"]): SystemData {
  const tables = [
    "profiles", "user_sessions", "creators_index", "creators", "campaigns", "campaign_creators", "sales", "payouts",
    "outreach_history", "affiliate_links", "creator_content", "creator_links", "workspaces", "workspace_members",
    "rpm_accruals", "gift_campaigns", "gift_missions", "gift_videos", "niche_requests", "creator_lookup_requests",
    "v2_waitlist", "admin_audit_log",
  ].map((table, i) => {
    const missing = table === "admin_audit_log" || table === "gift_videos";
    return { table, count: missing ? null : 120 + ((i * 7919) % 48_000), missing, error: null };
  });
  return { ok: true, env, tables, deploy, stripeMode };
}

export function devAudit(): AuditData {
  return {
    ok: true,
    missing: false,
    entries: [
      { id: "a1", actor_email: "dev@localhost", action: "user.giftMonth", target_user_id: "u8", target_email: "admin@verde.example", details: { value: "basic" }, created_at: daysAgo(0.2) },
      { id: "a2", actor_email: "dev@localhost", action: "user.role", target_user_id: "u2", target_email: "team@ateliernord.example", details: { value: "staff" }, created_at: daysAgo(1.4) },
      { id: "a3", actor_email: "dev@localhost", action: "user.setPlan", target_user_id: "u4", target_email: "growth@kinetic.example", details: { value: "pro" }, created_at: daysAgo(3) },
    ],
  };
}

export function devUserDetail(userId: string) {
  const user = devUsers().find((u) => u.id === userId) ?? devUsers()[0];
  const paying = user.stripe_subscription_id;
  return {
    ok: true,
    profile: { ...user, business_name: user.account_type === "brand" ? user.full_name : null, referral_source: "TikTok", onboarding_completed: true },
    subscription: paying
      ? { status: "active", currentPeriodEnd: Math.floor(Date.now() / 1000) + 18 * 86_400, cancelAtPeriodEnd: false, amount: 99, currency: "eur", interval: "month", priceId: "price_demo" }
      : null,
    invoices: paying
      ? [0, 1, 2].map((i) => ({ id: `in_demo_${i}`, amountPaid: 99, currency: "eur", status: "paid", created: Math.floor(Date.now() / 1000) - i * 30 * 86_400, pdf: null }))
      : [],
    usage: { campaigns: 6, creators: 38, sales: 211, salesRevenue: 8_412.5, outreach: 164, giftMissions: 7 },
    sessions: [
      { device_label: "Chrome · macOS", location_label: "Paris, FR", ip_address: "203.0.113.24", last_active_at: daysAgo(0.05) },
      { device_label: "Safari · iPhone", location_label: "Lyon, FR", ip_address: "198.51.100.7", last_active_at: daysAgo(2) },
    ],
  };
}

export function devConsole(admin: AdminContext) {
  const users = devUsers();
  return {
    ok: true,
    me: admin,
    stripeMode: "test" as const,
    users,
    metrics: {
      mrr: 6_843,
      arr: 82_116,
      activeSubscribers: 87,
      trialing: 6,
      pastDue: 3,
      canceledThisMonth: 4,
      newThisMonth: 17,
      churnRatePct: 4.4,
      mrrByPlan: { basic: 1_617, pro: 4_059, scale: 1_167 },
      countByPlan: { basic: 33, pro: 41, scale: 13 },
      currency: "eur",
    },
    growth: {
      monthly: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((month, i) => ({
        month,
        newSubs: 6 + i * 3,
        canceledSubs: 1 + (i % 3),
        netMrrAdded: 380 + i * 260,
      })),
      arpu: 78.7,
      ltv: 1_788,
      funnel: { signups: 1284, onboarded: 903, paying: 87, onboardRatePct: 70.3, payRatePct: 6.8 },
      currency: "eur",
    },
    ops: {
      failedPayments: [
        { customerId: "cus_demo_a", email: "ops@soraskin.example", amountDue: 49, currency: "eur", status: "open", created: Math.floor(Date.now() / 1000) - 3 * 86_400, hostedUrl: null },
        { customerId: "cus_demo_b", email: "hi@orbitcoffee.example", amountDue: 99, currency: "eur", status: "open", created: Math.floor(Date.now() / 1000) - 6 * 86_400, hostedUrl: null },
      ],
      acquisition: [
        { source: "TikTok", count: 402 },
        { source: "Google", count: 288 },
        { source: "Word of mouth", count: 173 },
        { source: "Instagram", count: 141 },
        { source: "(not specified)", count: 280 },
      ],
    },
  };
}

export function devCatalog() {
  const niches = ["fitness", "fashion", "beauty", "tech", "food", "travel"].map((niche, i) => {
    const total = 4_000 + i * 1_870;
    return {
      niche,
      total,
      curated: 30 + i * 14,
      min: 800,
      max: 4_200_000,
      under10k: Math.round(total * 0.46),
      from10kto100k: Math.round(total * 0.39),
      over100k: Math.round(total * 0.15),
      target: 100,
    };
  });
  return {
    ok: true,
    total: 48_612,
    curated: 412,
    niches,
    lookupRequests: devRequests().lookups!.map((l) => ({ normalized: l.key, query: l.label, count: l.count, lastAt: l.last })),
    nicheRequests: devRequests().niches!.map((n) => ({ normalized: n.key, niche: n.label, productContext: null, count: n.count, lastAt: n.last })),
  };
}
