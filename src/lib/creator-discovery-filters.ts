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
    language: p.language ? String(p.language).toLowerCase().trim() : undefined,
    countryCode: p.countryCode ? String(p.countryCode).toUpperCase().slice(0, 2) : undefined,
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
