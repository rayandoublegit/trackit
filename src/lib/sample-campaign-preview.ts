// Sample campaigns shown to an empty workspace. Every person here is fictional.
// Totals are derived from the rows, so the list card, the KPIs and the tables
// always agree with each other.

export type SamplePlatform = "tiktok" | "instagram";

export type SampleCreatorStatus = "live" | "shipping" | "invited" | "shortlisted";

export type SampleCreator = {
  id: string;
  name: string;
  handle: string;
  platform: SamplePlatform;
  /** Hue used for the avatar and the video tiles (0-360). */
  hue: number;
  followers: number;
  views: number;
  orders: number;
  revenue: number;
  videos: number;
  status: SampleCreatorStatus;
  paid: number;
};

export type SampleContent = {
  id: string;
  creatorId: string;
  title: { en: string; fr: string };
  views: number;
  likes: number;
  daysAgo: number;
  durationSec: number;
};

export type SampleGiftStage = "invited" | "signed" | "shipped" | "delivered" | "submitted" | "approved";

export type SampleGift = {
  creatorId: string;
  stage: SampleGiftStage;
  carrier?: string;
  tracking?: string;
};

export type SampleActivity =
  | { type: "sale"; creatorId: string; amount: number }
  | { type: "video"; creatorId: string; views: number }
  | { type: "signed"; creatorId: string }
  | { type: "delivered"; creatorId: string }
  | { type: "approved"; creatorId: string };

export type SampleCampaignDetail = {
  id: string;
  kind: "affiliate" | "gifting";
  product: { en: string; fr: string };
  brief: { en: string; fr: string };
  commissionRate: number;
  adRightsDays: number;
  territories: string;
  creators: SampleCreator[];
  content: SampleContent[];
  gifts: SampleGift[];
  activity: SampleActivity[];
  /** Relative weights, one per day, oldest first. */
  dailyShape: number[];
};

export const SAMPLE_GIFT_STAGES: SampleGiftStage[] = ["invited", "signed", "shipped", "delivered", "submitted", "approved"];

function creator(
  id: string,
  name: string,
  handle: string,
  platform: SamplePlatform,
  hue: number,
  stats: Omit<SampleCreator, "id" | "name" | "handle" | "platform" | "hue">,
): SampleCreator {
  return { id, name, handle, platform, hue, ...stats };
}

const SUMMER_CREATORS: SampleCreator[] = [
  creator("sample-sarah", "Sarah Cole", "sarah.creates", "tiktok", 222, { followers: 184_000, views: 412_000, orders: 26, revenue: 1_780, videos: 3, status: "live", paid: 120 }),
  creator("sample-mike", "Mike Alvarez", "mike.style", "instagram", 12, { followers: 96_400, views: 208_000, orders: 17, revenue: 1_105, videos: 2, status: "live", paid: 80 }),
  creator("sample-luna", "Luna Park", "luna.beauty", "tiktok", 312, { followers: 61_200, views: 164_000, orders: 12, revenue: 820, videos: 2, status: "live", paid: 123 }),
  creator("sample-nora", "Nora Diallo", "nora.daily", "tiktok", 160, { followers: 42_800, views: 97_500, orders: 9, revenue: 585, videos: 1, status: "live", paid: 0 }),
  creator("sample-tom", "Tom Becker", "tom.outdoors", "instagram", 34, { followers: 28_900, views: 51_200, orders: 5, revenue: 330, videos: 1, status: "shipping", paid: 0 }),
  creator("sample-ines", "Inès Moreau", "ines.matin", "tiktok", 268, { followers: 8_700, views: 23_900, orders: 3, revenue: 200, videos: 1, status: "shipping", paid: 0 }),
];

const LAUNCH_CREATORS: SampleCreator[] = [
  creator("sample-luna", "Luna Park", "luna.beauty", "tiktok", 312, { followers: 61_200, views: 138_000, orders: 14, revenue: 1_120, videos: 2, status: "live", paid: 90 }),
  creator("sample-kai", "Kai Nakamura", "kai.skin", "instagram", 190, { followers: 53_100, views: 86_000, orders: 7, revenue: 560, videos: 1, status: "live", paid: 0 }),
  creator("sample-jade", "Jade Laurent", "jade.glow", "instagram", 340, { followers: 19_400, views: 41_000, orders: 4, revenue: 280, videos: 1, status: "shipping", paid: 0 }),
];

const HOLIDAY_CREATORS: SampleCreator[] = [
  creator("sample-nora", "Nora Diallo", "nora.daily", "tiktok", 160, { followers: 42_800, views: 0, orders: 0, revenue: 0, videos: 0, status: "shortlisted", paid: 0 }),
  creator("sample-kai", "Kai Nakamura", "kai.skin", "instagram", 190, { followers: 53_100, views: 0, orders: 0, revenue: 0, videos: 0, status: "shortlisted", paid: 0 }),
  creator("sample-ines", "Inès Moreau", "ines.matin", "tiktok", 268, { followers: 8_700, views: 0, orders: 0, revenue: 0, videos: 0, status: "shortlisted", paid: 0 }),
  creator("sample-tom", "Tom Becker", "tom.outdoors", "instagram", 34, { followers: 28_900, views: 0, orders: 0, revenue: 0, videos: 0, status: "shortlisted", paid: 0 }),
];

function content(
  id: string,
  creatorId: string,
  en: string,
  fr: string,
  views: number,
  likes: number,
  daysAgo: number,
  durationSec: number,
): SampleContent {
  return { id, creatorId, title: { en, fr }, views, likes, daysAgo, durationSec };
}

export const SAMPLE_CAMPAIGN_DETAILS: Record<string, SampleCampaignDetail> = {
  "sample-summer": {
    id: "sample-summer",
    kind: "affiliate",
    product: { en: "SPF 50 body mist", fr: "Brume corps SPF 50" },
    brief: {
      en: "Show the mist in a real summer moment: beach bag, before a run, after a swim. Mention the code in the first 5 seconds.",
      fr: "Montrer la brume dans un vrai moment d’été : sac de plage, avant un footing, après une baignade. Citer le code dans les 5 premières secondes.",
    },
    commissionRate: 15,
    adRightsDays: 90,
    territories: "France, Belgique, Suisse",
    creators: SUMMER_CREATORS,
    content: [
      content("sc-1", "sample-sarah", "3 things in my beach bag", "3 choses dans mon sac de plage", 238_000, 19_400, 2, 34),
      content("sc-2", "sample-mike", "Run, sweat, reapply", "Courir, transpirer, remettre", 131_000, 8_900, 4, 22),
      content("sc-3", "sample-sarah", "SPF myths, busted", "Idées reçues sur le SPF", 121_000, 10_100, 7, 41),
      content("sc-4", "sample-luna", "GRWM: pool day", "GRWM : journée piscine", 98_000, 7_600, 5, 28),
      content("sc-5", "sample-nora", "Honest review after 2 weeks", "Avis honnête après 2 semaines", 97_500, 6_200, 3, 52),
      content("sc-6", "sample-luna", "No white cast test", "Test : aucune trace blanche", 66_000, 4_800, 9, 19),
      content("sc-7", "sample-mike", "What I pack for a surf trip", "Ma valise pour un surf trip", 77_000, 5_100, 11, 37),
      content("sc-8", "sample-sarah", "Duet: dermatologist reacts", "Duo : une dermato réagit", 53_000, 3_900, 13, 45),
    ],
    gifts: [
      { creatorId: "sample-sarah", stage: "approved", carrier: "Colissimo", tracking: "6A1928374650" },
      { creatorId: "sample-mike", stage: "approved", carrier: "DHL", tracking: "JD0146600012" },
      { creatorId: "sample-luna", stage: "approved", carrier: "Colissimo", tracking: "6A1928374711" },
      { creatorId: "sample-nora", stage: "submitted", carrier: "Mondial Relay", tracking: "MR44910238" },
      { creatorId: "sample-tom", stage: "shipped", carrier: "UPS", tracking: "1Z999AA10123456784" },
      { creatorId: "sample-ines", stage: "signed" },
    ],
    activity: [
      { type: "sale", creatorId: "sample-sarah", amount: 86 },
      { type: "video", creatorId: "sample-nora", views: 97_500 },
      { type: "sale", creatorId: "sample-mike", amount: 54 },
      { type: "delivered", creatorId: "sample-nora" },
      { type: "sale", creatorId: "sample-luna", amount: 72 },
      { type: "signed", creatorId: "sample-ines" },
      { type: "sale", creatorId: "sample-sarah", amount: 118 },
      { type: "approved", creatorId: "sample-luna" },
      { type: "sale", creatorId: "sample-tom", amount: 66 },
    ],
    dailyShape: [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 9, 8, 7, 10, 12, 11, 9, 13, 15, 14, 12, 16, 18, 17, 15, 19, 22, 20, 24, 26],
  },
  "sample-launch": {
    id: "sample-launch",
    kind: "affiliate",
    product: { en: "Niacinamide serum", fr: "Sérum niacinamide" },
    brief: {
      en: "A 7-day routine diary. Close-ups of the texture, morning light, no filter on the skin.",
      fr: "Un journal de routine sur 7 jours. Gros plans sur la texture, lumière du matin, aucun filtre sur la peau.",
    },
    commissionRate: 15,
    adRightsDays: 60,
    territories: "France",
    creators: LAUNCH_CREATORS,
    content: [
      content("lc-1", "sample-luna", "Day 1 vs day 7", "Jour 1 vs jour 7", 92_000, 8_300, 1, 31),
      content("lc-2", "sample-kai", "The 3-step routine", "La routine en 3 étapes", 86_000, 6_700, 3, 26),
      content("lc-3", "sample-luna", "Texture ASMR", "Texture ASMR", 46_000, 3_900, 6, 18),
      content("lc-4", "sample-jade", "Unboxing the launch kit", "Unboxing du kit de lancement", 41_000, 2_800, 2, 24),
    ],
    gifts: [
      { creatorId: "sample-luna", stage: "approved", carrier: "Colissimo", tracking: "6A1928375521" },
      { creatorId: "sample-kai", stage: "approved", carrier: "Chronopost", tracking: "XR118822991FR" },
      { creatorId: "sample-jade", stage: "delivered", carrier: "Colissimo", tracking: "6A1928375602" },
    ],
    activity: [
      { type: "sale", creatorId: "sample-luna", amount: 64 },
      { type: "delivered", creatorId: "sample-jade" },
      { type: "sale", creatorId: "sample-kai", amount: 80 },
      { type: "video", creatorId: "sample-luna", views: 92_000 },
      { type: "sale", creatorId: "sample-luna", amount: 96 },
      { type: "approved", creatorId: "sample-kai" },
    ],
    dailyShape: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 6, 9, 8, 11, 14, 13, 17],
  },
  "sample-draft": {
    id: "sample-draft",
    kind: "gifting",
    product: { en: "Holiday gift box", fr: "Coffret des fêtes" },
    brief: {
      en: "Unbox the gift box on camera, then show one product in use. Tone: warm, no hard sell.",
      fr: "Ouvrir le coffret face caméra, puis montrer un produit en situation. Ton : chaleureux, pas de vente forcée.",
    },
    commissionRate: 12,
    adRightsDays: 90,
    territories: "France, Belgique",
    creators: HOLIDAY_CREATORS,
    content: [],
    gifts: HOLIDAY_CREATORS.map((c) => ({ creatorId: c.id, stage: "invited" as const })),
    activity: [],
    dailyShape: [],
  },
};

export function getSampleCampaignDetail(id: string): SampleCampaignDetail | null {
  return SAMPLE_CAMPAIGN_DETAILS[id] ?? null;
}

export type SampleCampaignTotals = {
  revenue: number;
  commission: number;
  orders: number;
  views: number;
  creators: number;
  videos: number;
  paid: number;
  owed: number;
  /** Revenue per euro paid to creators, null when nothing is owed yet. */
  roi: number | null;
};

export function sampleCampaignTotals(detail: SampleCampaignDetail): SampleCampaignTotals {
  const engaged = detail.creators.filter((c) => c.status !== "shortlisted");
  const revenue = engaged.reduce((sum, c) => sum + c.revenue, 0);
  const commission = engaged.reduce((sum, c) => sum + creatorCommission(detail, c), 0);
  const paid = engaged.reduce((sum, c) => sum + c.paid, 0);
  return {
    revenue,
    commission,
    orders: engaged.reduce((sum, c) => sum + c.orders, 0),
    views: engaged.reduce((sum, c) => sum + c.views, 0),
    creators: engaged.length,
    videos: engaged.reduce((sum, c) => sum + c.videos, 0),
    paid,
    owed: Math.max(0, commission - paid),
    roi: commission > 0 ? Math.round((revenue / commission) * 10) / 10 : null,
  };
}

export function creatorCommission(detail: SampleCampaignDetail, c: SampleCreator): number {
  return Math.round(c.revenue * detail.commissionRate) / 100;
}

/**
 * Spreads the campaign revenue over the days of `dailyShape`, in whole euros,
 * so the chart adds up to exactly the revenue shown in the KPI.
 */
export function sampleDailyRevenue(detail: SampleCampaignDetail): number[] {
  const shape = detail.dailyShape;
  const total = sampleCampaignTotals(detail).revenue;
  const weight = shape.reduce((sum, w) => sum + w, 0);
  if (shape.length === 0 || weight === 0) return shape.map(() => 0);
  const days = shape.map((w) => Math.floor((w / weight) * total));
  const rest = total - days.reduce((sum, v) => sum + v, 0);
  days[days.length - 1] += rest;
  return days;
}

export function sampleGiftCounts(detail: SampleCampaignDetail): Record<SampleGiftStage, number> {
  const counts = Object.fromEntries(SAMPLE_GIFT_STAGES.map((s) => [s, 0])) as Record<SampleGiftStage, number>;
  for (const gift of detail.gifts) counts[gift.stage] += 1;
  return counts;
}

/** Last 7 days against the 7 before, in percent. Null when there is no earlier week to compare. */
export function sampleWeekTrend(detail: SampleCampaignDetail): number | null {
  const days = sampleDailyRevenue(detail);
  if (days.length < 14) return null;
  // A campaign that started inside the comparison window has no full week to compare with.
  const firstSale = days.findIndex((v) => v > 0);
  if (firstSale < 0 || firstSale > days.length - 14) return null;
  const last = days.slice(-7).reduce((a, b) => a + b, 0);
  const prev = days.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (prev <= 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}
