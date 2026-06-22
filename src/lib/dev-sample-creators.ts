// Dev-only sample creators for previewing the discovery search WITHOUT a
// Supabase backend. Only ever used when DEV_BYPASS_AUTH is on AND Supabase is
// not configured (see src/app/api/discovery/route.ts). Never reachable in prod.
import type { NormalizedFilters } from "@/lib/creator-discovery-filters";
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";

interface SampleCreator extends DiscoveryCreatorResult {
  _tags: string[]; // niche tags for matching (stripped before returning)
}

function avatar(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E8EEFC&color=0047FF&size=200&bold=true&rounded=true`;
}
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

const SAMPLES: SampleCreator[] = [
  {
    username: "kayla.lifts", displayName: "Kayla Lifts", platform: "TikTok",
    followersCount: 184000, engagementRate: 7.8, engagementByFollower: 4.1, avgViews: 92000,
    postFrequency: 5.2, lastPostAt: daysAgo(1), authenticityScore: 91, qualityStatus: "ok",
    bio: "Coach force & hypertrophie 💪 Programmes -> link. kayla@liftmail.com",
    email: "kayla@liftmail.com", primaryNiche: "fitness", language: "en", location: "Los Angeles",
    countryCode: "US", videoThumbnails: [], avatarUrl: avatar("Kayla Lifts"), niche: "fitness",
    _tags: ["fitness", "gym", "powerlifting", "musclebuilding"],
  },
  {
    username: "marie.muscle", displayName: "Marie Muscu", platform: "TikTok",
    followersCount: 76000, engagementRate: 9.1, engagementByFollower: 5.3, avgViews: 51000,
    postFrequency: 4.0, lastPostAt: daysAgo(2), authenticityScore: 88, qualityStatus: "ok",
    bio: "Fitness à la maison 🏠 Programmes gratuits 🇫🇷", email: null,
    primaryNiche: "fitness", language: "fr", location: "Lyon", countryCode: "FR",
    videoThumbnails: [], avatarUrl: avatar("Marie Muscu"), niche: "fitness",
    _tags: ["fitness", "homeworkout", "calisthenics"],
  },
  {
    username: "thefitcoachuk", displayName: "The Fit Coach", platform: "Instagram",
    followersCount: 421000, engagementRate: 4.2, engagementByFollower: 2.0, avgViews: 138000,
    postFrequency: 3.1, lastPostAt: daysAgo(3), authenticityScore: 79, qualityStatus: "ok",
    bio: "Online coaching • PT • collabs: hello@thefitcoach.co", email: "hello@thefitcoach.co",
    primaryNiche: "fitness", language: "en", location: "London", countryCode: "GB",
    videoThumbnails: [], avatarUrl: avatar("The Fit Coach"), niche: "fitness",
    _tags: ["fitness", "hyrox", "running", "crossfit"],
  },
  {
    username: "chef.lucas", displayName: "Lucas en Cuisine", platform: "TikTok",
    followersCount: 312000, engagementRate: 6.4, engagementByFollower: 3.5, avgViews: 210000,
    postFrequency: 6.0, lastPostAt: daysAgo(1), authenticityScore: 90, qualityStatus: "ok",
    bio: "Recettes rapides 🍝 3 ingrédients. Contact: lucas@kitchenfr.com", email: "lucas@kitchenfr.com",
    primaryNiche: "food", language: "fr", location: "Paris", countryCode: "FR",
    videoThumbnails: [], avatarUrl: avatar("Lucas Cuisine"), niche: "food",
    _tags: ["food", "recipes", "mealprep", "healthyfood"],
  },
  {
    username: "veganbowls", displayName: "Vegan Bowls", platform: "Instagram",
    followersCount: 980000, engagementRate: 3.1, engagementByFollower: 1.4, avgViews: 240000,
    postFrequency: 2.5, lastPostAt: daysAgo(5), authenticityScore: 72, qualityStatus: "ok",
    bio: "Plant-based recipes 🌱 worldwide", email: null,
    primaryNiche: "food", language: "en", location: null, countryCode: "US",
    videoThumbnails: [], avatarUrl: avatar("Vegan Bowls"), niche: "food",
    _tags: ["food", "vegan", "vegetarian", "healthyfood"],
  },
  {
    username: "skinby.sara", displayName: "Skin by Sara", platform: "TikTok",
    followersCount: 143000, engagementRate: 8.3, engagementByFollower: 4.6, avgViews: 88000,
    postFrequency: 4.4, lastPostAt: daysAgo(2), authenticityScore: 86, qualityStatus: "ok",
    bio: "Esthéticienne 🧖‍♀️ skincare science. PR: sara@glowmail.com", email: "sara@glowmail.com",
    primaryNiche: "beauty", language: "fr", location: "Bordeaux", countryCode: "FR",
    videoThumbnails: [], avatarUrl: avatar("Skin by Sara"), niche: "beauty",
    _tags: ["beauty", "skincare", "acne", "cleangirl"],
  },
  {
    username: "glowgaby", displayName: "Glow with Gaby", platform: "Instagram",
    followersCount: 67000, engagementRate: 9.6, engagementByFollower: 6.0, avgViews: 39000,
    postFrequency: 5.0, lastPostAt: daysAgo(1), authenticityScore: 93, qualityStatus: "ok",
    bio: "GRWM • makeup • drugstore finds", email: null,
    primaryNiche: "beauty", language: "en", location: "Toronto", countryCode: "CA",
    videoThumbnails: [], avatarUrl: avatar("Glow Gaby"), niche: "beauty",
    _tags: ["beauty", "makeup", "grwm", "haircare"],
  },
  {
    username: "techwithtom", displayName: "Tech with Tom", platform: "YouTube",
    followersCount: 540000, engagementRate: 5.0, engagementByFollower: 2.4, avgViews: 175000,
    postFrequency: 1.8, lastPostAt: daysAgo(4), authenticityScore: 83, qualityStatus: "ok",
    bio: "Gadget reviews & smart home. Business: tom@techmail.io", email: "tom@techmail.io",
    primaryNiche: "tech", language: "en", location: "Berlin", countryCode: "DE",
    videoThumbnails: [], avatarUrl: avatar("Tech Tom"), niche: "tech",
    _tags: ["tech", "gadgets", "smarthome", "techreviews"],
  },
  {
    username: "streetfitsam", displayName: "Street Fit Sam", platform: "TikTok",
    followersCount: 28000, engagementRate: 11.2, engagementByFollower: 7.4, avgViews: 22000,
    postFrequency: 6.5, lastPostAt: daysAgo(1), authenticityScore: 95, qualityStatus: "ok",
    bio: "Streetwear hauls 🧥 thrift + luxury", email: null,
    primaryNiche: "fashion", language: "en", location: "New York", countryCode: "US",
    videoThumbnails: [], avatarUrl: avatar("Street Fit Sam"), niche: "fashion",
    _tags: ["fashion", "streetwear", "thrift", "sneakers"],
  },
  {
    username: "wanderlea", displayName: "Wander with Lea", platform: "Instagram",
    followersCount: 256000, engagementRate: 4.8, engagementByFollower: 2.2, avgViews: 120000,
    postFrequency: 2.2, lastPostAt: daysAgo(6), authenticityScore: 77, qualityStatus: "ok",
    bio: "Budget travel ✈️ 60+ countries. collabs: lea@wandermail.com", email: "lea@wandermail.com",
    primaryNiche: "travel", language: "en", location: "Lisbon", countryCode: "PT",
    videoThumbnails: [], avatarUrl: avatar("Wander Lea"), niche: "travel",
    _tags: ["travel", "budgettravel", "solotravel", "digitalnomad"],
  },
  {
    username: "moneymaxi", displayName: "Money with Maxi", platform: "TikTok",
    followersCount: 119000, engagementRate: 6.9, engagementByFollower: 3.9, avgViews: 64000,
    postFrequency: 4.8, lastPostAt: daysAgo(2), authenticityScore: 84, qualityStatus: "ok",
    bio: "Investir simplement 📈 PEA & ETF 🇫🇷", email: null,
    primaryNiche: "finance", language: "fr", location: "Paris", countryCode: "FR",
    videoThumbnails: [], avatarUrl: avatar("Money Maxi"), niche: "finance",
    _tags: ["finance", "investing", "personalfinance", "budgeting"],
  },
  {
    username: "cozygamerkai", displayName: "Cozy Gamer Kai", platform: "YouTube",
    followersCount: 88000, engagementRate: 7.1, engagementByFollower: 4.2, avgViews: 47000,
    postFrequency: 3.0, lastPostAt: daysAgo(3), authenticityScore: 89, qualityStatus: "ok",
    bio: "Cozy games & setups 🎮 collabs welcome: kai@cozymail.gg", email: "kai@cozymail.gg",
    primaryNiche: "gaming", language: "en", location: "Manchester", countryCode: "GB",
    videoThumbnails: [], avatarUrl: avatar("Cozy Gamer Kai"), niche: "gaming",
    _tags: ["gaming", "cozygaming", "gamingsetup", "minecraft"],
  },
];

/**
 * Dev-only: returns sample creators matching the search, applying the same
 * filters the real route would (so the filter UI feels real). Falls back to all
 * samples when the niche matches none, so the preview is never empty.
 */
export function getDevSampleCreators(niche: string, f: NormalizedFilters): DiscoveryCreatorResult[] {
  const tokens = f.nicheTokens;
  let pool = SAMPLES;
  if (tokens.length) {
    const matched = SAMPLES.filter((c) =>
      tokens.some((t) => c._tags.includes(t) || c.primaryNiche.includes(t))
    );
    if (matched.length) pool = matched;
  }

  const results = pool
    .filter((c) => c.followersCount >= f.followers.gte && c.followersCount <= f.followers.lte)
    .filter((c) => c.engagementRate >= f.minEngagement)
    .filter((c) => c.avgViews >= f.minViews)
    .filter((c) => c.authenticityScore >= f.minAuthenticity)
    .filter((c) => !f.excludeStatuses.includes(c.qualityStatus))
    .filter((c) => (f.hasEmail ? !!c.email : true))
    .filter((c) => (f.language ? c.language === f.language : true))
    .filter((c) => (f.countryCode ? c.countryCode === f.countryCode || c.countryCode == null : true))
    .filter((c) => (f.activeSince && c.lastPostAt ? c.lastPostAt >= f.activeSince : true))
    .sort((a, b) => b.engagementRate - a.engagementRate || b.authenticityScore - a.authenticityScore)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _tags, ...rest }) => ({ ...rest, niche }));

  return results;
}
