import { describe, expect, it } from "vitest";
import {
  SAMPLE_CAMPAIGN_DETAILS,
  SAMPLE_GIFT_STAGES,
  getSampleCampaignDetail,
  sampleCampaignTotals,
  sampleDailyRevenue,
  sampleGiftCounts,
  sampleWeekTrend,
} from "./sample-campaign-preview";
import { SAMPLE_CAMPAIGNS } from "./sample-workspace";

describe("sample campaign preview data", () => {
  it("has a detail for every sample campaign in the list", () => {
    for (const campaign of SAMPLE_CAMPAIGNS) {
      expect(getSampleCampaignDetail(campaign.id)).not.toBeNull();
    }
    expect(getSampleCampaignDetail("real-campaign")).toBeNull();
  });

  it("keeps the list card in line with the detail totals", () => {
    for (const campaign of SAMPLE_CAMPAIGNS) {
      const totals = sampleCampaignTotals(SAMPLE_CAMPAIGN_DETAILS[campaign.id]);
      expect(campaign.sales).toBe(totals.revenue);
      expect(campaign.commission).toBe(totals.commission);
      expect(campaign.creators).toBe(totals.creators);
      expect(campaign.creatorIds.length).toBe(totals.creators);
    }
  });

  it("spreads revenue over the chart without losing a euro", () => {
    for (const detail of Object.values(SAMPLE_CAMPAIGN_DETAILS)) {
      const days = sampleDailyRevenue(detail);
      expect(days).toHaveLength(detail.dailyShape.length);
      if (days.length > 0) {
        expect(days.reduce((sum, v) => sum + v, 0)).toBe(sampleCampaignTotals(detail).revenue);
        expect(days.every((v) => v >= 0 && Number.isInteger(v))).toBe(true);
      }
    }
  });

  it("does not count shortlisted creators as engaged", () => {
    const draft = sampleCampaignTotals(SAMPLE_CAMPAIGN_DETAILS["sample-draft"]);
    expect(draft.creators).toBe(0);
    expect(draft.revenue).toBe(0);
    expect(draft.roi).toBeNull();
  });

  it("only references creators that belong to the campaign", () => {
    for (const detail of Object.values(SAMPLE_CAMPAIGN_DETAILS)) {
      const ids = new Set(detail.creators.map((c) => c.id));
      for (const item of detail.content) expect(ids.has(item.creatorId)).toBe(true);
      for (const gift of detail.gifts) expect(ids.has(gift.creatorId)).toBe(true);
      for (const event of detail.activity) expect(ids.has(event.creatorId)).toBe(true);
    }
  });

  it("counts every gift in exactly one stage", () => {
    for (const detail of Object.values(SAMPLE_CAMPAIGN_DETAILS)) {
      const counts = sampleGiftCounts(detail);
      expect(Object.keys(counts)).toEqual(SAMPLE_GIFT_STAGES);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(detail.gifts.length);
    }
  });

  it("never pays a creator more than they earned", () => {
    for (const detail of Object.values(SAMPLE_CAMPAIGN_DETAILS)) {
      const totals = sampleCampaignTotals(detail);
      expect(totals.paid).toBeLessThanOrEqual(totals.commission);
      expect(totals.owed).toBeCloseTo(totals.commission - totals.paid, 2);
    }
  });
});

describe("sampleWeekTrend", () => {
  it("compares the last week with the one before", () => {
    const trend = sampleWeekTrend(SAMPLE_CAMPAIGN_DETAILS["sample-summer"]);
    expect(trend).not.toBeNull();
    expect(trend!).toBeGreaterThan(0);
  });

  it("returns null when the campaign is younger than two weeks of sales", () => {
    expect(sampleWeekTrend(SAMPLE_CAMPAIGN_DETAILS["sample-launch"])).toBeNull();
    expect(sampleWeekTrend(SAMPLE_CAMPAIGN_DETAILS["sample-draft"])).toBeNull();
  });
});
