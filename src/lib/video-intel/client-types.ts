// Shapes the app receives from /api/creator-insights and /api/videos (no server imports).

export type VideoInsightBrief = {
  hook: string;
  hookType: string;
  format: string;
  topic: string;
  ctaType: string;
  hasProduct: boolean;
  band: "flop" | "under" | "normal" | "over" | "viral" | null;
  ratio: number | null;
  paceWps: number | null;
};

export type InsightPattern = {
  id: string;
  dimension: string;
  value: string;
  videos: number;
  medianRatio: number;
  lift: number;
  winShare: number;
  loseShare: number;
  title_en?: string;
  title_fr?: string;
  recommendation_en?: string;
  recommendation_fr?: string;
};

export type InsightVideoRef = { videoId: string; ratio: number; band: VideoInsightBrief["band"]; hook: string; hookType: string; format: string; views: number; shareUrl: string | null; coverUrl: string | null };

export type CreatorInsightsResponse = {
  username: string;
  platform: string;
  /** ready: synthesis written; partial: some videos analysed, no synthesis yet; pending: nothing analysed yet. */
  status: "ready" | "partial" | "pending";
  /** Free plan: content hidden, teaser counts only. */
  locked: boolean;
  teaser?: { patterns: number; analysed: number };
  progress: { analysed: number; tracked: number };
  synthesis: {
    summaryEn: string;
    summaryFr: string;
    patterns: InsightPattern[];
    best: InsightVideoRef[];
    worst: InsightVideoRef[];
    videosAnalysed: number;
    winners: number;
    losers: number;
    updatedAt: string | null;
  } | null;
  videos: Record<string, VideoInsightBrief>;
};

export type TranscriptResponse = {
  status: string;
  source: string;
  language: string | null;
  text: string;
  segments: { start: number; end: number; text: string }[];
  wordCount: number;
  fetchedAt: string;
};

// Labels (EN / FR) for the closed vocabularies.
export const HOOK_LABELS: Record<string, [string, string]> = {
  question: ["Question", "Question"],
  bold_claim: ["Bold claim", "Affirmation forte"],
  story: ["Story", "Histoire"],
  pov: ["POV", "POV"],
  tutorial: ["Tutorial", "Tutoriel"],
  list: ["List", "Liste"],
  reaction: ["Reaction", "Réaction"],
  trend_sound: ["Trend / sound", "Tendance / son"],
  product_reveal: ["Product reveal", "Révélation produit"],
  before_after: ["Before / after", "Avant / après"],
  challenge: ["Challenge", "Défi"],
  controversy: ["Hot take", "Avis tranché"],
  relatable: ["Relatable", "Situation du quotidien"],
  statistic: ["Fact / figure", "Fait / chiffre"],
  visual_only: ["Visual only", "Visuel seul"],
  other: ["Other", "Autre"],
};

export const FORMAT_LABELS: Record<string, [string, string]> = {
  talking_head: ["Talking head", "Face caméra"],
  voiceover: ["Voiceover", "Voix off"],
  skit: ["Skit", "Sketch"],
  tutorial: ["Tutorial", "Tutoriel"],
  unboxing: ["Unboxing", "Déballage"],
  grwm: ["GRWM", "GRWM"],
  vlog: ["Vlog", "Vlog"],
  review: ["Review", "Avis"],
  haul: ["Haul", "Haul"],
  routine: ["Routine", "Routine"],
  interview: ["Interview", "Interview"],
  duet_stitch: ["Duet / stitch", "Duo / stitch"],
  slideshow: ["Slideshow", "Diaporama"],
  montage: ["Montage", "Montage"],
  asmr: ["ASMR", "ASMR"],
  other: ["Other", "Autre"],
};

export const CTA_LABELS: Record<string, [string, string]> = {
  none: ["No CTA", "Sans appel à l'action"],
  follow: ["Follow", "S'abonner"],
  comment: ["Comment", "Commenter"],
  like_share: ["Like / share", "Liker / partager"],
  link_in_bio: ["Link in bio", "Lien en bio"],
  shop_product: ["Shop the product", "Acheter le produit"],
  discount_code: ["Discount code", "Code promo"],
  visit_profile: ["Visit profile", "Voir le profil"],
  watch_more: ["Watch more", "Voir la suite"],
  other: ["Other", "Autre"],
};

export const DIMENSION_LABELS: Record<string, [string, string]> = {
  hook_type: ["Hook", "Accroche"],
  format: ["Format", "Format"],
  cta: ["Call to action", "Appel à l'action"],
  product: ["Product", "Produit"],
  tone: ["Tone", "Ton"],
  pace: ["Speaking pace", "Débit"],
  length: ["Length", "Durée"],
};

export const VALUE_LABELS: Record<string, [string, string]> = {
  with_product: ["With a product", "Avec un produit"],
  no_product: ["No product", "Sans produit"],
  slow: ["Slow", "Lent"],
  medium: ["Medium", "Moyen"],
  fast: ["Fast", "Rapide"],
  under_15s: ["Under 15 s", "Moins de 15 s"],
  "15_30s": ["15-30 s", "15-30 s"],
  "30_60s": ["30-60 s", "30-60 s"],
  "1_3min": ["1-3 min", "1-3 min"],
  over_3min: ["Over 3 min", "Plus de 3 min"],
  funny: ["Funny", "Drôle"],
  inspirational: ["Inspirational", "Inspirant"],
  educational: ["Educational", "Éducatif"],
  emotional: ["Emotional", "Émouvant"],
  calm: ["Calm", "Calme"],
  energetic: ["Energetic", "Énergique"],
  dramatic: ["Dramatic", "Dramatique"],
  sarcastic: ["Sarcastic", "Sarcastique"],
  neutral: ["Neutral", "Neutre"],
};

export function insightLabel(dimension: string, value: string, fr: boolean): string {
  const table = dimension === "hook_type" ? HOOK_LABELS : dimension === "format" ? FORMAT_LABELS : dimension === "cta" ? CTA_LABELS : VALUE_LABELS;
  const pair = table[value] ?? VALUE_LABELS[value];
  return pair ? pair[fr ? 1 : 0] : value.replace(/_/g, " ");
}

export const BAND_LABELS: Record<string, [string, string]> = {
  viral: ["Viral", "Virale"],
  over: ["Above usual", "Au-dessus"],
  normal: ["Usual", "Habituelle"],
  under: ["Below usual", "En dessous"],
  flop: ["Flop", "Flop"],
};
