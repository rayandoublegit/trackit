import { describe, expect, it } from "vitest";
import {
  attributeSaleToCampaigns,
  buildCampaignCreatorLinkMap,
  computeCampaignSalesTotals,
  isSaleAttributedToCampaign,
} from "./campaign-sales-attribution";

const creatorCounts = {
  campA: ["creator1"],
  campB: ["creator1", "creator2"],
  campC: ["creator2"],
};

describe("campaign sales attribution", () => {
  it("attributes a sale to every campaign that contains the creator", () => {
    const sale = { creator_id: "creator1", order_amount: 100, commission_amount: 10 };
    expect(attributeSaleToCampaigns(sale, creatorCounts).sort()).toEqual(["campA", "campB"]);
    expect(isSaleAttributedToCampaign(sale, "campA", creatorCounts)).toBe(true);
    expect(isSaleAttributedToCampaign(sale, "campB", creatorCounts)).toBe(true);
    expect(isSaleAttributedToCampaign(sale, "campC", creatorCounts)).toBe(false);
  });

  it("does not pin historical sales to only the newest campaign_id", () => {
    const sale = {
      creator_id: "creator1",
      campaign_id: "campC",
      order_amount: 50,
      commission_amount: 5,
    };
    expect(attributeSaleToCampaigns(sale, creatorCounts).sort()).toEqual(["campA", "campB"]);
    expect(isSaleAttributedToCampaign(sale, "campA", creatorCounts)).toBe(true);
    expect(isSaleAttributedToCampaign(sale, "campC", creatorCounts)).toBe(false);
  });

  it("sums totals per campaign without losing creator membership sales", () => {
    const totals = computeCampaignSalesTotals(
      [
        { creator_id: "creator1", order_amount: 100, commission_amount: 10 },
        { creator_id: "creator2", order_amount: 40, commission_amount: 4 },
      ],
      creatorCounts,
    );
    expect(totals.campA).toEqual({ sales: 100, commission: 10 });
    expect(totals.campB).toEqual({ sales: 140, commission: 14 });
    expect(totals.campC).toEqual({ sales: 40, commission: 4 });
  });

  it("excludes pre-join sales when historical_sales_attached is false", () => {
    const linkMeta = buildCampaignCreatorLinkMap([
      {
        campaign_id: "campA",
        creator_id: "creator1",
        historical_sales_attached: false,
        created_at: "2026-06-01T12:00:00.000Z",
      },
    ]);

    const oldSale = {
      creator_id: "creator1",
      order_amount: 100,
      commission_amount: 10,
      created_at: "2026-05-01T12:00:00.000Z",
    };
    const newSale = {
      creator_id: "creator1",
      order_amount: 50,
      commission_amount: 5,
      created_at: "2026-06-15T12:00:00.000Z",
    };

    expect(isSaleAttributedToCampaign(oldSale, "campA", creatorCounts, linkMeta)).toBe(false);
    expect(isSaleAttributedToCampaign(newSale, "campA", creatorCounts, linkMeta)).toBe(true);

    const totals = computeCampaignSalesTotals([oldSale, newSale], creatorCounts, linkMeta);
    expect(totals.campA).toEqual({ sales: 50, commission: 5 });
    expect(attributeSaleToCampaigns(oldSale, creatorCounts, linkMeta)).toEqual(["campB"]);
    expect(attributeSaleToCampaigns(newSale, creatorCounts, linkMeta).sort()).toEqual(["campA", "campB"]);
  });

  it("includes all brand sales when historical_sales_attached is true", () => {
    const linkMeta = buildCampaignCreatorLinkMap([
      {
        campaign_id: "campA",
        creator_id: "creator1",
        historical_sales_attached: true,
        created_at: "2026-06-01T12:00:00.000Z",
      },
    ]);

    const oldSale = {
      creator_id: "creator1",
      order_amount: 100,
      commission_amount: 10,
      created_at: "2026-05-01T12:00:00.000Z",
    };

    expect(isSaleAttributedToCampaign(oldSale, "campA", creatorCounts, linkMeta)).toBe(true);
  });
});
