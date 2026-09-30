import type { GiftContentProgress, GiftStatus } from "@/lib/gifting";

type Lang = "en" | "fr";

export const GIFT_STATUS_LABELS: Record<GiftStatus, { en: string; fr: string }> = {
  invited: { en: "Invited", fr: "Invité" },
  accepted: { en: "Accepted", fr: "Accepté" },
  declined: { en: "Declined", fr: "Refusé" },
  signed: { en: "Contract signed", fr: "Contrat signé" },
  shipped: { en: "Shipped", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Livré" },
  submitted: { en: "Contents in review", fr: "Contenus en revue" },
  approved: { en: "Approved", fr: "Validé" },
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

/**
 * `pendingContents` (optional) is how many contents of the mission wait for the brand:
 * a brand can review each content as it arrives, before every slot is filled.
 */
export function giftStats(missions: { status: string; pendingContents?: number }[]): GiftStats {
  const stats: GiftStats = { active: 0, shipping: 0, toReview: 0, approved: 0, declined: 0 };
  for (const mission of missions) {
    if (mission.status === "declined") stats.declined += 1;
    else if (mission.status === "approved") stats.approved += 1;
    else stats.active += 1;
    if (mission.status === "shipped") stats.shipping += 1;
    if (mission.status === "submitted" || (mission.status === "delivered" && (mission.pendingContents ?? 0) > 0)) {
      stats.toReview += 1;
    }
  }
  return stats;
}

type Progress = Pick<GiftContentProgress, "expected" | "sent" | "approved"> & Partial<GiftContentProgress>;

/** "2/3 contents sent" / "2/3 contenus envoyés" (and "approved" once the brand has validated some). */
export function giftContentsLabel(progress: Progress, lang: Lang, what: "sent" | "approved" = "sent"): string {
  const fr = lang === "fr";
  const count = what === "approved" ? progress.approved : progress.sent;
  const plural = fr ? count > 1 : progress.expected !== 1;
  if (what === "approved") {
    return fr
      ? `${count}/${progress.expected} ${plural ? "contenus validés" : "contenu validé"}`
      : `${count}/${progress.expected} ${plural ? "contents" : "content"} approved`;
  }
  return fr
    ? `${count}/${progress.expected} ${plural ? "contenus envoyés" : "contenu envoyé"}`
    : `${count}/${progress.expected} ${plural ? "contents" : "content"} sent`;
}

/**
 * What the viewer should do next on a mission, or what they are waiting for.
 * Pass `progress` (from giftContentProgress) to get "2/3 contents sent" style texts.
 */
export function giftNextStep(status: string, isCreator: boolean, lang: Lang, progress?: Progress): string {
  const fr = lang === "fr";
  if (progress && (status === "delivered" || status === "submitted")) {
    const sent = giftContentsLabel(progress, lang, "sent");
    const approved = giftContentsLabel(progress, lang, "approved");
    const toFix = progress.changesRequested ?? 0;
    const waiting = progress.pending ?? 0;
    const many = progress.expected > 1;
    if (isCreator) {
      if (toFix > 0) {
        return fr
          ? `${sent}. La marque demande une modification : renvoyez le contenu concerné.`
          : `${sent}. The brand asked for changes: send that content again.`;
      }
      if (progress.sent < progress.expected) {
        return fr
          ? `${sent}. Déposez ${many ? "les contenus restants" : "votre contenu"} (vidéo ou photo).`
          : `${sent}. Upload ${many ? "the remaining contents" : "your content"} (video or photo).`;
      }
      return fr
        ? `${sent}, ${approved}. La marque examine le reste.`
        : `${sent}, ${approved}. The brand is reviewing the rest.`;
    }
    if (waiting > 0) {
      return fr
        ? `${sent}, ${approved}. Ouvrez chaque contenu, puis validez-le ou demandez une modification.`
        : `${sent}, ${approved}. Open each content, then approve it or ask for changes.`;
    }
    if (progress.sent < progress.expected) {
      return fr ? `Colis livré. ${sent}. En attente du créateur.` : `Parcel received. ${sent}. Waiting for the creator.`;
    }
    return fr
      ? `${sent}, ${approved}. En attente des contenus modifiés.`
      : `${sent}, ${approved}. Waiting for the changed contents.`;
  }
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
        : fr ? "Expédiez le colis, puis indiquez le transporteur et le numéro de suivi." : "Ship the parcel, then add the carrier and tracking number.";
    case "shipped":
      return fr ? "Colis en route. Marquez-le comme livré à sa réception." : "Parcel on its way. Mark it received on delivery.";
    case "delivered":
      return isCreator
        ? fr ? "Réalisez vos contenus et déposez-les ici." : "Create your contents and upload them here."
        : fr ? "Colis livré. En attente des contenus." : "Parcel received. Waiting for the contents.";
    case "submitted":
      return isCreator
        ? fr ? "Contenus envoyés. La marque les examine." : "Contents sent. The brand is reviewing them."
        : fr ? "Ouvrez chaque contenu, puis validez-le ou demandez une modification." : "Open each content, then approve it or ask for changes.";
    case "approved":
      return fr ? "Mission terminée. La durée des droits publicitaires court à compter de la validation." : "Mission complete. Ad rights run from the approval date.";
    case "declined":
      return fr ? "Le créateur a refusé cette mission." : "The creator declined this mission.";
    default:
      return "";
  }
}

/** A fixed sentence, or one built from the match (null means "not handled, keep looking"). */
type ErrorText = string | ((match: RegExpMatchArray) => string | null);

/** Field labels used by `required(...)` in gifting.ts and the API route. */
const FIELD_LABELS_FR: Record<string, { noun: string; feminine?: boolean; plural?: boolean }> = {
  handle: { noun: "Le pseudo" },
  territories: { noun: "Les territoires", plural: true },
  name: { noun: "Le nom" },
  address: { noun: "L’adresse", feminine: true },
  "postal code": { noun: "Le code postal" },
  city: { noun: "La ville", feminine: true },
  country: { noun: "Le pays" },
  signature: { noun: "La signature", feminine: true },
  carrier: { noun: "Le transporteur" },
  "tracking number": { noun: "Le numéro de suivi" },
  "video name": { noun: "Le nom de la vidéo" },
  "content name": { noun: "Le nom du contenu" },
  feedback: { noun: "Le retour" },
};

function fieldErrorFr(label: string, kind: "required" | "too long"): string | null {
  const field = FIELD_LABELS_FR[label.trim().toLowerCase()];
  if (!field) return null;
  if (kind === "required") return `${field.noun} ${field.plural ? "sont obligatoires" : "est obligatoire"}.`;
  const long = field.feminine ? "longue" : "long";
  return `${field.noun} ${field.plural ? `sont trop ${long}s` : `est trop ${long}`}.`;
}

const KNOWN_ERRORS: { match: RegExp; en: ErrorText; fr: ErrorText }[] = [
  {
    // Only errors about the gifting schema itself; a missing admin client or another table is a real failure.
    match: /(relation|column|table|function).*(gift_\w+|creator_links).*(does not exist|not find|schema cache)|could not find the (table|function) .*(gift_\w+|creator_links)/i,
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
  // Mission rules (GiftRuleError in gifting.ts): English stays as written, French is translated.
  { match: /^this mission can no longer be accepted\.$/i, en: "This mission can no longer be accepted.", fr: "Cette mission ne peut plus être acceptée." },
  { match: /^this mission can no longer be declined\.$/i, en: "This mission can no longer be declined.", fr: "Cette mission ne peut plus être refusée." },
  { match: /^sign the contract after accepting it\.$/i, en: "Sign the contract after accepting it.", fr: "Acceptez la mission avant de signer le contrat." },
  { match: /^consent is required\.$/i, en: "Consent is required.", fr: "Cochez la case de consentement pour signer le contrat." },
  { match: /^the contract is empty\.$/i, en: "The contract is empty.", fr: "Le contrat est vide." },
  {
    match: /^ship the parcel after the contract is signed\.$/i,
    en: "Ship the parcel after the contract is signed.",
    fr: "Le colis ne peut être expédié qu’une fois le contrat signé.",
  },
  {
    match: /^mark the parcel received after it has shipped\.$/i,
    en: "Mark the parcel received after it has shipped.",
    fr: "Le colis ne peut être marqué comme livré qu’après son expédition.",
  },
  {
    match: /^submit the video after the parcel is received\.$/i,
    en: "Submit the video after the parcel is received.",
    fr: "La vidéo ne peut être déposée qu’une fois le colis livré.",
  },
  { match: /^no video is waiting for approval\.$/i, en: "No video is waiting for approval.", fr: "Aucune vidéo n’est en attente de validation." },
  { match: /^no video is waiting for feedback\.$/i, en: "No video is waiting for feedback.", fr: "Aucune vidéo n’est en attente de retour." },
  { match: /^invalid content position\.$/i, en: "Invalid content position.", fr: "Emplacement de contenu invalide." },
  {
    match: /^this campaign does not expect that many contents\.$/i,
    en: "This campaign does not expect that many contents.",
    fr: "Cette campagne n’attend pas autant de contenus.",
  },
  {
    match: /^this content is already approved\.$/i,
    en: "This content is already approved.",
    fr: "Ce contenu est déjà validé.",
  },
  { match: /^unknown action\.$/i, en: "Unknown action.", fr: "Action inconnue." },
  {
    match: /^(.+) is required\.$/i,
    en: (m) => m[0],
    fr: (m) => fieldErrorFr(m[1], "required"),
  },
  {
    match: /^(.+) is too long\.$/i,
    en: (m) => m[0],
    fr: (m) => fieldErrorFr(m[1], "too long"),
  },
  // API route (/api/gifting) messages.
  { match: /^server misconfigured$/i, en: "Server misconfigured", fr: "Le serveur est mal configuré. Réessayez plus tard." },
  { match: /^invalid json$/i, en: "Invalid JSON", fr: "Requête invalide. Réessayez." },
  { match: /^unknown operation\.$/i, en: "Unknown operation.", fr: "Opération inconnue." },
  { match: /^action manquante\.$/i, en: "Missing action.", fr: "Action manquante." },
  { match: /^access denied\.$/i, en: "Access denied.", fr: "Accès refusé." },
  { match: /^wishlist not found\.$/i, en: "Wishlist not found.", fr: "Liste introuvable." },
  { match: /^campaign not found\.$/i, en: "Campaign not found.", fr: "Campagne introuvable." },
  { match: /^mission not found\.$/i, en: "Mission not found.", fr: "Mission introuvable." },
  {
    match: /^could not verify creator link\.$/i,
    en: "Could not verify creator link.",
    fr: "Impossible de vérifier le lien avec le créateur. Réessayez.",
  },
  {
    match: /^upgrade to publish and send the creator link\.$/i,
    en: "Upgrade to publish and send the creator link.",
    fr: "Passez à une offre payante pour publier la campagne et envoyer le lien au créateur.",
  },
  {
    match: /^mission changed\. refresh and try again\.$/i,
    en: "Mission changed. Refresh and try again.",
    fr: "La mission a été modifiée entre-temps. Actualisez la page et réessayez.",
  },
  {
    match: /^creator cannot upload to this mission\.$/i,
    en: "Creator cannot upload to this mission.",
    fr: "Vous ne pouvez pas déposer de vidéo sur cette mission.",
  },
  { match: /^invalid gift video path\.$/i, en: "Invalid gift video path.", fr: "Emplacement de la vidéo invalide." },
  {
    match: /^upload a supported video before submitting\.$/i,
    en: "Upload a supported video before submitting.",
    fr: "Déposez une vidéo dans un format pris en charge avant de l’envoyer.",
  },
  {
    match: /^upload an mp4, mov or webm video up to 500 mb\.$/i,
    en: "Upload an MP4, MOV or WebM video up to 500 MB.",
    fr: "Déposez une vidéo MP4, MOV ou WebM de 500 Mo maximum.",
  },
  {
    match: /^upload an mp4, mov or webm video up to 500 mb, or a jpeg, png or webp photo up to 25 mb\.$/i,
    en: "Upload an MP4, MOV or WebM video up to 500 MB, or a JPEG, PNG or WebP photo up to 25 MB.",
    fr: "Déposez une vidéo MP4, MOV ou WebM de 500 Mo maximum, ou une photo JPEG, PNG ou WebP de 25 Mo maximum.",
  },
  {
    match: /^upload a supported file before submitting\.$/i,
    en: "Upload a supported file before submitting.",
    fr: "Déposez un fichier dans un format pris en charge avant de l’envoyer.",
  },
  { match: /^no uploaded content\.$/i, en: "No uploaded content.", fr: "Aucun contenu déposé à cet emplacement." },
  {
    match: /^a real uploaded file is required for approval\.$/i,
    en: "The content has to be uploaded before it can be approved.",
    fr: "Le contenu doit être déposé avant d’être validé.",
  },
  { match: /^could not start upload\.$/i, en: "Could not start upload.", fr: "Impossible de démarrer l’envoi de la vidéo." },
  {
    match: /^supabase storage is not configured\.$/i,
    en: "Supabase storage is not configured.",
    fr: "Le stockage des vidéos n’est pas configuré.",
  },
];

export function friendlyGiftError(message: string, lang: Lang): string {
  const text = message.trim();
  for (const entry of KNOWN_ERRORS) {
    const match = text.match(entry.match);
    if (!match) continue;
    const value = entry[lang];
    const friendly = typeof value === "function" ? value(match) : value;
    if (friendly) return friendly;
  }
  return message;
}

export function isGiftSetupError(message: string): boolean {
  return KNOWN_ERRORS[0].match.test(message.trim());
}
