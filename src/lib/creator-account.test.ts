import { describe, expect, it } from "vitest";
import {
  aggregateCommissionByBrand,
  aggregateRpmByBrand,
  DEFAULT_CREATOR_RPM_RATE,
  isDeclinedGiftStatus,
  resolveBrandRpmRate,
  resolveCreatorBrandTerms,
  saleBrandId,
  type CreatorCampaignLite,
} from "./creator-account";

const COMMISSION_BRAND = "brand-commission";
const RPM_BRAND = "brand-rpm";
const GIFT_BRAND = "brand-gift";

function row(id: string, brandId: string, extra: Partial<{ commission_rate: number | null; discount_code: string | null; balance: number; total_earned: number }> = {}) {
  return {
    id,
    user_id: brandId,
    commission_rate: extra.commission_rate ?? null,
    discount_code: extra.discount_code ?? null,
    balance: extra.balance ?? 0,
    total_earned: extra.total_earned ?? 0,
  };
}

function campaign(partial: Partial<CreatorCampaignLite> & Pick<CreatorCampaignLite, "id" | "brandId">): CreatorCampaignLite {
  return { name: "", isRpm: false, active: true, commissionRate: null, rpmRate: 0, ...partial };
}

/** One commission brand, one RPM brand, one gifting-only brand. */
function mixedCreator() {
  const rows = [
    row("row-c", COMMISSION_BRAND, { commission_rate: 15, discount_code: "ANNA15", balance: 30, total_earned: 45 }),
    row("row-r", RPM_BRAND, { commission_rate: 10, balance: 12.5, total_earned: 12.5 }),
  ];
  const payoutTerms = [
    { id: "row-c", payout_model: "commission", rpm_rate: null },
    { id: "row-r", payout_model: "rpm", rpm_rate: 2.5 },
  ];
  const campaigns = [
    campaign({ id: "camp-c", brandId: COMMISSION_BRAND, commissionRate: 20 }),
    campaign({ id: "camp-r", brandId: RPM_BRAND, isRpm: true, rpmRate: 2.5 }),
    campaign({ id: "camp-r-high", brandId: RPM_BRAND, isRpm: true, rpmRate: 4 }),
  ];
  const campaignLinks = [
    { creatorRowId: "row-c", campaignId: "camp-c", discountCode: "CAMP20" },
    { creatorRowId: "row-r", campaignId: "camp-r", discountCode: null },
  ];
  return { rows, payoutTerms, campaigns, campaignLinks, giftBrandIds: [GIFT_BRAND] };
}

describe("resolveCreatorBrandTerms", () => {
  it("splits a creator with a commission, an RPM and a gifting-only brand", () => {
    const terms = resolveCreatorBrandTerms(mixedCreator());
    expect(terms.map((t) => t.brandId)).toEqual([COMMISSION_BRAND, RPM_BRAND, GIFT_BRAND]);

    const [commission, rpm, gift] = terms;
    expect(commission).toMatchObject({
      models: ["commission"],
      commissionRate: 15,
      rpmRate: null,
      discountCode: "ANNA15",
      primaryRowId: "row-c",
    });
    expect(rpm).toMatchObject({
      models: ["rpm"],
      commissionRate: null,
      rpmRate: 2.5, // creator's own rate wins over the brand's higher campaign
      primaryRowId: "row-r",
    });
    expect(gift).toEqual({
      brandId: GIFT_BRAND,
      models: ["gifting"],
      primaryRowId: null,
      rowIds: [],
      commissionRate: null,
      rpmRate: null,
      discountCode: null,
    });
  });

  it("adds gifting to a brand that also has a creators row, without duplicating it", () => {
    const input = mixedCreator();
    const terms = resolveCreatorBrandTerms({ ...input, giftBrandIds: [COMMISSION_BRAND, COMMISSION_BRAND] });
    expect(terms).toHaveLength(2);
    expect(terms[0].models).toEqual(["commission", "gifting"]);
  });

  it("treats rows without payout_model (column not migrated) as commission", () => {
    const terms = resolveCreatorBrandTerms({ rows: [row("r1", COMMISSION_BRAND, { commission_rate: 12 })] });
    expect(terms[0].models).toEqual(["commission"]);
    expect(terms[0].commissionRate).toBe(12);
  });

  it("marks a commission row enrolled in an active RPM campaign as commission + rpm", () => {
    const terms = resolveCreatorBrandTerms({
      rows: [row("r1", COMMISSION_BRAND)],
      payoutTerms: [{ id: "r1", payout_model: "commission", rpm_rate: null }],
      campaigns: [
        campaign({ id: "rpm-old", brandId: COMMISSION_BRAND, isRpm: true, active: false, rpmRate: 9 }),
        campaign({ id: "rpm", brandId: COMMISSION_BRAND, isRpm: true, rpmRate: 3 }),
        campaign({ id: "comm", brandId: COMMISSION_BRAND, commissionRate: 25 }),
      ],
      campaignLinks: [
        { creatorRowId: "r1", campaignId: "rpm", discountCode: null },
        { creatorRowId: "r1", campaignId: "comm", discountCode: "COMM25" },
      ],
    });
    expect(terms[0]).toMatchObject({
      models: ["commission", "rpm"],
      rpmRate: 3,
      commissionRate: 25, // falls back to the commission campaign when the row has no rate
      discountCode: "COMM25",
    });
  });

  it("ignores ended RPM campaigns when deciding the model", () => {
    const terms = resolveCreatorBrandTerms({
      rows: [row("r1", COMMISSION_BRAND)],
      campaigns: [campaign({ id: "rpm", brandId: COMMISSION_BRAND, isRpm: true, active: false, rpmRate: 3 })],
      campaignLinks: [{ creatorRowId: "r1", campaignId: "rpm", discountCode: null }],
    });
    expect(terms[0].models).toEqual(["commission"]);
    expect(terms[0].rpmRate).toBeNull();
  });
});

describe("resolveBrandRpmRate", () => {
  it("prefers the creator rate, then linked campaigns, then brand campaigns, then €1", () => {
    expect(resolveBrandRpmRate({ rowRpmRates: [2], linkedCampaignRates: [3], brandCampaignRates: [5] })).toBe(2);
    expect(resolveBrandRpmRate({ rowRpmRates: [null], linkedCampaignRates: [3, 1.5], brandCampaignRates: [5] })).toBe(3);
    expect(resolveBrandRpmRate({ rowRpmRates: [], linkedCampaignRates: [0], brandCampaignRates: [5, 4] })).toBe(5);
    expect(resolveBrandRpmRate({ rowRpmRates: [0], linkedCampaignRates: [], brandCampaignRates: [] })).toBe(
      DEFAULT_CREATOR_RPM_RATE,
    );
  });
});

describe("aggregateCommissionByBrand", () => {
  it("gives sales & commissions per brand and no entry for gifting-only brands", () => {
    const input = mixedCreator();
    const terms = resolveCreatorBrandTerms(input);
    const brandByRowId = new Map(input.rows.map((r) => [r.id, r.user_id]));
    const rawSales = [
      { user_id: COMMISSION_BRAND, creator_id: "row-c", order_amount: 100, commission_amount: 15 },
      { user_id: null, creator_id: "row-c", order_amount: 50, commission_amount: 7.5 },
      { user_id: null, creator_id: "unknown-row", order_amount: 999, commission_amount: 99 },
    ];
    const byBrand = aggregateCommissionByBrand({
      terms,
      rows: input.rows,
      sales: rawSales.map((s) => ({
        brandId: saleBrandId(s, brandByRowId),
        orderAmount: s.order_amount,
        commissionAmount: s.commission_amount,
      })),
      brandNameById: new Map([
        [COMMISSION_BRAND, "Comm Co"],
        [RPM_BRAND, "Views Inc"],
      ]),
    });

    expect(byBrand).toEqual([
      {
        brandId: COMMISSION_BRAND,
        brandName: "Comm Co",
        model: "commission",
        commissionRate: 15,
        totalSales: 150,
        totalCommissions: 22.5,
        balance: 30,
        totalEarned: 45, // max(commissions, creators.total_earned)
        salesCount: 2,
      },
      {
        brandId: RPM_BRAND,
        brandName: "Views Inc",
        model: "rpm",
        commissionRate: null,
        totalSales: 0,
        totalCommissions: 0,
        balance: 12.5,
        totalEarned: 12.5,
        salesCount: 0,
      },
    ]);
    expect(byBrand.some((b) => b.brandId === GIFT_BRAND)).toBe(false);
  });

  it("uses commissions as totalEarned when they exceed creators.total_earned", () => {
    const terms = resolveCreatorBrandTerms({ rows: [row("r1", COMMISSION_BRAND)] });
    const [stats] = aggregateCommissionByBrand({
      terms,
      rows: [row("r1", COMMISSION_BRAND, { total_earned: 5 })],
      sales: [{ brandId: COMMISSION_BRAND, orderAmount: 200, commissionAmount: 20 }],
      brandNameById: new Map(),
    });
    expect(stats.totalEarned).toBe(20);
    expect(stats.brandName).toBe("Marque");
  });
});

describe("aggregateRpmByBrand", () => {
  it("sums views and earnings per brand, keeping brands without videos at zero", () => {
    const byBrand = aggregateRpmByBrand({
      brands: [
        { brandId: COMMISSION_BRAND, brandName: "Comm Co", rpmRate: 1, isRpm: false },
        { brandId: RPM_BRAND, brandName: "Views Inc", rpmRate: 2.5, isRpm: true },
      ],
      videos: [
        { brandId: RPM_BRAND, views: 10_000, accrued: 25, pending: 10.005 },
        { brandId: RPM_BRAND, views: 2_000, accrued: 5, pending: 2.001 },
      ],
    });
    expect(byBrand).toEqual([
      { brandId: COMMISSION_BRAND, brandName: "Comm Co", rpmRate: 1, isRpm: false, views: 0, accrued: 0, pending: 0, videos: 0 },
      { brandId: RPM_BRAND, brandName: "Views Inc", rpmRate: 2.5, isRpm: true, views: 12_000, accrued: 30, pending: 12.01, videos: 2 },
    ]);
  });

  it("still reports videos of a brand missing from the list", () => {
    const byBrand = aggregateRpmByBrand({
      brands: [],
      videos: [{ brandId: "other", views: 1000, accrued: 1, pending: 0 }],
    });
    expect(byBrand).toEqual([
      { brandId: "other", brandName: "", rpmRate: 0, isRpm: false, views: 1000, accrued: 1, pending: 0, videos: 1 },
    ]);
  });
});

describe("gift missions", () => {
  it("only declined missions are excluded", () => {
    expect(isDeclinedGiftStatus("declined")).toBe(true);
    expect(isDeclinedGiftStatus(" Declined ")).toBe(true);
    expect(isDeclinedGiftStatus("invited")).toBe(false);
    expect(isDeclinedGiftStatus(null)).toBe(false);
  });
});
