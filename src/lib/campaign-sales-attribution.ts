export type CampaignSalesMeta = { status: string; created_at?: string };

export type SaleAttributionRow = {
  order_amount?: number | null;
  commission_amount?: number | null;
  campaign_id?: string | null;
  creator_id?: string | null;
  created_at?: string | null;
};

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

export function pickCampaignForCreatorSale(
  creatorId: string,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
): string | null {
  const campaignIds = Object.keys(creatorCounts).filter((campaignId) =>
    creatorCounts[campaignId].includes(creatorId),
  );
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

export function attributeSaleToCampaign(
  sale: SaleAttributionRow,
  creatorCounts: Record<string, string[]>,
  campaignMeta: Record<string, CampaignSalesMeta>,
): string | null {
  if (sale.campaign_id) return String(sale.campaign_id);
  if (!sale.creator_id) return null;
  return pickCampaignForCreatorSale(String(sale.creator_id), creatorCounts, campaignMeta);
}
