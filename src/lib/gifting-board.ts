import type { GiftStatus } from "@/lib/gifting";

type Lang = "en" | "fr";

export const GIFT_STATUS_LABELS: Record<GiftStatus, { en: string; fr: string }> = {
  invited: { en: "Invited", fr: "Invité" },
  accepted: { en: "Accepted", fr: "Acceptée" },
  declined: { en: "Declined", fr: "Refusée" },
  signed: { en: "Contract signed", fr: "Contrat signé" },
  shipped: { en: "Shipped", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Reçu" },
  submitted: { en: "Video in review", fr: "Vidéo à valider" },
  approved: { en: "Approved", fr: "Validée" },
};

export function giftStatusLabel(status: string, lang: Lang): string {
  const entry = GIFT_STATUS_LABELS[status as GiftStatus];
  return entry ? entry[lang] : status;
}

/** Board columns, in the order a mission moves through them. */
export const GIFT_BOARD_COLUMNS: { id: string; statuses: GiftStatus[] }[] = [
  { id: "invited", statuses: ["invited", "accepted"] },
  { id: "signed", statuses: ["signed"] },
  { id: "shipped", statuses: ["shipped"] },
  { id: "delivered", statuses: ["delivered"] },
  { id: "submitted", statuses: ["submitted"] },
  { id: "approved", statuses: ["approved"] },
];

export function giftColumnFor(status: string): string | null {
  return GIFT_BOARD_COLUMNS.find((column) => column.statuses.includes(status as GiftStatus))?.id ?? null;
}

export type GiftStats = { active: number; shipping: number; toReview: number; approved: number; declined: number };

export function giftStats(missions: { status: string }[]): GiftStats {
  const stats: GiftStats = { active: 0, shipping: 0, toReview: 0, approved: 0, declined: 0 };
  for (const mission of missions) {
    if (mission.status === "declined") stats.declined += 1;
    else if (mission.status === "approved") stats.approved += 1;
    else stats.active += 1;
    if (mission.status === "shipped") stats.shipping += 1;
    if (mission.status === "submitted") stats.toReview += 1;
  }
  return stats;
}

/** What the viewer should do next on a mission, or what they are waiting for. */
export function giftNextStep(status: string, isCreator: boolean, lang: Lang): string {
  const fr = lang === "fr";
  switch (status) {
    case "invited":
      return isCreator
        ? fr ? "Lisez la proposition, puis acceptez ou refusez." : "Read the offer, then accept or decline."
        : fr ? "En attente de la réponse du créateur." : "Waiting for the creator to reply.";
    case "accepted":
      return isCreator
        ? fr ? "Signez le contrat et indiquez votre adresse de livraison." : "Sign the contract and add your delivery address."
        : fr ? "Le créateur a accepté. Il doit encore signer et donner son adresse." : "The creator accepted and still has to sign and share an address.";
    case "signed":
      return isCreator
        ? fr ? "Contrat signé. La marque prépare votre colis." : "Contract signed. The brand is preparing your parcel."
        : fr ? "Envoyez le colis, puis notez le transporteur et le numéro de suivi." : "Ship the parcel, then add the carrier and tracking number.";
    case "shipped":
      return fr ? "Colis en route. Marquez-le reçu à la livraison." : "Parcel on its way. Mark it received on delivery.";
    case "delivered":
      return isCreator
        ? fr ? "Tournez la vidéo et déposez-la ici." : "Film the video and upload it here."
        : fr ? "Colis reçu. En attente de la vidéo." : "Parcel received. Waiting for the video.";
    case "submitted":
      return isCreator
        ? fr ? "Vidéo envoyée. La marque la relit." : "Video sent. The brand is reviewing it."
        : fr ? "Regardez la vidéo, validez-la ou demandez une modification." : "Watch the video, then approve it or ask for changes.";
    case "approved":
      return fr ? "Mission terminée. La durée des droits publicitaires démarre à la validation." : "Mission complete. Ad rights run from the approval date.";
    case "declined":
      return fr ? "Le créateur a refusé cette mission." : "The creator declined this mission.";
    default:
      return "";
  }
}

const KNOWN_ERRORS: { match: RegExp; en: string; fr: string }[] = [
  {
    match: /server misconfigured|relation .* does not exist|column .* does not exist|could not find the (table|function)|schema cache/i,
    en: "Gifting is not set up on this workspace yet. The sample below shows how it works.",
    fr: "Le gifting n’est pas encore activé sur cet espace. L’exemple ci-dessous montre comment il fonctionne.",
  },
  { match: /^unauthorized$/i, en: "Your session has expired. Sign in again.", fr: "Votre session a expiré. Reconnectez-vous." },
  {
    match: /creator must join this brand/i,
    en: "This creator is not connected to your brand yet. Invite them from Creators first, then send the mission.",
    fr: "Ce créateur n’est pas encore relié à votre marque. Invitez-le depuis Créateurs, puis envoyez la mission.",
  },
  { match: /brands only/i, en: "Only the brand can do this.", fr: "Seule la marque peut faire cela." },
  { match: /invited creator only/i, en: "Only the invited creator can do this.", fr: "Seul le créateur invité peut faire cela." },
  {
    match: /name, product, brief and deadline are required/i,
    en: "Add a name, a product, a brief and a deadline.",
    fr: "Ajoutez un nom, un produit, un brief et une échéance.",
  },
  { match: /advertising rights need a duration/i, en: "Ad rights need a duration in days.", fr: "Les droits publicitaires demandent une durée en jours." },
  {
    match: /a real uploaded video is required/i,
    en: "The video has to be uploaded before it can be approved.",
    fr: "La vidéo doit être déposée avant d’être validée.",
  },
];

export function friendlyGiftError(message: string, lang: Lang): string {
  const known = KNOWN_ERRORS.find((entry) => entry.match.test(message.trim()));
  return known ? known[lang] : message;
}

export function isGiftSetupError(message: string): boolean {
  return KNOWN_ERRORS[0].match.test(message.trim());
}
