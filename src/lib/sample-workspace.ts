import { SAMPLE_CAMPAIGN_DETAILS, sampleCampaignTotals } from "@/lib/sample-campaign-preview";

export function samplesHidden(userId?: string | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`trackit_samples_hidden_${userId}`) === "1";
  } catch {
    return false;
  }
}

export function hideSamples(userId?: string | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(`trackit_samples_hidden_${userId}`, "1");
  } catch {
    /* storage unavailable */
  }
}

const summer = sampleCampaignTotals(SAMPLE_CAMPAIGN_DETAILS["sample-summer"]);
const launch = sampleCampaignTotals(SAMPLE_CAMPAIGN_DETAILS["sample-launch"]);
const idsOf = (id: string) => SAMPLE_CAMPAIGN_DETAILS[id].creators.filter((c) => c.status !== "shortlisted").map((c) => c.id);

export const SAMPLE_CAMPAIGNS = [
  {
    id: "sample-summer",
    name: "Summer drop",
    creators: summer.creators,
    platform: "TikTok, Instagram",
    sales: summer.revenue,
    commission: summer.commission,
    status: "Active" as const,
    start: "Jun 2",
    end: "Aug 31",
    startRaw: "2026-06-02",
    endRaw: "2026-08-31",
    description: "Sample campaign",
    commissionType: "percentage",
    commissionRate: SAMPLE_CAMPAIGN_DETAILS["sample-summer"].commissionRate,
    creatorIds: idsOf("sample-summer"),
    createdAt: "2026-06-02T10:00:00.000Z",
  },
  {
    id: "sample-launch",
    name: "Serum launch",
    creators: launch.creators,
    platform: "Instagram",
    sales: launch.revenue,
    commission: launch.commission,
    status: "Active" as const,
    start: "Sep 4",
    end: "Oct 4",
    startRaw: "2026-09-04",
    endRaw: "2026-10-04",
    description: "Sample campaign",
    commissionType: "percentage",
    commissionRate: SAMPLE_CAMPAIGN_DETAILS["sample-launch"].commissionRate,
    creatorIds: idsOf("sample-launch"),
    createdAt: "2026-09-04T10:00:00.000Z",
  },
  {
    id: "sample-draft",
    name: "Holiday gifting",
    creators: 0,
    platform: "TikTok, Instagram",
    sales: 0,
    commission: 0,
    status: "Draft" as const,
    start: "",
    end: "",
    description: "Sample draft",
    commissionRate: SAMPLE_CAMPAIGN_DETAILS["sample-draft"].commissionRate,
    creatorIds: [],
    createdAt: "2026-09-20T10:00:00.000Z",
  },
];

const SAMPLE_CAMPAIGN_FR: Record<string, { name: string; start: string; end: string; description: string }> = {
  "sample-summer": { name: "Collection été", start: "2 juin", end: "31 août", description: "Campagne exemple" },
  "sample-launch": { name: "Lancement sérum", start: "4 sept.", end: "4 oct.", description: "Campagne exemple" },
  "sample-draft": { name: "Cadeaux des fêtes", start: "", end: "", description: "Brouillon exemple" },
};

/** SAMPLE_CAMPAIGNS with names, dates and descriptions in the visitor's language. */
export function sampleCampaignsFor(lang: "en" | "fr"): typeof SAMPLE_CAMPAIGNS {
  if (lang !== "fr") return SAMPLE_CAMPAIGNS;
  return SAMPLE_CAMPAIGNS.map((c) => ({ ...c, ...(SAMPLE_CAMPAIGN_FR[c.id] ?? {}) }));
}

export const SAMPLE_PAYOUT_CREATORS = [
  {
    id: "sample-sarah",
    full_name: "Sarah Cole",
    handle: "sarah.creates",
    platform: "tiktok",
    balance: 186,
    total_earned: 640,
    total_sales: 12,
    paypal_link: "sarahcreates",
  },
  {
    id: "sample-mike",
    full_name: "Mike Alvarez",
    handle: "mike.style",
    platform: "instagram",
    balance: 92,
    total_earned: 310,
    total_sales: 7,
    revolut_link: "mikestyle",
  },
  {
    id: "sample-luna",
    full_name: "Luna Park",
    handle: "luna.beauty",
    platform: "tiktok",
    balance: 0,
    total_earned: 150,
    total_sales: 4,
    paypal_link: "lunabeauty",
  },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const SAMPLE_SALES = [
  { id: "sample-sale-1", creator_id: "sample-sarah", order_amount: 86, commission_amount: 12.9, created_at: daysAgo(1), campaign_id: "sample-summer", status: "tracked" },
  { id: "sample-sale-2", creator_id: "sample-mike", order_amount: 54, commission_amount: 8.1, created_at: daysAgo(3), campaign_id: "sample-summer", status: "tracked" },
  { id: "sample-sale-3", creator_id: "sample-luna", order_amount: 120, commission_amount: 18, created_at: daysAgo(6), campaign_id: "sample-launch", status: "tracked" },
  { id: "sample-sale-4", creator_id: "sample-sarah", order_amount: 42, commission_amount: 6.3, created_at: daysAgo(9), campaign_id: "sample-summer", status: "tracked" },
];

export const SAMPLE_PAYOUTS = [
  {
    id: "sample-pay-1",
    creator_id: "sample-luna",
    amount: 150,
    status: "paid",
    stripe_transfer_id: null,
    paid_at: daysAgo(12),
    created_at: daysAgo(12),
    creator: { handle: "luna.beauty", full_name: "Luna Park", platform: "tiktok" },
  },
];
