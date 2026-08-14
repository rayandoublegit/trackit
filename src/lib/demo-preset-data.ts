/**
 * Demo preset: list + campaign "Trackit" with realistic mock creators & sales.
 * Seeded once per workspace on first dashboard load.
 */

import type { PipelineStage } from "@/lib/pipeline";

export const DEMO_LIST_NAME = "Trackit";
export const DEMO_CAMPAIGN_NAME = "Trackit";
export const DEMO_CAMPAIGN_MARKER = "[trackit-demo-preset]";
export const DEMO_CREATOR_NOTES = "Créateur démo Trackit";
/** Hard cap for creators shown in the Trackit demo list / campaign. */
export const DEMO_LIST_MAX_CREATORS = 8;
export const DEMO_CAMPAIGN_DESCRIPTION =
  `Campagne démo Trackit — Explorez inventaire, ventes, ROI et affiliation avec des données d’exemple. ${DEMO_CAMPAIGN_MARKER}`;

/** Campaign excluded from free-plan campaign quota. */
export function isDemoPresetCampaign(row: {
  name?: string | null;
  description?: string | null;
}): boolean {
  const name = String(row.name || "").trim();
  const description = String(row.description || "");
  return name === DEMO_CAMPAIGN_NAME && description.includes(DEMO_CAMPAIGN_MARKER);
}

/** Saved creator rows seeded by the Trackit demo list (hors quota créateurs suivis). */
export function isDemoPresetSavedCreator(row: {
  notes?: string | null;
  snapshot?: unknown;
}): boolean {
  if (String(row.notes || "").includes(DEMO_CREATOR_NOTES)) return true;
  const snap = row.snapshot && typeof row.snapshot === "object" ? (row.snapshot as Record<string, unknown>) : null;
  const crm = snap?.crm && typeof snap.crm === "object" ? (snap.crm as Record<string, unknown>) : null;
  return String(crm?.label || "") === "Demo Trackit";
}

/** Demo sales must not consume free manual-sales lifetime quota. */
export function isDemoPresetSaleOrderId(shopifyOrderId: string | null | undefined): boolean {
  const id = String(shopifyOrderId || "");
  return id.startsWith("demo_") || id.startsWith("manual_demo_");
}

export type DemoCreatorSeed = {
  handle: string;
  displayName: string;
  platform: "TikTok" | "Instagram" | "YouTube";
  niche: string;
  country: string;
  stage: PipelineStage;
  followers: number;
  engagement: number;
  commissionRate: number;
  promoCode: string;
  email: string;
  avatarSeed: string;
};

/** Pool of plausible demo creators. Selection is shuffled per user. */
export const DEMO_CREATOR_POOL: DemoCreatorSeed[] = [
  {
    handle: "leacreatess",
    displayName: "Léa Martin",
    platform: "TikTok",
    niche: "Beauty",
    country: "FR",
    stage: "signed",
    followers: 182_400,
    engagement: 4.8,
    commissionRate: 15,
    promoCode: "LEA15",
    email: "lea.demo@trackit.example",
    avatarSeed: "lea",
  },
  {
    handle: "thomasfit",
    displayName: "Thomas Roy",
    platform: "Instagram",
    niche: "Fitness",
    country: "FR",
    stage: "in_progress",
    followers: 94_200,
    engagement: 3.2,
    commissionRate: 12,
    promoCode: "TOM12",
    email: "thomas.demo@trackit.example",
    avatarSeed: "thomas",
  },
  {
    handle: "sofiamode",
    displayName: "Sofia Nguyen",
    platform: "TikTok",
    niche: "Fashion",
    country: "BE",
    stage: "signed",
    followers: 256_800,
    engagement: 5.1,
    commissionRate: 18,
    promoCode: "SOFIA18",
    email: "sofia.demo@trackit.example",
    avatarSeed: "sofia",
  },
  {
    handle: "mike.style",
    displayName: "Mike Laurent",
    platform: "YouTube",
    niche: "Lifestyle",
    country: "FR",
    stage: "contacted",
    followers: 412_000,
    engagement: 2.4,
    commissionRate: 10,
    promoCode: "MIKE10",
    email: "mike.demo@trackit.example",
    avatarSeed: "mike",
  },
  {
    handle: "claraeats",
    displayName: "Clara Petit",
    platform: "Instagram",
    niche: "Food",
    country: "FR",
    stage: "nurturing",
    followers: 67_500,
    engagement: 6.2,
    commissionRate: 14,
    promoCode: "CLARA14",
    email: "clara.demo@trackit.example",
    avatarSeed: "clara",
  },
  {
    handle: "noemihome",
    displayName: "Noémie Blanc",
    platform: "TikTok",
    niche: "Home",
    country: "CH",
    stage: "signed",
    followers: 138_900,
    engagement: 4.1,
    commissionRate: 16,
    promoCode: "NOEMI16",
    email: "noemie.demo@trackit.example",
    avatarSeed: "noemi",
  },
  {
    handle: "alexgamerfr",
    displayName: "Alex Dubois",
    platform: "TikTok",
    niche: "Gaming",
    country: "FR",
    stage: "saved",
    followers: 521_300,
    engagement: 7.4,
    commissionRate: 8,
    promoCode: "ALEX08",
    email: "alex.demo@trackit.example",
    avatarSeed: "alex",
  },
  {
    handle: "emma.glow",
    displayName: "Emma Rossi",
    platform: "Instagram",
    niche: "Beauty",
    country: "IT",
    stage: "signed",
    followers: 203_100,
    engagement: 3.9,
    commissionRate: 15,
    promoCode: "EMMA15",
    email: "emma.demo@trackit.example",
    avatarSeed: "emma",
  },
  {
    handle: "lucasrun",
    displayName: "Lucas Bernard",
    platform: "YouTube",
    niche: "Sports",
    country: "FR",
    stage: "in_progress",
    followers: 88_400,
    engagement: 2.8,
    commissionRate: 11,
    promoCode: "LUCAS11",
    email: "lucas.demo@trackit.example",
    avatarSeed: "lucas",
  },
  {
    handle: "ines.travel",
    displayName: "Inès Moreau",
    platform: "TikTok",
    niche: "Travel",
    country: "FR",
    stage: "contacted",
    followers: 310_200,
    engagement: 4.6,
    commissionRate: 12,
    promoCode: "INES12",
    email: "ines.demo@trackit.example",
    avatarSeed: "ines",
  },
  {
    handle: "hugo.techlab",
    displayName: "Hugo Renard",
    platform: "TikTok",
    niche: "Tech",
    country: "FR",
    stage: "signed",
    followers: 274_600,
    engagement: 5.4,
    commissionRate: 14,
    promoCode: "HUGO14",
    email: "hugo.demo@trackit.example",
    avatarSeed: "hugo",
  },
  {
    handle: "maya.gadgets",
    displayName: "Maya Chen",
    platform: "Instagram",
    niche: "Tech",
    country: "FR",
    stage: "in_progress",
    followers: 156_800,
    engagement: 4.2,
    commissionRate: 13,
    promoCode: "MAYA13",
    email: "maya.demo@trackit.example",
    avatarSeed: "maya",
  },
  {
    handle: "noah.setup",
    displayName: "Noah Keller",
    platform: "YouTube",
    niche: "Tech",
    country: "DE",
    stage: "contacted",
    followers: 489_200,
    engagement: 3.1,
    commissionRate: 10,
    promoCode: "NOAH10",
    email: "noah.demo@trackit.example",
    avatarSeed: "noah",
  },
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDemoCreators(
  userId: string,
  count = DEMO_LIST_MAX_CREATORS,
): DemoCreatorSeed[] {
  const capped = Math.min(Math.max(1, count), DEMO_LIST_MAX_CREATORS);
  const rand = mulberry32(hashSeed(`${userId}:demo-creators-v4`));
  const pool = [...DEMO_CREATOR_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Always include at least one Tech creator in the Trackit demo set.
  const tech = pool.find((c) => c.niche.toLowerCase() === "tech");
  const picked = pool.slice(0, Math.min(capped, pool.length));
  if (tech && !picked.some((c) => c.handle === tech.handle)) {
    picked[picked.length - 1] = tech;
  }
  return picked.map((c) => {
    // Slight per-user jitter so numbers feel unique without absurd values
    const fJitter = 0.9 + rand() * 0.2;
    const eJitter = 0.9 + rand() * 0.2;
    return {
      ...c,
      followers: Math.round(c.followers * fJitter),
      engagement: Math.round(c.engagement * eJitter * 10) / 10,
    };
  });
}

export function demoAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

export type DemoSalePlan = {
  handle: string;
  orderAmount: number;
  daysAgo: number;
  kind: "shopify" | "manual";
};

/** Spread sales over ~45 days for charts / ROI / live feed. */
export function buildDemoSalePlans(userId: string, handles: string[]): DemoSalePlan[] {
  const rand = mulberry32(hashSeed(`${userId}:demo-sales`));
  const plans: DemoSalePlan[] = [];
  const count = 18 + Math.floor(rand() * 8); // 18–25

  for (let i = 0; i < count; i++) {
    const handle = handles[Math.floor(rand() * handles.length)]!;
    const orderAmount = Math.round((35 + rand() * 180) * 100) / 100;
    const daysAgo = Math.floor(rand() * 45);
    const kind: "shopify" | "manual" = rand() > 0.35 ? "shopify" : "manual";
    plans.push({ handle, orderAmount, daysAgo, kind });
  }
  return plans;
}

export function daysAgoToIso(daysAgo: number, hourOffset = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hourOffset, Math.floor(Math.random() * 50), Math.floor(Math.random() * 50), 0);
  return d.toISOString();
}
