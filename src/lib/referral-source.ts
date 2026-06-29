export type ReferralSource =
  | "tiktok"
  | "instagram"
  | "reddit"
  | "twitter"
  | "friend"
  | "google"
  | "other";

export const SOCIAL_REFERRAL_SOURCES: ReferralSource[] = [
  "tiktok",
  "instagram",
  "twitter",
  "reddit",
];

export const REQUIRED_TEXT_REFERRAL_SOURCES: ReferralSource[] = [
  "friend",
  "other",
];

export function isSocialReferralSource(source: ReferralSource): boolean {
  return SOCIAL_REFERRAL_SOURCES.includes(source);
}

export function requiresReferralDetails(source: ReferralSource): boolean {
  return REQUIRED_TEXT_REFERRAL_SOURCES.includes(source);
}

export function normalizeSocialHandle(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/^u\//i, "").toLowerCase();
}

export function referralHandleFieldCopy(source: ReferralSource, lang: "fr" | "en") {
  const fr = lang === "fr";
  switch (source) {
    case "tiktok":
      return {
        label: fr ? "Votre @ TikTok" : "Your TikTok @",
        placeholder: fr ? "ex. @marque_officielle" : "e.g. @brand_official",
        hint: fr ? "Le compte ou créateur qui vous a fait découvrir Trackit." : "The account or creator who introduced you to Trackit.",
      };
    case "instagram":
      return {
        label: fr ? "Votre @ Instagram" : "Your Instagram @",
        placeholder: fr ? "ex. @marque_officielle" : "e.g. @brand_official",
        hint: fr ? "Le compte qui vous a fait découvrir Trackit." : "The account that introduced you to Trackit.",
      };
    case "twitter":
      return {
        label: fr ? "Votre @ X (Twitter)" : "Your X (Twitter) @",
        placeholder: fr ? "ex. @marque_officielle" : "e.g. @brand_official",
        hint: fr ? "Le compte qui vous a fait découvrir Trackit." : "The account that introduced you to Trackit.",
      };
    case "reddit":
      return {
        label: fr ? "Votre pseudo Reddit" : "Your Reddit username",
        placeholder: fr ? "ex. u/nom_utilisateur" : "e.g. u/username",
        hint: fr ? "L'utilisateur ou le subreddit qui vous a orienté vers nous." : "The user or subreddit that pointed you to us.",
      };
    default:
      return {
        label: fr ? "Votre pseudo" : "Your handle",
        placeholder: fr ? "ex. @pseudo" : "e.g. @handle",
        hint: "",
      };
  }
}

export function referralDetailsFieldCopy(source: ReferralSource, lang: "fr" | "en") {
  const fr = lang === "fr";
  switch (source) {
    case "friend":
      return {
        label: fr ? "Qui vous a recommandé ?" : "Who recommended us?",
        placeholder: fr ? "Prénom, nom ou @ de la personne…" : "First name, last name, or @ of the person…",
        hint: fr ? "Dites-nous qui vous a parlé de Trackit." : "Tell us who told you about Trackit.",
        required: true,
      };
    case "other":
      return {
        label: fr ? "Comment nous avez-vous trouvés ?" : "How did you find us?",
        placeholder: fr ? "Podcast, newsletter, événement, autre réseau…" : "Podcast, newsletter, event, another network…",
        hint: fr ? "Précisez le canal ou le contexte." : "Specify the channel or context.",
        required: true,
      };
    case "google":
      return {
        label: fr ? "Précision (optionnel)" : "Details (optional)",
        placeholder: fr ? "ex. « outil affiliation créateurs », article de blog…" : "e.g. “creator affiliate tool”, blog post…",
        hint: fr ? "Ce que vous avez tapé ou le lien que vous avez cliqué." : "What you searched or which link you clicked.",
        required: false,
      };
    default:
      return {
        label: fr ? "Détails" : "Details",
        placeholder: "",
        hint: "",
        required: false,
      };
  }
}
