// Parent niche -> sub-niches. Creators get tagged with BOTH the sub-niche
// and its parent, so searching the parent surfaces all sub-niche creators.
export const NICHE_TREE: Record<string, string[]> = {
  fitness: ["calisthenics", "crossfit", "powerlifting", "homeworkout", "bodybuilding", "running", "pilates", "hyrox", "gymtok", "fatloss", "musclebuilding", "yogafit"],
  food: ["vegan", "recipes", "baking", "mealprep", "streetfood", "healthyfood", "dessert", "vegetarian", "keto", "highprotein", "airfryer", "foodreview"],
  beauty: ["skincare", "makeup", "haircare", "nails", "perfume", "grwm", "kbeauty", "antiaging", "acne", "lashes", "browns", "cleangirl"],
  fashion: ["streetwear", "luxury", "thrift", "sneakers", "outfits", "menswear", "womenswear", "ootd", "vintage", "plussize", "modestfashion", "jewelry"],
  travel: ["budgettravel", "luxurytravel", "vanlife", "solotravel", "backpacking", "citybreaks", "digitalnomad", "traveltips", "roadtrip", "beaches"],
  pets: ["dogs", "cats", "puppytraining", "petcare", "exoticpets", "doggrooming", "petsupplements", "aquariums", "rescuepets", "petnutrition"],
  gaming: ["fps", "minecraft", "mobilegaming", "speedrun", "cozygaming", "valorant", "fortnite", "retrogaming", "gamingsetup", "esports"],
  lifestyle: ["minimalism", "productivity", "selfcare", "morningroutine", "journaling", "declutter", "slowliving", "thatgirl", "dayinmylife"],
  finance: ["investing", "crypto", "personalfinance", "stocks", "budgeting", "sidehustles", "passiveincome", "realestate", "frugal", "moneytips"],
  tech: ["gadgets", "ai", "coding", "smarthome", "apps", "techreviews", "pcbuilds", "productivitytech", "iphone", "android"],
  home: ["interiordesign", "diyhome", "cleaning", "organization", "plants", "homedecor", "renovation", "smallspaces", "rentaldecor", "cottagecore"],
  parenting: ["momlife", "dadlife", "babytips", "toddlers", "pregnancy", "newborn", "parentinghacks", "homeschool", "bigfamily"],
  wellness: ["mentalhealth", "meditation", "yoga", "nutrition", "supplements", "sleep", "biohacking", "holistic", "selflove", "therapy"],
  business: ["entrepreneur", "marketing", "ecommerce", "sidehustle", "smallbusiness", "saas", "dropshipping", "agency", "founder", "freelance"],
  beautytech: ["ledmask", "microcurrent", "gua sha", "skintools", "hairtools"],
  outdoors: ["hiking", "camping", "fishing", "climbing", "surfing", "skiing", "cycling"],
  auto: ["cartok", "carmods", "supercars", "evs", "motorcycles", "detailing"],
  art: ["digitalart", "painting", "tattoo", "photography", "design", "crafts", "pottery"],
};

// Returns [...all niche queries to seed], each as { query, tags }
export function buildSeedTargets(): { query: string; tags: string[] }[] {
  const targets: { query: string; tags: string[] }[] = [];
  for (const [parent, subs] of Object.entries(NICHE_TREE)) {
    targets.push({ query: parent, tags: [parent] });
    for (const sub of subs) {
      targets.push({ query: sub, tags: [sub, parent] });
    }
  }
  return targets;
}

// Deterministic rotating slice so the daily discovery cron covers all targets
// over several days without re-querying everything each run.
export function getDailySlice<T>(items: T[], dayIndex: number, sliceSize: number): T[] {
  if (items.length === 0 || sliceSize <= 0) return [];
  const size = Math.min(sliceSize, items.length);
  const start = ((dayIndex * size) % items.length + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < size; i++) out.push(items[(start + i) % items.length]);
  return out;
}

// Whole-day index in UTC, used to advance the rotating slice each day.
export function dayIndexUTC(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 86_400_000);
}
