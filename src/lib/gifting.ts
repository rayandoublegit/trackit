export const GIFT_STATUSES = [
  "invited",
  "accepted",
  "declined",
  "signed",
  "shipped",
  "delivered",
  "submitted",
  "approved",
] as const;

export type GiftStatus = (typeof GIFT_STATUSES)[number];

export type ShippingAddress = {
  name: string;
  line: string;
  postalCode: string;
  city: string;
  country: string;
};

export type GiftVideo = {
  name: string;
  status: "pending" | "changes_requested" | "approved";
  feedback: string;
  approvedAt: string | null;
};

export type GiftMission = {
  status: GiftStatus;
  contractText: string;
  signedName: string | null;
  signedAt: string | null;
  address: ShippingAddress | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  video: GiftVideo | null;
};

export type GiftAction =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "sign"; name: string; consent: boolean; address: ShippingAddress }
  | { type: "ship"; carrier: string; trackingNumber: string }
  | { type: "deliver" }
  | { type: "submit"; videoName: string; storagePath: string }
  | { type: "approve" }
  | { type: "request_changes"; feedback: string };

export class GiftRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiftRuleError";
  }
}

function required(value: string, label: string, max = 200) {
  const text = value.trim();
  if (!text) throw new GiftRuleError(`${label} is required.`);
  if (text.length > max) throw new GiftRuleError(`${label} is too long.`);
  return text;
}

export function normalizeHandle(handle: string) {
  return required(handle, "Handle", 80).replace(/^@+/, "").toLowerCase();
}

export function parseGiftCampaignRights(input: {
  allowAds?: unknown;
  rightsDays?: unknown;
  territories?: unknown;
}) {
  if (input.allowAds !== true) {
    return { allowAds: false, rightsDays: 0, territories: "" };
  }
  const rightsDays = Number(input.rightsDays);
  if (!Number.isSafeInteger(rightsDays) || rightsDays <= 0) {
    throw new GiftRuleError("Advertising rights need a duration.");
  }
  const territories = required(String(input.territories ?? ""), "Territories", 200);
  return { allowAds: true, rightsDays, territories };
}

export function buildGiftContract(input: {
  lang: "fr" | "en";
  brandName: string;
  creatorHandle: string;
  campaignName: string;
  product: string;
  brief: string;
  videoCount: number;
  deadline: string;
  fixedFeeCents: number;
  allowAds: boolean;
  rightsDays: number;
  territories: string;
}) {
  if (input.allowAds && (!Number.isSafeInteger(input.rightsDays) || input.rightsDays <= 0)) {
    throw new GiftRuleError("Advertising rights need a duration.");
  }
  const territories = input.allowAds ? required(input.territories, "Territories", 200) : "";
  const fee =
    input.fixedFeeCents > 0
      ? `${(input.fixedFeeCents / 100).toFixed(2)} EUR`
      : input.lang === "fr"
        ? "aucun forfait"
        : "no fixed fee";
  const ads = input.allowAds
    ? input.lang === "fr"
      ? `Autorisation d’utiliser les vidéos en publicité : oui. Durée : ${input.rightsDays} jours. Territoires : ${territories}.`
      : `Authorization to use the videos in ads: granted. Duration: ${input.rightsDays} days. Territories: ${territories}.`
    : input.lang === "fr"
      ? "Autorisation d’utiliser les vidéos en publicité : non."
      : "Authorization to use the videos in ads: not granted.";
  if (input.lang === "en") {
    return [
      `${input.brandName} invites @${input.creatorHandle} on “${input.campaignName}”.`,
      `Product: ${input.product}.`,
      `Brief: ${input.brief}`,
      `Videos: ${input.videoCount}. Deadline: ${input.deadline}. Fixed fee: ${fee}. The fee is shown only. It does not trigger a payment.`,
      "The product is a gift. Shipping is recorded by hand. A tracking number is a note, not carrier proof.",
      ads,
      "Accepting freezes this text. A later change to the campaign does not rewrite it.",
    ].join("\n");
  }
  return [
    `${input.brandName} invite @${input.creatorHandle} sur « ${input.campaignName} ».`,
    `Produit : ${input.product}.`,
    `Brief : ${input.brief}`,
    `Vidéos : ${input.videoCount}. Échéance : ${input.deadline}. Forfait : ${fee}. Le montant est affiché. Il ne déclenche aucun paiement.`,
    "Le produit est un cadeau. L’envoi se note à la main. Un numéro de suivi est une note, pas une preuve transporteur.",
    ads,
    "L’acceptation fige ce texte. Une modification ultérieure de la campagne ne le réécrit pas.",
  ].join("\n");
}

export function contractGrantsAdUse(text: string) {
  const terms = text.split("\n").filter((line) =>
    /^(authorization to use the videos in ads|autorisation d’utiliser les vidéos en publicité)\s*:/i.test(line),
  );
  const officialTerm = terms.at(-1) ?? "";
  return /^authorization to use the videos in ads:\s*granted\./i.test(officialTerm)
    || /^autorisation d’utiliser les vidéos en publicité\s*:\s*oui\./i.test(officialTerm);
}

export function applyGiftAction(mission: GiftMission, action: GiftAction, now: string): GiftMission {
  const next: GiftMission = {
    ...mission,
    address: mission.address ? { ...mission.address } : null,
    video: mission.video ? { ...mission.video } : null,
  };
  switch (action.type) {
    case "accept":
      if (next.status !== "invited") throw new GiftRuleError("This mission can no longer be accepted.");
      next.status = "accepted";
      return next;
    case "decline":
      if (next.status !== "invited") throw new GiftRuleError("This mission can no longer be declined.");
      next.status = "declined";
      return next;
    case "sign": {
      if (next.status !== "accepted") throw new GiftRuleError("Sign the contract after accepting it.");
      if (!action.consent) throw new GiftRuleError("Consent is required.");
      if (!next.contractText.trim()) throw new GiftRuleError("The contract is empty.");
      const address = {
        name: required(action.address.name, "Name", 120),
        line: required(action.address.line, "Address", 200),
        postalCode: required(action.address.postalCode, "Postal code", 20),
        city: required(action.address.city, "City", 80),
        country: required(action.address.country, "Country", 80),
      };
      next.status = "signed";
      next.signedName = required(action.name, "Signature", 120);
      next.signedAt = now;
      next.address = address;
      return next;
    }
    case "ship":
      if (next.status !== "signed") throw new GiftRuleError("Ship the parcel after the contract is signed.");
      next.status = "shipped";
      next.carrier = required(action.carrier, "Carrier", 80);
      next.trackingNumber = required(action.trackingNumber, "Tracking number", 80);
      next.shippedAt = now;
      return next;
    case "deliver":
      if (next.status !== "shipped") throw new GiftRuleError("Mark the parcel received after it has shipped.");
      next.status = "delivered";
      next.deliveredAt = now;
      return next;
    case "submit": {
      if (next.status !== "delivered" && next.status !== "submitted") {
        throw new GiftRuleError("Submit the video after the parcel is received.");
      }
      const name = required(action.videoName, "Video name", 180);
      const approvedAt = next.video?.approvedAt ?? null;
      next.status = "submitted";
      next.video = {
        name,
        status: "pending",
        feedback: "",
        approvedAt,
      };
      return next;
    }
    case "approve": {
      if (next.status !== "submitted" || !next.video) {
        throw new GiftRuleError("No video is waiting for approval.");
      }
      next.status = "approved";
      next.video = {
        ...next.video,
        status: "approved",
        approvedAt: next.video.approvedAt ?? now,
      };
      return next;
    }
    case "request_changes": {
      if (next.status !== "submitted" || !next.video) {
        throw new GiftRuleError("No video is waiting for feedback.");
      }
      next.video = {
        ...next.video,
        status: "changes_requested",
        feedback: required(action.feedback, "Feedback", 500),
      };
      return next;
    }
    default:
      throw new GiftRuleError("Unknown action.");
  }
}
