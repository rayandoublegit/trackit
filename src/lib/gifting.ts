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

export const GIFT_MAX_CONTENTS = 20;

export type GiftContentKind = "video" | "photo";
export type GiftContentStatus = "pending" | "changes_requested" | "approved";

/** One expected content of a mission (a video or a photo) at its slot 1..expectedCount. */
export type GiftContent = {
  position: number;
  name: string;
  kind: GiftContentKind;
  status: GiftContentStatus;
  feedback: string;
  approvedAt: string | null;
  storagePath: string | null;
};

/** @deprecated A mission now holds several contents. Kept for older imports. */
export type GiftVideo = GiftContent;

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
  /** How many contents the campaign asks for (gift_campaigns.video_count). */
  expectedCount: number;
  contents: GiftContent[];
  /** First time every expected content was approved: the start of ad rights. */
  approvedAt: string | null;
};

export type GiftAction =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "sign"; name: string; consent: boolean; address: ShippingAddress }
  | { type: "ship"; carrier: string; trackingNumber: string }
  | { type: "deliver" }
  | {
      type: "submit";
      /** Slot 1..expectedCount. Defaults to 1 (single-video missions). */
      position?: number;
      name?: string;
      /** Older callers send videoName instead of name. */
      videoName?: string;
      storagePath?: string | null;
      kind?: GiftContentKind;
    }
  | { type: "approve"; position?: number }
  | { type: "request_changes"; position?: number; feedback: string };

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
      ? input.lang === "fr"
        ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(input.fixedFeeCents / 100)
        : `${(input.fixedFeeCents / 100).toFixed(2)} EUR`
      : input.lang === "fr"
        ? "aucune"
        : "no fixed fee";
  const expected = giftExpectedCount(input.videoCount);
  const ads = input.allowAds
    ? input.lang === "fr"
      ? `Autorisation d’utiliser les contenus en publicité : oui. Durée : ${input.rightsDays} jours, à compter de la validation de tous les contenus. Territoires : ${territories}.`
      : `Authorization to use the content in ads: granted. Duration: ${input.rightsDays} days from the approval of all contents. Territories: ${territories}.`
    : input.lang === "fr"
      ? "Autorisation d’utiliser les contenus en publicité : non."
      : "Authorization to use the content in ads: not granted.";
  if (input.lang === "en") {
    return [
      `${input.brandName} invites @${input.creatorHandle} on “${input.campaignName}”.`,
      `Product: ${input.product}.`,
      `Brief: ${input.brief}`,
      `Contents expected: ${expected} (videos or photos). Deadline: ${input.deadline}. Fixed fee: ${fee}. The fee is shown only. It does not trigger a payment.`,
      "The product is a gift. Shipping is recorded by hand. A tracking number is a note, not carrier proof.",
      ads,
      "Accepting freezes this text. A later change to the campaign does not rewrite it.",
    ].join("\n");
  }
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.deadline.trim());
  const deadline = isoDay ? `${isoDay[3]}/${isoDay[2]}/${isoDay[1]}` : input.deadline;
  return [
    `${input.brandName} invite @${input.creatorHandle} à participer à la campagne « ${input.campaignName} ».`,
    `Produit : ${input.product}.`,
    `Brief : ${input.brief}`,
    `Contenus attendus : ${expected} (vidéos ou photos). Date limite : ${deadline}. Rémunération forfaitaire : ${fee}. Ce montant est indiqué à titre informatif et ne déclenche aucun paiement.`,
    "Le produit est remis à titre gracieux. L’expédition est déclarée manuellement par la marque ; le numéro de suivi est indicatif et ne constitue pas une preuve de livraison du transporteur.",
    ads,
    "L’acceptation du présent contrat en fige le contenu : toute modification ultérieure de la campagne est sans effet sur celui-ci.",
  ].join("\n");
}

// Contracts frozen before multi-content said "the videos" / "les vidéos"; newer ones say
// "the content" / "les contenus". Both are read the same way.
const AD_TERM_EN = /^authorization to use the (?:videos|content) in ads\s*:/i;
const AD_TERM_FR = /^autorisation d’utiliser les (?:vidéos|contenus) en publicité\s*:/i;

export function contractGrantsAdUse(text: string) {
  const terms = text.split("\n").filter((line) => AD_TERM_EN.test(line) || AD_TERM_FR.test(line));
  const officialTerm = terms.at(-1) ?? "";
  return /^authorization to use the (?:videos|content) in ads:\s*granted\./i.test(officialTerm)
    || /^autorisation d’utiliser les (?:vidéos|contenus) en publicité\s*:\s*oui\./i.test(officialTerm);
}

export const GIFT_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const GIFT_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

const GIFT_CONTENT_TYPES: Record<string, { kind: GiftContentKind; extension: string }> = {
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/quicktime": { kind: "video", extension: "mov" },
  "video/webm": { kind: "video", extension: "webm" },
  "image/jpeg": { kind: "photo", extension: "jpg" },
  "image/png": { kind: "photo", extension: "png" },
  "image/webp": { kind: "photo", extension: "webp" },
};

/** For a file input's `accept` attribute. */
export const GIFT_CONTENT_ACCEPT = Object.keys(GIFT_CONTENT_TYPES).join(",");

/** Kind, file extension and size limit of an accepted MIME type, or null when it is not accepted. */
export function giftContentType(mime: string) {
  const entry = GIFT_CONTENT_TYPES[mime];
  if (!entry) return null;
  return { ...entry, maxBytes: entry.kind === "photo" ? GIFT_PHOTO_MAX_BYTES : GIFT_VIDEO_MAX_BYTES };
}

/** The campaign's expected content count, clamped to 1..20 (bad or missing values mean 1). */
export function giftExpectedCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(GIFT_MAX_CONTENTS, n);
}

/** The slot an action targets. Older callers send no position: slot 1. */
export function giftActionPosition(action: { position?: unknown }): number {
  if (action.position === undefined || action.position === null || action.position === "") return 1;
  const n = Number(action.position);
  if (!Number.isSafeInteger(n) || n < 1 || n > GIFT_MAX_CONTENTS) {
    throw new GiftRuleError("Invalid content position.");
  }
  return n;
}

export type GiftContentProgress = {
  expected: number;
  /** Slots holding a content, whatever its review status. */
  sent: number;
  approved: number;
  changesRequested: number;
  pending: number;
};

/** Counts over the expected slots only (a stray row beyond video_count is ignored). */
export function giftContentProgress(
  contents: { position?: number | null; status: string }[],
  expectedCount: unknown,
): GiftContentProgress {
  const expected = giftExpectedCount(expectedCount);
  const bySlot = new Map<number, string>();
  for (const item of contents) {
    const position = item.position ?? 1;
    if (position >= 1 && position <= expected) bySlot.set(position, item.status);
  }
  const statuses = [...bySlot.values()];
  return {
    expected,
    sent: bySlot.size,
    approved: statuses.filter((s) => s === "approved").length,
    changesRequested: statuses.filter((s) => s === "changes_requested").length,
    pending: statuses.filter((s) => s === "pending").length,
  };
}

/** Mission status once contents are in play: every slot approved, every slot filled, or still waiting. */
function contentPhaseStatus(contents: GiftContent[], expectedCount: number): GiftStatus {
  const progress = giftContentProgress(contents, expectedCount);
  if (progress.approved === progress.expected) return "approved";
  if (progress.sent === progress.expected) return "submitted";
  return "delivered";
}

function contentAt(mission: GiftMission, position: number) {
  return mission.contents.find((item) => item.position === position) ?? null;
}

export function applyGiftAction(mission: GiftMission, action: GiftAction, now: string): GiftMission {
  const next: GiftMission = {
    ...mission,
    expectedCount: giftExpectedCount(mission.expectedCount),
    address: mission.address ? { ...mission.address } : null,
    contents: (mission.contents ?? []).map((item) => ({ ...item, position: item.position ?? 1 })),
    approvedAt: mission.approvedAt ?? null,
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
      const position = giftActionPosition(action);
      if (position > next.expectedCount) {
        throw new GiftRuleError("This campaign does not expect that many contents.");
      }
      // An approved content is locked: the brand already accepted it (and its ad rights).
      if (contentAt(next, position)?.status === "approved") {
        throw new GiftRuleError("This content is already approved.");
      }
      const name = required(String(action.name ?? action.videoName ?? ""), "Content name", 180);
      const item: GiftContent = {
        position,
        name,
        kind: action.kind === "photo" ? "photo" : "video",
        status: "pending",
        feedback: "",
        approvedAt: null,
        storagePath: action.storagePath ?? null,
      };
      next.contents = [...next.contents.filter((c) => c.position !== position), item].sort(
        (a, b) => a.position - b.position,
      );
      next.status = contentPhaseStatus(next.contents, next.expectedCount);
      return next;
    }
    case "approve": {
      const position = giftActionPosition(action);
      const existing = contentAt(next, position);
      if ((next.status !== "delivered" && next.status !== "submitted") || !existing || existing.status === "approved") {
        throw new GiftRuleError("No video is waiting for approval.");
      }
      next.contents = next.contents.map((c) =>
        c.position === position ? { ...c, status: "approved", feedback: "", approvedAt: c.approvedAt ?? now } : c,
      );
      next.status = contentPhaseStatus(next.contents, next.expectedCount);
      // The first full approval starts the ad rights; it never moves afterwards.
      if (next.status === "approved") next.approvedAt = next.approvedAt ?? now;
      return next;
    }
    case "request_changes": {
      const position = giftActionPosition(action);
      const existing = contentAt(next, position);
      if ((next.status !== "delivered" && next.status !== "submitted") || !existing || existing.status === "approved") {
        throw new GiftRuleError("No video is waiting for feedback.");
      }
      const feedback = required(action.feedback, "Feedback", 500);
      next.contents = next.contents.map((c) =>
        c.position === position ? { ...c, status: "changes_requested", feedback } : c,
      );
      next.status = contentPhaseStatus(next.contents, next.expectedCount);
      return next;
    }
    default:
      throw new GiftRuleError("Unknown action.");
  }
}
