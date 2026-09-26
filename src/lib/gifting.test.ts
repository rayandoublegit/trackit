import { describe, expect, it } from "vitest";
import {
  applyGiftAction,
  buildGiftContract,
  contractGrantsAdUse,
  GiftRuleError,
  parseGiftCampaignRights,
  type GiftMission,
} from "./gifting";

const now = "2026-09-23T12:00:00.000Z";
const later = "2026-10-01T12:00:00.000Z";

function mission(patch: Partial<GiftMission> = {}): GiftMission {
  return {
    status: "invited",
    contractText: "Texte figé.",
    signedName: null,
    signedAt: null,
    address: null,
    carrier: null,
    trackingNumber: null,
    shippedAt: null,
    deliveredAt: null,
    video: null,
    ...patch,
  };
}

const address = {
  name: "Léa Moreau",
  line: "1 rue des Fleurs",
  postalCode: "75011",
  city: "Paris",
  country: "France",
};

describe("gift contract", () => {
  it("keeps the approved ad duration and territories in campaign input", () => {
    expect(parseGiftCampaignRights({ allowAds: true, rightsDays: 90, territories: " France " })).toEqual({
      allowAds: true,
      rightsDays: 90,
      territories: "France",
    });
    expect(() => parseGiftCampaignRights({ allowAds: true, rightsDays: 0, territories: "France" })).toThrow(GiftRuleError);
    expect(() => parseGiftCampaignRights({ allowAds: true, rightsDays: 90, territories: "" })).toThrow(GiftRuleError);
  });

  it("writes the ad term into the text that will be frozen", () => {
    const text = buildGiftContract({
      lang: "fr",
      brandName: "Maison Bloom",
      creatorHandle: "lea.glow",
      campaignName: "Routine",
      product: "Sérum",
      brief: "Routine du matin.",
      videoCount: 1,
      deadline: "2026-10-23",
      fixedFeeCents: 0,
      allowAds: true,
      rightsDays: 90,
      territories: "France",
    });
    expect(text).toContain("90 jours");
    expect(text).toContain("France");
    expect(text).toContain("Autorisation d’utiliser les vidéos en publicité : oui");
    expect(text).toContain("ne le réécrit pas");
    expect(contractGrantsAdUse(text)).toBe(true);
  });

  it("states when the videos cannot be used in ads", () => {
    const text = buildGiftContract({
      lang: "en",
      brandName: "Maison Bloom",
      creatorHandle: "lea.glow",
      campaignName: "Routine",
      product: "Serum",
      brief: "Morning routine.",
      videoCount: 1,
      deadline: "2026-10-23",
      fixedFeeCents: 0,
      allowAds: false,
      rightsDays: 0,
      territories: "France",
    });
    expect(text).toContain("Authorization to use the videos in ads: not granted");
    expect(contractGrantsAdUse(text)).toBe(false);
  });

  it("does not mistake a quoted phrase in the brief for a rights grant", () => {
    const text = buildGiftContract({
      lang: "fr",
      brandName: "Maison Bloom",
      creatorHandle: "lea.glow",
      campaignName: "Routine",
      product: "Sérum",
      brief: "Exemple à éviter : Autorisation d’utiliser les vidéos en publicité : oui.",
      videoCount: 1,
      deadline: "2026-10-23",
      fixedFeeCents: 0,
      allowAds: false,
      rightsDays: 0,
      territories: "",
    });
    expect(contractGrantsAdUse(text)).toBe(false);
  });

  it("refuses to grant ad rights without a duration and territory", () => {
    const terms = {
      lang: "fr" as const,
      brandName: "Maison Bloom",
      creatorHandle: "lea.glow",
      campaignName: "Routine",
      product: "Sérum",
      brief: "Routine du matin.",
      videoCount: 1,
      deadline: "2026-10-23",
      fixedFeeCents: 0,
      allowAds: true,
      rightsDays: 0,
      territories: "",
    };
    expect(() => buildGiftContract(terms)).toThrow(GiftRuleError);
    expect(() => buildGiftContract({ ...terms, rightsDays: 90 })).toThrow(GiftRuleError);
    expect(() => buildGiftContract({ ...terms, territories: "France" })).toThrow(GiftRuleError);
  });
});

describe("gift mission", () => {
  it("walks from invite to a first approval and keeps that date", () => {
    let current = applyGiftAction(mission(), { type: "accept" }, now);
    current = applyGiftAction(
      current,
      { type: "sign", name: "Léa Moreau", consent: true, address },
      now,
    );
    expect(current.contractText).toBe("Texte figé.");
    current = applyGiftAction(
      current,
      { type: "ship", carrier: "Colissimo", trackingNumber: "AB123" },
      now,
    );
    current = applyGiftAction(current, { type: "deliver" }, now);
    current = applyGiftAction(current, { type: "submit", videoName: "routine.mp4" }, now);
    current = applyGiftAction(current, { type: "approve" }, now);
    expect(current.video?.approvedAt).toBe(now);
    current = applyGiftAction(
      { ...current, status: "submitted" },
      { type: "approve" },
      later,
    );
    expect(current.video?.approvedAt).toBe(now);
  });

  it("refuses a shipment before the signature and a rewrite of a declined mission", () => {
    expect(() =>
      applyGiftAction(mission(), { type: "ship", carrier: "Colissimo", trackingNumber: "AB" }, now),
    ).toThrow(GiftRuleError);
    const declined = applyGiftAction(mission(), { type: "decline" }, now);
    expect(() => applyGiftAction(declined, { type: "accept" }, now)).toThrow(GiftRuleError);
  });

  it("asks for consent and a complete address", () => {
    const accepted = applyGiftAction(mission(), { type: "accept" }, now);
    expect(() =>
      applyGiftAction(
        accepted,
        { type: "sign", name: "Léa", consent: false, address },
        now,
      ),
    ).toThrow(/consent/i);
  });
});
