// Parent niche -> sub-niches. Creators get tagged with BOTH the sub-niche
// and its parent, so searching the parent surfaces all sub-niche creators.
export const NICHE_TREE: Record<string, string[]> = {
  fitness: ["calisthenics", "crossfit", "powerlifting", "homeworkout", "bodybuilding", "running", "pilates"],
  food: ["vegan", "recipes", "baking", "mealprep", "streetfood", "healthyfood", "dessert"],
  beauty: ["skincare", "makeup", "haircare", "nails", "perfume", "grwm"],
  fashion: ["streetwear", "luxury", "thrift", "sneakers", "outfits", "menswear", "womenswear"],
  travel: ["budgettravel", "luxurytravel", "vanlife", "solotravel", "backpacking"],
  pets: ["dogs", "cats", "puppytraining", "petcare", "exoticpets"],
  gaming: ["fps", "minecraft", "mobilegaming", "speedrun", "cozygaming"],
  lifestyle: ["minimalism", "productivity", "selfcare", "morningroutine"],
  finance: ["investing", "crypto", "personalfinance", "stocks", "budgeting"],
  tech: ["gadgets", "ai", "coding", "smarthome"],
  home: ["interiordesign", "diyhome", "cleaning", "organization", "plants"],
  parenting: ["momlife", "dadlife", "babytips", "toddlers"],
  wellness: ["mentalhealth", "meditation", "yoga", "nutrition", "supplements"],
  business: ["entrepreneur", "marketing", "ecommerce", "sidehustle"],
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
