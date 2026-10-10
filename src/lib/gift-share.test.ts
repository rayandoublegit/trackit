import { describe, expect, it } from "vitest";
import {
  checkGiftRequirements,
  creatorsIndexKey,
  generateGiftShareToken,
  giftApplicationStatus,
  giftCampaignAvailability,
  giftCreatorStatsFromIndex,
  giftSharePath,
  giftTakesSpot,
  isGiftShareToken,
  normalizeApplicantHandle,
  parseGiftApplication,
  parseGiftCampaignInput,
  sniffGiftImage,
  toPublicGiftCampaign,
} from "./gift-share";
import { GiftRuleError } from "./gifting";
import { composeNotification } from "./server-notifications-sync";

const today = "2026-10-09";
const prefix = "https://proj.supabase.co/storage/v1/object/public/gift-products/brand-1/";

const base = {
  name: "Routine du matin",
  product: "Sérum Glow 30 ml",
  brief: "Montre ta routine.",
  deadline: "2026-11-01",
  spots: 12,
  allowAds: true,
  rightsDays: 90,
  territories: "France",
};

describe("share token", () => {
  it("is 32 url-safe characters and never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateGiftShareToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(isGiftShareToken(token)).toBe(true);
    }
  });

  it("refuses anything that is not a token shape", () => {
    for (const bad of ["", "short", "a".repeat(21), "a".repeat(65), "abc/def/ghi/jkl/mno/pqr/s", "aaaaaaaaaaaaaaaaaaaaaa aa", null, 42, "../../etc/passwd/aaaaaaaa"]) {
      expect(isGiftShareToken(bad)).toBe(false);
    }
    expect(isGiftShareToken("a".repeat(22))).toBe(true);
  });

  it("builds the localized public path", () => {
    expect(giftSharePath("tok", "en")).toBe("/gift/tok");
    expect(giftSharePath("tok", "fr")).toBe("/fr/gift/tok");
  });
});

describe("campaign input", () => {
  it("creates a campaign without any creator handle, with sensible defaults", () => {
    const input = parseGiftCampaignInput({ ...base }, { today, imagePrefix: prefix });
    expect(input).toMatchObject({
      name: "Routine du matin",
      spots: 12,
      autoApprove: false,
      minFollowers: 0,
      platforms: ["tiktok", "instagram"],
      countries: [],
      productImages: [],
      videoCount: 1,
      allowAds: true,
      rightsDays: 90,
    });
  });

  it("reads euros, countries, platforms and the brand's own photos", () => {
    const input = parseGiftCampaignInput(
      {
        ...base,
        productValue: "45,90",
        countries: "fr, be ch",
        platforms: ["instagram"],
        minFollowers: "5000",
        autoApprove: true,
        productImages: [`${prefix}a.jpg`, `${prefix}a.jpg`, `${prefix}b.png`],
      },
      { today, imagePrefix: prefix },
    );
    expect(input.productValueCents).toBe(4590);
    expect(input.countries).toEqual(["FR", "BE", "CH"]);
    expect(input.platforms).toEqual(["instagram"]);
    expect(input.minFollowers).toBe(5000);
    expect(input.autoApprove).toBe(true);
    expect(input.productImages).toEqual([`${prefix}a.jpg`, `${prefix}b.png`]);
  });

  it("refuses missing fields, past deadlines, bad numbers and foreign photos", () => {
    const opts = { today, imagePrefix: prefix };
    expect(() => parseGiftCampaignInput({ ...base, product: " " }, opts)).toThrow(/Product is required/);
    expect(() => parseGiftCampaignInput({ ...base, deadline: "2026-10-08" }, opts)).toThrow(/past/);
    expect(() => parseGiftCampaignInput({ ...base, deadline: "2026-02-30" }, opts)).toThrow(/valid date/);
    expect(() => parseGiftCampaignInput({ ...base, spots: 0 }, opts)).toThrow(/Spots/);
    expect(() => parseGiftCampaignInput({ ...base, spots: 2.5 }, opts)).toThrow(/Spots/);
    expect(() => parseGiftCampaignInput({ ...base, spots: 501 }, opts)).toThrow(/Spots/);
    expect(() => parseGiftCampaignInput({ ...base, platforms: ["youtube"] }, opts)).toThrow(/platform/);
    expect(() => parseGiftCampaignInput({ ...base, platforms: [] }, opts)).toThrow(/platform/);
    expect(() => parseGiftCampaignInput({ ...base, countries: "France" }, opts)).toThrow(/two-letter/);
    expect(() => parseGiftCampaignInput({ ...base, productImages: ["https://evil.example/x.jpg"] }, opts)).toThrow(/photo/);
    expect(() => parseGiftCampaignInput({ ...base, productImages: [`${prefix.replace("brand-1", "brand-2")}x.jpg`] }, opts)).toThrow(/photo/);
    expect(() => parseGiftCampaignInput({ ...base, productImages: [`${prefix}a.jpg`] }, { today, imagePrefix: null })).toThrow(/photo/);
    expect(() => parseGiftCampaignInput({ ...base, productImages: [1, 2, 3, 4, 5].map((n) => `${prefix}${n}.jpg`) }, opts)).toThrow(/Too many photos/);
    expect(() => parseGiftCampaignInput({ ...base, rightsDays: 0 }, opts)).toThrow(GiftRuleError);
  });
});

describe("availability", () => {
  const open = { status: "active", share_enabled: true, deadline: "2026-11-01", spots: 3 };

  it("counts only missions the brand said yes to", () => {
    expect(["applied", "rejected", "declined"].map(giftTakesSpot)).toEqual([false, false, false]);
    expect(["invited", "accepted", "signed", "approved"].every(giftTakesSpot)).toBe(true);
  });

  it("is open with spots left, then closed for each reason", () => {
    expect(giftCampaignAvailability(open, 1, today)).toEqual({ open: true, reason: "open", spots: 3, taken: 1, spotsLeft: 2 });
    expect(giftCampaignAvailability(open, 3, today).reason).toBe("full");
    expect(giftCampaignAvailability({ ...open, status: "completed" }, 0, today).reason).toBe("closed");
    expect(giftCampaignAvailability({ ...open, share_enabled: false }, 0, today).reason).toBe("disabled");
    expect(giftCampaignAvailability({ ...open, deadline: "2026-10-08" }, 0, today).reason).toBe("expired");
    expect(giftCampaignAvailability({ ...open, deadline: today }, 0, today).open).toBe(true);
    expect(giftCampaignAvailability({ ...open, spots: null }, 99, today)).toMatchObject({ open: true, spotsLeft: null });
  });
});

describe("requirements and application", () => {
  const stats = giftCreatorStatsFromIndex({ followers: 12000, avg_views: 5400, engagement_rate: 6.2, country_code: "fr", avatar_url: "https://cdn/x.jpg", display_name: "Léa" });

  it("maps creators_index rows and keys", () => {
    expect(stats).toEqual({ followers: 12000, avgViews: 5400, engagementRate: 6.2, country: "FR", avatarUrl: "https://cdn/x.jpg", displayName: "Léa" });
    expect(giftCreatorStatsFromIndex(null)).toBeNull();
    expect(giftCreatorStatsFromIndex({ avatar_url: "javascript:alert(1)" })?.avatarUrl).toBeNull();
    expect(creatorsIndexKey("instagram", "lea")).toBe("ig_lea");
    expect(creatorsIndexKey("tiktok", "lea")).toBe("lea");
  });

  it("checks platform, followers and country, and sends unknown stats to manual review", () => {
    const campaign = { platforms: ["tiktok"], min_followers: 10000, countries: ["FR", "BE"] };
    expect(checkGiftRequirements(campaign, "tiktok", stats)).toEqual({ ok: true, failures: [], needsReview: false });
    expect(checkGiftRequirements(campaign, "instagram", stats).failures).toEqual(["platform"]);
    expect(checkGiftRequirements({ ...campaign, min_followers: 20000 }, "tiktok", stats).failures).toEqual(["followers"]);
    expect(checkGiftRequirements({ ...campaign, countries: ["US"] }, "tiktok", stats).failures).toEqual(["country"]);
    expect(checkGiftRequirements(campaign, "tiktok", null)).toEqual({ ok: true, failures: [], needsReview: true });
    expect(checkGiftRequirements({ platforms: null, min_followers: 0, countries: [] }, "instagram", null)).toEqual({ ok: true, failures: [], needsReview: false });
  });

  it("auto-approves only checked and met requirements", () => {
    const met = { ok: true, failures: [], needsReview: false };
    expect(giftApplicationStatus(true, met)).toBe("invited");
    expect(giftApplicationStatus(false, met)).toBe("applied");
    expect(giftApplicationStatus(true, { ...met, needsReview: true })).toBe("applied");
  });

  it("normalizes handles and refuses junk", () => {
    expect(normalizeApplicantHandle("@Lea.Test")).toBe("lea.test");
    expect(normalizeApplicantHandle("https://www.tiktok.com/@lea_t?lang=fr")).toBe("lea_t");
    expect(normalizeApplicantHandle("instagram.com/lea.t/")).toBe("lea.t");
    for (const bad of ["", "a", "lea test", "<script>", ".lea", "x".repeat(31)]) expect(normalizeApplicantHandle(bad)).toBeNull();
  });

  it("validates the application form", () => {
    const ok = parseGiftApplication({ acceptTerms: true, platform: "tiktok", handle: "@lea", message: " Salut " }, ["tiktok"]);
    expect(ok).toEqual({ ok: true, value: { platform: "tiktok", handle: "lea", message: "Salut" } });
    expect(parseGiftApplication({ platform: "tiktok", handle: "lea" }, null)).toEqual({ ok: false, code: "terms" });
    expect(parseGiftApplication({ acceptTerms: true, platform: "instagram", handle: "lea" }, ["tiktok"])).toEqual({ ok: false, code: "platform" });
    expect(parseGiftApplication({ acceptTerms: true, platform: "youtube", handle: "lea" }, null)).toEqual({ ok: false, code: "platform" });
    expect(parseGiftApplication({ acceptTerms: true, platform: "tiktok", handle: "no way" }, null)).toEqual({ ok: false, code: "handle" });
    expect(parseGiftApplication({ acceptTerms: true, platform: "tiktok", handle: "lea", message: "x".repeat(501) }, null)).toEqual({ ok: false, code: "message" });
  });
});

describe("public campaign", () => {
  const row = {
    id: "camp-1",
    user_id: "brand-secret-id",
    workspace_id: "ws-secret",
    share_token: "t".repeat(32),
    name: "Routine",
    product: "Sérum",
    brief: "Brief",
    status: "active",
    share_enabled: true,
    deadline: "2026-11-01",
    spots: 5,
    video_count: 2,
    allow_ads: false,
    rights_days: 90,
    territories: "France",
    fixed_fee_cents: 0,
    currency: "EUR",
    offer: "Le sérum",
    product_value_cents: 4500,
    product_images: ["https://img/1.jpg", "http://insecure/2.jpg"],
    platforms: ["tiktok"],
    countries: ["FR"],
    min_followers: 1000,
    auto_approve: true,
  };

  it("keeps public fields only", () => {
    const pub = toPublicGiftCampaign(row, { name: "Maison", logoUrl: null }, 2, today);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("brand-secret-id");
    expect(json).not.toContain("ws-secret");
    expect(json).not.toContain("camp-1");
    expect(pub.images).toEqual(["https://img/1.jpg"]);
    expect(pub.availability).toMatchObject({ open: true, spotsLeft: 3 });
    // No ad use: the stored duration and territories are not shown.
    expect(pub.rightsDays).toBe(0);
    expect(pub.territories).toBe("");
    expect(pub.contentCount).toBe(2);
  });

  it("shows the link as inactive when the brand cannot publish", () => {
    const pub = toPublicGiftCampaign(row, { name: "Maison", logoUrl: null }, 0, today, { brandCanPublish: false });
    expect(pub.availability).toMatchObject({ open: false, reason: "disabled" });
  });
});

describe("product photos and notifications", () => {
  it("knows images by their bytes, not their name", () => {
    expect(sniffGiftImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffGiftImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffGiftImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))?.ext).toBe("webp");
    expect(sniffGiftImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("tells the brand someone applied, in both languages", () => {
    const item = { id: "n1", type: "gift_application", created_at: "2026-10-09T10:00:00Z", payload: { creatorName: "Léa", handle: "lea", campaignName: "Routine", autoApproved: false } };
    expect(composeNotification("fr", item)?.title).toBe("Léa (@lea) veut participer à votre campagne cadeau");
    expect(composeNotification("en", item)?.body).toContain("to review in Gifting");
    expect(composeNotification("en", { ...item, payload: { ...item.payload, autoApproved: true } })?.title).toBe("Léa (@lea) joined your gift campaign");
  });
});
