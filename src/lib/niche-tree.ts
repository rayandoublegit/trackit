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
// French-market search queries per canonical niche. The query is what we send to
// ScrapeCreators (French keywords surface French creators); the tags are our
// canonical niche taxonomy so discovery/filtering stays consistent.
export const FR_NICHE_QUERIES: Record<string, string[]> = {
  fitness: ["musculation", "coach sportif", "fitness français", "prise de masse", "perte de poids", "transformation physique", "salle de sport", "programme musculation", "street workout", "crossfit france"],
  food: ["recette facile", "cuisine française", "recette healthy", "patisserie maison", "meal prep français", "recette rapide", "cuisine du monde", "batch cooking", "recette gourmande", "food français"],
  beauty: ["routine soin visage", "maquillage français", "skincare france", "soin cheveux", "grwm français", "conseils beauté", "nail art", "makeup tuto", "peau acne", "routine cheveux"],
  fashion: ["mode française", "outfit du jour", "streetwear france", "conseils mode", "friperie france", "mode homme", "mode femme", "tenue inspo", "haul vetements", "style vestimentaire"],
  travel: ["voyage pas cher", "destination voyage", "roadtrip france", "voyage solo", "astuces voyage", "vanlife france", "city trip", "bon plan voyage", "voyage en famille", "globe trotter"],
  pets: ["education chien", "soin animaux", "dressage chien", "vie de chat", "conseils chien", "animaux de compagnie", "toilettage chien", "comportement chien", "adoption animal", "nutrition animale"],
  lifestyle: ["productivite", "developpement personnel", "routine matinale", "organisation", "minimalisme", "vie quotidienne", "morning routine", "self care français", "vlog quotidien", "vie etudiante"],
  finance: ["investissement bourse", "finance personnelle", "crypto monnaie", "budget", "epargne", "argent", "investir immobilier", "independance financiere", "business en ligne", "education financiere"],
  tech: ["test gadget", "intelligence artificielle", "tech français", "review smartphone", "high tech", "applications utiles", "setup bureau", "astuce tech", "iphone android", "domotique"],
  home: ["decoration interieur", "diy maison", "rangement maison", "amenagement interieur", "plantes interieur", "deco inspiration", "renovation maison", "home staging", "menage astuce", "petit espace"],
  parenting: ["vie de maman", "vie de papa", "conseils parents", "grossesse", "education enfant", "astuce parent", "maman solo", "bebe conseils", "famille nombreuse", "routine bebe"],
  wellness: ["sante mentale", "meditation", "yoga français", "nutrition", "complement alimentaire", "bien etre", "developpement spirituel", "sommeil", "gestion stress", "naturopathie"],
  business: ["entrepreneur français", "marketing digital", "ecommerce france", "side business", "freelance", "creer entreprise", "business en ligne", "agence marketing", "dropshipping france", "startup"],
};

// English-market search queries, same canonical niches as FR. English keywords
// surface English-speaking creators; tagged with the same niche taxonomy.
export const EN_NICHE_QUERIES: Record<string, string[]> = {
  fitness: ["gym workout", "fat loss", "build muscle", "home workout", "calisthenics", "personal trainer", "weight training", "fitness transformation", "powerlifting", "crossfit"],
  food: ["easy recipes", "high protein meals", "meal prep", "healthy recipes", "baking recipes", "air fryer recipes", "vegan recipes", "quick dinner", "food recipe", "cooking tips"],
  beauty: ["skincare routine", "makeup tutorial", "grwm makeup", "hair care tips", "beauty tips", "nail art", "acne skincare", "makeup look", "skincare tips", "hair routine"],
  fashion: ["outfit ideas", "streetwear style", "ootd outfit", "fashion tips", "thrift haul", "mens fashion", "womens fashion", "style inspo", "outfit inspiration", "fashion haul"],
  travel: ["budget travel", "travel tips", "solo travel", "travel destinations", "road trip usa", "van life", "city travel guide", "travel hacks", "family travel", "cheap flights"],
  pets: ["dog training", "puppy training", "pet care tips", "cat lovers", "dog tips", "pet grooming", "dog behavior", "pet nutrition", "rescue dogs", "dog owner"],
  lifestyle: ["productivity tips", "self improvement", "morning routine", "organization tips", "minimalism", "daily vlog", "self care routine", "that girl routine", "life hacks", "student life"],
  finance: ["stock investing", "personal finance", "crypto investing", "budgeting tips", "save money", "money tips", "real estate investing", "financial freedom", "side hustles", "passive income"],
  tech: ["tech review", "gadget review", "ai tools", "smartphone review", "tech tips", "useful apps", "desk setup", "tech gadgets", "iphone tips", "smart home"],
  home: ["interior design", "diy home", "home organization", "home decor", "indoor plants", "decor inspiration", "home renovation", "home staging", "cleaning tips", "small space ideas"],
  parenting: ["mom life", "dad life", "parenting tips", "pregnancy tips", "newborn tips", "toddler mom", "parenting hacks", "baby tips", "big family", "first time mom"],
  wellness: ["mental health", "meditation", "yoga practice", "nutrition tips", "supplements", "wellness routine", "self love", "better sleep", "stress relief", "holistic health"],
  business: ["entrepreneur tips", "digital marketing", "ecommerce tips", "side business", "freelancing", "start a business", "online business", "marketing agency", "dropshipping", "startup founder"],
};

export function buildSeedTargets(): { query: string; tags: string[] }[] {
  // FR-first: each French query is tagged with its canonical niche so discovery
  // (which filters language === "fr") serves these to French Shopify brands.
  const targets: { query: string; tags: string[] }[] = [];
  // FR first (priority market), then EN.
  for (const [niche, queries] of Object.entries(FR_NICHE_QUERIES)) {
    for (const query of queries) {
      targets.push({ query, tags: [niche] });
    }
  }
  for (const [niche, queries] of Object.entries(EN_NICHE_QUERIES)) {
    for (const query of queries) {
      targets.push({ query, tags: [niche] });
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
