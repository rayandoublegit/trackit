import { dayKeyFromIso } from "@/lib/analytics-periods";

export type CampaignSalesMeta = { status: string; created_at?: string };

export type SaleAttributionRow = {
  order_amount?: number | null;
  commission_amount?: number | null;
  campaign_id?: string | null;
  creator_id?: string | null;
  discount_code_used?: string | null;
  created_at?: string | null;
};

export type CampaignCreatorLinkMeta = {
  historical_sales_attached: boolean;
  joined_at: string;
};

/** Key: `${campaignId}:${creatorId}` */
export type CampaignCreatorLinkMap = Record<string, CampaignCreatorLinkMeta>;

export function buildCreatorCountsFromLinks(
  links: Array<{ campaign_id: string; creator_id: string }>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const link of links) {
    const campaignId = String(link.campaign_id);
    if (!map[campaignId]) map[campaignId] = [];
    map[campaignId].push(String(link.creator_id));
  }
  return map;
}

export function buildCampaignCreatorLinkMap(
  links: Array<{
    campaign_id: string;
    creator_id: string;
    historical_sales_attached?: boolean | null;
    created_at?: string | null;
  }>,
): CampaignCreatorLinkMap {
  const map: CampaignCreatorLinkMap = {};
  for (const link of links) {
    const key = `${String(link.campaign_id)}:${String(link.creator_id)}`;
    map[key] = {
      historical_sales_attached: link.historical_sales_attached !== false,
      joined_at: link.created_at || new Date(0).toISOString(),
    };
  }
  return map;
}

export function campaignIdsForCreator(
  creatorId: string,
  creatorCounts: Record<string, string[]>,
): string[] {
  return Object.keys(creatorCounts).filter((campaignId) =>
    creatorCounts[campaignId].includes(creatorId),
  );
}

/** Used when persisting a new sale — picks one campaign to store on the row. */
export function pickCampaignForCreatorSale(
  creatorId: string,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
): string | null {
  const campaignIds = campaignIdsForCreator(creatorId, creatorCounts);
  if (campaignIds.length === 0) return null;
  if (campaignIds.length === 1) return campaignIds[0];

  const active = campaignIds
    .filter((id) => (campaignMeta[id]?.status || "").toLowerCase() === "active")
    .sort((a, b) => (campaignMeta[b]?.created_at || "").localeCompare(campaignMeta[a]?.created_at || ""));
  if (active[0]) return active[0];

  const byRecency = [...campaignIds].sort((a, b) =>
    (campaignMeta[b]?.created_at || "").localeCompare(campaignMeta[a]?.created_at || ""),
  );
  return byRecency[0] ?? null;
}

function saleCountsForCampaignLink(
  sale: SaleAttributionRow,
  campaignId: string,
  creatorId: string,
  linkMeta?: CampaignCreatorLinkMap,
): boolean {
  const meta = linkMeta?.[`${campaignId}:${creatorId}`];
  if (!meta || meta.historical_sales_attached) return true;

  const saleDay = dayKeyFromIso(sale.created_at) ?? dayKeyFromIso(new Date().toISOString());
  const joinDay = dayKeyFromIso(meta.joined_at);
  if (!saleDay || !joinDay) return true;
  return saleDay >= joinDay;
}

/** Whether a sale belongs to a campaign view (creator roster + historical sales rules). */
export function isSaleAttributedToCampaign(
  sale: SaleAttributionRow,
  campaignId: string,
  creatorCounts: Record<string, string[]>,
  linkMeta?: CampaignCreatorLinkMap,
): boolean {
  const creatorId = String(sale.creator_id || "");
  if (creatorId) {
    const roster = creatorCounts[campaignId] ?? [];
    if (!roster.includes(creatorId)) return false;
    return saleCountsForCampaignLink(sale, campaignId, creatorId, linkMeta);
  }
  return !!sale.campaign_id && String(sale.campaign_id) === campaignId;
}

/** All campaigns that should receive credit for a sale. */
export function attributeSaleToCampaigns(
  sale: SaleAttributionRow,
  creatorCounts: Record<string, string[]>,
  linkMeta?: CampaignCreatorLinkMap,
): string[] {
  const creatorId = String(sale.creator_id || "");
  if (creatorId) {
    const fromMembership = campaignIdsForCreator(creatorId, creatorCounts).filter((campaignId) =>
      isSaleAttributedToCampaign(sale, campaignId, creatorCounts, linkMeta),
    );
    if (fromMembership.length > 0) return fromMembership;
  }
  if (sale.campaign_id) return [String(sale.campaign_id)];
  return [];
}

export function attributeSaleToCampaign(
  sale: SaleAttributionRow,
  creatorCounts: Record<string, string[]>,
  _campaignMeta?: Record<string, CampaignSalesMeta>,
  linkMeta?: CampaignCreatorLinkMap,
): string | null {
  const ids = attributeSaleToCampaigns(sale, creatorCounts, linkMeta);
  return ids[0] ?? null;
}

export function computeCampaignSalesTotals(
  sales: SaleAttributionRow[],
  creatorCounts: Record<string, string[]>,
  linkMeta?: CampaignCreatorLinkMap,
): Record<string, { sales: number; commission: number }> {
  const totals: Record<string, { sales: number; commission: number }> = {};

  const add = (campaignId: string, orderAmount: number, commissionAmount: number) => {
    if (!totals[campaignId]) totals[campaignId] = { sales: 0, commission: 0 };
    totals[campaignId].sales += orderAmount;
    totals[campaignId].commission += commissionAmount;
  };

  for (const sale of sales) {
    const orderAmount = Number(sale.order_amount) || 0;
    const commissionAmount = Number(sale.commission_amount) || 0;
    for (const campaignId of attributeSaleToCampaigns(sale, creatorCounts, linkMeta)) {
      add(campaignId, orderAmount, commissionAmount);
    }
  }

  return totals;
}
