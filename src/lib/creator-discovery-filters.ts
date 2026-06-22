export interface DiscoverySearchParams {
  niche?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  minViews?: number;
  language?: string;
  countryCode?: string;
  activeWithinDays?: number;
  includeLowQuality?: boolean;
  hasEmail?: boolean;
}

export interface QualityGate {
  minAuthenticity: number;
  excludeStatuses: string[];
}

export const DEFAULT_QUALITY_GATE: QualityGate = {
  minAuthenticity: 40,
  excludeStatuses: ["dead", "inflated"],
};

export interface NormalizedFilters {
  platform: string;
  nicheTokens: string[];
  followers: { gte: number; lte: number };
  minEngagement: number;
  minViews: number;
  language?: string;
  countryCode?: string;
  activeSince?: string;
  minAuthenticity: number;
  excludeStatuses: string[];
  hasEmail: boolean;
  sort: Array<{ column: string; ascending: boolean }>;
}

// The UI sends human labels (e.g. "french", "France"), but enrichment stores ISO
// codes (language = ISO 639-1 like "fr", country_code = ISO 3166-1 alpha-2 like
// "FR"). Map labels to codes so the equality filters actually match real rows.
const LANGUAGE_ALIASES: Record<string, string> = {
  french: "fr", francais: "fr", "français": "fr",
  english: "en", anglais: "en",
  spanish: "es", espanol: "es", "español": "es",
  german: "de", allemand: "de", italian: "it", italien: "it",
  portuguese: "pt", portugais: "pt", dutch: "nl", arabic: "ar",
};
const COUNTRY_ALIASES: Record<string, string> = {
  france: "FR", "united states": "US", usa: "US", "etats-unis": "US",
  "united kingdom": "GB", uk: "GB", "royaume-uni": "GB",
  germany: "DE", allemagne: "DE", spain: "ES", espagne: "ES",
  italy: "IT", italie: "IT", brazil: "BR", "brésil": "BR", canada: "CA",
};
const SKIP_VALUES = new Set(["", "all", "tous", "toutes", "any"]);

function normalizeLanguage(raw?: string): string | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (SKIP_VALUES.has(r)) return undefined;
  return LANGUAGE_ALIASES[r] ?? r; // already an ISO code (e.g. "fr") passes through
}

function normalizeCountry(raw?: string): string | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (SKIP_VALUES.has(r)) return undefined;
  return COUNTRY_ALIASES[r] ?? raw.toUpperCase().slice(0, 2);
}

export function normalizeDiscoveryFilters(
  p: DiscoverySearchParams,
  nowMs: number = Date.now()
): NormalizedFilters {
  const platform =
    (p.platform || "TikTok").toLowerCase() === "instagram" ? "Instagram"
    : (p.platform || "TikTok").toLowerCase() === "youtube" ? "YouTube"
    : "TikTok";

  const nicheNorm = String(p.niche || "").toLowerCase().trim();
  const nicheTokens = nicheNorm ? Array.from(new Set(nicheNorm.split(/\s+/).filter(Boolean))) : [];

  const gate = p.includeLowQuality
    ? { minAuthenticity: 0, excludeStatuses: [] as string[] }
    : DEFAULT_QUALITY_GATE;

  return {
    platform,
    nicheTokens,
    followers: { gte: Number(p.minFollowers ?? 0), lte: Number(p.maxFollowers ?? 100_000_000) },
    minEngagement: Number(p.minEngagement ?? 0),
    minViews: Number(p.minViews ?? 0),
    language: normalizeLanguage(p.language),
    countryCode: normalizeCountry(p.countryCode),
    activeSince: p.activeWithinDays ? new Date(nowMs - p.activeWithinDays * 86_400_000).toISOString() : undefined,
    minAuthenticity: gate.minAuthenticity,
    excludeStatuses: gate.excludeStatuses,
    hasEmail: Boolean(p.hasEmail),
    sort: [
      { column: "engagement_rate", ascending: false },
      { column: "authenticity_score", ascending: false },
    ],
  };
}
