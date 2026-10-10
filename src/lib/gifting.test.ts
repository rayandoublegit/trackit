import { describe, expect, it } from "vitest";
import {
  applyGiftAction,
  buildGiftContract,
  contractGrantsAdUse,
  giftContentProgress,
  giftContentType,
  giftExpectedCount,
  GiftRuleError,
  parseGiftCampaignRights,
  type GiftMission,
} from "./gifting";
import { friendlyGiftError, giftContentsLabel, giftNextStep, giftStats } from "./gifting-board";

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
    expectedCount: 1,
    contents: [],
    approvedAt: null,
    ...patch,
  };
}

/** A mission whose parcel has arrived, waiting for `expectedCount` contents. */
function delivered(expectedCount: number, patch: Partial<GiftMission> = {}) {
  return mission({ status: "delivered", expectedCount, ...patch });
}

function submit(position: number, kind: "video" | "photo" = "video") {
  return {
    type: "submit" as const,
    position,
    name: `content-${position}.${kind === "photo" ? "jpg" : "mp4"}`,
    storagePath: `m/${position}`,
    kind,
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
    expect(text).toContain("Autorisation d’utiliser les contenus en publicité : oui");
    expect(text).toContain("Contenus attendus : 1 (vidéos ou photos).");
    expect(text).toContain("à compter de la validation de tous les contenus");
    expect(text).toContain("est sans effet sur celui-ci");
    expect(text).toContain("Date limite : 23/10/2026");
    expect(text).not.toMatch(/\btu\b/i);
    expect(contractGrantsAdUse(text)).toBe(true);
  });

  it("formats the French fee the French way", () => {
    const text = buildGiftContract({
      lang: "fr",
      brandName: "Maison Bloom",
      creatorHandle: "lea.glow",
      campaignName: "Routine",
      product: "Sérum",
      brief: "Routine du matin.",
      videoCount: 1,
      deadline: "2026-10-23",
      fixedFeeCents: 123450,
      allowAds: false,
      rightsDays: 0,
      territories: "",
    });
    expect(text).toMatch(/Rémunération forfaitaire : 1\s234,50\s€\./);
    expect(text).toContain("Autorisation d’utiliser les contenus en publicité : non.");
    expect(contractGrantsAdUse(text)).toBe(false);
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
    expect(text).toContain("Authorization to use the content in ads: not granted");
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
    // An older caller: no position, videoName instead of name. It is slot 1.
    current = applyGiftAction(current, { type: "submit", videoName: "routine.mp4" }, now);
    expect(current.status).toBe("submitted");
    expect(current.contents).toEqual([
      expect.objectContaining({ position: 1, name: "routine.mp4", kind: "video", status: "pending" }),
    ]);
    current = applyGiftAction(current, { type: "approve" }, now);
    expect(current.status).toBe("approved");
    expect(current.approvedAt).toBe(now);
    expect(current.contents[0].approvedAt).toBe(now);
    expect(() => applyGiftAction(current, { type: "approve" }, later)).toThrow(GiftRuleError);
    expect(current.approvedAt).toBe(now);
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

describe("several contents per mission", () => {
  it("stays delivered until every expected slot holds a content, then waits for review", () => {
    let current = applyGiftAction(delivered(3), submit(1), now);
    expect(current.status).toBe("delivered");
    current = applyGiftAction(current, submit(3, "photo"), now);
    expect(current.status).toBe("delivered");
    expect(giftContentProgress(current.contents, current.expectedCount)).toMatchObject({ expected: 3, sent: 2, pending: 2 });
    current = applyGiftAction(current, submit(2), now);
    expect(current.status).toBe("submitted");
    expect(current.contents.map((c) => [c.position, c.kind])).toEqual([[1, "video"], [2, "video"], [3, "photo"]]);
  });

  it("approves item by item and sets the ad-rights date on the last approval only", () => {
    let current = delivered(3);
    for (const p of [1, 2, 3]) current = applyGiftAction(current, submit(p), now);
    current = applyGiftAction(current, { type: "approve", position: 2 }, now);
    expect(current.status).toBe("submitted");
    expect(current.approvedAt).toBeNull();
    current = applyGiftAction(current, { type: "request_changes", position: 1, feedback: "Plus de lumière" }, now);
    expect(current.contents[0]).toMatchObject({ status: "changes_requested", feedback: "Plus de lumière" });
    expect(current.status).toBe("submitted");
    current = applyGiftAction(current, { type: "approve", position: 3 }, now);
    expect(current.status).toBe("submitted");
    // Re-sending slot 1 puts it back in review.
    current = applyGiftAction(current, submit(1), later);
    expect(current.contents[0]).toMatchObject({ status: "pending", feedback: "" });
    current = applyGiftAction(current, { type: "approve", position: 1 }, later);
    expect(current.status).toBe("approved");
    expect(current.approvedAt).toBe(later);
    expect(current.contents.find((c) => c.position === 2)?.approvedAt).toBe(now);
  });

  it("lets the brand review a content before every slot is filled", () => {
    let current = applyGiftAction(delivered(2), submit(1), now);
    current = applyGiftAction(current, { type: "approve", position: 1 }, now);
    expect(current.status).toBe("delivered");
    expect(current.approvedAt).toBeNull();
    current = applyGiftAction(current, submit(2), now);
    expect(current.status).toBe("submitted");
    current = applyGiftAction(current, { type: "approve", position: 2 }, later);
    expect(current.status).toBe("approved");
    expect(current.approvedAt).toBe(later);
  });

  it("refuses a slot outside 1..expected, an empty slot review, and replacing an approved content", () => {
    const current = applyGiftAction(delivered(2), submit(1), now);
    expect(() => applyGiftAction(current, submit(3), now)).toThrow(/does not expect/);
    expect(() => applyGiftAction(current, { ...submit(1), position: 0 }, now)).toThrow(/position/);
    expect(() => applyGiftAction(current, { ...submit(1), position: 1.5 }, now)).toThrow(/position/);
    expect(() => applyGiftAction(current, { type: "approve", position: 2 }, now)).toThrow(GiftRuleError);
    expect(() => applyGiftAction(current, { type: "request_changes", position: 2, feedback: "x" }, now)).toThrow(GiftRuleError);
    const approved = applyGiftAction(current, { type: "approve", position: 1 }, now);
    expect(() => applyGiftAction(approved, submit(1), later)).toThrow(/already approved/);
    expect(() => applyGiftAction(approved, { type: "request_changes", position: 1, feedback: "x" }, later)).toThrow(GiftRuleError);
    expect(() => applyGiftAction(mission({ status: "shipped", expectedCount: 2 }), submit(1), now)).toThrow(GiftRuleError);
  });

  it("keeps an old single-video mission working and ignores a stray row past the expected count", () => {
    const legacy = mission({
      status: "submitted",
      expectedCount: 1,
      contents: [
        { position: 1, name: "old.mp4", kind: "video", status: "pending", feedback: "", approvedAt: null, storagePath: "m/old" },
        { position: 4, name: "stray.mp4", kind: "video", status: "pending", feedback: "", approvedAt: null, storagePath: "m/x" },
      ],
    });
    const done = applyGiftAction(legacy, { type: "approve" }, now);
    expect(done.status).toBe("approved");
    expect(done.approvedAt).toBe(now);
  });

  it("clamps the expected count and counts progress", () => {
    expect(giftExpectedCount(undefined)).toBe(1);
    expect(giftExpectedCount(0)).toBe(1);
    expect(giftExpectedCount("3")).toBe(3);
    expect(giftExpectedCount(99)).toBe(20);
    expect(giftContentProgress([{ status: "approved" }, { position: 2, status: "changes_requested" }], 3)).toEqual({
      expected: 3,
      sent: 2,
      approved: 1,
      changesRequested: 1,
      pending: 0,
    });
  });

  it("knows which files are videos and which are photos, with their limits", () => {
    expect(giftContentType("video/quicktime")).toMatchObject({ kind: "video", extension: "mov", maxBytes: 500 * 1024 * 1024 });
    expect(giftContentType("image/jpeg")).toMatchObject({ kind: "photo", extension: "jpg", maxBytes: 25 * 1024 * 1024 });
    expect(giftContentType("image/gif")).toBeNull();
  });
});

describe("board texts for several contents", () => {
  const partial = giftContentProgress([{ position: 1, status: "approved" }, { position: 2, status: "pending" }], 3);

  it("counts sent and approved contents in both languages", () => {
    expect(giftContentsLabel(partial, "en")).toBe("2/3 contents sent");
    expect(giftContentsLabel(partial, "fr")).toBe("2/3 contenus envoyés");
    expect(giftContentsLabel(partial, "fr", "approved")).toBe("1/3 contenu validé");
    expect(giftContentsLabel({ expected: 1, sent: 1, approved: 0 }, "en")).toBe("1/1 content sent");
  });

  it("tells each side what is next with the progress", () => {
    expect(giftNextStep("delivered", true, "en", partial)).toMatch(/^2\/3 contents sent\. Upload the remaining contents/);
    expect(giftNextStep("delivered", false, "fr", partial)).toMatch(/^2\/3 contenus envoyés, 1\/3 contenu validé\. Ouvrez chaque contenu/);
    const fix = giftContentProgress([{ position: 1, status: "changes_requested" }, { position: 2, status: "pending" }], 2);
    expect(giftNextStep("submitted", true, "fr", fix)).toMatch(/demande une modification/);
    expect(giftNextStep("submitted", false, "en")).toMatch(/Open each content/);
    for (const text of [giftNextStep("delivered", true, "fr", partial), giftNextStep("submitted", false, "fr", fix)]) {
      expect(text).not.toMatch(/\btu\b|\bton\b|\bta\b/i);
    }
  });

  it("counts a mission with a content waiting as to review, even before every slot is filled", () => {
    expect(giftStats([{ status: "delivered", pendingContents: 1 }, { status: "delivered" }, { status: "submitted" }]).toReview).toBe(2);
  });

  it("translates the new rule errors", () => {
    expect(friendlyGiftError("This content is already approved.", "fr")).toBe("Ce contenu est déjà validé.");
    expect(friendlyGiftError("Content name is required.", "fr")).toBe("Le nom du contenu est obligatoire.");
    expect(friendlyGiftError("Upload an MP4, MOV or WebM video up to 500 MB, or a JPEG, PNG or WebP photo up to 25 MB.", "fr")).toMatch(/25 Mo/);
  });
});

describe("contract with several contents", () => {
  const terms = {
    brandName: "Maison Bloom",
    creatorHandle: "lea.glow",
    campaignName: "Routine",
    product: "Serum",
    brief: "Morning routine.",
    videoCount: 3,
    deadline: "2026-10-23",
    fixedFeeCents: 0,
    allowAds: true,
    rightsDays: 30,
    territories: "France",
  };

  it("states how many contents are expected in both languages", () => {
    const en = buildGiftContract({ ...terms, lang: "en" });
    const fr = buildGiftContract({ ...terms, lang: "fr" });
    expect(en).toContain("Contents expected: 3 (videos or photos).");
    expect(fr).toContain("Contenus attendus : 3 (vidéos ou photos).");
    expect(en).toContain("Authorization to use the content in ads: granted. Duration: 30 days from the approval of all contents.");
    expect(contractGrantsAdUse(en)).toBe(true);
    expect(contractGrantsAdUse(fr)).toBe(true);
    expect(contractGrantsAdUse(buildGiftContract({ ...terms, lang: "en", allowAds: false }))).toBe(false);
  });

  it("still reads the ad term of contracts frozen with the old wording", () => {
    expect(contractGrantsAdUse("Videos: 1.\nAuthorization to use the videos in ads: granted. Duration: 90 days.")).toBe(true);
    expect(contractGrantsAdUse("Autorisation d’utiliser les vidéos en publicité : oui. Durée : 90 jours.")).toBe(true);
    expect(contractGrantsAdUse("Autorisation d’utiliser les vidéos en publicité : non.")).toBe(false);
    expect(contractGrantsAdUse("Brief : Authorization to use the content in ads: granted.")).toBe(false);
  });
});

describe("applications from the share link", () => {
  const applied = () => mission({ status: "applied" });

  it("approving an application opens the usual flow: accept, sign, ship", () => {
    let current = applyGiftAction(applied(), { type: "approve_application" }, now);
    expect(current.status).toBe("invited");
    current = applyGiftAction(current, { type: "accept" }, now);
    current = applyGiftAction(current, { type: "sign", name: "Léa Moreau", consent: true, address }, now);
    expect(current.status).toBe("signed");
  });

  it("declining or withdrawing is final", () => {
    const rejected = applyGiftAction(applied(), { type: "decline_application" }, now);
    expect(rejected.status).toBe("rejected");
    expect(() => applyGiftAction(rejected, { type: "approve_application" }, now)).toThrow(/already reviewed/);
    expect(() => applyGiftAction(rejected, { type: "accept" }, now)).toThrow(GiftRuleError);
    const withdrawn = applyGiftAction(applied(), { type: "withdraw" }, now);
    expect(withdrawn.status).toBe("declined");
    expect(() => applyGiftAction(withdrawn, { type: "approve_application" }, now)).toThrow(GiftRuleError);
  });

  it("an application cannot skip the brand's review, and review actions need an application", () => {
    expect(() => applyGiftAction(applied(), { type: "accept" }, now)).toThrow(/no longer be accepted/);
    expect(() => applyGiftAction(applied(), { type: "decline" }, now)).toThrow(/no longer be declined/);
    expect(() => applyGiftAction(applied(), { type: "ship", carrier: "UPS", trackingNumber: "1Z" }, now)).toThrow(GiftRuleError);
    expect(() => applyGiftAction(mission(), { type: "approve_application" }, now)).toThrow(/already reviewed/);
    expect(() => applyGiftAction(mission({ status: "accepted" }), { type: "withdraw" }, now)).toThrow(/withdrawn/);
  });

  it("board texts know applications", () => {
    expect(giftNextStep("applied", true, "fr")).toBe("Candidature envoyée. La marque te répond ici.");
    expect(giftNextStep("applied", false, "en")).toBe("New application: approve or decline it.");
    expect(giftStats([{ status: "applied" }, { status: "rejected" }, { status: "invited" }])).toMatchObject({ applicants: 1, active: 1 });
    expect(friendlyGiftError("Every spot of this campaign is taken.", "fr")).toBe("Toutes les places de cette campagne sont prises.");
  });
});
